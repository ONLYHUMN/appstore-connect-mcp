import type { AppStoreConnectClient } from './appstore-client.js';
import { compactAttributes, resource } from './jsonapi.js';
import { bool, createToolModule, num, requireConfirm, str, strList } from './tool-runner.js';

const tools = [
  {
    definition: {
      name: 'list_users',
      description: 'List App Store Connect users.',
      inputSchema: {
        type: 'object',
        properties: { limit: num('Max users to return') },
      },
    },
    run: (client: AppStoreConnectClient, { limit }: any) =>
      client.request('GET', '/v1/users', { query: { limit } }),
  },
  {
    definition: {
      name: 'invite_user',
      description: 'Invite a user to the App Store Connect team.',
      inputSchema: {
        type: 'object',
        properties: {
          email: str('Invite email'),
          firstName: str('First name'),
          lastName: str('Last name'),
          roles: strList('Roles, e.g. ["APP_MANAGER"]'),
          allAppsVisible: bool('Access to all apps'),
        },
        required: ['email', 'roles'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/userInvitations', {
        body: resource('userInvitations', {
          attributes: compactAttributes({
            email: args.email,
            firstName: args.firstName,
            lastName: args.lastName,
            roles: args.roles,
            allAppsVisible: args.allAppsVisible,
          }),
        }),
      }),
  },
  {
    definition: {
      name: 'list_user_invitations',
      description: 'List pending App Store Connect user invitations.',
      inputSchema: { type: 'object', properties: {} },
    },
    run: (client: AppStoreConnectClient) => client.request('GET', '/v1/userInvitations'),
  },
  {
    definition: {
      name: 'cancel_user_invitation',
      description: 'Cancel a pending user invitation. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          invitationId: str('userInvitations id'),
          confirm: bool('Must be true to cancel'),
        },
        required: ['invitationId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/userInvitations/${args.invitationId}`);
    },
  },
  {
    definition: {
      name: 'remove_user',
      description: 'Remove a user from the team. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: str('users id'),
          confirm: bool('Must be true to remove'),
        },
        required: ['userId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/users/${args.userId}`);
    },
  },
  {
    definition: {
      name: 'list_devices',
      description: 'List registered development devices.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: str('Optional platform filter, e.g. IOS'),
          limit: num('Max devices to return'),
        },
      },
    },
    run: (client: AppStoreConnectClient, { platform, limit }: any) =>
      client.request('GET', '/v1/devices', {
        query: { 'filter[platform]': platform, limit },
      }),
  },
  {
    definition: {
      name: 'register_device',
      description: 'Register a development device.',
      inputSchema: {
        type: 'object',
        properties: {
          name: str('Device name'),
          udid: str('Device UDID'),
          platform: {
            type: 'string',
            description: 'Device platform',
            enum: ['IOS', 'MAC_OS'],
          },
        },
        required: ['name', 'udid', 'platform'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/devices', {
        body: resource('devices', {
          attributes: { name: args.name, udid: args.udid, platform: args.platform },
        }),
      }),
  },
  {
    definition: {
      name: 'update_device',
      description: 'Update a device name or status (ENABLED or DISABLED).',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: str('devices id'),
          name: str('Device name'),
          status: {
            type: 'string',
            description: 'Device status',
            enum: ['ENABLED', 'DISABLED'],
          },
        },
        required: ['deviceId'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('PATCH', `/v1/devices/${args.deviceId}`, {
        body: resource('devices', {
          id: args.deviceId,
          attributes: compactAttributes({ name: args.name, status: args.status }),
        }),
      }),
  },
];

const module = createToolModule(tools);
export const teamToolDefinitions = module.definitions;
export const runTeamTool = module.run;
