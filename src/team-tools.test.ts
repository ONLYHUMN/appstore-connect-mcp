import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teamToolDefinitions } from './team-tools.js';

test('team tools export the spec names', () => {
  const names = teamToolDefinitions.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'cancel_user_invitation',
    'invite_user',
    'list_devices',
    'list_user_invitations',
    'list_users',
    'register_device',
    'remove_user',
    'update_device',
  ]);
});
