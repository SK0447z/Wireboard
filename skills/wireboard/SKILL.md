---
name: wireboard
description: >
  Integration contract verification and visual architecture debugger for full-stack AI web apps.
  Scans TypeScript AST (ts-morph) to detect FIELD_MISMATCH, SCHEMA_DRIFT, MISSING_ENDPOINT,
  TYPE_CHEAT (as any), and SWALLOWED_ERROR across Frontend (fetch, Supabase), Backend
  (App Router route.ts), and Database (Prisma schemas, Supabase types). Run before completing
  any full-stack task.
argument-hint: "[check|fix|report]"
license: MIT
---

# Wireboard Contract Inspector

Wireboard is an automated integration-contract inspector and visual architecture debugger for AI-built web apps. It parses the TypeScript AST using `ts-morph` in 50ms with 0 LLM tokens to detect the 5 silent AI contract bugs:

1. **`FIELD_MISMATCH`**: Frontend expects `userId` but backend returns `user_id`.
2. **`SCHEMA_DRIFT`**: Backend query inserts `subscriptionTier` but database column is `subscription_tier`.
3. **`MISSING_ENDPOINT`**: Frontend calls an endpoint route that does not exist or has mismatched HTTP method.
4. **`TYPE_CHEAT`**: Bypassing type safety at network boundaries using `as any` or unvalidated casts.
5. **`SWALLOWED_ERROR`**: Backend `catch` block returning HTTP 200 with an error string.

---

## When to Run

Before finishing any full-stack task touching:
- **Frontend**: `fetch()`, `axios`, `supabase.from(...)`
- **Backend**: Next.js App Router handlers (`app/api/**/route.ts` or Server Actions)
- **Database**: `prisma/schema.prisma` or `database.types.ts`

You **MUST** verify that all integration wires are intact.

---

## How to Verify Contracts

### Option 1: Via CLI (Deterministic Gatekeeper)
Run the CLI check in your workspace terminal:
```bash
npm run check
# Or against specific path:
npx tsx src/cli.ts .
# To output CONTRACT_REPORT.md:
npx tsx src/cli.ts . --write
```
If exit code is `1`, there are `BROKEN` wires. Inspect the output and repair every issue.

### Option 2: Via MCP Server
If Wireboard is configured as an MCP server:
1. Call `wireboard_scan` with `{ projectPath: "." }` to get the summary, Contract Integrity Score, and issue list.
2. Call `wireboard_get_fixes` to obtain exact `repairPrompt` instructions for each diagnostic code.

---

## Repair Rules

When Wireboard flags an issue:
- **`FIELD_MISMATCH`**: Align the response keys in the backend handler or the frontend consumer. Do not silence it with `as any`.
- **`SCHEMA_DRIFT`**: Rename the Prisma/database column in queries to match the authoritative schema.
- **`MISSING_ENDPOINT`**: Create the missing `route.ts` or fix the URL path/method in the consumer.
- **`TYPE_CHEAT`**: Define an explicit TypeScript type interface matching the endpoint return schema; remove `as any`.
- **`SWALLOWED_ERROR`**: Ensure `catch` blocks in API routes return proper HTTP error status codes (`500`, `400`, etc.) rather than HTTP `200`.

Verify again until `npm run check` exits with `0` and reports `Contract Integrity Score: 100%`.
