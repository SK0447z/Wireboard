import { describe, it, expect } from "vitest";
import path from "node:path";
import { Project } from "ts-morph";
import { scanFrontendComponents } from "../scanFrontend";

describe("scanFrontendComponents", () => {
  const fixtureRoot = path.resolve(__dirname, "../../../test-fixtures/broken-app");

  it("extracts frontend components and fetch calls with type cheating detection and property tracing", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2 },
    });

    const result = scanFrontendComponents(project, fixtureRoot);

    expect(result.nodes).toHaveLength(2);

    // 1. RegisterForm
    const regNode = result.nodes.find((n) => n.id === "fe:RegisterForm.tsx");
    expect(regNode).toBeDefined();
    expect(regNode?.kind).toBe("FRONTEND_COMPONENT");
    expect(regNode?.label).toBe("RegisterForm");
    expect(regNode?.filePath).toBe("app/register/RegisterForm.tsx");
    expect(regNode?.line).toBe(5);

    const regFetch = result.fetchCalls.find(
      (c) => c.componentNodeId === "fe:RegisterForm.tsx"
    );
    expect(regFetch).toBeDefined();
    expect(regFetch?.url).toBe("/api/register");
    expect(regFetch?.method).toBe("POST");
    expect(regFetch?.fetchLine).toBe(12);
    expect(regFetch?.hasTypeCheat).toBe(true);
    expect(regFetch?.typeCheatLine).toBe(20);
    expect(regFetch?.expectsResponseFields).toContain("userId");
    expect(regFetch?.expectsResponseFields).toContain("sessionToken");

    // 2. ProjectList
    const projNode = result.nodes.find((n) => n.id === "fe:ProjectList.tsx");
    expect(projNode).toBeDefined();
    expect(projNode?.kind).toBe("FRONTEND_COMPONENT");
    expect(projNode?.label).toBe("ProjectList");
    expect(projNode?.filePath).toBe("app/dashboard/ProjectList.tsx");
    expect(projNode?.line).toBe(11);

    const projCalls = result.fetchCalls.filter(
      (c) => c.componentNodeId === "fe:ProjectList.tsx"
    );
    expect(projCalls).toHaveLength(2);

    const getCall = projCalls.find((c) => c.method === "GET");
    expect(getCall).toBeDefined();
    expect(getCall?.url).toBe("/api/projects");
    expect(getCall?.fetchLine).toBe(17);
    expect(getCall?.hasTypeCheat).toBe(false);
    expect(getCall?.expectsResponseFields).toEqual(["projects"]);

    const deleteCall = projCalls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.url).toBe("/api/v1/projects/delete");
    expect(deleteCall?.fetchLine).toBe(29);
    expect(deleteCall?.hasTypeCheat).toBe(false);
    expect(deleteCall?.expectsResponseFields).toEqual([]);
  });

  it("extracts template literal URLs, sent request body fields, and Supabase interactions", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2 },
    });

    project.createSourceFile(
      "src/components/DynamicTestComponent.tsx",
      `
      import React from "react";
      export function DynamicTestComponent() {
        const url = "/api/items";
        async function run(id: string) {
          // Template expression
          await fetch(\`/api/projects/\${id}\`);
          // Variable URL + POST body
          await fetch(url, {
            method: "POST",
            body: JSON.stringify({ repoPath: "foo", count: 42 }),
          });
          // Supabase select & insert
          await supabase.from("teams").select("id, name, created_at");
          await supabase.from("members").insert({ team_id: "t1", role: "admin" });
        }
        return <div>Test</div>;
      }
      `
    );

    const result = scanFrontendComponents(project, path.resolve("src"));

    const compNode = result.nodes.find((n) => n.id === "fe:DynamicTestComponent.tsx");
    expect(compNode).toBeDefined();

    // 1. Template literal normalized to [id]
    const templateCall = result.fetchCalls.find((c) => c.url === "/api/projects/[id]");
    expect(templateCall).toBeDefined();

    // 2. Variable URL resolved to /api/items + sent body fields extracted
    const postCall = result.fetchCalls.find((c) => c.url === "/api/items");
    expect(postCall).toBeDefined();
    expect(postCall?.method).toBe("POST");
    expect(postCall?.sentBodyFields).toEqual(["repoPath", "count"]);

    // 3. Supabase interactions extracted
    const teamsSupabase = result.supabaseInteractions.find((s) => s.table === "teams");
    expect(teamsSupabase).toBeDefined();
    expect(teamsSupabase?.operation).toBe("select");
    expect(teamsSupabase?.columns).toEqual(["id", "name", "created_at"]);

    const membersSupabase = result.supabaseInteractions.find((s) => s.table === "members");
    expect(membersSupabase).toBeDefined();
    expect(membersSupabase?.operation).toBe("insert");
    expect(membersSupabase?.columns).toEqual(["team_id", "role"]);
  });

  it("extracts destructured responses, useState setters, axios calls, error handling, and external services", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2 },
    });

    project.createSourceFile(
      "src/components/AdvancedConsumer.tsx",
      `
      import React, { useState } from "react";
      export function AdvancedConsumer() {
        const [profile, setProfile] = useState<any>(null);

        async function loadProfile() {
          try {
            const res = await fetch("/api/profile");
            const data = await res.json();
            setProfile(data);
          } catch (e) {
            console.error(e);
          }
        }

        async function createSession() {
          const res = await fetch("/api/session", {
            method: "POST",
            body: JSON.stringify({ email: "test@example.com", remember: true }),
          });
          const { sessionId, token } = await res.json();
          return { sessionId, token };
        }

        async function callAxios() {
          const res = await axios.post("/api/checkout", { amount: 100 });
          return res.data.checkoutUrl;
        }

        async function callExternal() {
          await fetch("https://api.stripe.com/v1/customers");
          await stripe.paymentIntents.create({ amount: 50 });
        }

        return <div>{profile?.displayName} ({profile?.email})</div>;
      }
      `
    );

    const result = scanFrontendComponents(project, path.resolve("src"));
    const compNode = result.nodes.find((n) => n.id === "fe:AdvancedConsumer.tsx");
    expect(compNode).toBeDefined();

    // 1. Profile fetch: inside try/catch -> hasErrorHandling = true; useState tracing -> displayName, email
    const profileCall = result.fetchCalls.find((c) => c.url === "/api/profile");
    expect(profileCall).toBeDefined();
    expect(profileCall?.hasErrorHandling).toBe(true);
    expect(profileCall?.expectsResponseFields).toContain("displayName");
    expect(profileCall?.expectsResponseFields).toContain("email");

    // 2. Session fetch: destructured response { sessionId, token } + no try/catch -> hasErrorHandling = false
    const sessionCall = result.fetchCalls.find((c) => c.url === "/api/session");
    expect(sessionCall).toBeDefined();
    expect(sessionCall?.hasErrorHandling).toBe(false);
    expect(sessionCall?.expectsResponseFields).toContain("sessionId");
    expect(sessionCall?.expectsResponseFields).toContain("token");
    expect(sessionCall?.sentBodyFields).toEqual(["email", "remember"]);

    // 3. Axios post
    const axiosCall = result.fetchCalls.find((c) => c.url === "/api/checkout");
    expect(axiosCall).toBeDefined();
    expect(axiosCall?.method).toBe("POST");
    expect(axiosCall?.sentBodyFields).toEqual(["amount"]);
    expect(axiosCall?.expectsResponseFields).toContain("checkoutUrl");

    // 4. External services
    const stripeExt = result.externalServices.find((e) => e.serviceName === "stripe");
    expect(stripeExt).toBeDefined();
  });
});
