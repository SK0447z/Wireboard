# WIREBOARD

> **Your AI agent says `✓ Compiled successfully` while your app is silently broken. Wireboard catches full-stack AI contract lies in 50ms—0 LLM tokens.**

---

## The Modern AI Engineering Stack

| Tool | Purpose | What it Eliminates |
| :--- | :--- | :--- |
| **`ponytail`** | Senior Dev Simplicity | Bloated code, premature wrappers, YAGNI over-engineering |
| **`unslop`** | Visual Design Discipline | AI UI slop, purple gradients, amorphous blobs, uneven rhythm |
| **`graphify`** | Codebase Memory | Lost architecture context across agent sessions |
| **`wireboard`** | **Full-Stack Contract Verification & Visual X-Ray** | **Silent AI network and database boundary lies** |

---

## The 5 AI Lies Wireboard Catches

AI coding agents are notorious for hallucinatory contract boundaries: they make a frontend component call a non-existent API or mismatch payload keys, and TypeScript compiler passes without errors because of `any` types or separate compilation roots.

1. 🔴 **`FIELD_MISMATCH`**: Frontend expects `userId` and `sessionToken`, but backend returns `user_id` and `token`.
2. 🔴 **`SCHEMA_DRIFT`**: Backend query inserts `subscriptionTier`, but Prisma or Supabase schema specifies `subscription_tier`.
3. 🔴 **`MISSING_ENDPOINT`**: Frontend `fetch('/api/v1/projects/delete', { method: 'DELETE' })` points to a void; no matching App Router `route.ts` exists.
4. 🟡 **`TYPE_CHEAT`**: Agent slaps `as any` or unvalidated type assertions across network boundaries to silence the type checker.
5. 🟡 **`SWALLOWED_ERROR`**: Backend route wraps logic in `try ... catch` and returns `{ success: false, error: message }` with HTTP `200 OK`, masking server failures.

---

## Quickstart

### 1. Visual Control Room
Launch the dark-mode `#09090b` architecture canvas to inspect your full-stack graph visually:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. You can:
- Scan local paths or built-in test fixtures (`test-fixtures/broken-app`).
- Scan any public GitHub repository directly by pasting `https://github.com/owner/repo`.
- Click on any wire to see exact file-and-line connections, contract diffs, and surgical repair prompts.
- Click **"Copy Audit MD"** to generate an instant markdown report for PRs or team reviews.

---

### 2. CI/Git Pre-Commit Gatekeeper (CLI)
Run Wireboard as a fast, deterministic pre-commit hook or CI check. Exits with code `1` if any broken contracts exist:

```bash
# Check current repository
npm run check

# Check a specific path or fixture
npx tsx src/cli.ts test-fixtures/broken-app

# Generate CONTRACT_REPORT.md file
npx tsx src/cli.ts . --write
```

---

### 3. Native Model Context Protocol (MCP) Server
Wireboard comes with a built-in MCP JSON-RPC 2.0 server. Add it to your `.mcp.json` or MCP settings:

```json
{
  "mcpServers": {
    "wireboard": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"]
    }
  }
}
```

Exposes two zero-token tools:
- `wireboard_scan`: Runs AST scan and returns Contract Integrity Score and broken/suspicious wire summaries.
- `wireboard_get_fixes`: Returns exact `DiagnosticIssue` items with ready-to-run `repairPrompt` instructions.

---

### 4. Drop-In Agent Skill
Equip your AI coding agent with the Wireboard skill by copying `skills/wireboard` into your project's `.agents/skills/`:

```bash
cp -r skills/wireboard .agents/skills/wireboard
```

Instruct your AI coding agent:
> *"Before finishing any full-stack task touching frontend components, API routes, or database schemas, verify all integration contracts using Wireboard (`npm run check` or `wireboard_scan`)."*

---

## Architecture & Technology

- **Pure Engine Isolation:** Zero React or Next.js runtime dependencies in `src/engine/`. Pure TypeScript AST scanning via `ts-morph`.
- **Three Anchors:**
  1. *Consumer (Frontend):* AST tracing of `fetch()`, `axios`, and `supabase.from()`.
  2. *Producer (Backend):* Next.js App Router handlers (`GET`, `POST`, `PUT`, `DELETE` in `route.ts`).
  3. *Storage (Database):* Prisma schemas (`schema.prisma`) and Supabase schemas (`database.types.ts`).
- **Graph Layout:** Dagre hierarchical DAG layout rendered on React Flow `@xyflow/react`.

---

## License

MIT
