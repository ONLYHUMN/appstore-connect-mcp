import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseToolDefinitions } from './release-tools.js';

test('release tools export the spec names', () => {
  const names = releaseToolDefinitions.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'add_review_submission_item',
    'attach_build_to_version',
    'cancel_review_submission',
    'create_review_submission',
    'get_review_detail',
    'get_review_submission',
    'submit_review_submission',
    'update_review_detail',
  ]);
});
