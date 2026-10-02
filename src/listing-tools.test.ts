import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listingToolDefinitions, runListingTool } from './listing-tools.js';

test('listing tools export the spec names', () => {
  const names = listingToolDefinitions.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'create_app_preview_set',
    'create_screenshot_set',
    'delete_app_preview',
    'delete_screenshot',
    'get_review_response',
    'list_app_preview_sets',
    'list_app_price_points',
    'list_screenshot_sets',
    'reply_to_review',
    'set_app_availability',
    'set_app_price',
    'upload_app_preview',
    'upload_screenshot',
  ]);
});

test('set_app_availability sells in every territory when allTerritories is true', async () => {
  const tool = listingToolDefinitions.find((item) => item.name === 'set_app_availability');
  assert.ok(tool);
  assert.equal(tool.inputSchema.properties.allTerritories !== undefined, true);
  assert.deepEqual(tool.inputSchema.required, ['appId', 'availableInNewTerritories']);

  const calls: { method: string; path: string; body: any }[] = [];
  const client = {
    listTerritories: async () => ['USA', 'GBR'],
    request: async (method: string, path: string, options?: { body?: any }) => {
      calls.push({ method, path, body: options?.body });
      return { data: { id: 'avail-1' } };
    },
  };

  await runListingTool(client as any, 'set_app_availability', {
    appId: 'app-1',
    allTerritories: true,
    availableInNewTerritories: true,
  });

  const territories = calls[0].body.data.relationships.availableTerritories.data.map(
    (item: { id: string }) => item.id
  );
  assert.deepEqual(territories, ['USA', 'GBR']);
});

test('set_app_availability keeps an explicit territory list', async () => {
  let listed = false;
  const calls: any[] = [];
  const client = {
    listTerritories: async () => {
      listed = true;
      return ['USA', 'GBR'];
    },
    request: async (_method: string, _path: string, options?: { body?: any }) => {
      calls.push(options?.body);
      return { data: { id: 'avail-2' } };
    },
  };

  await runListingTool(client as any, 'set_app_availability', {
    appId: 'app-1',
    territories: ['USA'],
    availableInNewTerritories: false,
  });

  assert.equal(listed, false);
  assert.deepEqual(
    calls[0].data.relationships.availableTerritories.data.map((item: { id: string }) => item.id),
    ['USA']
  );
});
