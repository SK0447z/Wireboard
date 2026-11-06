# WIREBOARD: Context & Product Vision

## 1. What Wireboard Is
**Wireboard** is an automated "Red Wire" integration-contract inspector and visual architecture debugger for vibe-coded and AI-built web applications (Next.js App Router + TypeScript + Route Handlers + Supabase/Prisma).

AI coding assistants can generate dozens of components and backend handlers in seconds, but they frequently drift:
- Renaming payload keys (`userId` vs `user_id` vs `id`)
- Swallowing HTTP errors with 200 OK responses
- Forcing type-casting with `as any` or `as unknown as Type` to bypass compiler checks
- Leaving ghost routes or mismatched database schema columns

Wireboard detects and surfaces these integration mismatches deterministically using Abstract Syntax Tree (AST) parsing—without guessing via regex or expensive, non-deterministic LLM passes.

## 2. Core Execution Loop
1. **Zero Manual Diagramming:** Scan local source directory (or cloned repository).
2. **Deterministic AST Extraction:** `ts-morph` extracts consumer requests (frontend fetch/axios/supabase), producer endpoints (Next.js `route.ts`), and storage schemas (Prisma/Supabase).
3. **Auto-Generate 3-Swimlane React Flow Canvas:**
   - **Frontend (Consumers):** UI components, hooks, action callers.
   - **Backend API (Producers):** Route handlers, expected request payloads, return status branches.
   - **Database (Storage):** Schema tables, columns, constraints.
4. **Visual Contract Triage:**
   - 🟢 **VERIFIED (Green Wire):** Keys and types match across boundaries.
   - 🔴 **BROKEN (Red Wire):** Missing route, field name mismatch (`userId` vs `user_id`), unhandled error status.
   - 🟡 **SUSPICIOUS (Yellow Wire):** Forced type-casting (`as any`), swallowed `try/catch` returning 200, dynamic or untyped fetch.
5. **1-Click Surgical Fix Prompt:** Click any broken or suspicious wire to copy a surgical, context-rich prompt tailored for IDE coding agents (Claude, Cursor, Copilot, Antigravity) to fix the drift immediately.

