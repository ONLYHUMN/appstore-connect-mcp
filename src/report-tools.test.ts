import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  decodeReportFile,
  parseTsv,
  reportToolDefinitions,
  runReportTool,
  summarizeTable,
} from './report-tools.js';

type RecordedRequest = { method: string; path: string; options?: any };

function fakeClient(responses: Record<string, unknown>) {
  const requests: RecordedRequest[] = [];
  const client = {
    async request(method: string, path: string, options?: any) {
      requests.push({ method, path, options });
      if (!(path in responses)) throw new Error(`Unexpected request: ${method} ${path}`);
      return responses[path];
    },
  };
  return { client: client as any, requests };
}

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

const salesTsv = [
  'Provider\tSKU\tTitle\tProduct Type Identifier\tUnits\tDeveloper Proceeds',
  'APPLE\t4912039113\tSourceBoard\tF1\t3\t0',
  'APPLE\t4912039113\tSourceBoard\tF1\t2\t0',
  'APPLE\tgeneralv1\tAnnual Subscription\tIAY\t1\t5.09',
  '',
].join('\n');

test('report tools export the spec names', () => {
  assert.deepEqual(reportToolDefinitions.map((tool) => tool.name).sort(), [
    'create_analytics_report_request',
    'get_analytics',
    'get_analytics_report_data',
    'get_sales_data',
    'list_analytics_report_instances',
    'list_analytics_reports',
  ]);
});

test('parseTsv maps rows to the header columns and skips blank lines', () => {
  const table = parseTsv('Date\tCounts\r\n2026-10-01\t4\r\n\r\n2026-10-02\t6\n');
  assert.deepEqual(table.columns, ['Date', 'Counts']);
  assert.deepEqual(table.rows, [
    { Date: '2026-10-01', Counts: '4' },
    { Date: '2026-10-02', Counts: '6' },
  ]);
});

test('decodeReportFile reads gzip and plain text', () => {
  assert.equal(decodeReportFile(gzipSync(Buffer.from('a\tb\n'))), 'a\tb\n');
  assert.equal(decodeReportFile(Buffer.from('a\tb\n')), 'a\tb\n');
});

test('summarizeTable sums per group and sorts by the first sum column', () => {
  const summary = summarizeTable(parseTsv(salesTsv), {
    groupBy: ['SKU'],
    sumColumns: ['Units', 'Developer Proceeds'],
  });
  assert.equal(summary.rowCount, 3);
  assert.deepEqual(summary.groups, [
    { SKU: '4912039113', Units: 5, 'Developer Proceeds': 0 },
    { SKU: 'generalv1', Units: 1, 'Developer Proceeds': 5.09 },
  ]);
});

test('summarizeTable returns raw rows with truncation when no shape is set', () => {
  const summary = summarizeTable(parseTsv(salesTsv), { maxRows: 1 });
  assert.equal(summary.rows?.length, 1);
  assert.equal(summary.truncated, true);
});

test('summarizeTable names the real columns when a column is unknown', () => {
  assert.throws(
    () => summarizeTable(parseTsv(salesTsv), { sumColumns: ['Downloads'] }),
    /Unknown column\(s\): Downloads\. Report columns: Provider, SKU/
  );
});

test('get_analytics explains the next step when no report request exists', async () => {
  const { client } = fakeClient({ '/v1/apps/6751933599/analyticsReportRequests': { data: [] } });
  const result = parseResult(await runReportTool(client, 'get_analytics', { appId: '6751933599' }));
  assert.deepEqual(result.reportRequests, []);
  assert.match(result.next, /create_analytics_report_request/);
});

test('create_analytics_report_request requires confirm and posts the app relationship', async () => {
  const { client, requests } = fakeClient({ '/v1/analyticsReportRequests': { data: { id: 'r1' } } });
  await assert.rejects(
    () =>
      runReportTool(client, 'create_analytics_report_request', {
        appId: '1',
        accessType: 'ONGOING',
      }),
    /confirm/
  );
  await runReportTool(client, 'create_analytics_report_request', {
    appId: '1',
    accessType: 'ONGOING',
    confirm: true,
  });
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(requests[0].options.body, {
    data: {
      type: 'analyticsReportRequests',
      attributes: { accessType: 'ONGOING' },
      relationships: { app: { data: { type: 'apps', id: '1' } } },
    },
  });
});

test('get_analytics_report_data merges gzip segments into one summary', async () => {
  const segmentA = 'https://example.com/a.gz';
  const segmentB = 'https://example.com/b.gz';
  const { client, requests } = fakeClient({
    '/v1/analyticsReportInstances/i1/segments': {
      data: [{ attributes: { url: segmentA } }, { attributes: { url: segmentB } }],
    },
    [segmentA]: gzipSync(Buffer.from('Date\tCounts\n2026-10-01\t4\n')),
    [segmentB]: gzipSync(Buffer.from('Date\tCounts\n2026-10-01\t6\n2026-10-02\t1\n')),
  });
  const result = parseResult(
    await runReportTool(client, 'get_analytics_report_data', {
      instanceId: 'i1',
      groupBy: ['Date'],
      sumColumns: ['Counts'],
    })
  );
  assert.equal(result.segmentCount, 2);
  assert.deepEqual(result.groups, [
    { Date: '2026-10-01', Counts: 10 },
    { Date: '2026-10-02', Counts: 1 },
  ]);
  assert.equal(requests[1].options.responseType, 'buffer');
});

test('get_sales_data needs a vendor number', async () => {
  const saved = process.env.APPLE_VENDOR_NUMBER;
  delete process.env.APPLE_VENDOR_NUMBER;
  try {
    await assert.rejects(
      () => runReportTool({} as any, 'get_sales_data', { reportDate: '2026-10-01' }),
      /Vendor number is missing\. Pass vendorNumber or set APPLE_VENDOR_NUMBER\. In App Store Connect, select Reports at the top\./
    );
  } finally {
    if (saved !== undefined) process.env.APPLE_VENDOR_NUMBER = saved;
  }
});

test('get_sales_data sends the vendor number and groups SALES SUMMARY by product', async () => {
  const { client, requests } = fakeClient({ '/v1/salesReports': gzipSync(Buffer.from(salesTsv)) });
  const result = parseResult(
    await runReportTool(client, 'get_sales_data', { reportDate: '2026-10-01', vendorNumber: '85000000' })
  );
  assert.equal(requests[0].options.query['filter[vendorNumber]'], '85000000');
  assert.equal(requests[0].options.query['filter[frequency]'], 'DAILY');
  assert.deepEqual(result.groupBy, ['SKU', 'Title', 'Product Type Identifier']);
  assert.deepEqual(result.groups[0], {
    SKU: '4912039113',
    Title: 'SourceBoard',
    'Product Type Identifier': 'F1',
    Units: 5,
    'Developer Proceeds': 0,
  });
});
