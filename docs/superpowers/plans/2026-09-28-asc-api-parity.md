# App Store Connect API Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP tools for App Store Connect REST API work that this server does not expose today.

**Architecture:** Shared tool runner plus `AppStoreConnectClient.request()`. New `src/*-tools.ts` modules register in `src/index.ts` the same way as IAP tools. File uploads use Apple reservation URLs. Mutating raw API and delete/submit tools require `confirm: true`.

**Tech Stack:** TypeScript, Node 18+, MCP SDK, `node:test` + `tsx`, App Store Connect JSON:API.

## Global Constraints

- Follow `docs/superpowers/specs/2026-09-28-asc-api-parity-design.md` tool names exactly.
- Do not add Auth0, Apple Ads, StoreKit server keys, or local Xcode tools.
- Do not wire `src/handlers/*`.
- Destructive tools throw before any Apple call unless `confirm === true`.
- File tools read a host path. Missing path error: `Local file not found: <path>`.
- Tool results are `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`.
- Do not commit unless the user asks.

---

### Task 1: Shared runner, client request, and test harness

**Files:**
- Create: `src/tool-runner.ts`
- Create: `src/local-file.ts`
- Create: `src/tool-runner.test.ts`
- Modify: `src/appstore-client.ts` (`makeRequest` becomes public `request` with query, method, body)
- Modify: `package.json` (add `"test": "tsx --test src/**/*.test.ts"`)

**Interfaces:**
- Consumes: existing `AppStoreConnectClient`
- Produces: `ToolDefinition`, `ToolHandler`, `createToolModule()`, `requireConfirm()`, `readLocalFile()`, `request(method, path, options?)`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx tsx --test src/tool-runner.test.ts`  
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement runner, file helper, and public request**

`createToolModule(tools)` returns `{ definitions, run }`.  
`run` finds the tool by name, calls `tool.run(client, args)`, returns JSON text content.  
`requireConfirm(args)` throws `Set confirm to true to run this mutating action.` when `args.confirm !== true`.  
`readLocalFile(path)` uses `existsSync` + `readFileSync` and throws `Local file not found: ${path}`.  
`AppStoreConnectClient.request(method, path, options?)` builds `URLSearchParams` from `options.query`, sends JSON when `options.body` is set, and supports `options.rawBody` plus `options.headers` for binary PUT.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx tsx --test src/tool-runner.test.ts` and `npm run build`  
Expected: PASS

---

### Task 2: Wave 1 release tools

**Files:**
- Create: `src/release-tools.ts`
- Create: `src/release-tools.test.ts`
- Modify: `src/index.ts` (spread `releaseToolDefinitions`, call `runReleaseTool`)

**Interfaces:**
- Consumes: `createToolModule`, `requireConfirm`, `client.request`
- Produces: tools `attach_build_to_version`, `get_review_detail`, `update_review_detail`, `create_review_submission`, `add_review_submission_item`, `submit_review_submission`, `cancel_review_submission`, `get_review_submission`

- [ ] **Step 1: Write the failing name test**

```typescript
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx tsx --test src/release-tools.test.ts`  
Expected: FAIL because `release-tools.ts` does not exist.

- [ ] **Step 3: Implement release tools**

`attach_build_to_version`: PATCH `/v1/appStoreVersions/{versionId}` with `relationships.build.data = { type: 'builds', id: buildId }`.  
`get_review_detail`: GET `/v1/appStoreVersions/{versionId}/appStoreReviewDetail`.  
`update_review_detail`: if `reviewDetailId` is set, PATCH `/v1/appStoreReviewDetails/{id}`; else POST `/v1/appStoreReviewDetails` related to `versionId`. Attributes: `contactFirstName`, `contactLastName`, `contactEmail`, `contactPhone`, `demoAccountName`, `demoAccountPassword`, `demoAccountRequired`, `notes`.  
`create_review_submission`: POST `/v1/reviewSubmissions` with `attributes.platform` and `relationships.app`.  
`add_review_submission_item`: POST `/v1/reviewSubmissionItems` related to submission + version.  
`submit_review_submission`: `requireConfirm` then PATCH `{ submitted: true }`.  
`cancel_review_submission`: `requireConfirm` then PATCH `{ canceled: true }`.  
`get_review_submission`: GET `/v1/reviewSubmissions/{id}?include=items`.

- [ ] **Step 4: Wire index.ts and build**

Spread `...releaseToolDefinitions` into the tools array. After subscription/IAP runners, call `runReleaseTool`.  
Run: `npm test` and `npm run build`  
Expected: PASS

---

### Task 3: Wave 1 TestFlight tools

**Files:**
- Create: `src/testflight-tools.ts`
- Create: `src/testflight-tools.test.ts`
- Modify: `src/index.ts`
- Modify: `src/appstore-client.ts` (add `uploadReservedBinary` used by `upload_build`)

**Interfaces:**
- Consumes: `createToolModule`, `requireConfirm`, `readLocalFile`, `client.request`
- Produces: tools `list_beta_testers`, `remove_tester_from_beta_group`, `add_build_to_beta_group`, `remove_build_from_beta_group`, `list_beta_feedback`, `get_beta_feedback`, `list_beta_crashes`, `get_beta_crash`, `upload_build`

- [ ] **Step 1: Write the failing name test**

Assert exported names match the spec table for TestFlight, sorted.

- [ ] **Step 2: Run the test and confirm it fails**

- [ ] **Step 3: Implement TestFlight tools**

`list_beta_testers`: GET `/v1/betaGroups/{groupId}/betaTesters`.  
`remove_tester_from_beta_group`: DELETE `/v1/betaGroups/{groupId}/relationships/betaTesters` with `{ data: [{ type: 'betaTesters', id: testerId }] }`.  
`add_build_to_beta_group`: POST `/v1/betaGroups/{groupId}/relationships/builds`.  
`remove_build_from_beta_group`: DELETE that relationship.  
`list_beta_feedback`: GET `/v1/apps/{appId}/betaFeedbackScreenshotSubmissions` with optional `filter[build]`.  
`get_beta_feedback`: GET `/v1/betaFeedbackScreenshotSubmissions/{feedbackId}`.  
`list_beta_crashes`: GET `/v1/apps/{appId}/betaFeedbackCrashSubmissions`.  
`get_beta_crash`: GET `/v1/betaFeedbackCrashSubmissions/{crashId}`.  
`upload_build`: POST `/v1/buildUploads` for `appId` + file size/name from `readLocalFile(filePath)`, PUT each `uploadOperations` chunk, PATCH commit. Return Apple JSON.

- [ ] **Step 4: Wire index.ts, test, and build**

---

### Task 4: Wave 2 listing tools

**Files:**
- Create: `src/listing-tools.ts`
- Create: `src/listing-tools.test.ts`
- Modify: `src/index.ts`
- Reuse: `uploadReservedBinary` from the client

**Interfaces:**
- Consumes: `createToolModule`, `requireConfirm`, `readLocalFile`, `client.request`, upload helper
- Produces: tools `reply_to_review`, `get_review_response`, `list_app_price_points`, `set_app_price`, `set_app_availability`, `list_screenshot_sets`, `create_screenshot_set`, `upload_screenshot`, `delete_screenshot`, `list_app_preview_sets`, `create_app_preview_set`, `upload_app_preview`, `delete_app_preview`

- [ ] **Step 1: Write the failing name test** for the 13 listing tool names
- [ ] **Step 2: Confirm fail**
- [ ] **Step 3: Implement listing tools**

`reply_to_review`: POST `/v1/customerReviewResponses` with `attributes.responseBody` and `relationships.review`.  
`get_review_response`: GET `/v1/customerReviews/{reviewId}/response`.  
`list_app_price_points`: GET `/v1/apps/{appId}/appPricePoints` with `filter[territory]`.  
`set_app_price`: POST `/v1/appPriceSchedules` with `baseTerritory` + `manualPrices` / price point relationship as Apple requires.  
`set_app_availability`: POST `/v1/appAvailabilities` (or V2 if GET of V1 404s) with territory ids.  
`list_screenshot_sets`: GET `/v1/appStoreVersionLocalizations/{id}/appScreenshotSets`.  
`create_screenshot_set`: POST `/v1/appScreenshotSets`.  
`upload_screenshot`: POST `/v1/appScreenshots` reservation (`fileName`, `fileSize`), PUT operations, PATCH `uploaded: true`.  
`delete_screenshot`: DELETE `/v1/appScreenshots/{id}`.  
Preview tools mirror screenshot tools on `appPreviewSets` / `appPreviews`.

- [ ] **Step 4: Wire, test, build**

---

### Task 5: Wave 3 team and signing tools

**Files:**
- Create: `src/team-tools.ts`
- Create: `src/signing-tools.ts`
- Create: `src/team-tools.test.ts`
- Create: `src/signing-tools.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `createToolModule`, `requireConfirm`, `client.request`
- Produces: team tools `list_users`, `invite_user`, `list_user_invitations`, `cancel_user_invitation`, `remove_user`, `list_devices`, `register_device`, `update_device`; signing tools `list_bundle_ids`, `create_bundle_id`, `list_bundle_id_capabilities`, `enable_bundle_id_capability`, `disable_bundle_id_capability`, `list_certificates`, `list_profiles`, `create_profile`, `delete_profile`

- [ ] **Step 1: Write failing name tests**
- [ ] **Step 2: Confirm fail**
- [ ] **Step 3: Implement JSON:API CRUD against the spec paths**
- [ ] **Step 4: Wire, test, build**

---

### Task 6: Wave 4 catalog and raw API

**Files:**
- Create: `src/catalog-tools.ts`
- Create: `src/raw-api-tools.ts`
- Create: `src/catalog-tools.test.ts`
- Create: `src/raw-api-tools.test.ts`
- Modify: `src/index.ts`
- Modify: `README.md` (list the new tool groups)

**Interfaces:**
- Consumes: `createToolModule`, `requireConfirm`, `client.request`
- Produces: catalog tools from the spec table; `call_app_store_connect_api` with `method`, `path`, optional `query`, optional `body`. Reject paths that do not start with `/`. Require `confirm` for POST/PATCH/PUT/DELETE.

- [ ] **Step 1: Write failing name tests plus raw-api path and confirm tests**
- [ ] **Step 2: Confirm fail**
- [ ] **Step 3: Implement catalog tools and raw API**
- [ ] **Step 4: Wire README, test, build**

README Features section must list: Release, TestFlight writes, review reply, app price/availability writes, screenshots and previews, users and devices, bundle IDs and profiles, catalog (age rating, encryption, EULA, App Clips, events, product pages, pre-orders, webhooks, sandbox testers, Xcode Cloud, Game Center lists), and raw API.

---

### Task 7: Final verification

**Files:** none new

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Grep `src/index.ts` for every spec tool name**

Expected: all tests pass, build passes, every spec tool is registered.
