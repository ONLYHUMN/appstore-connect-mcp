/**
 * Consumable / non-consumable / non-renewing IAP tools (copy, price, availability).
 * Each entry holds the MCP tool definition and its handler, so they stay in sync.
 */

import type { AppStoreConnectClient } from './appstore-client.js';

type ToolResult = { content: { type: 'text'; text: string }[] };

export type IapTool = {
  definition: {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  };
  run: (client: AppStoreConnectClient, args: any) => Promise<unknown>;
};

const str = (description: string) => ({ type: 'string', description });
const bool = (description: string) => ({ type: 'boolean', description });

export const iapTools: IapTool[] = [
  {
    definition: {
      name: 'create_in_app_purchase',
      description: 'Create a consumable, non-consumable, or non-renewing in-app purchase.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: str('The ID of the app'),
          name: str('Internal reference name'),
          productId: str('Store product id, e.g. uyen.credits.100'),
          inAppPurchaseType: {
            type: 'string',
            description: 'IAP type',
            enum: ['CONSUMABLE', 'NON_CONSUMABLE', 'NON_RENEWING_SUBSCRIPTION'],
          },
          reviewNote: str('Note for App Review'),
          familySharable: bool('Family Sharing on/off'),
        },
        required: ['appId', 'name', 'productId', 'inAppPurchaseType'],
      },
    },
    run: (client, args) => client.createInAppPurchase(args),
  },
  {
    definition: {
      name: 'update_in_app_purchase',
      description: 'Update the internal name, review note, or Family Sharing flag of an IAP.',
      inputSchema: {
        type: 'object',
        properties: {
          iapId: str('inAppPurchases id from get_in_app_purchases'),
          name: str('Internal reference name'),
          reviewNote: str('Note for App Review'),
          familySharable: bool('Family Sharing on/off'),
        },
        required: ['iapId'],
      },
    },
    run: (client, args) => client.updateInAppPurchase(args),
  },
  {
    definition: {
      name: 'list_in_app_purchase_localizations',
      description: 'List customer-facing IAP names and descriptions, with localization ids.',
      inputSchema: {
        type: 'object',
        properties: { iapId: str('inAppPurchases id') },
        required: ['iapId'],
      },
    },
    run: (client, { iapId }) => client.listInAppPurchaseLocalizations(iapId),
  },
  {
    definition: {
      name: 'create_in_app_purchase_localization',
      description: 'Add a locale (display name + description) to an IAP.',
      inputSchema: {
        type: 'object',
        properties: {
          iapId: str('inAppPurchases id'),
          locale: str('Locale code, e.g. en-US'),
          name: str('Display name shown in the store'),
          description: str('Description shown in the store'),
        },
        required: ['iapId', 'locale', 'name'],
      },
    },
    run: (client, args) => client.createInAppPurchaseLocalization(args),
  },
  {
    definition: {
      name: 'update_in_app_purchase_localization',
      description: 'Update the customer-facing name and/or description of an IAP for one locale.',
      inputSchema: {
        type: 'object',
        properties: {
          localizationId: str('inAppPurchaseLocalizations id from list_in_app_purchase_localizations'),
          name: str('Display name shown in the store'),
          description: str('Description shown in the store'),
        },
        required: ['localizationId'],
      },
    },
    run: (client, args) => client.updateInAppPurchaseLocalization(args),
  },
  {
    definition: {
      name: 'set_in_app_purchase_localization',
      description: 'Create or update the customer-facing name and description for one locale.',
      inputSchema: {
        type: 'object',
        properties: {
          iapId: str('inAppPurchases id'),
          locale: str('Locale code, e.g. en-US'),
          name: str('Display name shown in the store'),
          description: str('Description shown in the store'),
        },
        required: ['iapId', 'locale', 'name'],
      },
    },
    run: (client, args) => client.setInAppPurchaseLocalization(args),
  },
  {
    definition: {
      name: 'list_in_app_purchase_price_points',
      description: 'List IAP price points in one territory; filter by customerPrice (e.g. "0.99") to get the id.',
      inputSchema: {
        type: 'object',
        properties: {
          iapId: str('inAppPurchases id'),
          territory: str('Territory code, e.g. USA'),
          customerPrice: str('Optional exact customer price, e.g. "0.99"'),
        },
        required: ['iapId', 'territory'],
      },
    },
    run: (client, args) => client.listInAppPurchasePricePoints(args),
  },
  {
    definition: {
      name: 'set_in_app_purchase_price',
      description:
        'Set the IAP price from a price point or an exact customerPrice (territory defaults to USA).',
      inputSchema: {
        type: 'object',
        properties: {
          iapId: str('inAppPurchases id'),
          territory: str('Territory code, e.g. USA (default USA)'),
          pricePointId: str('inAppPurchasePricePoints id'),
          customerPrice: str('Exact customer price, e.g. "0.99" (used when pricePointId is omitted)'),
        },
        required: ['iapId'],
      },
    },
    run: (client, args) => client.setInAppPurchasePrice(args),
  },
  {
    definition: {
      name: 'set_in_app_purchase_availability',
      description:
        'Set the territories where an IAP is for sale. Omit territories or set allTerritories to sell in every territory.',
      inputSchema: {
        type: 'object',
        properties: {
          iapId: str('inAppPurchases id'),
          territories: { type: 'array', items: { type: 'string' }, description: 'Territory codes, e.g. ["USA"]' },
          allTerritories: bool('Sell in every App Store territory'),
          availableInNewTerritories: bool('Sell automatically in territories Apple adds later'),
        },
        required: ['iapId', 'availableInNewTerritories'],
      },
    },
    run: (client, args) => client.setInAppPurchaseAvailability(args),
  },
];

export const iapToolDefinitions = iapTools.map((tool) => tool.definition);

/** Returns null when `name` is not an IAP tool. */
export async function runIapTool(
  client: AppStoreConnectClient,
  name: string,
  args: unknown
): Promise<ToolResult | null> {
  const tool = iapTools.find((candidate) => candidate.definition.name === name);
  if (!tool) return null;
  const result = await tool.run(client, args ?? {});
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
