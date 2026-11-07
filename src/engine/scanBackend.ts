import path from "node:path";
import { Project, SyntaxKind, Node } from "ts-morph";
import type { AnchorNode, HttpMethod } from "../types/graph";
import type { SupabaseInteraction } from "./scanFrontend";

export interface BackendDbInteraction {
  model: string;
  operation: string;
  dataKeys: string[];
  line: number;
}

export interface BackendSwallowedError {
  line: number;
  status: number;
}

export interface BackendRouteInfo {
  node: AnchorNode;
  dbInteractions: BackendDbInteraction[];
  swallowedErrors: BackendSwallowedError[];
  supabaseInteractions: SupabaseInteraction[];
}

export interface ScanBackendResult {
  nodes: AnchorNode[];
  routes: BackendRouteInfo[];
}

const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function extractBackendSupabaseInteractions(
  body: Node,
  sourceNodeId: string,
  sourceFile: string
): SupabaseInteraction[] {
  const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression);
  const interactions: SupabaseInteraction[] = [];

  for (const call of calls) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;
    if (expr.getName() !== "from") continue;

    const baseText = expr.getExpression().getText();
    if (baseText !== "supabase" && !baseText.endsWith(".supabase") && baseText !== "client") {
      continue;
    }

    const args = call.getArguments();
    if (args.length === 0) continue;

    let tableName = "";
    if (Node.isStringLiteral(args[0]) || Node.isNoSubstitutionTemplateLiteral(args[0])) {
      tableName = args[0].getLiteralValue();
    }
    if (!tableName) continue;

    let operation = "select";
    const columns: string[] = [];
    let interactionLine = call.getStartLineNumber();

    let curr: Node = call;
    while (curr.getParent() && Node.isPropertyAccessExpression(curr.getParent())) {
      const propAccess = curr.getParent() as import("ts-morph").PropertyAccessExpression;
      const methodName = propAccess.getName();
      const methodCall = propAccess.getParent();

      if (
        methodCall &&
        Node.isCallExpression(methodCall) &&
        methodCall.getExpression() === propAccess
      ) {
        if (methodName === "select") {
          if (operation !== "insert" && operation !== "update" && operation !== "delete") {
            operation = "select";
          }
          const mArgs = methodCall.getArguments();
          if (
            mArgs.length > 0 &&
            (Node.isStringLiteral(mArgs[0]) || Node.isNoSubstitutionTemplateLiteral(mArgs[0]))
          ) {
            const raw = mArgs[0].getLiteralValue();
            const parts = raw.split(",").map((s) => s.trim()).filter((s) => s && s !== "*");
            for (const p of parts) {
              const colName = p.split(":")[0].trim();
              if (colName && !columns.includes(colName)) {
                columns.push(colName);
              }
            }
          }
        } else if (methodName === "insert" || methodName === "update") {
          operation = methodName;
          interactionLine = methodCall.getStartLineNumber();
          const mArgs = methodCall.getArguments();
          if (mArgs.length > 0) {
            const arg = mArgs[0];
            if (Node.isObjectLiteralExpression(arg)) {
              for (const prop of arg.getProperties()) {
                if (
                  Node.isPropertyAssignment(prop) ||
                  Node.isShorthandPropertyAssignment(prop)
                ) {
                  if (!columns.includes(prop.getName())) {
                    columns.push(prop.getName());
                  }
                }
              }
            } else if (Node.isArrayLiteralExpression(arg)) {
              for (const el of arg.getElements()) {
                if (Node.isObjectLiteralExpression(el)) {
                  for (const prop of el.getProperties()) {
                    if (
                      Node.isPropertyAssignment(prop) ||
                      Node.isShorthandPropertyAssignment(prop)
                    ) {
                      if (!columns.includes(prop.getName())) {
                        columns.push(prop.getName());
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (methodName === "delete") {
          operation = "delete";
          interactionLine = methodCall.getStartLineNumber();
        }
        curr = methodCall;
      } else {
        break;
      }
    }

    interactions.push({
      sourceNodeId,
      sourceFile,
      table: tableName,
      operation,
      columns,
      line: interactionLine,
    });
  }

  return interactions;
}

export function scanBackendRoutes(
  project: Project,
  projectRoot: string
): ScanBackendResult {
  const normalizedRoot = path.resolve(projectRoot).replace(/\\/g, "/");
  const isFixtureScan =
    normalizedRoot.endsWith("test-fixtures/broken-app") ||
    normalizedRoot.includes("/test-fixtures/");

  const globPatterns = [
    path.join(normalizedRoot, "app/api/**/route.ts").replace(/\\/g, "/"),
    path.join(normalizedRoot, "app/api/**/route.js").replace(/\\/g, "/"),
    path.join(normalizedRoot, "src/app/api/**/route.ts").replace(/\\/g, "/"),
    path.join(normalizedRoot, "src/app/api/**/route.js").replace(/\\/g, "/"),
    "!**/node_modules/**",
    "!**/.next/**",
    "!**/.git/**",
  ];

  if (!isFixtureScan) {
    globPatterns.push("!**/test-fixtures/**");
  }

  project.addSourceFilesAtPaths(globPatterns);

  const routeFiles = project.getSourceFiles().filter((sf) => {
    const p = sf.getFilePath().replace(/\\/g, "/");
    return (
      p.startsWith(normalizedRoot) &&
      !p.includes("/node_modules/") &&
      !p.includes("/.next/") &&
      !p.includes("/.git/") &&
      (isFixtureScan || !p.includes("/test-fixtures/")) &&
      /(?:src\/)?app\/api(\/.*)?\/route\.[tj]sx?$/.test(p)
    );
  });

  const nodes: AnchorNode[] = [];
  const routes: BackendRouteInfo[] = [];

  for (const sf of routeFiles) {
    const relPath = path.relative(normalizedRoot, sf.getFilePath()).replace(/\\/g, "/");
    const match = relPath.match(/(?:src\/)?app(\/api(?:\/.*)?)\/route\.[tj]sx?$/);
    if (!match) continue;

    // Derived routePath e.g. "/api/register" or "/api/projects"
    const routePath = match[1];

    for (const method of HTTP_METHODS) {
      let declNode: Node | undefined;
      let body: Node | undefined;

      const funcDecl = sf.getFunction(method);
      if (funcDecl && funcDecl.isExported()) {
        declNode = funcDecl;
        body = funcDecl.getBody();
      } else {
        const exportedMap = sf.getExportedDeclarations();
        const decls = exportedMap.get(method);
        if (decls && decls.length > 0) {
          const first = decls[0];
          if (Node.isFunctionDeclaration(first)) {
            declNode = first;
            body = first.getBody();
          } else if (Node.isVariableDeclaration(first)) {
            declNode = first;
            const init = first.getInitializer();
            if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
              body = init.getBody();
            }
          }
        }
      }

      if (!declNode || !body) continue;

      const line = declNode.getStartLineNumber();
      const nodeId = `api:${method}:${routePath}`;
      const expectsPayload: Record<string, string> = {};
      const returnsPayload: Record<string, string> = {};
      const dbInteractions: BackendDbInteraction[] = [];
      const swallowedErrors: BackendSwallowedError[] = [];

      // 1. Request Payload: `const { ... } = await req.json()` or `const body = await req.json(); ... body.repoPath`
      const varDecls = body.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
      for (const varDecl of varDecls) {
        const init = varDecl.getInitializer();
        if (!init) continue;

        let callCandidate: Node = init;
        if (Node.isAwaitExpression(init)) {
          callCandidate = init.getExpression();
        }

        if (Node.isCallExpression(callCandidate)) {
          const callExpr = callCandidate.getExpression();
          if (Node.isPropertyAccessExpression(callExpr) && callExpr.getName() === "json") {
            const nameNode = varDecl.getNameNode();
            if (Node.isObjectBindingPattern(nameNode)) {
              for (const elem of nameNode.getElements()) {
                expectsPayload[elem.getName()] = "string";
              }
            } else if (Node.isIdentifier(nameNode)) {
              const idName = nameNode.getText();
              const propAccesses = body.getDescendantsOfKind(
                SyntaxKind.PropertyAccessExpression
              );
              for (const prop of propAccesses) {
                if (prop.getExpression().getText() === idName) {
                  expectsPayload[prop.getName()] = "string";
                }
              }
            }
          }
        }
      }

      // 2. Prisma Calls: prisma.<model>.<operation>(...)
      const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of calls) {
        const expr = call.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) continue;

        const operation = expr.getName();
        const subExpr = expr.getExpression();
        if (!Node.isPropertyAccessExpression(subExpr)) continue;

        const model = subExpr.getName();
        const base = subExpr.getExpression().getText();

        if (base === "prisma" || base.endsWith(".prisma")) {
          const dataKeys: string[] = [];
          let interactionLine = call.getStartLineNumber();

          const args = call.getArguments();
          if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
            const dataProp = args[0].getProperty("data");
            if (dataProp && Node.isPropertyAssignment(dataProp)) {
              interactionLine = dataProp.getStartLineNumber();
              const dataInit = dataProp.getInitializer();
              if (dataInit && Node.isObjectLiteralExpression(dataInit)) {
                for (const prop of dataInit.getProperties()) {
                  if (
                    Node.isPropertyAssignment(prop) ||
                    Node.isShorthandPropertyAssignment(prop)
                  ) {
                    dataKeys.push(prop.getName());
                  }
                }
              }
            }
          }

          dbInteractions.push({
            model: model.toLowerCase(),
            operation,
            dataKeys,
            line: interactionLine,
          });
        }
      }

      // 3. Supabase Calls in Backend
      const supabaseInteractions = extractBackendSupabaseInteractions(body, nodeId, relPath);

      // 4. NextResponse.json & Swallowed Errors
      for (const call of calls) {
        const expr = call.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) continue;

        const methodName = expr.getName();
        const baseText = expr.getExpression().getText();

        if (
          (baseText === "NextResponse" || baseText === "Response") &&
          methodName === "json"
        ) {
          const args = call.getArguments();
          const catchAncestor = call.getFirstAncestorByKind(SyntaxKind.CatchClause);

          let status: number | undefined;
          if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
            const statusProp = args[1].getProperty("status");
            if (statusProp && Node.isPropertyAssignment(statusProp)) {
              const statusVal = statusProp.getInitializer()?.getText();
              if (statusVal) {
                status = parseInt(statusVal, 10);
              }
            }
          }

          if (catchAncestor) {
            const effectiveStatus = status ?? 200;
            if (effectiveStatus >= 200 && effectiveStatus < 300) {
              swallowedErrors.push({
                line: call.getStartLineNumber(),
                status: effectiveStatus,
              });
            }
          } else {
            const isErrorStatus = status !== undefined && status >= 400;
            if (!isErrorStatus && args.length >= 1) {
              const retArg = args[0];
              if (Node.isObjectLiteralExpression(retArg)) {
                for (const prop of retArg.getProperties()) {
                  if (
                    Node.isPropertyAssignment(prop) ||
                    Node.isShorthandPropertyAssignment(prop)
                  ) {
                    returnsPayload[prop.getName()] = "string";
                  }
                }
              } else {
                // Inspect TypeScript type via ts-morph
                const argType = retArg.getType();
                const typeProps = argType.getProperties();
                if (typeProps.length > 0) {
                  for (const tp of typeProps) {
                    returnsPayload[tp.getName()] = "string";
                  }
                }

                // If local variable initialized with object literal
                if (Node.isIdentifier(retArg)) {
                  const varName = retArg.getText();
                  const enclosingBlock = retArg.getFirstAncestorByKind(SyntaxKind.Block);
                  const decl = enclosingBlock
                    ?.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
                    .find((d) => d.getName() === varName);
                  const init = decl?.getInitializer();
                  if (init && Node.isObjectLiteralExpression(init)) {
                    for (const prop of init.getProperties()) {
                      if (
                        Node.isPropertyAssignment(prop) ||
                        Node.isShorthandPropertyAssignment(prop)
                      ) {
                        returnsPayload[prop.getName()] = "string";
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      const node: AnchorNode = {
        id: nodeId,
        kind: "BACKEND_ROUTE",
        label: `${method} ${routePath}`,
        filePath: relPath,
        line,
        httpMethod: method,
        routePath,
        expectsPayload: Object.keys(expectsPayload).length > 0 ? expectsPayload : undefined,
        returnsPayload: Object.keys(returnsPayload).length > 0 ? returnsPayload : undefined,
      };

      nodes.push(node);
      routes.push({
        node,
        dbInteractions,
        swallowedErrors,
        supabaseInteractions,
      });
    }
  }

  return { nodes, routes };
}
