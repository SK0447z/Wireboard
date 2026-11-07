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

export interface BackendEnvAccess {
  key: string;
  line: number;
}

export interface BackendUncheckedDbError {
  table: string;
  line: number;
  operation: string;
}

export interface BackendRouteInfo {
  node: AnchorNode;
  dbInteractions: BackendDbInteraction[];
  swallowedErrors: BackendSwallowedError[];
  supabaseInteractions: SupabaseInteraction[];
  uncheckedDbErrors: BackendUncheckedDbError[];
  envUsages: BackendEnvAccess[];
}

export interface ScanBackendResult {
  nodes: AnchorNode[];
  routes: BackendRouteInfo[];
  envUsages: Array<{ nodeId: string; key: string; line: number; filePath: string }>;
}

function extractEnvUsagesFromNode(node: Node): BackendEnvAccess[] {
  const envUsages: BackendEnvAccess[] = [];
  const propAccesses = node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);

  for (const pa of propAccesses) {
    const expr = pa.getExpression();
    if (Node.isPropertyAccessExpression(expr)) {
      if (expr.getExpression().getText() === "process" && expr.getName() === "env") {
        const key = pa.getName();
        if (key && key !== "NODE_ENV") {
          envUsages.push({
            key,
            line: pa.getStartLineNumber(),
          });
        }
      }
    }
  }

  return envUsages;
}

const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function extractBackendSupabase(
  body: Node,
  sourceNodeId: string,
  sourceFile: string
): {
  interactions: SupabaseInteraction[];
  uncheckedDbErrors: BackendUncheckedDbError[];
} {
  const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression);
  const interactions: SupabaseInteraction[] = [];
  const uncheckedDbErrors: BackendUncheckedDbError[] = [];

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

    // Check if Supabase error is handled or ignored
    let terminalExpr = curr;
    if (terminalExpr.getParent() && Node.isAwaitExpression(terminalExpr.getParent())) {
      terminalExpr = terminalExpr.getParent()!;
    }

    const varDecl = terminalExpr.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    let errorHandled = false;

    if (varDecl) {
      const nameNode = varDecl.getNameNode();
      if (Node.isObjectBindingPattern(nameNode)) {
        for (const elem of nameNode.getElements()) {
          if (elem.getName() === "error") {
            errorHandled = true;
            break;
          }
        }
      } else if (Node.isIdentifier(nameNode)) {
        const resName = nameNode.getText();
        const scope = varDecl.getFirstAncestorByKind(SyntaxKind.Block) || body;
        const propAccesses = scope.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
        for (const pa of propAccesses) {
          if (pa.getExpression().getText() === resName && pa.getName() === "error") {
            errorHandled = true;
            break;
          }
        }
      }
    }

    if (!errorHandled) {
      uncheckedDbErrors.push({
        table: tableName,
        line: interactionLine,
        operation,
      });
    }
  }

  return { interactions, uncheckedDbErrors };
}

function extractReturnedPayloadKeys(retArg: Node, body: Node): string[] {
  let nodeToInspect = retArg;
  if (Node.isAsExpression(retArg)) {
    nodeToInspect = retArg.getExpression();
  }

  const keys: string[] = [];

  // Direct object literal: { user_id: 1, token: "..." }
  if (Node.isObjectLiteralExpression(nodeToInspect)) {
    for (const prop of nodeToInspect.getProperties()) {
      if (
        Node.isPropertyAssignment(prop) ||
        Node.isShorthandPropertyAssignment(prop)
      ) {
        keys.push(prop.getName());
      }
    }
    return keys;
  }

  // Identifier: return NextResponse.json(out)
  if (Node.isIdentifier(nodeToInspect)) {
    const varName = nodeToInspect.getText();
    const varDecls = body.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    const decl = varDecls.find((d) => d.getName() === varName);

    if (decl) {
      let init = decl.getInitializer();
      if (init && Node.isAwaitExpression(init)) {
        init = init.getExpression();
      }

      if (init && Node.isObjectLiteralExpression(init)) {
        for (const prop of init.getProperties()) {
          if (
            Node.isPropertyAssignment(prop) ||
            Node.isShorthandPropertyAssignment(prop)
          ) {
            keys.push(prop.getName());
          }
        }
        return keys;
      }

      // Check if init is a Prisma call: e.g. await prisma.user.create({ data: { ... } })
      if (init && Node.isCallExpression(init)) {
        const pArgs = init.getArguments();
        if (pArgs.length > 0 && Node.isObjectLiteralExpression(pArgs[0])) {
          const selectProp = pArgs[0].getProperty("select");
          if (selectProp && Node.isPropertyAssignment(selectProp)) {
            const selectInit = selectProp.getInitializer();
            if (selectInit && Node.isObjectLiteralExpression(selectInit)) {
              for (const p of selectInit.getProperties()) {
                if (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) {
                  keys.push(p.getName());
                }
              }
            }
          }
          const dataProp = pArgs[0].getProperty("data");
          if (dataProp && Node.isPropertyAssignment(dataProp) && keys.length === 0) {
            const dataInit = dataProp.getInitializer();
            if (dataInit && Node.isObjectLiteralExpression(dataInit)) {
              for (const p of dataInit.getProperties()) {
                if (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) {
                  keys.push(p.getName());
                }
              }
            }
          }
        }
      }

      // TypeScript type properties
      const declType = decl.getType();
      const typeProps = declType.getProperties();
      if (typeProps.length > 0 && keys.length === 0) {
        for (const tp of typeProps) {
          keys.push(tp.getName());
        }
      }
    }
  }

  // Type-level fallback on nodeToInspect
  const argType = nodeToInspect.getType();
  const effectiveType = argType.getNonNullableType();
  let typeProps = effectiveType.getProperties();
  if (typeProps.length === 0 && effectiveType.isUnion()) {
    for (const u of effectiveType.getUnionTypes()) {
      const uProps = u.getNonNullableType().getProperties();
      if (uProps.length > 0) {
        typeProps = uProps;
        break;
      }
    }
  }
  if (typeProps.length > 0 && keys.length === 0) {
    for (const tp of typeProps) {
      keys.push(tp.getName());
    }
  }

  return keys;
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
    path.join(normalizedRoot, "app/**/actions*.ts").replace(/\\/g, "/"),
    path.join(normalizedRoot, "src/app/**/actions*.ts").replace(/\\/g, "/"),
    "!**/node_modules/**",
    "!**/.next/**",
    "!**/.git/**",
  ];

  if (!isFixtureScan) {
    globPatterns.push("!**/test-fixtures/**");
  }

  project.addSourceFilesAtPaths(globPatterns);

  const files = project.getSourceFiles().filter((sf) => {
    const p = sf.getFilePath().replace(/\\/g, "/");
    return (
      p.startsWith(normalizedRoot) &&
      !p.includes("/node_modules/") &&
      !p.includes("/.next/") &&
      !p.includes("/.git/") &&
      (isFixtureScan || !p.includes("/test-fixtures/")) &&
      /\.[tj]sx?$/.test(p)
    );
  });

  const nodes: AnchorNode[] = [];
  const routes: BackendRouteInfo[] = [];
  const allEnvUsages: Array<{ nodeId: string; key: string; line: number; filePath: string }> = [];

  for (const sf of files) {
    const relPath = path.relative(normalizedRoot, sf.getFilePath()).replace(/\\/g, "/");
    const isRouteFile = /(?:src\/)?app\/api(\/.*)?\/route\.[tj]sx?$/.test(relPath);
    const fileText = sf.getFullText();
    const hasUseServer = fileText.includes('"use server"') || fileText.includes("'use server'");

    // 1. Process API route handlers
    if (isRouteFile) {
      const match = relPath.match(/(?:src\/)?app(\/api(?:\/.*)?)\/route\.[tj]sx?$/);
      if (!match) continue;
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

        // Request Payload extraction
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
                // 1. Property accesses: body.email
                const propAccesses = body.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
                for (const prop of propAccesses) {
                  if (prop.getExpression().getText() === idName) {
                    expectsPayload[prop.getName()] = "string";
                  }
                }
                // 2. Destructuring: const { email } = body
                for (const innerVd of varDecls) {
                  if (innerVd.getInitializer()?.getText() === idName) {
                    const innerNameNode = innerVd.getNameNode();
                    if (Node.isObjectBindingPattern(innerNameNode)) {
                      for (const elem of innerNameNode.getElements()) {
                        expectsPayload[elem.getName()] = "string";
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Prisma Calls: prisma.<model>.<operation>(...)
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

        // Supabase Calls in Backend
        const { interactions: supabaseInteractions, uncheckedDbErrors } =
          extractBackendSupabase(body, nodeId, relPath);

        // NextResponse.json & Swallowed Errors
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
            let isErrorStatus = false;
            if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
              const statusProp = args[1].getProperty("status");
              if (statusProp && Node.isPropertyAssignment(statusProp)) {
                const statusExpr = statusProp.getInitializer();
                const statusText = statusExpr?.getText() || "";
                const matches = statusText.match(/\b([45]\d\d)\b/);
                if (matches) {
                  status = parseInt(matches[1], 10);
                  isErrorStatus = true;
                } else {
                  const parsed = parseInt(statusText, 10);
                  if (!isNaN(parsed)) {
                    status = parsed;
                    isErrorStatus = parsed >= 400;
                  }
                }
              }
            }

            const ifAncestor = call.getFirstAncestorByKind(SyntaxKind.IfStatement);
            if (ifAncestor && ifAncestor.getExpression().getText().toLowerCase().includes("error")) {
              isErrorStatus = true;
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
              if (!isErrorStatus && args.length >= 1) {
                const keys = extractReturnedPayloadKeys(args[0], body);
                for (const k of keys) {
                  returnsPayload[k] = "string";
                }
              }
            }
          }
        }

        const envUsages = extractEnvUsagesFromNode(body);
        for (const env of envUsages) {
          allEnvUsages.push({
            nodeId,
            key: env.key,
            line: env.line,
            filePath: relPath,
          });
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
          uncheckedDbErrors,
          envUsages,
        });
      }
    }

    // 2. Process Next.js Server Actions ("use server")
    if (hasUseServer) {
      const exportedDecls = sf.getExportedDeclarations();
      for (const [fnName, decls] of exportedDecls) {
        for (const decl of decls) {
          let body: Node | undefined;
          const line = decl.getStartLineNumber();

          if (Node.isFunctionDeclaration(decl) && decl.isAsync()) {
            body = decl.getBody();
          } else if (Node.isVariableDeclaration(decl)) {
            const init = decl.getInitializer();
            if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
              if (init.isAsync()) {
                body = init.getBody();
              }
            }
          }

          if (!body) continue;

          // Check for Prisma or Supabase interactions
          const { interactions: supabaseInteractions, uncheckedDbErrors } =
            extractBackendSupabase(body, `action:${relPath}:${fnName}`, relPath);

          const prismaCalls = body.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
            const text = c.getExpression().getText();
            return text.includes("prisma.");
          });

          if (supabaseInteractions.length === 0 && prismaCalls.length === 0) {
            continue;
          }

          const actionId = `action:${relPath}:${fnName}`;
          const dbInteractions: BackendDbInteraction[] = [];
          for (const call of prismaCalls) {
            const expr = call.getExpression();
            if (Node.isPropertyAccessExpression(expr)) {
              const op = expr.getName();
              const sub = expr.getExpression();
              if (Node.isPropertyAccessExpression(sub)) {
                const model = sub.getName();
                dbInteractions.push({
                  model: model.toLowerCase(),
                  operation: op,
                  dataKeys: [],
                  line: call.getStartLineNumber(),
                });
              }
            }
          }

          const actionNode: AnchorNode = {
            id: actionId,
            kind: "SERVER_ACTION",
            label: `action ${fnName}()`,
            filePath: relPath,
            line,
          };

          nodes.push(actionNode);
          routes.push({
            node: actionNode,
            dbInteractions,
            swallowedErrors: [],
            supabaseInteractions,
            uncheckedDbErrors,
            envUsages: [],
          });
        }
      }
    }
  }

  return { nodes, routes, envUsages: allEnvUsages };
}
