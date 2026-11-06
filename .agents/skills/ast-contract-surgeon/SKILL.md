---
name: ast-contract-surgeon
description: Rules for extracting full-stack API & database contracts using ts-morph AST parsing without regex or unnecessary LLM calls.
---
# AST Contract Surgeon

## Core Mandate
Wireboard is a deterministic full-stack contract compiler disguised as a visual React Flow canvas. Never guess code structure with Regular Expressions or dump entire repositories into an LLM.

## Rules
1. **Pure Engine Isolation:** All AST scanning and contract diffing must live in `src/engine/` as pure TypeScript functions (File Paths in -> Typed JSON Graph out). Zero React or Next.js runtime dependencies inside `src/engine/`.
2. **AST over Regex:** Use `ts-morph` to parse TypeScript/React files. Extract 3 anchors:
   - **Consumer Anchor (Frontend):** Locate `fetch()`, `axios`, and `supabase.from()` calls. Trace the awaited response variable to see which properties the UI actually reads (`res.user_id`) and detect type-cheating (`as any`, `as unknown as X`).
   - **Producer Anchor (Backend):** Locate Next.js App Router handlers (`GET`, `POST`, etc. in `route.ts`). Extract request body destructuring (`await req.json()`) and all `NextResponse.json(payload, { status })` return branches.
   - **Storage Anchor (Database):** Parse Prisma schemas (`schema.prisma`) or Supabase type definitions (`database.types.ts`) into flat table/column/type maps.
3. **Deterministic Diffing First:** Compare Consumer expectations against Producer responses and Storage schemas in code. Grade every wire:
   - `VERIFIED` (Green): Keys and types match across boundaries.
   - `BROKEN` (Red): Missing route, mismatched field name (`userId` vs `user_id`), or unhandled error status.
   - `SUSPICIOUS` (Yellow): Forced type-casting (`as any`), swallowed `try/catch` returning 200 OK, or dynamic URLs.

