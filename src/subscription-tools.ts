/**
 * Auto-renewable subscription tools (groups, localizations, prices, availability).
 * Each entry holds the MCP tool definition and its handler, so they stay in sync.
 */

import type { AppStoreConnectClient } from './appstore-client.js';

type ToolResult = { content: { type: 'text'; text: string }[] };

export type SubscriptionTool = {
  definition: {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  };
  run: (client: AppStoreConnectClient, args: any) => Promise<unknown>;
};

const str = (description: string) => ({ type: 'string', description });
const bool = (description: string) => ({ type: 'boolean', description });
const num = (description: string) => ({ type: 'number', description });

export const subscriptionTools: SubscriptionTool[] = [
  {
    definition: {
      name: 'list_subscription_groups',
      description:
        'List auto-renewable subscription groups for an app, with each subscription, its state, and its localizations (ids needed for updates).',
      inputSchema: { type: 'object', properties: { appId: str('The ID of the app') }, required: ['appId'] },
    },
    run: (client, { appId }) => client.listSubscriptionGroups(appId),
  },
  {
    definition: {
      name: 'update_subscription_localization',
      description: 'Update the customer-facing name and/or description of a subscription for one locale.',
      inputSchema: {
        type: 'object',
        properties: {
          localizationId: str('subscriptionLocalizations id from list_subscription_groups'),
          name: str('Display name (max 30 chars)'),
          description: str('Description (max 45 chars)'),
        },
        required: ['localizationId'],
      },
    },
    run: (client, args) => client.updateSubscriptionLocalization(args),
  },
  {
    definition: {
      name: 'create_subscription_localization',
      description: 'Add a locale (name + description) to a subscription.',
      inputSchema: {
        type: 'object',
        properties: {
          subscriptionId: str('subscriptions id'),
          locale: str('Locale code, e.g. en-US'),
          name: str('Display name (max 30 chars)'),
          description: str('Description (max 45 chars)'),
        },
        required: ['subscriptionId', 'locale', 'name'],
      },
    },
    run: (client, args) => client.createSubscriptionLocalization(args),
  },
  {
    definition: {
      name: 'update_subscription_group_localization',
      description: 'Update the subscription group display name shown on the App Store for one locale.',
      inputSchema: {
        type: 'object',
        properties: {
          localizationId: str('subscriptionGroupLocalizations id from list_subscription_groups'),
          name: str('Group display name'),
          customAppName: str('Optional custom app name shown with the group'),
        },
        required: ['localizationId'],
      },
    },
    run: (client, args) => client.updateSubscriptionGroupLocalization(args),
  },
  {
    definition: {
      name: 'update_subscription',
      description: 'Update reference name, review note, family sharing, or group level of a subscription.',
      inputSchema: {
        type: 'object',
        properties: {
          subscriptionId: str('subscriptions id'),
          referenceName: str('Internal reference name'),
          reviewNote: str('Note for App Review'),
          familySharable: bool('Family Sharing on/off'),
          groupLevel: num('Rank inside the group (1 = highest tier)'),
        },
        required: ['subscriptionId'],
      },
    },
    run: (client, args) => client.updateSubscription(args),
  },
  {
    definition: {
      name: 'create_subscription',
      description: 'Create an auto-renewable subscription inside an existing group.',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: str('subscriptionGroups id'),
          referenceName: str('Internal reference name'),
          productId: str('Store product id, e.g. uyen.professional.monthly'),
          subscriptionPeriod: {
            type: 'string',
            description: 'Billing period',
            enum: ['ONE_WEEK', 'ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'],
          },
          groupLevel: num('Rank inside the group (1 = highest tier)'),
          familySharable: bool('Family Sharing on/off'),
          reviewNote: str('Note for App Review'),
        },
        required: ['groupId', 'referenceName', 'productId', 'subscriptionPeriod'],
      },
    },
    run: (client, args) => client.createSubscription(args),
  },
  {
    definition: {
      name: 'list_subscription_price_points',
      description: 'List price points for a subscription in one territory; filter by customerPrice (e.g. "99.99") to get the id.',
      inputSchema: {
        type: 'object',
        properties: {
          subscriptionId: str('subscriptions id'),
          territory: str('Territory code, e.g. USA'),
          customerPrice: str('Optional exact customer price, e.g. "99.99"'),
        },
        required: ['subscriptionId', 'territory'],
      },
    },
    run: (client, args) => client.listSubscriptionPricePoints(args),
  },
  {
    definition: {
      name: 'set_subscription_price',
      description: 'Schedule a subscription price from a price point (startDate omitted = now).',
      inputSchema: {
        type: 'object',
        properties: {
          subscriptionId: str('subscriptions id'),
          pricePointId: str('subscriptionPricePoints id'),
          startDate: str('Optional YYYY-MM-DD start date'),
          preserveCurrentPrice: bool('Keep the price for current subscribers'),
        },
        required: ['subscriptionId', 'pricePointId'],
      },
    },
    run: (client, args) => client.setSubscriptionPrice(args),
  },
  {
    definition: {
      name: 'set_subscription_availability',
      description: 'Set the territories where a subscription is for sale.',
      inputSchema: {
        type: 'object',
        properties: {
          subscriptionId: str('subscriptions id'),
          territories: { type: 'array', items: { type: 'string' }, description: 'Territory codes, e.g. ["USA"]' },
          availableInNewTerritories: bool('Sell automatically in territories Apple adds later'),
        },
        required: ['subscriptionId', 'territories', 'availableInNewTerritories'],
      },
    },
    run: (client, args) => client.setSubscriptionAvailability(args),
  },
];

export const subscriptionToolDefinitions = subscriptionTools.map((tool) => tool.definition);

/** Returns null when `name` is not a subscription tool. */
export async function runSubscriptionTool(
  client: AppStoreConnectClient,
  name: string,
  args: unknown
): Promise<ToolResult | null> {
  const tool = subscriptionTools.find((candidate) => candidate.definition.name === name);
  if (!tool) return null;
  const result = await tool.run(client, args ?? {});
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
