import path from "node:path";
import {
  Project,
  SyntaxKind,
  Node,
  SourceFile,
  Block,
  VariableDeclaration,
} from "ts-morph";
import type { AnchorNode, HttpMethod } from "../types/graph";

export interface FrontendFetchCall {
  componentNodeId: string;
  url: string;
  method: HttpMethod;
  fetchLine: number;
  hasTypeCheat: boolean;
  typeCheatLine?: number;
  expectsResponseFields: string[];
  responseVarLine?: number;
  sentBodyFields?: string[];
}

export interface SupabaseInteraction {
  sourceNodeId: string;
  sourceFile: string;
  table: string;
  operation: "select" | "insert" | "update" | "delete" | string;
  columns: string[];
  line: number;
}

export interface FrontendEnvAccess {
  nodeId: string;
  key: string;
  line: number;
  filePath: string;
}

export interface ScanFrontendResult {
  nodes: AnchorNode[];
  fetchCalls: FrontendFetchCall[];
  supabaseInteractions: SupabaseInteraction[];
  envUsages: FrontendEnvAccess[];
}

function extractUrlFromNode(argNode: Node, sf: SourceFile): string {
  if (Node.isStringLiteral(argNode)) {
    return argNode.getLiteralValue();
  }
  if (Node.isNoSubstitutionTemplateLiteral(argNode)) {
    return argNode.getLiteralValue();
  }
  if (Node.isTemplateExpression(argNode)) {
    let reconstructed = argNode.getHead().getLiteralText();
    for (const span of argNode.getTemplateSpans()) {
      const exprText = span.getExpression().getText();
      const paramName =
        exprText.split(".").pop()?.replace(/[^a-zA-Z0-9_]/g, "") || "id";
      reconstructed += `[${paramName}]` + span.getLiteral().getLiteralText();
    }
    return reconstructed;
  }
  if (Node.isIdentifier(argNode)) {
    const varName = argNode.getText();
    let current: Node | undefined = argNode;
    let decl: VariableDeclaration | undefined;

    while (current && !decl) {
      const block: Block | undefined = current.getFirstAncestorByKind(SyntaxKind.Block);
      if (!block) break;
      decl = block
        .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
        .find((d) => d.getName() === varName);
      current = block.getParent();
    }

    if (!decl) {
      decl = sf.getVariableDeclaration(varName);
    }

    const init = decl?.getInitializer();
    if (init) {
      return extractUrlFromNode(init, sf);
    }
  }

  return argNode.getText().replace(/['"`]/g, "");
}

function extractSentBodyKeys(callNode: Node, sf: SourceFile): string[] {
  const args = Node.isCallExpression(callNode) ? callNode.getArguments() : [];
  if (args.length < 2 || !Node.isObjectLiteralExpression(args[1])) {
    return [];
  }

  const bodyProp = args[1].getProperty("body");
  if (!bodyProp || !Node.isPropertyAssignment(bodyProp)) {
    return [];
  }

  const init = bodyProp.getInitializer();
  if (!init || !Node.isCallExpression(init)) {
    return [];
  }

  const callExprText = init.getExpression().getText();
  if (callExprText !== "JSON.stringify" && !callExprText.endsWith(".stringify")) {
    return [];
  }

  const stringifyArgs = init.getArguments();
  if (stringifyArgs.length === 0) {
    return [];
  }

  const payloadArg = stringifyArgs[0];
  const keys: string[] = [];

  if (Node.isObjectLiteralExpression(payloadArg)) {
    for (const prop of payloadArg.getProperties()) {
      if (
        Node.isPropertyAssignment(prop) ||
        Node.isShorthandPropertyAssignment(prop)
      ) {
        keys.push(prop.getName());
      }
    }
  } else if (Node.isIdentifier(payloadArg)) {
    const varName = payloadArg.getText();
    let current: Node | undefined = init;
    let decl: VariableDeclaration | undefined;

    while (current && !decl) {
      const block: Block | undefined = current.getFirstAncestorByKind(SyntaxKind.Block);
      if (!block) break;
      decl = block
        .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
        .find((d) => d.getName() === varName);
      current = block.getParent();
    }

    if (!decl) {
      decl = sf.getVariableDeclaration(varName);
    }

    const varInit = decl?.getInitializer();
    if (varInit && Node.isObjectLiteralExpression(varInit)) {
      for (const prop of varInit.getProperties()) {
        if (
          Node.isPropertyAssignment(prop) ||
          Node.isShorthandPropertyAssignment(prop)
        ) {
          keys.push(prop.getName());
        }
      }
    }
  }

  return keys;
}

function extractSupabaseInteractionsFromScope(
  scope: Node,
  sourceNodeId: string,
  sourceFile: string
): SupabaseInteraction[] {
  const calls = scope.getDescendantsOfKind(SyntaxKind.CallExpression);
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

    // Trace up the call chain
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

export function scanFrontendComponents(
  project: Project,
  projectRoot: string
): ScanFrontendResult {
  const normalizedRoot = path.resolve(projectRoot).replace(/\\/g, "/");
  const isFixtureScan =
    normalizedRoot.endsWith("test-fixtures/broken-app") ||
    normalizedRoot.includes("/test-fixtures/");

  const globPatterns = [
    path.join(normalizedRoot, "**/*.tsx").replace(/\\/g, "/"),
    path.join(normalizedRoot, "**/*.jsx").replace(/\\/g, "/"),
    "!**/node_modules/**",
    "!**/.next/**",
    "!**/.git/**",
  ];

  if (!isFixtureScan) {
    globPatterns.push("!**/test-fixtures/**");
  }

  project.addSourceFilesAtPaths(globPatterns);

  const frontendFiles = project.getSourceFiles().filter((sf) => {
    const p = sf.getFilePath().replace(/\\/g, "/");
    return (
      p.startsWith(normalizedRoot) &&
      !p.includes("/api/") &&
      !p.includes("/node_modules/") &&
      !p.includes("/.next/") &&
      !p.includes("/.git/") &&
      (isFixtureScan || !p.includes("/test-fixtures/")) &&
      /\.[tj]sx$/.test(p)
    );
  });

  const nodes: AnchorNode[] = [];
  const fetchCalls: FrontendFetchCall[] = [];
  const supabaseInteractions: SupabaseInteraction[] = [];
  const envUsages: FrontendEnvAccess[] = [];

  for (const sf of frontendFiles) {
    const relPath = path.relative(normalizedRoot, sf.getFilePath()).replace(/\\/g, "/");
    const baseName = path.basename(sf.getFilePath());

    // Identify component
    let compName = baseName.replace(/\.[tj]sx$/, "");
    let compLine = 1;

    // Check exported functions or variables
    const exportedDeclarations = sf.getExportedDeclarations();
    for (const [name, decls] of exportedDeclarations) {
      if (/^[A-Z]/.test(name) && decls.length > 0) {
        compName = name;
        compLine = decls[0].getStartLineNumber();
        break;
      }
    }

    if (compLine === 1) {
      // Fallback: check function declarations in file
      const funcs = sf.getFunctions();
      for (const fn of funcs) {
        const name = fn.getName();
        if (name && /^[A-Z]/.test(name)) {
          compName = name;
          compLine = fn.getStartLineNumber();
          break;
        }
      }
    }

    const componentNodeId = `fe:${baseName}`;
    const compNode: AnchorNode = {
      id: componentNodeId,
      kind: "FRONTEND_COMPONENT",
      label: compName,
      filePath: relPath,
      line: compLine,
    };
    nodes.push(compNode);

    // Extract Supabase interactions from component file
    const sfSupabase = extractSupabaseInteractionsFromScope(sf, componentNodeId, relPath);
    supabaseInteractions.push(...sfSupabase);

    // Extract process.env usages
    const sfPropAccesses = sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
    for (const pa of sfPropAccesses) {
      const expr = pa.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        if (expr.getExpression().getText() === "process" && expr.getName() === "env") {
          const key = pa.getName();
          if (key && key !== "NODE_ENV") {
            envUsages.push({
              nodeId: componentNodeId,
              key,
              line: pa.getStartLineNumber(),
              filePath: relPath,
            });
          }
        }
      }
    }

    // Find fetch calls
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const callExpr = call.getExpression();
      if (callExpr.getText() !== "fetch") continue;

      const args = call.getArguments();
      if (args.length === 0) continue;

      // Extract URL (handling StringLiteral, NoSubstitutionTemplateLiteral, TemplateExpression, Identifiers)
      const url = extractUrlFromNode(args[0], sf);

      // Extract HTTP method
      let method: HttpMethod = "GET";
      if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
        const methodProp = args[1].getProperty("method");
        if (methodProp && Node.isPropertyAssignment(methodProp)) {
          const methodVal = methodProp
            .getInitializer()
            ?.getText()
            .replace(/['"`]/g, "")
            .toUpperCase();
          if (
            methodVal === "GET" ||
            methodVal === "POST" ||
            methodVal === "PUT" ||
            methodVal === "PATCH" ||
            methodVal === "DELETE"
          ) {
            method = methodVal;
          }
        }
      }

      // Extract sent request body keys
      const sentBodyFields = extractSentBodyKeys(call, sf);

      const fetchLine = call.getStartLineNumber();
      let hasTypeCheat = false;
      let typeCheatLine: number | undefined;
      let responseVarLine: number | undefined;
      const expectsResponseFields: string[] = [];

      // Determine response variable name (e.g. const res = await fetch(...))
      let resVarName: string | null = null;
      const parentVarDecl = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (parentVarDecl) {
        resVarName = parentVarDecl.getName();
      }

      // Find enclosing scope to search for res.json() and data property accesses
      const enclosingScope =
        call.getFirstAncestorByKind(SyntaxKind.Block) ||
        call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) ||
        sf;

      // Find res.json() calls
      const innerCalls = enclosingScope.getDescendantsOfKind(SyntaxKind.CallExpression);
      let dataVarName: string | null = null;

      for (const ic of innerCalls) {
        const icExpr = ic.getExpression();
        if (
          Node.isPropertyAccessExpression(icExpr) &&
          icExpr.getName() === "json" &&
          (!resVarName || icExpr.getExpression().getText() === resVarName)
        ) {
          // Check for type cheat (as any / as unknown)
          const asExpr = ic.getFirstAncestorByKind(SyntaxKind.AsExpression);
          if (asExpr) {
            const typeNode = asExpr.getTypeNode();
            const typeKind = typeNode?.getKind();
            const typeText = typeNode?.getText();

            if (
              typeKind === SyntaxKind.AnyKeyword ||
              typeKind === SyntaxKind.UnknownKeyword ||
              typeText === "any" ||
              typeText?.startsWith("unknown")
            ) {
              hasTypeCheat = true;
              typeCheatLine = asExpr.getStartLineNumber();
            }
          }

          // Find variable receiving .json()
          const jsonVarDecl = (asExpr || ic).getFirstAncestorByKind(
            SyntaxKind.VariableDeclaration
          );
          if (jsonVarDecl) {
            dataVarName = jsonVarDecl.getName();
            responseVarLine = jsonVarDecl.getStartLineNumber();
          }
        }
      }

      // Trace read properties on data variable
      if (dataVarName) {
        const propAccesses = enclosingScope.getDescendantsOfKind(
          SyntaxKind.PropertyAccessExpression
        );
        const readFields = new Set<string>();
        for (const prop of propAccesses) {
          if (prop.getExpression().getText() === dataVarName) {
            readFields.add(prop.getName());
          }
        }
        expectsResponseFields.push(...readFields);
      }

      fetchCalls.push({
        componentNodeId,
        url,
        method,
        fetchLine,
        hasTypeCheat,
        typeCheatLine,
        expectsResponseFields,
        responseVarLine,
        sentBodyFields: sentBodyFields.length > 0 ? sentBodyFields : undefined,
      });
    }
  }

  return { nodes, fetchCalls, supabaseInteractions, envUsages };
}
