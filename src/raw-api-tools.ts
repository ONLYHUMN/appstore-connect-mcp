import type { AppStoreConnectClient } from './appstore-client.js';
import { bool, createToolModule, requireConfirm, str } from './tool-runner.js';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const tools = [
  {
    definition: {
      name: 'call_app_store_connect_api',
      description:
        'Send a raw authenticated request to the App Store Connect API. Path must start with /. Mutating methods require confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            description: 'HTTP method',
            enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
          },
          path: str('API path, e.g. /v1/apps'),
          query: { type: 'object', description: 'Optional query parameters' },
          body: { type: 'object', description: 'Optional JSON:API body' },
          confirm: bool('Required for POST, PATCH, PUT, and DELETE'),
        },
        required: ['method', 'path'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      const method = String(args.method || 'GET').toUpperCase();
      const path = String(args.path || '');
      if (!path.startsWith('/')) {
        throw new Error('path must start with /');
      }
      if (MUTATING.has(method)) {
        requireConfirm(args);
      }
      return client.request(method, path, {
        query: args.query,
        body: args.body,
      });
    },
  },
];

const module = createToolModule(tools);
export const rawApiToolDefinitions = module.definitions;
export const runRawApiTool = module.run;
