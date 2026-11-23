import type { AppStoreConnectClient } from './appstore-client.js';
import { compactAttributes, rel, resource } from './jsonapi.js';
import { bool, createToolModule, requireConfirm, str } from './tool-runner.js';

const reviewItemLinks: Record<string, { field: string; type: string }> = {
  appStoreVersions: { field: 'appStoreVersion', type: 'appStoreVersions' },
  appCustomProductPageVersions: {
    field: 'appCustomProductPageVersion',
    type: 'appCustomProductPageVersions',
  },
  appAssetLibraryImages: { field: 'appAssetLibraryImage', type: 'appAssetLibraryImages' },
  appAssetLibraryVideos: { field: 'appAssetLibraryVideo', type: 'appAssetLibraryVideos' },
  appEvents: { field: 'appEvent', type: 'appEvents' },
  appStoreVersionExperiments: {
    field: 'appStoreVersionExperiment',
    type: 'appStoreVersionExperiments',
  },
  appStoreVersionExperimentsV2: {
    field: 'appStoreVersionExperimentV2',
    type: 'appStoreVersionExperiments',
  },
  backgroundAssetVersions: { field: 'backgroundAssetVersion', type: 'backgroundAssetVersions' },
  gameCenterAchievementVersions: {
    field: 'gameCenterAchievementVersion',
    type: 'gameCenterAchievementVersions',
  },
  gameCenterActivityVersions: {
    field: 'gameCenterActivityVersion',
    type: 'gameCenterActivityVersions',
  },
  gameCenterChallengeVersions: {
    field: 'gameCenterChallengeVersion',
    type: 'gameCenterChallengeVersions',
  },
  gameCenterLeaderboardSetVersions: {
    field: 'gameCenterLeaderboardSetVersion',
    type: 'gameCenterLeaderboardSetVersions',
  },
  gameCenterLeaderboardVersions: {
    field: 'gameCenterLeaderboardVersion',
    type: 'gameCenterLeaderboardVersions',
  },
  inAppPurchaseVersions: { field: 'inAppPurchaseVersion', type: 'inAppPurchaseVersions' },
  subscriptionVersions: { field: 'subscriptionVersion', type: 'subscriptionVersions' },
  subscriptionGroupVersions: {
    field: 'subscriptionGroupVersion',
    type: 'subscriptionGroupVersions',
  },
  retentionMessageVersions: { field: 'retentionMessageVersion', type: 'retentionMessageVersions' },
};

const tools = [
  {
    definition: {
      name: 'attach_build_to_version',
      description: 'Attach a processed build to an App Store version.',
      inputSchema: {
        type: 'object',
        properties: {
          versionId: str('appStoreVersions id'),
          buildId: str('builds id'),
        },
        required: ['versionId', 'buildId'],
      },
    },
    run: (client: AppStoreConnectClient, { versionId, buildId }: any) =>
      client.request('PATCH', `/v1/appStoreVersions/${versionId}`, {
        body: resource('appStoreVersions', {
          id: versionId,
          relationships: { build: rel('builds', buildId) },
        }),
      }),
  },
  {
    definition: {
      name: 'get_review_detail',
      description: 'Get App Review contact, demo account, and notes for a version.',
      inputSchema: {
        type: 'object',
        properties: { versionId: str('appStoreVersions id') },
        required: ['versionId'],
      },
    },
    run: (client: AppStoreConnectClient, { versionId }: any) =>
      client.request('GET', `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`),
  },
  {
    definition: {
      name: 'update_review_detail',
      description: 'Create or update App Review details for a version.',
      inputSchema: {
        type: 'object',
        properties: {
          versionId: str('appStoreVersions id (required to create)'),
          reviewDetailId: str('appStoreReviewDetails id (required to update)'),
          contactFirstName: str('Review contact first name'),
          contactLastName: str('Review contact last name'),
          contactEmail: str('Review contact email'),
          contactPhone: str('Review contact phone'),
          demoAccountName: str('Demo account user name'),
          demoAccountPassword: str('Demo account password'),
          demoAccountRequired: bool('Whether a demo account is required'),
          notes: str('Notes for App Review'),
        },
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const attributes = compactAttributes({
        contactFirstName: args.contactFirstName,
        contactLastName: args.contactLastName,
        contactEmail: args.contactEmail,
        contactPhone: args.contactPhone,
        demoAccountName: args.demoAccountName,
        demoAccountPassword: args.demoAccountPassword,
        demoAccountRequired: args.demoAccountRequired,
        notes: args.notes,
      });
      if (args.reviewDetailId) {
        return client.request('PATCH', `/v1/appStoreReviewDetails/${args.reviewDetailId}`, {
          body: resource('appStoreReviewDetails', { id: args.reviewDetailId, attributes }),
        });
      }
      if (!args.versionId) {
        throw new Error('Provide reviewDetailId to update or versionId to create.');
      }
      return client.request('POST', '/v1/appStoreReviewDetails', {
        body: resource('appStoreReviewDetails', {
          attributes,
          relationships: { appStoreVersion: rel('appStoreVersions', args.versionId) },
        }),
      });
    },
  },
  {
    definition: {
      name: 'create_review_submission',
      description: 'Create a review submission for an app and platform.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          platform: {
            type: 'string',
            description: 'Platform',
            enum: ['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS'],
          },
        },
        required: ['appId', 'platform'],
      },
    },
    run: (client: AppStoreConnectClient, { appId, platform }: any) =>
      client.request('POST', '/v1/reviewSubmissions', {
        body: resource('reviewSubmissions', {
          attributes: { platform },
          relationships: { app: rel('apps', appId) },
        }),
      }),
  },
  {
    definition: {
      name: 'add_review_submission_item',
      description:
        'Add one item to a review submission. Pass versionId for an App Store version, or itemType plus itemId for a subscription, event, or other review item.',
      inputSchema: {
        type: 'object',
        properties: {
          reviewSubmissionId: str('reviewSubmissions id'),
          versionId: str('appStoreVersions id. Use this or itemType plus itemId.'),
          itemType: str(
            'Review item type, for example subscriptionVersions, inAppPurchaseVersions, appEvents, or backgroundAssetVersions'
          ),
          itemId: str('Id of the item named by itemType'),
        },
        required: ['reviewSubmissionId'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      if (args.versionId && (args.itemType || args.itemId)) {
        throw new Error('Pass versionId, or itemType with itemId.');
      }
      const itemType = args.versionId ? 'appStoreVersions' : args.itemType;
      const itemId = args.versionId || args.itemId;
      if (!itemType || !itemId) {
        throw new Error('Provide versionId, or itemType and itemId.');
      }
      const link = reviewItemLinks[itemType];
      if (!link) {
        throw new Error(`Unsupported itemType: ${itemType}`);
      }
      return client.request('POST', '/v1/reviewSubmissionItems', {
        body: resource('reviewSubmissionItems', {
          relationships: {
            reviewSubmission: rel('reviewSubmissions', args.reviewSubmissionId),
            [link.field]: rel(link.type, itemId),
          },
        }),
      });
    },
  },
  {
    definition: {
      name: 'submit_review_submission',
      description: 'Submit a review submission to App Review. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          reviewSubmissionId: str('reviewSubmissions id'),
          confirm: bool('Must be true to submit'),
        },
        required: ['reviewSubmissionId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('PATCH', `/v1/reviewSubmissions/${args.reviewSubmissionId}`, {
        body: resource('reviewSubmissions', {
          id: args.reviewSubmissionId,
          attributes: { submitted: true },
        }),
      });
    },
  },
  {
    definition: {
      name: 'cancel_review_submission',
      description: 'Cancel a review submission. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          reviewSubmissionId: str('reviewSubmissions id'),
          confirm: bool('Must be true to cancel'),
        },
        required: ['reviewSubmissionId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('PATCH', `/v1/reviewSubmissions/${args.reviewSubmissionId}`, {
        body: resource('reviewSubmissions', {
          id: args.reviewSubmissionId,
          attributes: { canceled: true },
        }),
      });
    },
  },
  {
    definition: {
      name: 'get_review_submission',
      description: 'Get a review submission and its items.',
      inputSchema: {
        type: 'object',
        properties: { reviewSubmissionId: str('reviewSubmissions id') },
        required: ['reviewSubmissionId'],
      },
    },
    run: (client: AppStoreConnectClient, { reviewSubmissionId }: any) =>
      client.request('GET', `/v1/reviewSubmissions/${reviewSubmissionId}`, {
        query: { include: 'items' },
      }),
  },
];

const module = createToolModule(tools);
export const releaseToolDefinitions = module.definitions;
export const runReleaseTool = module.run;
