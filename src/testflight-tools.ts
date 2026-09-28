import type { AppStoreConnectClient } from './appstore-client.js';
import { relList } from './jsonapi.js';
import { readLocalFile } from './local-file.js';
import { bool, createToolModule, requireConfirm, str } from './tool-runner.js';

const tools = [
  {
    definition: {
      name: 'list_beta_testers',
      description: 'List testers in a TestFlight beta group.',
      inputSchema: {
        type: 'object',
        properties: { groupId: str('betaGroups id') },
        required: ['groupId'],
      },
    },
    run: (client: AppStoreConnectClient, { groupId }: any) =>
      client.request('GET', `/v1/betaGroups/${groupId}/betaTesters`),
  },
  {
    definition: {
      name: 'remove_tester_from_beta_group',
      description: 'Remove a tester from a TestFlight group. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: str('betaGroups id'),
          testerId: str('betaTesters id'),
          confirm: bool('Must be true to remove'),
        },
        required: ['groupId', 'testerId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/betaGroups/${args.groupId}/relationships/betaTesters`, {
        body: relList('betaTesters', [args.testerId]),
      });
    },
  },
  {
    definition: {
      name: 'add_build_to_beta_group',
      description: 'Add a processed build to a TestFlight group.',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: str('betaGroups id'),
          buildId: str('builds id'),
        },
        required: ['groupId', 'buildId'],
      },
    },
    run: (client: AppStoreConnectClient, { groupId, buildId }: any) =>
      client.request('POST', `/v1/betaGroups/${groupId}/relationships/builds`, {
        body: relList('builds', [buildId]),
      }),
  },
  {
    definition: {
      name: 'remove_build_from_beta_group',
      description: 'Remove a build from a TestFlight group. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: str('betaGroups id'),
          buildId: str('builds id'),
          confirm: bool('Must be true to remove'),
        },
        required: ['groupId', 'buildId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/betaGroups/${args.groupId}/relationships/builds`, {
        body: relList('builds', [args.buildId]),
      });
    },
  },
  {
    definition: {
      name: 'list_beta_feedback',
      description: 'List TestFlight screenshot feedback submissions for an app.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          buildId: str('Optional builds id filter'),
        },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId, buildId }: any) =>
      client.request('GET', `/v1/apps/${appId}/betaFeedbackScreenshotSubmissions`, {
        query: {
          'filter[build]': buildId,
          sort: '-createdDate',
        },
      }),
  },
  {
    definition: {
      name: 'get_beta_feedback',
      description: 'Get one TestFlight screenshot feedback submission.',
      inputSchema: {
        type: 'object',
        properties: { feedbackId: str('betaFeedbackScreenshotSubmissions id') },
        required: ['feedbackId'],
      },
    },
    run: (client: AppStoreConnectClient, { feedbackId }: any) =>
      client.request('GET', `/v1/betaFeedbackScreenshotSubmissions/${feedbackId}`),
  },
  {
    definition: {
      name: 'list_beta_crashes',
      description: 'List TestFlight crash submissions for an app.',
      inputSchema: {
        type: 'object',
        properties: { appId: str('apps id') },
        required: ['appId'],
      },
    },
    run: (client: AppStoreConnectClient, { appId }: any) =>
      client.request('GET', `/v1/apps/${appId}/betaFeedbackCrashSubmissions`, {
        query: { sort: '-createdDate' },
      }),
  },
  {
    definition: {
      name: 'get_beta_crash',
      description: 'Get one TestFlight crash submission.',
      inputSchema: {
        type: 'object',
        properties: { crashId: str('betaFeedbackCrashSubmissions id') },
        required: ['crashId'],
      },
    },
    run: (client: AppStoreConnectClient, { crashId }: any) =>
      client.request('GET', `/v1/betaFeedbackCrashSubmissions/${crashId}`),
  },
  {
    definition: {
      name: 'upload_build',
      description: 'Upload a local IPA or PKG through the App Store Connect build upload API.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('apps id'),
          filePath: str('Absolute path to the IPA or PKG on the MCP host'),
          version: str('Optional CFBundleShortVersionString'),
          buildNumber: str('Optional CFBundleVersion'),
        },
        required: ['appId', 'filePath'],
      },
    },
    run: async (client: AppStoreConnectClient, args: any) => {
      const file = readLocalFile(args.filePath);
      const created = await client.request('POST', '/v1/buildUploads', {
        body: {
          data: {
            type: 'buildUploads',
            attributes: {
              fileName: file.fileName,
              fileSize: file.fileSize,
              ...(args.version ? { cfBundleShortVersionString: args.version } : {}),
              ...(args.buildNumber ? { cfBundleVersion: args.buildNumber } : {}),
            },
            relationships: { app: { data: { type: 'apps', id: args.appId } } },
          },
        },
      });
      await client.uploadReservedBinary(created, file.bytes);
      const uploadId = created.data?.id;
      if (uploadId) {
        return client.request('PATCH', `/v1/buildUploads/${uploadId}`, {
          body: {
            data: {
              type: 'buildUploads',
              id: uploadId,
              attributes: { uploaded: true },
            },
          },
        });
      }
      return created;
    },
  },
];

const module = createToolModule(tools);
export const testflightToolDefinitions = module.definitions;
export const runTestflightTool = module.run;
