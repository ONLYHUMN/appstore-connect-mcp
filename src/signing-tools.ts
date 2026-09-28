import type { AppStoreConnectClient } from './appstore-client.js';
import { compactAttributes, rel, relList, resource } from './jsonapi.js';
import { bool, createToolModule, requireConfirm, str, strList } from './tool-runner.js';

const tools = [
  {
    definition: {
      name: 'list_bundle_ids',
      description: 'List bundle IDs in the developer account.',
      inputSchema: {
        type: 'object',
        properties: {
          identifier: str('Optional bundle identifier filter'),
          platform: str('Optional platform filter, e.g. IOS'),
        },
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('GET', '/v1/bundleIds', {
        query: {
          'filter[identifier]': args.identifier,
          'filter[platform]': args.platform,
        },
      }),
  },
  {
    definition: {
      name: 'create_bundle_id',
      description: 'Register a bundle ID.',
      inputSchema: {
        type: 'object',
        properties: {
          identifier: str('Bundle identifier, e.g. com.example.app'),
          name: str('Display name'),
          platform: {
            type: 'string',
            description: 'Bundle platform',
            enum: ['IOS', 'MAC_OS'],
          },
        },
        required: ['identifier', 'name', 'platform'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/bundleIds', {
        body: resource('bundleIds', {
          attributes: {
            identifier: args.identifier,
            name: args.name,
            platform: args.platform,
          },
        }),
      }),
  },
  {
    definition: {
      name: 'list_bundle_id_capabilities',
      description: 'List capabilities enabled on a bundle ID.',
      inputSchema: {
        type: 'object',
        properties: { bundleId: str('bundleIds id') },
        required: ['bundleId'],
      },
    },
    run: (client: AppStoreConnectClient, { bundleId }: any) =>
      client.request('GET', `/v1/bundleIds/${bundleId}/bundleIdCapabilities`),
  },
  {
    definition: {
      name: 'enable_bundle_id_capability',
      description: 'Enable a capability on a bundle ID.',
      inputSchema: {
        type: 'object',
        properties: {
          bundleId: str('bundleIds id'),
          capabilityType: str('e.g. PUSH_NOTIFICATIONS'),
        },
        required: ['bundleId', 'capabilityType'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/bundleIdCapabilities', {
        body: resource('bundleIdCapabilities', {
          attributes: { capabilityType: args.capabilityType },
          relationships: { bundleId: rel('bundleIds', args.bundleId) },
        }),
      }),
  },
  {
    definition: {
      name: 'disable_bundle_id_capability',
      description: 'Disable a bundle ID capability. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          capabilityId: str('bundleIdCapabilities id'),
          confirm: bool('Must be true to disable'),
        },
        required: ['capabilityId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/bundleIdCapabilities/${args.capabilityId}`);
    },
  },
  {
    definition: {
      name: 'list_certificates',
      description: 'List signing certificates.',
      inputSchema: {
        type: 'object',
        properties: { certificateType: str('Optional certificate type filter') },
      },
    },
    run: (client: AppStoreConnectClient, { certificateType }: any) =>
      client.request('GET', '/v1/certificates', {
        query: { 'filter[certificateType]': certificateType },
      }),
  },
  {
    definition: {
      name: 'list_profiles',
      description: 'List provisioning profiles.',
      inputSchema: {
        type: 'object',
        properties: { profileType: str('Optional profile type filter') },
      },
    },
    run: (client: AppStoreConnectClient, { profileType }: any) =>
      client.request('GET', '/v1/profiles', {
        query: { 'filter[profileType]': profileType },
      }),
  },
  {
    definition: {
      name: 'create_profile',
      description: 'Create a provisioning profile from a bundle ID, certificates, and devices.',
      inputSchema: {
        type: 'object',
        properties: {
          name: str('Profile name'),
          profileType: str('e.g. IOS_APP_DEVELOPMENT or IOS_APP_STORE'),
          bundleId: str('bundleIds id'),
          certificateIds: strList('certificates ids'),
          deviceIds: strList('devices ids (omit for App Store profiles)'),
        },
        required: ['name', 'profileType', 'bundleId', 'certificateIds'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) =>
      client.request('POST', '/v1/profiles', {
        body: resource('profiles', {
          attributes: compactAttributes({
            name: args.name,
            profileType: args.profileType,
          }),
          relationships: {
            bundleId: rel('bundleIds', args.bundleId),
            certificates: relList('certificates', args.certificateIds),
            ...(args.deviceIds?.length
              ? { devices: relList('devices', args.deviceIds) }
              : {}),
          },
        }),
      }),
  },
  {
    definition: {
      name: 'delete_profile',
      description: 'Delete a provisioning profile. Requires confirm true.',
      inputSchema: {
        type: 'object',
        properties: {
          profileId: str('profiles id'),
          confirm: bool('Must be true to delete'),
        },
        required: ['profileId', 'confirm'],
      },
    },
    run: (client: AppStoreConnectClient, args: any) => {
      requireConfirm(args);
      return client.request('DELETE', `/v1/profiles/${args.profileId}`);
    },
  },
];

const module = createToolModule(tools);
export const signingToolDefinitions = module.definitions;
export const runSigningTool = module.run;
