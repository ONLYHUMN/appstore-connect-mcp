import type { AppStoreConnectClient } from './appstore-client.js';
import { compactAttributes, rel, relList, resource } from './jsonapi.js';
import { bool, createToolModule, requireConfirm, str, strList } from './tool-runner.js';

async function gameCenterDetailId(client: AppStoreConnectClient, appId: string): Promise<string> {
  const detail = await client.request('GET', `/v1/apps/${appId}/gameCenterDetail`);
  const id = detail?.data?.id;
  if (!id) {
    throw new Error(`No Game Center detail found for app ${appId}`);
  }
  return id;
}

const tools = [
  {
    definition: {
      name: 'get_age_rating_declaration',
      description: 'Get the age rating declaration for an app info resource.',
      inputSchema: {
        type: 'object',
        properties: { appInfoId: str('appInfos id from get_app_info_details') },
        required: ['appInfoId'],
      },
    },
    run: (client: AppStoreConnectClient, { appInfoId }: any) =>
      client.request('GET', `/v1/appInfos/${appInfoId}/ageRatingDeclaration`),
  },
  {
    definition: {
      name: 'update_age_rating_declaration',
      description: 'Update an age rating declaration. Pass Apple attribute names as extra fields.',
      inputSchema: {
        type: 'object',
        properties: {
          declarationId: str('ageRatingDeclarations id'),
          attributes: { type: 'object', description: 'Apple ageRatingDeclarations attributes' },
        },
        required: ['declarationId', 'attributes'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('PATCH', `/v1/ageRatingDeclarations/${args.declarationId}`, {
        body: resource('ageRatingDeclarations', {
          id: args.declarationId,
          attributes: args.attributes,
        }),
      }),
  },
  {
    definition: {
      name: 'list_encryption_declarations',
      description: 'List app encryption declarations for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/appEncryptionDeclarations`),
  },
  {
    definition: {
      name: 'create_encryption_declaration',
      description: 'Create an app encryption declaration.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          usesEncryption: bool('App uses encryption'),
          exempt: bool('Encryption exemption applies'),
          containsProprietaryCryptography: bool('Contains proprietary cryptography'),
          containsThirdPartyCryptography: bool('Contains third-party cryptography'),
          availableOnFrenchStore: bool('Available on the French store'),
        },
        required: ['appId', 'usesEncryption'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/appEncryptionDeclarations', {
        body: resource('appEncryptionDeclarations', {
          attributes: compactAttributes({
            usesEncryption: args.usesEncryption,
            exempt: args.exempt,
            containsProprietaryCryptography: args.containsProprietaryCryptography,
            containsThirdPartyCryptography: args.containsThirdPartyCryptography,
            availableOnFrenchStore: args.availableOnFrenchStore,
          }),
          relationships: { app: rel('apps', args.appId) },
        }),
      }),
  },
  {
    definition: {
      name: 'get_eula',
      description: 'Get the custom EULA for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/endUserLicenseAgreement`),
  },
  {
    definition: {
      name: 'set_eula',
      description: 'Create or update a custom EULA.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          eulaId: str('endUserLicenseAgreements id when updating'),
          agreementText: str('EULA text'),
          territories: strList('Territory codes'),
        },
        required: ['agreementText', 'territories'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const relationships = {
        territories: relList('territories', args.territories),
        ...(args.appId && !args.eulaId ? { app: rel('apps', args.appId) } : {}),
      };
      if (args.eulaId) {
        return client.request('PATCH', `/v1/endUserLicenseAgreements/${args.eulaId}`, {
          body: resource('endUserLicenseAgreements', {
            id: args.eulaId,
            attributes: { agreementText: args.agreementText },
            relationships,
          }),
        });
      }
      if (!args.appId) {
        throw new Error('Provide eulaId to update or appId to create.');
      }
      return client.request('POST', '/v1/endUserLicenseAgreements', {
        body: resource('endUserLicenseAgreements', {
          attributes: { agreementText: args.agreementText },
          relationships,
        }),
      });
    },
  },
  {
    definition: {
      name: 'list_app_clips',
      description: 'List App Clips for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/appClips`),
  },
  {
    definition: {
      name: 'list_app_events',
      description: 'List in-app events for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/appEvents`),
  },
  {
    definition: {
      name: 'create_app_event',
      description: 'Create an in-app event.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          referenceName: str('Internal event name'),
          badge: str('Event badge, e.g. LIVE_EVENT'),
          deepLink: str('Optional deep link URL'),
          purchaseRequirement: str('Optional purchase requirement'),
        },
        required: ['appId', 'referenceName'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/appEvents', {
        body: resource('appEvents', {
          attributes: compactAttributes({
            referenceName: args.referenceName,
            badge: args.badge,
            deepLink: args.deepLink,
            purchaseRequirement: args.purchaseRequirement,
          }),
          relationships: { app: rel('apps', args.appId) },
        }),
      }),
  },
  {
    definition: {
      name: 'list_custom_product_pages',
      description: 'List custom product pages for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/appCustomProductPages`),
  },
  {
    definition: {
      name: 'get_pre_order',
      description: 'Get the app pre-order configuration.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/preOrder`),
  },
  {
    definition: {
      name: 'set_pre_order',
      description: 'Create or update an app pre-order.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          preOrderId: str('appPreOrders id when updating'),
          appReleaseDate: str('Optional YYYY-MM-DD release date'),
        },
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const attributes = compactAttributes({ appReleaseDate: args.appReleaseDate });
      if (args.preOrderId) {
        return client.request('PATCH', `/v1/appPreOrders/${args.preOrderId}`, {
          body: resource('appPreOrders', { id: args.preOrderId, attributes }),
        });
      }
      if (!args.appId) {
        throw new Error('Provide preOrderId to update or appId to create.');
      }
      return client.request('POST', '/v1/appPreOrders', {
        body: resource('appPreOrders', {
          attributes,
          relationships: { app: rel('apps', args.appId) },
        }),
      });
    },
  },
  {
    definition: {
      name: 'list_webhooks',
      description: 'List App Store Connect webhooks.',
      inputSchema: { type: 'object', properties: {} },
    },
    run: (client: AppStoreConnectClient) => client.request('GET', '/v1/webhooks'),
  },
  {
    definition: {
      name: 'create_webhook',
      description: 'Create an App Store Connect webhook.',
      inputSchema: {
        type: 'object',
        properties: {
          url: str('Webhook URL'),
          secret: str('Webhook secret'),
          eventTypes: strList('Event types, e.g. ["APP_STORE_VERSION_STATE_CHANGED"]'),
        },
        required: ['url', 'eventTypes'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/webhooks', {
        body: resource('webhooks', {
          attributes: compactAttributes({
            url: args.url,
            secret: args.secret,
            eventTypes: args.eventTypes,
          }),
        }),
      }),
  },
  {
    definition: {
      name: 'delete_webhook',
      description: 'Delete a webhook. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          webhookId: str('webhooks id'),
          confirm: bool('Must be true to delete'),
        },
        required: ['webhookId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/webhooks/${args.webhookId}`);
    },
  },
  {
    definition: {
      name: 'list_sandbox_testers',
      description: 'List Sandbox Apple ID testers.',
      inputSchema: { type: 'object', properties: {} },
    },
    run: (client: AppStoreConnectClient) => client.request('GET', '/v2/sandboxTesters'),
  },
  {
    definition: {
      name: 'create_sandbox_tester',
      description: 'Create a Sandbox Apple ID tester.',
      inputSchema: {
        type: 'object',
        properties: {
          email: str('Sandbox tester email'),
          password: str('Sandbox tester password'),
          firstName: str('First name'),
          lastName: str('Last name'),
          territory: str('Territory code, e.g. USA'),
        },
        required: ['email', 'password', 'territory'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v2/sandboxTesters', {
        body: resource('sandboxTesters', {
          attributes: compactAttributes({
            email: args.email,
            password: args.password,
            firstName: args.firstName,
            lastName: args.lastName,
            territory: args.territory,
          }),
        }),
      }),
  },
  {
    definition: {
      name: 'delete_sandbox_tester',
      description: 'Delete a Sandbox tester. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          testerId: str('sandboxTesters id'),
          confirm: bool('Must be true to delete'),
        },
        required: ['testerId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v2/sandboxTesters/${args.testerId}`);
    },
  },
  {
    definition: {
      name: 'list_xcode_cloud_products',
      description: 'List Xcode Cloud products.',
      inputSchema: { type: 'object', properties: {} },
    },
    run: (client: AppStoreConnectClient) => client.request('GET', '/v1/ciProducts'),
  },
  {
    definition: {
      name: 'list_xcode_cloud_workflows',
      description: 'List Xcode Cloud workflows for a product.',
      inputSchema: {
        type: 'object',
        properties: { ciProductId: str('ciProducts id') },
        required: ['ciProductId'],
      },
    },
    run: (client: AppStoreConnectClient, { ciProductId }: any) =>
      client.request('GET', `/v1/ciProducts/${ciProductId}/workflows`),
  },
  {
    definition: {
      name: 'start_xcode_cloud_build',
      description: 'Start an Xcode Cloud build run for a workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: str('ciWorkflows id'),
          clean: bool('Force a clean build'),
        },
        required: ['workflowId'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/ciBuildRuns', {
        body: resource('ciBuildRuns', {
          attributes: compactAttributes({ clean: args.clean }),
          relationships: { workflow: rel('ciWorkflows', args.workflowId) },
        }),
      }),
  },
  {
    definition: {
      name: 'get_xcode_cloud_build',
      description: 'Get one Xcode Cloud build run.',
      inputSchema: {
        type: 'object',
        properties: { buildRunId: str('ciBuildRuns id') },
        required: ['buildRunId'],
      },
    },
    run: (client: AppStoreConnectClient, { buildRunId }: any) =>
      client.request('GET', `/v1/ciBuildRuns/${buildRunId}`),
  },
  {
    definition: {
      name: 'list_game_center_leaderboards',
      description: 'List Game Center leaderboards for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: async (client: AppStoreConnectClient, { appId }: any) => {
      const detailId = await gameCenterDetailId(client, appId);
      return client.request('GET', `/v1/gameCenterDetails/${detailId}/gameCenterLeaderboards`);
    },
  },
  {
    definition: {
      name: 'list_game_center_achievements',
      description: 'List Game Center achievements for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: async (client: AppStoreConnectClient, { appId }: any) => {
      const detailId = await gameCenterDetailId(client, appId);
      return client.request('GET', `/v1/gameCenterDetails/${detailId}/gameCenterAchievements`);
    },
  },
];

const module = createToolModule(tools);
export const catalogToolDefinitions = module.definitions;
export const runCatalogTool = module.run;
