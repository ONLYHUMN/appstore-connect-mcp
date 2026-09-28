import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listingToolDefinitions } from './listing-tools.js';

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
