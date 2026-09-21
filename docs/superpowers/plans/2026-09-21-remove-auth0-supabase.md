# Remove Auth0 and Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip Auth0, Supabase, and OAuth client code so the server is local Apple MCP over open HTTP.

**Architecture:** Keep Express `HttpTransport` for `/mcp` and `/health`. Delete `src/auth/` and Supabase transports. Drop unused npm deps. Docs and env examples match Apple-only setup.

**Tech Stack:** TypeScript, Express, MCP SDK, `jsonwebtoken` (Apple API only)

## Global Constraints

- ASD-STE100 for user-facing docs and comments you write
- Do not commit unless the user asks
- Keep App Store Connect tool behavior unchanged
- Keep `src/services/auth.ts` (Apple JWT helper — not Auth0)

---

### Task 1: Slim HttpTransport

**Files:**
- Modify: `src/transport/HttpTransport.ts` (rewrite without OAuth)

**Interfaces:**
- Consumes: `HttpTransportConfig` without `oauth`
- Produces: `HttpTransport` with `setMcpServerFactory`, `start`, `stop`; routes `/`, `/mcp`, `/health`

- [ ] **Step 1: Replace file with OAuth-free transport**

Write `src/transport/HttpTransport.ts` as Express + StreamableHTTP MCP only: helmet, cors, rate limit, health, POST/GET/DELETE on `/` and `/mcp`, no Auth0/fetch/authenticator.

- [ ] **Step 2: Verify TypeScript compiles after later tasks**

Run: `npm run build` (after Task 3 wiring)

---

### Task 2: Delete Auth0 / Supabase modules

**Files:**
- Delete: `src/auth/*`
- Delete: `src/transport/HttpSSETransport.ts`
- Delete: `src/transport/TransportFactory.ts`
- Delete: `supabase/`
- Delete: `AUTH0_SETUP.md`
- Delete: `docs/OAUTH_MCP_AUTH0_GUIDE.md`
- Delete: `src/index.ts.backup` (dead OAuth backup)

- [ ] **Step 1: Delete the files listed above**

---

### Task 3: Wire index + package + docs

**Files:**
- Modify: `src/index.ts` (remove oauth config)
- Modify: `package.json` / lockfile (remove `@supabase/supabase-js`, `jwks-rsa`; drop oauth/auth0 keywords)
- Modify: `.env.example`, `README.md`, `server.json`
- Modify: `PUBLISHING.md` tags if they list auth0/oauth as product features

- [ ] **Step 1: Update `main()` to construct HttpTransport without oauth**
- [ ] **Step 2: Update env example, README, server.json**
- [ ] **Step 3: `npm uninstall @supabase/supabase-js jwks-rsa`**
- [ ] **Step 4: `npm run build` — expect success**
- [ ] **Step 5: Grep for Auth0/Supabase/hardcoded secret — expect no hits in `src/`**

---

### Task 4: Smoke check

- [ ] **Step 1: Confirm no `Sxbl5OaXjqfdb1NYlgFyfJr0afbynb6UOIsqFEZiQPxB98h6tRTfUmbRnJUHulQG` in working tree source**
- [ ] **Step 2: Confirm `src/services/auth.ts` still present (Apple JWT)**
