# Design: App Store Connect API parity

**Date:** 2026-09-28  
**Status:** Approved in chat  
**Repo:** appstore-connect-mcp

## Goal

Add MCP tools for App Store Connect REST API work that this server does not expose today. Keep one Apple JWT. Keep the current IAP and subscription tools.

## Non-goals

These areas stay out of this server:

- Local Xcode build, archive, test, and simulator screenshot capture
- Keychain, `.p12`, and notarization
- Apple Ads, StoreKit server keys, and Apple-ID web sessions
- Local workflow helpers that are not App Store Connect REST API calls
- Wiring or deleting unused `src/handlers/*` files

## Architecture

- Keep `AppStoreConnectClient` as the only Apple HTTP client.
- Make a public `request(method, path, options)` on the client. Options: `query`, `body`, `rawBody`, `headers`. JSON:API calls use JWT plus `Content-Type: application/json`. Binary PUT to Apple upload URLs uses the reservation headers and no JSON content type.
- Extract a shared tool runner that matches `iap-tools.ts` / `subscription-tools.ts`.
- New tools live in `src/*-tools.ts` modules. `src/index.ts` spreads definitions and calls each `runXTool`. No new `switch` cases.
- Destructive tools require `confirm: true`. If `confirm` is missing or false, the runner throws before any Apple call.
- File tools take a path on the MCP host. The server reads the file. The tool JSON does not carry file bytes.
- Tool results are JSON text, same as IAP tools.

## Shared rules

- Tool names: `snake_case`.
- IDs are Apple resource ids unless a name says otherwise.
- Errors from Apple stay `App Store API error: <status> - <detail>`.
- A missing local file throws `Local file not found: <path>` before any Apple call.
- `call_app_store_connect_api` allows any `/v1/...` or `/v2/...` path. It rejects paths that do not start with `/`. It does not bypass `confirm` when `method` is POST, PATCH, PUT, or DELETE.

## Wave 1 — Release and TestFlight

File: `src/release-tools.ts`

| Tool | Apple resource | Notes |
|---|---|---|
| `attach_build_to_version` | PATCH `appStoreVersions` build relationship | `versionId`, `buildId` |
| `get_review_detail` | GET version `appStoreReviewDetail` | `versionId` |
| `update_review_detail` | POST or PATCH `appStoreReviewDetails` | Contact, demo account, notes |
| `create_review_submission` | POST `reviewSubmissions` | `appId`, `platform` |
| `add_review_submission_item` | POST `reviewSubmissionItems` | `reviewSubmissionId`, `versionId` |
| `submit_review_submission` | PATCH `reviewSubmissions` `submitted: true` | `reviewSubmissionId`, `confirm` |
| `cancel_review_submission` | PATCH `reviewSubmissions` canceled | `reviewSubmissionId`, `confirm` |
| `get_review_submission` | GET `reviewSubmissions/{id}` | include items |

File: `src/testflight-tools.ts`

| Tool | Apple resource | Notes |
|---|---|---|
| `list_beta_testers` | GET group testers | `groupId` |
| `remove_tester_from_beta_group` | DELETE group testers relationship | `groupId`, `testerId`, `confirm` |
| `add_build_to_beta_group` | POST group builds relationship | `groupId`, `buildId` |
| `remove_build_from_beta_group` | DELETE group builds relationship | `groupId`, `buildId`, `confirm` |
| `list_beta_feedback` | GET `betaFeedbackScreenshotSubmissions` | `appId` plus optional filters |
| `get_beta_feedback` | GET one screenshot submission | `feedbackId` |
| `list_beta_crashes` | GET `betaFeedbackCrashSubmissions` | `appId` |
| `get_beta_crash` | GET one crash submission | `crashId` |
| `upload_build` | `buildUploads` reservation plus binary PUT | `appId`, `filePath`, optional version/build number. If Apple rejects the upload API for the account, return the Apple error. |

## Wave 2 — Store listing writes

File: `src/listing-tools.ts`

| Tool | Apple resource | Notes |
|---|---|---|
| `reply_to_review` | POST `customerReviewResponses` | `reviewId`, `responseBody` |
| `get_review_response` | GET review `response` | `reviewId` |
| `list_app_price_points` | GET `appPricePoints` | `appId`, `territory` |
| `set_app_price` | POST `appPriceSchedules` | `appId`, `pricePointId`, optional start date |
| `set_app_availability` | POST `appAvailabilities` / V2 | `appId`, `territories`, `availableInNewTerritories` |
| `list_screenshot_sets` | GET version localization screenshot sets | `versionLocalizationId` |
| `create_screenshot_set` | POST `appScreenshotSets` | `versionLocalizationId`, `screenshotDisplayType` |
| `upload_screenshot` | reservation + PUT + commit | `screenshotSetId`, `filePath` |
| `delete_screenshot` | DELETE `appScreenshots/{id}` | `screenshotId`, `confirm` |
| `list_app_preview_sets` | GET preview sets | `versionLocalizationId` |
| `create_app_preview_set` | POST `appPreviewSets` | `versionLocalizationId`, `previewType` |
| `upload_app_preview` | reservation + PUT + commit | `previewSetId`, `filePath` |
| `delete_app_preview` | DELETE `appPreviews/{id}` | `previewId`, `confirm` |

## Wave 3 — Team and signing records

File: `src/team-tools.ts`

| Tool | Apple resource | Notes |
|---|---|---|
| `list_users` | GET `users` | optional limit |
| `invite_user` | POST `userInvitations` | email, roles, optional all-apps |
| `list_user_invitations` | GET `userInvitations` | |
| `cancel_user_invitation` | DELETE invitation | `invitationId`, `confirm` |
| `remove_user` | DELETE `users/{id}` | `userId`, `confirm` |
| `list_devices` | GET `devices` | optional platform filter |
| `register_device` | POST `devices` | name, `udid`, platform |
| `update_device` | PATCH `devices` | `deviceId`, name and/or status |

File: `src/signing-tools.ts`

| Tool | Apple resource | Notes |
|---|---|---|
| `list_bundle_ids` | GET `bundleIds` | optional platform / identifier |
| `create_bundle_id` | POST `bundleIds` | identifier, name, platform |
| `list_bundle_id_capabilities` | GET capabilities | `bundleId` |
| `enable_bundle_id_capability` | POST `bundleIdCapabilities` | `bundleId`, `capabilityType` |
| `disable_bundle_id_capability` | DELETE capability | `capabilityId`, `confirm` |
| `list_certificates` | GET `certificates` | optional type filter |
| `list_profiles` | GET `profiles` | optional type filter |
| `create_profile` | POST `profiles` | name, type, `bundleId`, certificate ids, device ids |
| `delete_profile` | DELETE `profiles/{id}` | `profileId`, `confirm` |

Certificate create needs a CSR. This wave lists certificates only. It does not create certificates.

## Wave 4 — Catalog, ops, and raw API

File: `src/catalog-tools.ts`

| Tool | Apple resource | Notes |
|---|---|---|
| `get_age_rating_declaration` | GET app info age rating | `appInfoId` |
| `update_age_rating_declaration` | PATCH `ageRatingDeclarations` | `declarationId` plus Apple attributes |
| `list_encryption_declarations` | GET app encryption declarations | `appId` |
| `create_encryption_declaration` | POST `appEncryptionDeclarations` | `appId` plus Apple attributes |
| `get_eula` | GET app EULA | `appId` |
| `set_eula` | POST or PATCH `endUserLicenseAgreements` | `appId`, `agreementText`, territories |
| `list_app_clips` | GET app clips | `appId` |
| `list_app_events` | GET `appEvents` | `appId` |
| `create_app_event` | POST `appEvents` | `appId`, name, dates, badge |
| `list_custom_product_pages` | GET custom product pages | `appId` |
| `get_pre_order` | GET app pre-order | `appId` |
| `set_pre_order` | POST or PATCH `appPreOrders` | `appId`, optional publish date |
| `list_webhooks` | GET `webhooks` | |
| `create_webhook` | POST `webhooks` | url, events, secret |
| `delete_webhook` | DELETE `webhooks/{id}` | `webhookId`, `confirm` |
| `list_sandbox_testers` | GET `sandboxTestersV2` | |
| `create_sandbox_tester` | POST `sandboxTestersV2` | email, password, territory |
| `delete_sandbox_tester` | DELETE tester | `testerId`, `confirm` |
| `list_xcode_cloud_products` | GET `ciProducts` | |
| `list_xcode_cloud_workflows` | GET product workflows | `ciProductId` |
| `start_xcode_cloud_build` | POST `ciBuildRuns` | `workflowId`, optional git ref |
| `get_xcode_cloud_build` | GET `ciBuildRuns/{id}` | `buildRunId` |
| `list_game_center_leaderboards` | GET Game Center leaderboards | `appId` |
| `list_game_center_achievements` | GET Game Center achievements | `appId` |

File: `src/raw-api-tools.ts`

| Tool | Behavior |
|---|---|
| `call_app_store_connect_api` | `method`, `path`, optional `query`, optional `body`, `confirm` when the method mutates |

## Tests

Add Node `node:test` plus `tsx`. Script: `npm test`.

Cover:

1. Shared runner returns `null` for an unknown tool name.
2. Shared runner throws when a mutating tool lacks `confirm: true`.
3. Each new module exports the tool names in this spec.
4. `request` builds the query string and sends JSON:API bodies (mock `fetch`).
5. File helpers throw `Local file not found` for a missing path.

No live Apple calls in `npm test`.

## Success criteria

1. `npm run build` succeeds.
2. `npm test` succeeds.
3. `ListTools` includes every tool in this spec plus the current IAP, subscription, and core tools.
4. README lists the new tool groups.

## Out of this spec

- Game Center write/localization trees beyond list tools
- Certificate create from a CSR
- Local Transporter fallback when `buildUploads` fails
