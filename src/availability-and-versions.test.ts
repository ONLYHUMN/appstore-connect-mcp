import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { AppStoreConnectClient } from './appstore-client.js';
import { subscriptionToolDefinitions } from './subscription-tools.js';

function testClient() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return new AppStoreConnectClient({
    keyId: 'TESTKEY',
    issuerId: 'issuer',
    privateKey: pem,
  });
}

test('set_subscription_availability accepts allTerritories', () => {
  const tool = subscriptionToolDefinitions.find((item) => item.name === 'set_subscription_availability');
  assert.ok(tool);
  assert.equal(tool.inputSchema.properties.allTerritories !== undefined, true);
  assert.deepEqual(tool.inputSchema.required, ['subscriptionId', 'availableInNewTerritories']);
});

test('setSubscriptionAvailability loads the territory catalog when allTerritories is true', async () => {
  const client = testClient();
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body?: any }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (href.includes('/v1/territories')) {
      return new Response(
        JSON.stringify({ data: [{ id: 'USA' }, { id: 'GBR' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ data: { id: 'sub-avail-1', attributes: {} } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await client.setSubscriptionAvailability({
      subscriptionId: 'sub-1',
      allTerritories: true,
      availableInNewTerritories: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const post = calls.find((call) => call.body);
  const territories = post?.body.data.relationships.availableTerritories.data.map(
    (item: { id: string }) => item.id
  );
  assert.deepEqual(territories, ['USA', 'GBR']);
});

test('listAppStoreVersions keeps appVersionState', async () => {
  const client = testClient();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: 'ver-1',
            attributes: {
              versionString: '1.2.3',
              platform: 'IOS',
              appStoreState: 'READY_FOR_SALE',
              appVersionState: 'READY_FOR_DISTRIBUTION',
              createdDate: '2026-10-01T00:00:00Z',
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const versions = await client.listAppStoreVersions('app-1');
    assert.equal(versions[0].appVersionState, 'READY_FOR_DISTRIBUTION');
    assert.equal(versions[0].appStoreState, 'READY_FOR_SALE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
