import { gunzipSync } from 'node:zlib';
import type { AppStoreConnectClient } from './appstore-client.js';
import { rel, resource } from './jsonapi.js';
import { bool, createToolModule, num, requireConfirm, str, strList } from './tool-runner.js';

const ANALYTICS_CATEGORIES = [
  'APP_STORE_ENGAGEMENT',
  'APP_STORE_COMMERCE',
  'APP_USAGE',
  'FRAMEWORK_USAGE',
  'PERFORMANCE',
];
const ANALYTICS_GRANULARITIES = ['DAILY', 'WEEKLY', 'MONTHLY'];
const SALES_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const DEFAULT_MAX_ROWS = 200;
const DEFAULT_LIST_LIMIT = 200;
const VENDOR_NUMBER_ENV = 'APPLE_VENDOR_NUMBER';
const VENDOR_NUMBER_LOCATION =
  'In App Store Connect, select Reports at the top. The vendor number is in the top left, under the legal entity name.';
const SALES_SUMMARY_GROUP_BY = ['SKU', 'Title', 'Product Type Identifier'];
const SALES_SUMMARY_SUM_COLUMNS = ['Units', 'Developer Proceeds'];

export type ReportTable = { columns: string[]; rows: Record<string, string>[] };

export type SummaryOptions = { groupBy?: string[]; sumColumns?: string[]; maxRows?: number };

export function decodeReportFile(data: Buffer): string {
  const isGzip = data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
  return (isGzip ? gunzipSync(data) : data).toString('utf-8');
}

export function parseTsv(text: string): ReportTable {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split('\t').map((column) => column.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(columns.map((column, index) => [column, (values[index] ?? '').trim()]));
  });
  return { columns, rows };
}

function toNumber(value: string | undefined): number {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Returns raw rows, or sums `sumColumns` per distinct `groupBy` key when either option is set. */
export function summarizeTable(table: ReportTable, options: SummaryOptions = {}) {
  const groupBy = options.groupBy ?? [];
  const sumColumns = options.sumColumns ?? [];
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  const unknownColumns = [...groupBy, ...sumColumns].filter((column) => !table.columns.includes(column));
  if (unknownColumns.length > 0) {
    throw new Error(
      `Unknown column(s): ${unknownColumns.join(', ')}. Report columns: ${table.columns.join(', ')}`
    );
  }

  if (groupBy.length === 0 && sumColumns.length === 0) {
    return {
      columns: table.columns,
      rowCount: table.rows.length,
      rows: table.rows.slice(0, maxRows),
      truncated: table.rows.length > maxRows,
    };
  }

  const groups = new Map<string, Record<string, string | number>>();
  for (const row of table.rows) {
    const key = groupBy.map((column) => row[column]).join('\t');
    const group: Record<string, string | number> =
      groups.get(key) ??
      Object.fromEntries([
        ...groupBy.map((column) => [column, row[column]]),
        ...sumColumns.map((column) => [column, 0]),
      ]);
    groups.set(key, group);
    for (const column of sumColumns) {
      group[column] = (group[column] as number) + toNumber(row[column]);
    }
  }

  const grouped = [...groups.values()];
  if (sumColumns.length > 0) {
    const sortColumn = sumColumns[0];
    grouped.sort((left, right) => (right[sortColumn] as number) - (left[sortColumn] as number));
  }
  return {
    columns: table.columns,
    rowCount: table.rows.length,
    groupBy,
    sumColumns,
    groups: grouped.slice(0, maxRows),
    truncated: grouped.length > maxRows,
  };
}

async function downloadReportTable(
  client: AppStoreConnectClient,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): Promise<ReportTable> {
  const data: Buffer = await client.request('GET', path, { query, responseType: 'buffer' });
  return parseTsv(decodeReportFile(data));
}

function mergeTables(tables: ReportTable[]): ReportTable {
  const columns = tables.find((table) => table.columns.length > 0)?.columns ?? [];
  return { columns, rows: tables.flatMap((table) => table.rows) };
}

function summaryOptions(args: any, defaults?: SummaryOptions): SummaryOptions {
  const hasCustomShape = args.groupBy !== undefined || args.sumColumns !== undefined;
  return {
    groupBy: hasCustomShape ? args.groupBy : defaults?.groupBy,
    sumColumns: hasCustomShape ? args.sumColumns : defaults?.sumColumns,
    maxRows: args.maxRows,
  };
}

const summaryProperties = {
  groupBy: strList('Optional columns to group by, e.g. ["Date"]'),
  sumColumns: strList('Optional numeric columns to sum per group, e.g. ["Counts"]'),
  maxRows: num(`Max rows or groups to return (default ${DEFAULT_MAX_ROWS})`),
};

const enumStr = (description: string, values: string[]) => ({
  type: 'string',
  description,
  enum: values,
});

const tools = [
  {
    definition: {
      name: 'get_analytics',
      description:
        'Start here for App Store analytics (impressions, product page views, downloads, sessions). Shows the analytics report requests for an app and the next step. Use the app id from list_apps, not the SKU.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('App Store Connect app id (apps resource id)') },
        required: ['appId'],
      },
    },
    run: async (client: AppStoreConnectClient, { appId }: any) => {
      const response = await client.request('GET', `/v1/apps/${appId}/analyticsReportRequests`);
      const reportRequests = (response.data ?? []).map((request: any) => ({
        id: request.id,
        accessType: request.attributes?.accessType,
        stoppedDueToInactivity: request.attributes?.stoppedDueToInactivity,
      }));
      return {
        appId,
        reportRequests,
        next:
          reportRequests.length === 0
            ? 'No analytics report request exists. Call create_analytics_report_request with accessType ONE_TIME_SNAPSHOT (past data) or ONGOING (daily data from now on) and confirm true. Apple can need one or two days to make the first reports.'
            : 'Call list_analytics_reports with a reportRequestId and a category such as APP_STORE_ENGAGEMENT or APP_STORE_COMMERCE.',
      };
    },
  },
  {
    definition: {
      name: 'create_analytics_report_request',
      description:
        'Ask Apple to make analytics reports for an app. Needs an Admin API key. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('App Store Connect app id'),
          accessType: enumStr('ONGOING (daily from now on) or ONE_TIME_SNAPSHOT (past data)', [
            'ONGOING',
            'ONE_TIME_SNAPSHOT',
          ]),
          confirm: bool('Must be true to create'),
        },
        required: ['appId', 'accessType', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('POST', '/v1/analyticsReportRequests', {
        body: resource('analyticsReportRequests', {
          attributes: { accessType: args.accessType },
          relationships: { app: rel('apps', args.appId) },
        }),
      });
    },
  },
  {
    definition: {
      name: 'list_analytics_reports',
      description: 'List the reports in an analytics report request.',
      inputSchema: {
        type: 'object',
        properties: {
          reportRequestId: str('analyticsReportRequests id from get_analytics'),
          category: enumStr('Optional report category', ANALYTICS_CATEGORIES),
          name: str('Optional exact report name, e.g. "App Downloads Standard"'),
          limit: num(`Max reports (default ${DEFAULT_LIST_LIMIT})`),
        },
        required: ['reportRequestId'],
      },
    },
    run: async (client: AppStoreConnectClient, args: any) => {
      const response = await client.request(
        'GET',
        `/v1/analyticsReportRequests/${args.reportRequestId}/reports`,
        {
          query: {
            'filter[category]': args.category,
            'filter[name]': args.name,
            limit: args.limit ?? DEFAULT_LIST_LIMIT,
          },
        }
      );
      return (response.data ?? []).map((report: any) => ({
        id: report.id,
        name: report.attributes?.name,
        category: report.attributes?.category,
      }));
    },
  },
  {
    definition: {
      name: 'list_analytics_report_instances',
      description: 'List the generated instances (one per processing date) of an analytics report.',
      inputSchema: {
        type: 'object',
        properties: {
          reportId: str('analyticsReports id from list_analytics_reports'),
          granularity: enumStr('Optional granularity', ANALYTICS_GRANULARITIES),
          processingDate: str('Optional processing date, YYYY-MM-DD'),
          limit: num(`Max instances (default ${DEFAULT_LIST_LIMIT})`),
        },
        required: ['reportId'],
      },
    },
    run: async (client: AppStoreConnectClient, args: any) => {
      const response = await client.request('GET', `/v1/analyticsReports/${args.reportId}/instances`, {
        query: {
          'filter[granularity]': args.granularity,
          'filter[processingDate]': args.processingDate,
          limit: args.limit ?? DEFAULT_LIST_LIMIT,
        },
      });
      return (response.data ?? []).map((instance: any) => ({
        id: instance.id,
        granularity: instance.attributes?.granularity,
        processingDate: instance.attributes?.processingDate,
      }));
    },
  },
  {
    definition: {
      name: 'get_analytics_report_data',
      description:
        'Download and parse all segments of an analytics report instance. Returns rows, or sums per group when groupBy or sumColumns is set.',
      inputSchema: {
        type: 'object',
        properties: {
          instanceId: str('analyticsReportInstances id from list_analytics_report_instances'),
          ...summaryProperties,
        },
        required: ['instanceId'],
      },
    },
    run: async (client: AppStoreConnectClient, args: any) => {
      const response = await client.request(
        'GET',
        `/v1/analyticsReportInstances/${args.instanceId}/segments`
      );
      const segmentUrls: string[] = (response.data ?? [])
        .map((segment: any) => segment.attributes?.url)
        .filter(Boolean);
      const tables = await Promise.all(segmentUrls.map((url) => downloadReportTable(client, url)));
      return {
        instanceId: args.instanceId,
        segmentCount: segmentUrls.length,
        ...summarizeTable(mergeTables(tables), summaryOptions(args)),
      };
    },
  },
  {
    definition: {
      name: 'get_sales_data',
      description: `Download a Sales and Trends report (units and proceeds). SALES SUMMARY reports are grouped by SKU, Title, and Product Type Identifier unless groupBy or sumColumns is set. Uses vendorNumber or the ${VENDOR_NUMBER_ENV} env var.`,
      inputSchema: {
        type: 'object',
        properties: {
          reportDate: str('YYYY-MM-DD for DAILY/WEEKLY, YYYY-MM for MONTHLY, YYYY for YEARLY'),
          frequency: enumStr('Report frequency (default DAILY)', SALES_FREQUENCIES),
          vendorNumber: str(`Vendor number. ${VENDOR_NUMBER_LOCATION}`),
          reportType: str('Report type (default SALES)'),
          reportSubType: str('Report sub-type (default SUMMARY)'),
          version: str('Optional report version, e.g. 1_0'),
          ...summaryProperties,
        },
        required: ['reportDate'],
      },
    },
    run: async (client: AppStoreConnectClient, args: any) => {
      const vendorNumber = args.vendorNumber || process.env[VENDOR_NUMBER_ENV];
      if (!vendorNumber) {
        throw new Error(
          `Vendor number is missing. Pass vendorNumber or set ${VENDOR_NUMBER_ENV}. ${VENDOR_NUMBER_LOCATION}`
        );
      }
      const reportType = args.reportType ?? 'SALES';
      const reportSubType = args.reportSubType ?? 'SUMMARY';
      const frequency = args.frequency ?? 'DAILY';
      const table = await downloadReportTable(client, '/v1/salesReports', {
        'filter[vendorNumber]': vendorNumber,
        'filter[reportType]': reportType,
        'filter[reportSubType]': reportSubType,
        'filter[frequency]': frequency,
        'filter[reportDate]': args.reportDate,
        'filter[version]': args.version,
      });
      const isSalesSummary = reportType === 'SALES' && reportSubType === 'SUMMARY';
      return {
        reportType,
        reportSubType,
        frequency,
        reportDate: args.reportDate,
        ...summarizeTable(
          table,
          summaryOptions(
            args,
            isSalesSummary
              ? { groupBy: SALES_SUMMARY_GROUP_BY, sumColumns: SALES_SUMMARY_SUM_COLUMNS }
              : undefined
          )
        ),
      };
    },
  },
];

const module = createToolModule(tools);
export const reportToolDefinitions = module.definitions;
export const runReportTool = module.run;
