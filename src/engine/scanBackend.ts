import path from "node:path";
import {
  Project,
  SyntaxKind,
  Node,
} from "ts-morph";
import type { AnchorNode, HttpMethod } from "../types/graph";

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
}

export interface ScanBackendResult {
  nodes: AnchorNode[];
  routes: BackendRouteInfo[];
}

const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function scanBackendRoutes(
  project: Project,
  projectRoot: string
): ScanBackendResult {
  const normalizedRoot = projectRoot.replace(/\\/g, "/");
  const globPatterns = [
    path.join(projectRoot, "app/api/**/route.ts").replace(/\\/g, "/"),
    path.join(projectRoot, "app/api/**/route.js").replace(/\\/g, "/"),
    path.join(projectRoot, "src/app/api/**/route.ts").replace(/\\/g, "/"),
    path.join(projectRoot, "src/app/api/**/route.js").replace(/\\/g, "/"),
  ];

  project.addSourceFilesAtPaths(globPatterns);

  const routeFiles = project.getSourceFiles().filter((sf) => {
    const p = sf.getFilePath().replace(/\\/g, "/");
    return (
      p.startsWith(normalizedRoot) &&
      /(?:src\/)?app\/api(\/.*)?\/route\.[tj]sx?$/.test(p)
    );
  });

  const nodes: AnchorNode[] = [];
  const routes: BackendRouteInfo[] = [];

  for (const sf of routeFiles) {
    const relPath = path.relative(projectRoot, sf.getFilePath()).replace(/\\/g, "/");
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

      // 1. Request Payload: `const { ... } = await req.json()`
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

      // 3. NextResponse.json & Swallowed Errors
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
            if (args.length >= 1 && Node.isObjectLiteralExpression(args[0])) {
              for (const prop of args[0].getProperties()) {
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
      });
    }
  }

  return { nodes, routes };
}
