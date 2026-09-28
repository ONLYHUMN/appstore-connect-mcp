import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rawApiToolDefinitions, runRawApiTool } from './raw-api-tools.js';

test('raw api tools export the spec names', () => {
  assert.deepEqual(rawApiToolDefinitions.map((tool) => tool.name), [
    'call_app_store_connect_api',
  ]);
});

test('raw api rejects a path that does not start with /', async () => {
  await assert.rejects(
    () =>
      runRawApiTool({} as any, 'call_app_store_connect_api', {
        method: 'GET',
        path: 'v1/apps',
      }),
    /path must start with \//
  );
});

test('raw api requires confirm for mutating methods', async () => {
  await assert.rejects(
    () =>
      runRawApiTool({} as any, 'call_app_store_connect_api', {
        method: 'DELETE',
        path: '/v1/apps/1',
      }),
    /confirm/
  );
});
