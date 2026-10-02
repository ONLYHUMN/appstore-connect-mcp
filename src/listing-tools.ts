import type { AppStoreConnectClient } from './appstore-client.js';
import { compactAttributes, rel, relList, resource } from './jsonapi.js';
import { readLocalFile } from './local-file.js';
import { bool, createToolModule, requireConfirm, str, strList } from './tool-runner.js';

async function uploadAsset(
  client: AppStoreConnectClient,
  type: 'appScreenshots' | 'appPreviews',
  setType: 'appScreenshotSets' | 'appPreviewSets',
  setId: string,
  filePath: string
) {
  const file = readLocalFile(filePath);
  const created = await client.request('POST', `/v1/${type}`, {
    body: resource(type, {
      attributes: { fileName: file.fileName, fileSize: file.fileSize },
      relationships: {
        [setType === 'appScreenshotSets' ? 'appScreenshotSet' : 'appPreviewSet']: rel(setType, setId),
      },
    }),
  });
  await client.uploadReservedBinary(created, file.bytes);
  const id = created.data?.id;
  if (!id) return created;
  return client.request('PATCH', `/v1/${type}/${id}`, {
    body: resource(type, { id, attributes: { uploaded: true } }),
  });
}

const tools = [
  {
    definition: {
      name: 'reply_to_review',
      description: 'Reply to a customer review.',
      inputSchema: {
        type: 'object',
        properties: {
          reviewId: str('customerReviews id'),
          responseBody: str('Public reply text'),
        },
        required: ['reviewId', 'responseBody'],
      },
    },
    run: (client: AppStoreConnectClient, { reviewId, responseBody }: any) =>
      client.request('POST', '/v1/customerReviewResponses', {
        body: resource('customerReviewResponses', {
          attributes: { responseBody },
          relationships: { review: rel('customerReviews', reviewId) },
        }),
      }),
  },
  {
    definition: {
      name: 'get_review_response',
      description: 'Get the developer reply for a customer review.',
      inputSchema: {
        type: 'object',
        properties: { reviewId: str('customerReviews id') },
        required: ['reviewId'],
      },
    },
    run: (client: AppStoreConnectClient, { reviewId }: any) =>
      client.request('GET', `/v1/customerReviews/${reviewId}/response`),
  },
  {
    definition: {
      name: 'list_app_price_points',
      description: 'List app price points for a territory.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          territory: str('Territory code, e.g. USA'),
        },
        required: ['appId', 'territory'],
      },
    },
    run: (client: AppStoreConnectClient, { appId, territory }: any) =>
      client.request('GET', `/v1/apps/${appId}/appPricePoints`, {
        query: { 'filter[territory]': territory, include: 'territory' },
      }),
  },
  {
    definition: {
      name: 'set_app_price',
      description: 'Set the app price from a price point.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          pricePointId: str('appPricePoints id'),
          territory: str('Base territory code, e.g. USA'),
          startDate: str('Optional YYYY-MM-DD start date'),
        },
        required: ['appId', 'pricePointId', 'territory'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const priceId = `price-${args.territory}`;
      return client.request('POST', '/v1/appPriceSchedules', {
        body: {
          data: {
            type: 'appPriceSchedules',
            relationships: {
              app: rel('apps', args.appId),
              baseTerritory: rel('territories', args.territory),
              manualPrices: relList('appPrices', [priceId]),
            },
          },
          included: [
            {
              type: 'appPrices',
              id: priceId,
              attributes: compactAttributes({ startDate: args.startDate ?? null }),
              relationships: { appPricePoint: rel('appPricePoints', args.pricePointId) },
            },
          ],
        },
      });
    },
  },
  {
    definition: {
      name: 'set_app_availability',
      description:
        'Set the territories where the app is for sale. Omit territories or set allTerritories to sell in every territory.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          territories: strList('Territory codes, e.g. ["USA"]'),
          allTerritories: bool('Sell in every App Store territory'),
          availableInNewTerritories: bool('Sell automatically in territories Apple adds later'),
        },
        required: ['appId', 'availableInNewTerritories'],
      },
    },
    run: async (client: AppStoreConnectClient, args: any) => {
      let territories: string[] = args.territories || [];
      if (args.allTerritories || territories.length === 0) {
        territories = await client.listTerritories();
      }
      return client.request('POST', '/v1/appAvailabilities', {
        body: resource('appAvailabilities', {
          attributes: { availableInNewTerritories: args.availableInNewTerritories },
          relationships: {
            app: rel('apps', args.appId),
            availableTerritories: relList('territories', territories),
          },
        }),
      });
    },
  },
  {
    definition: {
      name: 'list_screenshot_sets',
      description: 'List screenshot sets for an App Store version localization.',
      inputSchema: {
        type: 'object',
        properties: { versionLocalizationId: str('appStoreVersionLocalizations id') },
        required: ['versionLocalizationId'],
      },
    },
    run: (client: AppStoreConnectClient, { versionLocalizationId }: any) =>
      client.request('GET', `/v1/appStoreVersionLocalizations/${versionLocalizationId}/appScreenshotSets`),
  },
  {
    definition: {
      name: 'create_screenshot_set',
      description: 'Create a screenshot set for a device display type.',
      inputSchema: {
        type: 'object',
        properties: {
          versionLocalizationId: str('appStoreVersionLocalizations id'),
          screenshotDisplayType: str('e.g. APP_IPHONE_65'),
        },
        required: ['versionLocalizationId', 'screenshotDisplayType'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/appScreenshotSets', {
        body: resource('appScreenshotSets', {
          attributes: { screenshotDisplayType: args.screenshotDisplayType },
          relationships: {
            appStoreVersionLocalization: rel('appStoreVersionLocalizations', args.versionLocalizationId),
          },
        }),
      }),
  },
  {
    definition: {
      name: 'upload_screenshot',
      description: 'Upload a local screenshot image into a screenshot set.',
      inputSchema: {
        type: 'object',
        properties: {
          screenshotSetId: str('appScreenshotSets id'),
          filePath: str('Absolute image path on the MCP host'),
        },
        required: ['screenshotSetId', 'filePath'],
      },
    },
    run: (client: AppStoreConnectClient, { screenshotSetId, filePath }: any) =>
      uploadAsset(client, 'appScreenshots', 'appScreenshotSets', screenshotSetId, filePath),
  },
  {
    definition: {
      name: 'delete_screenshot',
      description: 'Delete a screenshot. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          screenshotId: str('appScreenshots id'),
          confirm: bool('Must be true to delete'),
        },
        required: ['screenshotId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/appScreenshots/${args.screenshotId}`);
    },
  },
  {
    definition: {
      name: 'list_app_preview_sets',
      description: 'List app preview sets for an App Store version localization.',
      inputSchema: {
        type: 'object',
        properties: { versionLocalizationId: str('appStoreVersionLocalizations id') },
        required: ['versionLocalizationId'],
      },
    },
    run: (client: AppStoreConnectClient, { versionLocalizationId }: any) =>
      client.request('GET', `/v1/appStoreVersionLocalizations/${versionLocalizationId}/appPreviewSets`),
  },
  {
    definition: {
      name: 'create_app_preview_set',
      description: 'Create an app preview set for a preview type.',
      inputSchema: {
        type: 'object',
        properties: {
          versionLocalizationId: str('appStoreVersionLocalizations id'),
          previewType: str('e.g. IPHONE_65'),
        },
        required: ['versionLocalizationId', 'previewType'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/appPreviewSets', {
        body: resource('appPreviewSets', {
          attributes: { previewType: args.previewType },
          relationships: {
            appStoreVersionLocalization: rel('appStoreVersionLocalizations', args.versionLocalizationId),
          },
        }),
      }),
  },
  {
    definition: {
      name: 'upload_app_preview',
      description: 'Upload a local preview video into a preview set.',
      inputSchema: {
        type: 'object',
        properties: {
          previewSetId: str('appPreviewSets id'),
          filePath: str('Absolute video path on the MCP host'),
        },
        required: ['previewSetId', 'filePath'],
      },
    },
    run: (client: AppStoreConnectClient, { previewSetId, filePath }: any) =>
      uploadAsset(client, 'appPreviews', 'appPreviewSets', previewSetId, filePath),
  },
  {
    definition: {
      name: 'delete_app_preview',
      description: 'Delete an app preview. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          previewId: str('appPreviews id'),
          confirm: bool('Must be true to delete'),
        },
        required: ['previewId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/appPreviews/${args.previewId}`);
    },
  },
];

const module = createToolModule(tools);
export const listingToolDefinitions = module.definitions;
export const runListingTool = module.run;
