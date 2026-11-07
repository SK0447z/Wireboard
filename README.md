# WIREBOARD

**Full-stack contract compiler, AI lie detector, and visual architecture debugger for Next.js, Supabase, and Prisma.**

---

### The Problem
Your AI coding agent edits 6 files, runs `npm run build`, sees `0 errors`, and confidently tells you:

> *"All done! Everything compiles cleanly and works as expected."*

Then you open your browser, submit a form, and nothing works. Why? Because `fetch()`, REST payloads, and database queries cross network and process boundaries where TypeScript's static type checker is completely blind. By slapping `as any` or assuming snake_case keys match camelCase properties, AI agents introduce silent contract mismatches that compile cleanly but blow up in production.

### The Solution
Wireboard parses your TypeScript AST deterministically using `ts-morph` in **<100ms with 0 LLM tokens (100% local and offline)**. It stitches your entire full-stack topology—**Frontend ➔ API Routes ➔ Database**—into a unified contract graph. Broken integration wires glow **Red**, suspicious type bypasses light up **Yellow**, verified contracts glow **Green**, and Wireboard automatically outputs 1-click surgical repair prompts to patch every mismatch.

---

## Show, Don't Tell: What Wireboard Catches Instantly

Here is a classic real-world bug that passes `tsc` and `npm run build` without a single warning:

### 1. The Broken Code

#### Frontend: `app/register/RegisterForm.tsx`
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tier }),
  });

  // AI agent silences TypeScript using `as any`
  const data = (await res.json()) as any;

  // Expects camelCase keys
  if (data.userId && data.sessionToken) {
    router.push("/dashboard");
  }
};
```

#### Backend API Route: `app/api/register/route.ts`
```ts
export async function POST(req: Request) {
  const body = await req.json();

  // Inserts camelCase 'subscriptionTier' into database
  const user = await prisma.user.create({
    data: {
      email: body.email,
      subscriptionTier: body.tier, // schema expects 'subscription_tier'
    },
  });

  // Returns snake_case keys
  return NextResponse.json({
    user_id: user.id,
    token: "session_tok_abc123",
  });
}
```

#### Database Schema: `prisma/schema.prisma`
```prisma
model User {
  id                String   @id @default(uuid())
  email             String   @unique
  subscription_tier String   @default("free") // Database column is snake_case
}
```

---

### 2. What TypeScript & Next.js Report
```text
✓ Compiled successfully in 1.4s
✓ 0 errors, 0 warnings
```

---

### 3. What Wireboard Detects in 42ms
Run `npm run check` and Wireboard immediately exposes the 3 invisible boundary failures:

```text
🔍 Wireboard AST Contract Inspector
   Target: /workspace

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contract Integrity Score: 0%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Nodes:      8
Verified Wires:   🟢 2
Suspicious Wires: 🟡 1
Broken Wires:     🔴 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found 3 contract issue(s):

1. 🔴 [BROKEN] FIELD_MISMATCH — Payload key mismatch: expected [userId, sessionToken]
   Location: app/register/RegisterForm.tsx:20 -> app/api/register/route.ts:15
   Contract Diff:
     - Expected: {"userId":"string","sessionToken":"string"}
     - Actual:   {"user_id":"string","token":"string"}
   Fix: In app/api/register/route.ts (line 15), update return payload keys to include
        'userId', 'sessionToken' to match app/register/RegisterForm.tsx (line 20).

2. 🔴 [BROKEN] SCHEMA_DRIFT — Column mismatch: subscriptionTier vs subscription_tier
   Location: app/api/register/route.ts:21 -> prisma/schema.prisma:10
   Contract Diff:
     - Expected: {"subscription_tier":"string"}
     - Actual:   {"subscriptionTier":"string"}
   Fix: In app/api/register/route.ts (line 21), update 'subscriptionTier' to
        'subscription_tier' to match prisma/schema.prisma (line 10).

3. 🟡 [SUSPICIOUS] TYPE_CHEAT — Type assertion `as any` at network boundary
   Location: app/register/RegisterForm.tsx:20 -> app/api/register/route.ts:15
   Fix: In app/register/RegisterForm.tsx (line 20), remove `as any` and define an
        explicit typed interface matching app/api/register/route.ts (line 15).

❌ Check failed: 3 broken wire(s) detected.
```

---

## The 5 Boundary Failures Wireboard Detects

Wireboard acts as a strict compile-time firewall against the five most common AI-generated integration bugs:

1. 🔴 **`FIELD_MISMATCH`**  
   Frontend reads properties on a response payload that the backend handler never returns (e.g. `userId` vs `user_id`, or missing nested properties).
2. 🔴 **`SCHEMA_DRIFT`**  
   Backend queries or Supabase/Prisma operations insert or select columns that do not exist on the authoritative schema (e.g. `subscriptionTier` vs `subscription_tier`).
3. 🔴 **`MISSING_ENDPOINT`**  
   Frontend components invoke an API route or HTTP method that has no corresponding App Router `route.ts` handler (e.g. `DELETE /api/v1/projects/delete`).
4. 🟡 **`TYPE_CHEAT`**  
   AI models silence compiler checks at network boundaries using `as any`, `as unknown`, or unvalidated assertions instead of typing the contract.
5. 🟡 **`SWALLOWED_ERROR`**  
   Backend route handlers catch exceptions in `try / catch` blocks and return HTTP `200 OK` with an error message, masking server crashes from client error boundaries.

---

## 4 Ways to Use Wireboard

### A. Visual Control Room (`npm run dev`)
Launch the dark-mode (`#09090b`) architecture canvas at `http://localhost:3000`:
- **3 Swimlanes:** Visually traces dependencies across `FRONTEND` ➔ `API ROUTE` ➔ `DB TABLE`.
- **Public GitHub Scanning:** Paste any public repository link (`https://github.com/owner/repo`) or select local workspaces to inspect their integration graph live.
- **Interactive Inspector:** Click any wire or node to inspect code snippets, exact line numbers, expected vs. actual shapes, and copy surgical repair prompts.
- **Export Audit:** One-click **Copy Audit MD** button produces instant Markdown reports for pull request reviews and audits.

```bash
npm install
npm run dev
```

---

### B. Terminal CLI & CI Gatekeeper (`npm run check`)
Run deterministic contract checks in your terminal or continuous integration pipeline. Wireboard exits with code `1` if any broken contracts exist, stopping faulty code from merging:

```bash
# Check current project
npm run check

# Check a specific directory or test fixture
npx tsx src/cli.ts test-fixtures/broken-app

# Generate CONTRACT_REPORT.md file
npx tsx src/cli.ts . --write
```

---

### C. Native MCP Server (`.mcp.json`)
Connect Wireboard to Cursor, Claude Code, Windsurf, Antigravity, or any Model Context Protocol host. Allows coding agents to query full-stack contract state with zero token consumption:

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

#### Exposed MCP Tools:
- **`wireboard_scan`**: Scans the AST and returns the Contract Integrity Score, total nodes, summary counts, and broken/suspicious wire lists.
- **`wireboard_get_fixes`**: Returns the exact `DiagnosticIssue[]` list containing ready-to-execute `repairPrompt` instructions for every contract bug.

---

### D. Drop-In Agent Skill (`skills/wireboard/SKILL.md`)
Copy `skills/wireboard` into your project's `.agents/skills/` directory:

```bash
cp -r skills/wireboard .agents/skills/wireboard
```

Force your AI coding agent to obey strict contract verification before closing any issue:
> *"Before declaring any full-stack task finished that touches frontend components, Next.js API routes, or database schemas, you MUST verify contracts using Wireboard (`npm run check` or `wireboard_scan`). Fix all FIELD_MISMATCH, SCHEMA_DRIFT, and MISSING_ENDPOINT issues before completing."*

---

## How It Works Under the Hood: 3-Anchor AST Pipeline

Wireboard contains zero runtime dependencies on React or Next.js inside its core engine (`src/engine/`). It functions as a pure AST static analysis compiler:

```
┌────────────────────────────────┐
│      1. Consumer Anchor        │  Scans TSX components for fetch(), axios,
│    (Frontend TSX Scanner)      │  and supabase.from() calls + property reads
└───────────────┬────────────────┘
                │
┌───────────────▼────────────────┐
│      2. Producer Anchor        │  Scans App Router route.ts files for HTTP handlers
│     (Backend Route Scanner)    │  (GET/POST/etc), req.json(), & NextResponse.json()
└───────────────┬────────────────┘
                │
┌───────────────▼────────────────┐
│      3. Storage Anchor         │  Parses schema.prisma models & Supabase database
│     (Database Parser)          │  type definitions for authoritative schema models
└───────────────┬────────────────┘
                │
┌───────────────▼────────────────┐
│      Deterministic Graph       │  Diffs property reads vs returned payload keys,
│       Stitcher & Differ        │  validates route existence, flags type-cheats,
│         (src/engine/)          │  and outputs typed ArchitectureGraph JSON
└────────────────────────────────┘
```

1. **Consumer Anchor:** Extracts endpoint targets, HTTP methods, outbound payload properties, downstream property accesses, and `as any` type bypasses.
2. **Producer Anchor:** Extracts exported route handlers, extracts status codes, returns payload shapes from `NextResponse.json()`, and flags swallowed errors in catch blocks.
3. **Storage Anchor:** Parses Prisma schema ASTs and Supabase TypeScript definitions into model definitions and column mappings.
4. **Deterministic Graph Stitcher & Differ:** Matches consumers to producers and producers to database tables, compares key shapes, calculates a deterministic **Contract Integrity Score**, and compiles actionable diagnostic issues.

---

## License

MIT
