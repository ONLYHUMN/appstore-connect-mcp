import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogToolDefinitions } from './catalog-tools.js';

test('catalog tools export the spec names', () => {
  const names = catalogToolDefinitions.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'create_app_event',
    'create_encryption_declaration',
    'create_sandbox_tester',
    'create_webhook',
    'delete_sandbox_tester',
    'delete_webhook',
    'get_age_rating_declaration',
    'get_eula',
    'get_pre_order',
    'get_xcode_cloud_build',
    'list_app_clips',
    'list_app_events',
    'list_custom_product_pages',
    'list_encryption_declarations',
    'list_game_center_achievements',
    'list_game_center_leaderboards',
    'list_sandbox_testers',
    'list_webhooks',
    'list_xcode_cloud_products',
    'list_xcode_cloud_workflows',
    'set_eula',
    'set_pre_order',
    'start_xcode_cloud_build',
    'update_age_rating_declaration',
  ]);
});
