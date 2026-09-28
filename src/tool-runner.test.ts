import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createToolModule, requireConfirm } from './tool-runner.js';
import { readLocalFile } from './local-file.js';

test('createToolModule returns null for an unknown tool', async () => {
  const module = createToolModule([]);
  assert.equal(await module.run({} as any, 'nope', {}), null);
});

test('requireConfirm throws without confirm true', () => {
  assert.throws(() => requireConfirm({}), /confirm/);
  assert.throws(() => requireConfirm({ confirm: false }), /confirm/);
});

test('requireConfirm passes when confirm is true', () => {
  requireConfirm({ confirm: true });
});

test('readLocalFile throws for a missing path', () => {
  assert.throws(() => readLocalFile('/tmp/asc-mcp-missing-file.bin'), /Local file not found/);
});
