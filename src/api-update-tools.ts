import type { AppStoreConnectClient } from './appstore-client.js';
import { releaseTypeForEarliestDate } from './appstore-client.js';
import { compactAttributes, rel, resource } from './jsonapi.js';
import { bool, createToolModule, num, requireConfirm, str } from './tool-runner.js';

const phasedStates = ['INACTIVE', 'ACTIVE', 'PAUSED', 'COMPLETE'] as const;

function requirePhasedState(state: string, allowed: readonly string[]) {
  if (!allowed.includes(state)) {
    throw new Error(`phasedReleaseState must be one of: ${allowed.join(', ')}.`);
  }
}

async function listBetaReviewSubmissions(client: AppStoreConnectClient, args: any) {
  let buildIds: string[] = [];
  if (args.buildId) {
    buildIds = [args.buildId];
  } else if (args.appId) {
    const builds = await client.request('GET', `/v1/apps/${args.appId}/builds`, {
      query: { sort: '-uploadedDate', limit: 200 },
    });
    buildIds = (builds.data || []).map((build: { id?: string }) => build.id).filter(Boolean);
    if (buildIds.length === 0) return { data: [] };
  } else {
    throw new Error('Provide appId or buildId.');
  }
  return client.request('GET', '/v1/betaAppReviewSubmissions', {
    query: { 'filter[build]': buildIds.join(',') },
  });
}

async function newestSubscriptionVersionId(client: AppStoreConnectClient, subscriptionId: string) {
  const versions = await client.request('GET', `/v1/subscriptions/${subscriptionId}/versions`, {
    query: { limit: 200 },
  });
  let newestId = '';
  let newest = -1;
  for (const version of versions.data || []) {
    const number = Number(version.attributes?.version);
    if (version.id && Number.isFinite(number) && number > newest) {
      newest = number;
      newestId = version.id;
    }
  }
  if (!newestId) {
    throw new Error(`Subscription ${subscriptionId} has no versions.`);
  }
  return newestId;
}

function offerCodeBatch(
  kind: 'subscription' | 'iap',
  args: { offerCodeId: string; numberOfCodes: number; expirationDate: string; environment?: string }
) {
  const type =
    kind === 'subscription'
      ? 'subscriptionOfferCodeOneTimeUseCodes'
      : 'inAppPurchaseOfferCodeOneTimeUseCodes';
  const offerType = kind === 'subscription' ? 'subscriptionOfferCodes' : 'inAppPurchaseOfferCodes';
  return clientRequestBody(type, offerType, args);
}

function clientRequestBody(
  type: string,
  offerType: string,
  args: { offerCodeId: string; numberOfCodes: number; expirationDate: string; environment?: string }
) {
  return resource(type, {
    attributes: compactAttributes({
      numberOfCodes: args.numberOfCodes,
      expirationDate: args.expirationDate,
      environment: args.environment,
    }),
    relationships: { offerCode: rel(offerType, args.offerCodeId) },
  });
}

const tools = [
  {
    definition: {
      name: 'update_app_store_version',
      description:
        'Update an App Store version. A release date sets releaseType to SCHEDULED. downloadable false requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          versionId: str('appStoreVersions id'),
          versionString: str('Version string, for example 1.2.3'),
          copyright: str('Copyright text'),
          releaseType: {
            type: 'string',
            description: 'MANUAL, AFTER_APPROVAL, or SCHEDULED',
            enum: ['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED'],
          },
          earliestReleaseDate: str('RFC 3339 date. Applies only to a SCHEDULED release.'),
          reviewType: {
            type: 'string',
            description: 'APP_STORE or NOTARIZATION',
            enum: ['APP_STORE', 'NOTARIZATION'],
          },
          downloadable: bool('Allow download of this version on older operating systems'),
          confirm: bool('Required when downloadable is false'),
        },
        required: ['versionId'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const releaseType = releaseTypeForEarliestDate(args.releaseType, args.earliestReleaseDate);
      const attributes = compactAttributes({
        versionString: args.versionString,
        copyright: args.copyright,
        releaseType,
        earliestReleaseDate: args.earliestReleaseDate,
        reviewType: args.reviewType,
        downloadable: args.downloadable,
      });
      if (Object.keys(attributes).length === 0) {
        throw new Error('Provide a field to update.');
      }
      const turnsOffDownloads = args.downloadable === false;
      if (turnsOffDownloads && args.confirm !== true) {
        throw new Error('Set confirm to true to make a released version unavailable for download.');
      }
      if (args.confirm !== undefined && !turnsOffDownloads) {
        throw new Error('confirm applies only when downloadable is false.');
      }
      return client.request('PATCH', `/v1/appStoreVersions/${args.versionId}`, {
        body: resource('appStoreVersions', { id: args.versionId, attributes }),
      });
    },
  },
  {
    definition: {
      name: 'get_phased_release',
      description: 'Get the phased release for an App Store version.',
      inputSchema: {
        type: 'object',
        properties: { versionId: str('appStoreVersions id') },
        required: ['versionId'],
      },
    },
    run: (client: AppStoreConnectClient, { versionId }: any) =>
      client.request('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionPhasedRelease`),
  },
  {
    definition: {
      name: 'create_phased_release',
      description: 'Create a phased release for an App Store version. The default state is INACTIVE.',
      inputSchema: {
        type: 'object',
        properties: {
          versionId: str('appStoreVersions id'),
          phasedReleaseState: {
            type: 'string',
            description: 'INACTIVE, ACTIVE, PAUSED, or COMPLETE',
            enum: [...phasedStates],
          },
        },
        required: ['versionId'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const state = args.phasedReleaseState || 'INACTIVE';
      requirePhasedState(state, phasedStates);
      return client.request('POST', '/v1/appStoreVersionPhasedReleases', {
        body: resource('appStoreVersionPhasedReleases', {
          attributes: { phasedReleaseState: state },
          relationships: { appStoreVersion: rel('appStoreVersions', args.versionId) },
        }),
      });
    },
  },
  {
    definition: {
      name: 'update_phased_release',
      description: 'Set a phased release to ACTIVE, PAUSED, or COMPLETE. COMPLETE requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          phasedReleaseId: str('appStoreVersionPhasedReleases id'),
          phasedReleaseState: {
            type: 'string',
            description: 'ACTIVE, PAUSED, or COMPLETE',
            enum: ['ACTIVE', 'PAUSED', 'COMPLETE'],
          },
          confirm: bool('Required when phasedReleaseState is COMPLETE'),
        },
        required: ['phasedReleaseId', 'phasedReleaseState'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requirePhasedState(args.phasedReleaseState, ['ACTIVE', 'PAUSED', 'COMPLETE']);
      if (args.phasedReleaseState === 'COMPLETE') requireConfirm(args);
      return client.request('PATCH', `/v1/appStoreVersionPhasedReleases/${args.phasedReleaseId}`, {
        body: resource('appStoreVersionPhasedReleases', {
          id: args.phasedReleaseId,
          attributes: { phasedReleaseState: args.phasedReleaseState },
        }),
      });
    },
  },
  {
    definition: {
      name: 'delete_phased_release',
      description: 'Delete a phased release. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          phasedReleaseId: str('appStoreVersionPhasedReleases id'),
          confirm: bool('Must be true to delete'),
        },
        required: ['phasedReleaseId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/appStoreVersionPhasedReleases/${args.phasedReleaseId}`);
    },
  },
  {
    definition: {
      name: 'list_beta_review_submissions',
      description:
        'List TestFlight beta review submissions for one build, or for the 200 newest builds of an app.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id. Use this or buildId.'),
          buildId: str('builds id. Use this or appId.'),
        },
      },
    },
    run: listBetaReviewSubmissions,
  },
  {
    definition: {
      name: 'get_beta_review_submission',
      description: 'Get one TestFlight beta review submission.',
      inputSchema: {
        type: 'object',
        properties: { submissionId: str('betaAppReviewSubmissions id') },
        required: ['submissionId'],
      },
    },
    run: (client: AppStoreConnectClient, { submissionId }: any) =>
      client.request('GET', `/v1/betaAppReviewSubmissions/${submissionId}`),
  },
  {
    definition: {
      name: 'submit_beta_review',
      description: 'Submit a build for TestFlight beta review. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          buildId: str('builds id'),
          confirm: bool('Must be true to submit'),
        },
        required: ['buildId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('POST', '/v1/betaAppReviewSubmissions', {
        body: resource('betaAppReviewSubmissions', {
          relationships: { build: rel('builds', args.buildId) },
        }),
      });
    },
  },
  {
    definition: {
      name: 'list_subscription_version_localizations',
      description: 'List store text for the newest version of a subscription.',
      inputSchema: {
        type: 'object',
        properties: { subscriptionId: str('subscriptions id') },
        required: ['subscriptionId'],
      },
    },
    run: async (client: AppStoreConnectClient, { subscriptionId }: any) => {
      const versionId = await newestSubscriptionVersionId(client, subscriptionId);
      return client.request('GET', `/v1/subscriptionVersions/${versionId}/localizations`);
    },
  },
  {
    definition: {
      name: 'list_subscription_offer_codes',
      description: 'List offer codes for a subscription.',
      inputSchema: {
        type: 'object',
        properties: { subscriptionId: str('subscriptions id') },
        required: ['subscriptionId'],
      },
    },
    run: (client: AppStoreConnectClient, { subscriptionId }: any) =>
      client.request('GET', `/v1/subscriptions/${subscriptionId}/offerCodes`),
  },
  {
    definition: {
      name: 'list_in_app_purchase_offer_codes',
      description: 'List offer codes for an in-app purchase.',
      inputSchema: {
        type: 'object',
        properties: { iapId: str('inAppPurchases id') },
        required: ['iapId'],
      },
    },
    run: (client: AppStoreConnectClient, { iapId }: any) =>
      client.request('GET', `/v2/inAppPurchases/${iapId}/offerCodes`),
  },
  {
    definition: {
      name: 'generate_subscription_offer_codes',
      description: 'Generate a batch of one-time subscription offer codes. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          offerCodeId: str('subscriptionOfferCodes id'),
          numberOfCodes: num('How many codes to generate'),
          expirationDate: str('Expiration date, for example 2026-12-31'),
          environment: { type: 'string', description: 'SANDBOX or PRODUCTION', enum: ['SANDBOX', 'PRODUCTION'] },
          confirm: bool('Must be true to generate codes'),
        },
        required: ['offerCodeId', 'numberOfCodes', 'expirationDate', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('POST', '/v1/subscriptionOfferCodeOneTimeUseCodes', {
        body: offerCodeBatch('subscription', args),
      });
    },
  },
  {
    definition: {
      name: 'generate_in_app_purchase_offer_codes',
      description: 'Generate a batch of one-time in-app purchase offer codes. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          offerCodeId: str('inAppPurchaseOfferCodes id'),
          numberOfCodes: num('How many codes to generate'),
          expirationDate: str('Expiration date, for example 2026-12-31'),
          environment: { type: 'string', description: 'SANDBOX or PRODUCTION', enum: ['SANDBOX', 'PRODUCTION'] },
          confirm: bool('Must be true to generate codes'),
        },
        required: ['offerCodeId', 'numberOfCodes', 'expirationDate', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('POST', '/v1/inAppPurchaseOfferCodeOneTimeUseCodes', {
        body: offerCodeBatch('iap', args),
      });
    },
  },
  {
    definition: {
      name: 'deactivate_offer_code_batch',
      description: 'Turn off one offer-code batch. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          batchId: str('One-time use code batch id'),
          product: {
            type: 'string',
            description: 'subscription or inAppPurchase',
            enum: ['subscription', 'inAppPurchase'],
          },
          confirm: bool('Must be true to deactivate'),
        },
        required: ['batchId', 'product', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      const type =
        args.product === 'subscription'
          ? 'subscriptionOfferCodeOneTimeUseCodes'
          : args.product === 'inAppPurchase'
            ? 'inAppPurchaseOfferCodeOneTimeUseCodes'
            : '';
      if (!type) throw new Error('product must be subscription or inAppPurchase.');
      return client.request('PATCH', `/v1/${type}/${args.batchId}`, {
        body: resource(type, { id: args.batchId, attributes: { active: false } }),
      });
    },
  },
  {
    definition: {
      name: 'list_win_back_offers',
      description: 'List win-back offers for a subscription.',
      inputSchema: {
        type: 'object',
        properties: { subscriptionId: str('subscriptions id') },
        required: ['subscriptionId'],
      },
    },
    run: (client: AppStoreConnectClient, { subscriptionId }: any) =>
      client.request('GET', `/v1/subscriptions/${subscriptionId}/winBackOffers`),
  },
  {
    definition: {
      name: 'list_retention_offers',
      description: 'List retention offers for a subscription.',
      inputSchema: {
        type: 'object',
        properties: { subscriptionId: str('subscriptions id') },
        required: ['subscriptionId'],
      },
    },
    run: (client: AppStoreConnectClient, { subscriptionId }: any) =>
      client.request('GET', `/v1/subscriptions/${subscriptionId}/retentionOffers`),
  },
  {
    definition: {
      name: 'list_retention_messages',
      description: 'List retention messages for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/retentionMessages`),
  },
  {
    definition: {
      name: 'create_retention_message',
      description: 'Create a retention message for an app.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          referenceName: str('Internal name for the message'),
        },
        required: ['appId', 'referenceName'],
      },
    },
    run: (client: AppStoreConnectClient, { appId, referenceName }: any) =>
      client.request('POST', '/v1/retentionMessages', {
        body: resource('retentionMessages', {
          attributes: { referenceName },
          relationships: { app: rel('apps', appId) },
        }),
      }),
  },
  {
    definition: {
      name: 'list_app_tags',
      description: 'List App Store discoverability tags for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/appTags`),
  },
  {
    definition: {
      name: 'update_app_tag',
      description: 'Show or hide one App Store tag.',
      inputSchema: {
        type: 'object',
        properties: {
          tagId: str('appTags id'),
          visibleInAppStore: bool('Show this tag on the App Store'),
        },
        required: ['tagId', 'visibleInAppStore'],
      },
    },
    run: (client: AppStoreConnectClient, { tagId, visibleInAppStore }: any) =>
      client.request('PATCH', `/v1/appTags/${tagId}`, {
        body: resource('appTags', {
          id: tagId,
          attributes: { visibleInAppStore },
        }),
      }),
  },
  {
    definition: {
      name: 'list_background_assets',
      description: 'List background assets for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/backgroundAssets`),
  },
  {
    definition: {
      name: 'create_background_asset',
      description: 'Create a background asset pack record for an app.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          assetPackIdentifier: str('Asset pack identifier'),
        },
        required: ['appId', 'assetPackIdentifier'],
      },
    },
    run: (client: AppStoreConnectClient, { appId, assetPackIdentifier }: any) =>
      client.request('POST', '/v1/backgroundAssets', {
        body: resource('backgroundAssets', {
          attributes: { assetPackIdentifier },
          relationships: { app: rel('apps', appId) },
        }),
      }),
  },
  {
    definition: {
      name: 'list_accessibility_declarations',
      description: 'List accessibility declarations for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/accessibilityDeclarations`),
  },
  {
    definition: {
      name: 'create_accessibility_declaration',
      description: 'Create an accessibility declaration for one device family.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          deviceFamily: {
            type: 'string',
            description: 'Device family',
            enum: ['IPHONE', 'IPAD', 'APPLE_TV', 'APPLE_WATCH', 'MAC', 'VISION'],
          },
          supportsVoiceover: bool('VoiceOver support'),
          supportsCaptions: bool('Captions support'),
          supportsDarkInterface: bool('Dark interface support'),
          supportsLargerText: bool('Larger text support'),
          supportsReducedMotion: bool('Reduced motion support'),
          supportsSufficientContrast: bool('Sufficient contrast support'),
          supportsVoiceControl: bool('Voice Control support'),
          supportsAudioDescriptions: bool('Audio descriptions support'),
          supportsDifferentiateWithoutColorAlone: bool('Differentiate without color alone'),
        },
        required: ['appId', 'deviceFamily'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/accessibilityDeclarations', {
        body: resource('accessibilityDeclarations', {
          attributes: compactAttributes({
            deviceFamily: args.deviceFamily,
            supportsVoiceover: args.supportsVoiceover,
            supportsCaptions: args.supportsCaptions,
            supportsDarkInterface: args.supportsDarkInterface,
            supportsLargerText: args.supportsLargerText,
            supportsReducedMotion: args.supportsReducedMotion,
            supportsSufficientContrast: args.supportsSufficientContrast,
            supportsVoiceControl: args.supportsVoiceControl,
            supportsAudioDescriptions: args.supportsAudioDescriptions,
            supportsDifferentiateWithoutColorAlone: args.supportsDifferentiateWithoutColorAlone,
          }),
          relationships: { app: rel('apps', args.appId) },
        }),
      }),
  },
  {
    definition: {
      name: 'update_accessibility_declaration',
      description: 'Update or publish an accessibility declaration.',
      inputSchema: {
        type: 'object',
        properties: {
          declarationId: str('accessibilityDeclarations id'),
          publish: bool('Publish the declaration'),
          supportsVoiceover: bool('VoiceOver support'),
          supportsCaptions: bool('Captions support'),
          supportsDarkInterface: bool('Dark interface support'),
          supportsLargerText: bool('Larger text support'),
          supportsReducedMotion: bool('Reduced motion support'),
          supportsSufficientContrast: bool('Sufficient contrast support'),
          supportsVoiceControl: bool('Voice Control support'),
          supportsAudioDescriptions: bool('Audio descriptions support'),
          supportsDifferentiateWithoutColorAlone: bool('Differentiate without color alone'),
        },
        required: ['declarationId'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const attributes = compactAttributes({
        publish: args.publish,
        supportsVoiceover: args.supportsVoiceover,
        supportsCaptions: args.supportsCaptions,
        supportsDarkInterface: args.supportsDarkInterface,
        supportsLargerText: args.supportsLargerText,
        supportsReducedMotion: args.supportsReducedMotion,
        supportsSufficientContrast: args.supportsSufficientContrast,
        supportsVoiceControl: args.supportsVoiceControl,
        supportsAudioDescriptions: args.supportsAudioDescriptions,
        supportsDifferentiateWithoutColorAlone: args.supportsDifferentiateWithoutColorAlone,
      });
      if (Object.keys(attributes).length === 0) {
        throw new Error('Provide a field to update.');
      }
      return client.request('PATCH', `/v1/accessibilityDeclarations/${args.declarationId}`, {
        body: resource('accessibilityDeclarations', { id: args.declarationId, attributes }),
      });
    },
  },
  {
    definition: {
      name: 'list_promoted_purchases',
      description: 'List promoted in-app purchases and subscriptions for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/promotedPurchases`),
  },
  {
    definition: {
      name: 'create_promoted_purchase',
      description: 'Promote one in-app purchase or one subscription on the app page.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          iapId: str('inAppPurchases id. Use this or subscriptionId.'),
          subscriptionId: str('subscriptions id. Use this or iapId.'),
          visibleForAllUsers: bool('Show the promotion to all users'),
          enabled: bool('Turn the promotion on'),
        },
        required: ['appId', 'visibleForAllUsers'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      if (Boolean(args.iapId) === Boolean(args.subscriptionId)) {
        throw new Error('Provide iapId or subscriptionId.');
      }
      const relationships: Record<string, unknown> = { app: rel('apps', args.appId) };
      if (args.iapId) relationships.inAppPurchaseV2 = rel('inAppPurchases', args.iapId);
      if (args.subscriptionId) relationships.subscription = rel('subscriptions', args.subscriptionId);
      return client.request('POST', '/v1/promotedPurchases', {
        body: resource('promotedPurchases', {
          attributes: compactAttributes({
            visibleForAllUsers: args.visibleForAllUsers,
            enabled: args.enabled,
          }),
          relationships,
        }),
      });
    },
  },
];

const module = createToolModule(tools);
export const apiUpdateToolDefinitions = module.definitions;
export const runApiUpdateTool = module.run;
