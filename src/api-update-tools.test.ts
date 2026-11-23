import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { AppStoreConnectClient } from './appstore-client.js';
import { apiUpdateToolDefinitions, runApiUpdateTool } from './api-update-tools.js';
import { runReleaseTool } from './release-tools.js';

function testClient() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return new AppStoreConnectClient({
    keyId: 'TESTKEY',
    issuerId: 'issuer',
    privateKey: pem,
  });
}

async function captureCalls(run: (client: AppStoreConnectClient) => Promise<unknown>) {
  const client = testClient();
  const calls: { url: string; method?: string; body?: any }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify({ data: { id: 'ok', attributes: {} } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await run(client);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return calls;
}

test('api update tools export the new names', () => {
  const names = apiUpdateToolDefinitions.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'create_accessibility_declaration',
    'create_background_asset',
    'create_phased_release',
    'create_promoted_purchase',
    'create_retention_message',
    'deactivate_offer_code_batch',
    'delete_phased_release',
    'generate_in_app_purchase_offer_codes',
    'generate_subscription_offer_codes',
    'get_beta_review_submission',
    'get_phased_release',
    'list_accessibility_declarations',
    'list_app_tags',
    'list_background_assets',
    'list_beta_review_submissions',
    'list_in_app_purchase_offer_codes',
    'list_promoted_purchases',
    'list_retention_messages',
    'list_retention_offers',
    'list_subscription_offer_codes',
    'list_subscription_version_localizations',
    'list_win_back_offers',
    'submit_beta_review',
    'update_accessibility_declaration',
    'update_app_store_version',
    'update_app_tag',
    'update_phased_release',
  ]);
});

test('update_app_store_version sets SCHEDULED when only a release date is given', async () => {
  const calls = await captureCalls((client) =>
    runApiUpdateTool(client, 'update_app_store_version', {
      versionId: 'ver-1',
      earliestReleaseDate: '2026-12-01T08:00:00Z',
    })
  );
  assert.equal(calls[0].method, 'PATCH');
  assert.match(calls[0].url, /\/v1\/appStoreVersions\/ver-1$/);
  assert.equal(calls[0].body.data.attributes.releaseType, 'SCHEDULED');
  assert.equal(calls[0].body.data.attributes.earliestReleaseDate, '2026-12-01T08:00:00Z');
});

test('update_app_store_version refuses a date with a manual release', async () => {
  await assert.rejects(
    () =>
      runApiUpdateTool(testClient(), 'update_app_store_version', {
        versionId: 'ver-1',
        releaseType: 'MANUAL',
        earliestReleaseDate: '2026-12-01T08:00:00Z',
      }),
    /SCHEDULED/
  );
});

test('update_app_store_version refuses downloadable false without confirm', async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        runApiUpdateTool(testClient(), 'update_app_store_version', {
          versionId: 'ver-1',
          downloadable: false,
        }),
      /confirm/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(called, false);
});

test('list_beta_review_submissions filters the newest builds for an app', async () => {
  const client = testClient();
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/builds')) {
      return new Response(JSON.stringify({ data: [{ id: 'build-a' }, { id: 'build-b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await runApiUpdateTool(client, 'list_beta_review_submissions', { appId: 'app-1' });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(calls[0], /\/v1\/apps\/app-1\/builds\?/);
  assert.match(decodeURIComponent(calls[0]), /sort=-uploadedDate/);
  assert.match(decodeURIComponent(calls[1]), /filter\[build\]=build-a,build-b/);
});

test('add_review_submission_item attaches a subscription version', async () => {
  const calls = await captureCalls((client) =>
    runReleaseTool(client, 'add_review_submission_item', {
      reviewSubmissionId: 'sub-1',
      itemType: 'subscriptionVersions',
      itemId: 'sv-9',
    })
  );
  assert.equal(calls[0].body.data.relationships.subscriptionVersion.data.id, 'sv-9');
  assert.equal(calls[0].body.data.relationships.subscriptionVersion.data.type, 'subscriptionVersions');
  assert.equal(calls[0].body.data.relationships.reviewSubmission.data.id, 'sub-1');
});

test('createAppStoreVersion sends SCHEDULED when only a release date is given', async () => {
  const calls = await captureCalls((client) =>
    client.createAppStoreVersion({
      appId: 'app-1',
      platform: 'IOS',
      versionString: '1.3',
      earliestReleaseDate: '2026-12-01T08:00:00Z',
    })
  );
  assert.equal(calls[0].body.data.attributes.releaseType, 'SCHEDULED');
});

test('listAppStoreVersions keeps downloadable', async () => {
  const client = testClient();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: 'ver-1',
            attributes: {
              versionString: '1.0',
              platform: 'IOS',
              appStoreState: 'READY_FOR_SALE',
              downloadable: false,
              createdDate: '2026-01-01T00:00:00Z',
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;
  try {
    const versions = await client.listAppStoreVersions('app-1');
    assert.equal(versions[0].downloadable, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
