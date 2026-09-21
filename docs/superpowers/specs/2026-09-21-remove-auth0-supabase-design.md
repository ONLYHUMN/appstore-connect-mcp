# Design: Remove Auth0 and Supabase

**Date:** 2026-09-21  
**Status:** Approved in chat; pending file review  
**Repo:** appstore-connect-mcp (ONLYHUMN fork)

## Goal

Run a local Apple Store Connect MCP server over HTTP. Remove Auth0, Supabase, and unused OAuth client code. Remove the hardcoded Auth0 Management API secret with that code.

## Non-goals

- Rotate the live Auth0 secret in the Auth0 dashboard (manual, separate)
- Change the remote `asconnect.abundancecoach.ai` deploy
- Change App Store Connect API tool behavior

## Keep

- `src/index.ts` MCP tool registration and Apple JWT config (`APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY`)
- HTTP MCP transport for `/mcp` and `/health`
- `jsonwebtoken` for App Store Connect API JWTs (not Auth0)
- Local service scripts and Apple-focused README setup

## Delete

| Path / item | Reason |
|-------------|--------|
| `src/auth/` (all files) | Auth0 OAuth / DCR / static client registry |
| `src/transport/HttpSSETransport.ts` | Supabase-backed alternate transport |
| `src/transport/TransportFactory.ts` | Unused factory; wires Supabase |
| `supabase/` | Credential table for multi-tenant Auth0 users |
| `AUTH0_SETUP.md` | Auth0 ops doc |
| `docs/OAUTH_MCP_AUTH0_GUIDE.md` | Auth0 OAuth guide |
| `@supabase/supabase-js` | Unused after transport removal |
| `jwks-rsa` | Used only for OAuth JWT validation |

## Change

### `src/transport/HttpTransport.ts`

- Remove OAuth config, authenticator, and Auth0 Management hardcoded client
- Remove routes: `/.well-known/oauth-*`, `/register`, `/oidc/register`, `/authorize`, `/oauth/token`
- Keep Express server, CORS, `/health`, `/mcp` (and related MCP session handling)
- `/mcp` stays open (same as current `OAUTH_ENABLED=false`)

### `src/index.ts`

- Stop passing `oauth` / Stytch env into `HttpTransport`
- Remove OAuth enable logs
- Keep Apple env checks and tool wiring

### Config and docs

- `.env.example`: drop `OAUTH_*`; keep Apple + server host/port
- `README.md`: drop Auth0/OAuth setup; state open local `/mcp`
- `server.json`: drop OAuth env entries and Auth0 wording
- `package.json`: drop `oauth` / `auth0` keywords; remove unused deps; refresh lockfile

## Security note

Hardcoded Auth0 `client_id` / `client_secret` leave the tree when `StaticClientRegistry.ts` and the OAuth register path in `HttpTransport.ts` are deleted. History still holds the old values until history rewrite or secret rotation.

## Success criteria

1. `npm run build` succeeds
2. No import of Auth0, Supabase, or `src/auth/`
3. Server starts with Apple env only and serves `/mcp`
4. Repo text does not instruct users to configure Auth0 or Supabase
