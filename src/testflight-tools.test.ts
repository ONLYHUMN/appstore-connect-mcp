import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testflightToolDefinitions } from './testflight-tools.js';

test('testflight tools export the spec names', () => {
  const names = testflightToolDefinitions.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'add_build_to_beta_group',
    'get_beta_crash',
    'get_beta_feedback',
    'list_beta_crashes',
    'list_beta_feedback',
    'list_beta_testers',
    'remove_build_from_beta_group',
    'remove_tester_from_beta_group',
    'upload_build',
  ]);
});
