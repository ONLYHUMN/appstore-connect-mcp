import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signingToolDefinitions } from './signing-tools.js';

test('signing tools export the spec names', () => {
  const names = signingToolDefinitions.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'create_bundle_id',
    'create_profile',
    'delete_profile',
    'disable_bundle_id_capability',
    'enable_bundle_id_capability',
    'list_bundle_id_capabilities',
    'list_bundle_ids',
    'list_certificates',
    'list_profiles',
  ]);
});
