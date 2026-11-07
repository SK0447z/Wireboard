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
  hasErrorHandling: boolean;
  isExternal?: boolean;
  externalService?: string;
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

export interface ExternalServiceCall {
  sourceNodeId: string;
  serviceName: string;
  urlOrTarget: string;
  line: number;
  filePath: string;
}

export interface ScanFrontendResult {
  nodes: AnchorNode[];
  fetchCalls: FrontendFetchCall[];
  supabaseInteractions: SupabaseInteraction[];
  envUsages: FrontendEnvAccess[];
  externalServices: ExternalServiceCall[];
}

const EXTERNAL_SDK_PREFIXES = [
  "stripe",
  "resend",
  "openai",
  "anthropic",
  "twilio",
  "sendgrid",
  "postmark",
];

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

function extractKeysFromObjectLiteralOrVar(
  targetNode: Node,
  sf: SourceFile
): string[] {
  const keys: string[] = [];

  let nodeToInspect: Node = targetNode;
  if (Node.isAwaitExpression(targetNode)) {
    nodeToInspect = targetNode.getExpression();
  }

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

  if (Node.isIdentifier(nodeToInspect)) {
    const varName = nodeToInspect.getText();
    let current: Node | undefined = nodeToInspect;
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
    if (varInit) {
      return extractKeysFromObjectLiteralOrVar(varInit, sf);
    }
  }

  return keys;
}

function extractSentBodyKeys(callNode: Node, sf: SourceFile): string[] {
  if (!Node.isCallExpression(callNode)) return [];
  const args = callNode.getArguments();
  const callExpr = callNode.getExpression();
  const callText = callExpr.getText();

  // Axios methods: axios.post(url, data), axios.put(url, data), axios.patch(url, data)
  if (
    callText === "axios.post" ||
    callText === "axios.put" ||
    callText === "axios.patch" ||
    callText.endsWith(".post") ||
    callText.endsWith(".put") ||
    callText.endsWith(".patch")
  ) {
    if (args.length >= 2) {
      return extractKeysFromObjectLiteralOrVar(args[1], sf);
    }
  }

  // Standard fetch: fetch(url, { body: JSON.stringify(...) })
  if (args.length < 2 || !Node.isObjectLiteralExpression(args[1])) {
    return [];
  }

  const bodyProp = args[1].getProperty("body");
  if (!bodyProp || !Node.isPropertyAssignment(bodyProp)) {
    return [];
  }

  const init = bodyProp.getInitializer();
  if (!init) return [];

  if (Node.isCallExpression(init)) {
    const callExprText = init.getExpression().getText();
    if (callExprText === "JSON.stringify" || callExprText.endsWith(".stringify")) {
      const stringifyArgs = init.getArguments();
      if (stringifyArgs.length > 0) {
        return extractKeysFromObjectLiteralOrVar(stringifyArgs[0], sf);
      }
    }
  }

  return extractKeysFromObjectLiteralOrVar(init, sf);
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

function isServiceExternal(url: string): { isExternal: boolean; serviceName?: string } {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return { isExternal: false };
      }
      for (const prefix of EXTERNAL_SDK_PREFIXES) {
        if (hostname.includes(prefix)) {
          return { isExternal: true, serviceName: prefix };
        }
      }
      return { isExternal: true, serviceName: hostname };
    } catch {
      return { isExternal: true, serviceName: "external" };
    }
  }
  return { isExternal: false };
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
  const externalServices: ExternalServiceCall[] = [];

  for (const sf of frontendFiles) {
    const relPath = path.relative(normalizedRoot, sf.getFilePath()).replace(/\\/g, "/");
    const baseName = path.basename(sf.getFilePath());

    // Identify component
    let compName = baseName.replace(/\.[tj]sx$/, "");
    let compLine = 1;

    const exportedDeclarations = sf.getExportedDeclarations();
    for (const [name, decls] of exportedDeclarations) {
      if (/^[A-Z]/.test(name) && decls.length > 0) {
        compName = name;
        compLine = decls[0].getStartLineNumber();
        break;
      }
    }

    if (compLine === 1) {
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

    // Extract Supabase interactions
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

    // Map React useState setters to state variable names: setterName -> stateVarName
    const stateMap = new Map<string, string>();
    const sfVarDecls = sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    for (const vd of sfVarDecls) {
      const init = vd.getInitializer();
      if (init && Node.isCallExpression(init)) {
        const callee = init.getExpression().getText();
        if (callee === "useState" || callee === "React.useState") {
          const nameNode = vd.getNameNode();
          if (Node.isArrayBindingPattern(nameNode)) {
            const elems = nameNode.getElements();
            if (elems.length >= 2) {
              const stateVar = elems[0].getText();
              const setter = elems[1].getText();
              stateMap.set(setter, stateVar);
            }
          }
        }
      }
    }

    // Check external SDK calls in the component
    const sfCalls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const c of sfCalls) {
      const cExpr = c.getExpression();
      if (Node.isPropertyAccessExpression(cExpr)) {
        let root = cExpr.getExpression();
        while (Node.isPropertyAccessExpression(root)) {
          root = root.getExpression();
        }
        const rootName = root.getText().toLowerCase();
        if (EXTERNAL_SDK_PREFIXES.includes(rootName)) {
          externalServices.push({
            sourceNodeId: componentNodeId,
            serviceName: rootName,
            urlOrTarget: cExpr.getText(),
            line: c.getStartLineNumber(),
            filePath: relPath,
          });
        }
      }
    }

    // Scan network calls (fetch and axios)
    for (const call of sfCalls) {
      const callExpr = call.getExpression();
      const callText = callExpr.getText();

      const isFetch = callText === "fetch";
      const isAxios =
        callText === "axios" ||
        callText.startsWith("axios.") ||
        callText.endsWith(".axios");

      if (!isFetch && !isAxios) continue;

      const args = call.getArguments();
      if (args.length === 0) continue;

      // Extract URL
      const url = extractUrlFromNode(args[0], sf);
      const { isExternal, serviceName } = isServiceExternal(url);
      if (isExternal && serviceName) {
        externalServices.push({
          sourceNodeId: componentNodeId,
          serviceName,
          urlOrTarget: url,
          line: call.getStartLineNumber(),
          filePath: relPath,
        });
      }

      // Extract HTTP method
      let method: HttpMethod = "GET";
      if (isAxios) {
        if (callText === "axios.post") method = "POST";
        else if (callText === "axios.put") method = "PUT";
        else if (callText === "axios.patch") method = "PATCH";
        else if (callText === "axios.delete") method = "DELETE";
      }

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
      const readFields = new Set<string>();

      // Check if call is wrapped in try/catch
      const isInsideTry = call.getFirstAncestorByKind(SyntaxKind.TryStatement) !== undefined;

      // Determine response variable name (e.g. const res = await fetch(...))
      let resVarName: string | null = null;
      const parentVarDecl = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (parentVarDecl) {
        const nameNode = parentVarDecl.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          resVarName = nameNode.getText();
        } else if (Node.isObjectBindingPattern(nameNode)) {
          // Destructuring direct axios call: const { data } = await axios.get(...)
          for (const elem of nameNode.getElements()) {
            if (elem.getName() === "data") {
              const boundName = elem.getNameNode().getText();
              resVarName = boundName;
            } else {
              readFields.add(elem.getName());
            }
          }
        }
      }

      // Find enclosing scope
      const enclosingScope =
        call.getFirstAncestorByKind(SyntaxKind.Block) ||
        call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) ||
        sf;

      // Check for error handling on resVarName (e.g. if (!res.ok) or res.status)
      let checkedResStatus = false;
      if (resVarName) {
        const scopePropAccesses = enclosingScope.getDescendantsOfKind(
          SyntaxKind.PropertyAccessExpression
        );
        for (const pa of scopePropAccesses) {
          if (pa.getExpression().getText() === resVarName) {
            const propName = pa.getName();
            if (propName === "ok" || propName === "status" || propName === "statusText") {
              checkedResStatus = true;
              break;
            }
          }
        }
      }

      const hasErrorHandling = isInsideTry || checkedResStatus;

      // Find response body processing
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

          // Variable receiving .json()
          const jsonVarDecl = (asExpr || ic).getFirstAncestorByKind(
            SyntaxKind.VariableDeclaration
          );
          if (jsonVarDecl) {
            responseVarLine = jsonVarDecl.getStartLineNumber();
            const nameNode = jsonVarDecl.getNameNode();

            // Destructured pattern: const { userId, token } = await res.json()
            if (Node.isObjectBindingPattern(nameNode)) {
              for (const elem of nameNode.getElements()) {
                const pName = elem.getName();
                if (pName) readFields.add(pName);
              }
            } else if (Node.isIdentifier(nameNode)) {
              dataVarName = nameNode.getText();
            }
          }

          // Direct state setter call: setUser(await res.json())
          const directCall = (asExpr || ic).getFirstAncestorByKind(SyntaxKind.CallExpression);
          if (directCall && directCall !== ic) {
            const calleeName = directCall.getExpression().getText();
            const stateVar = stateMap.get(calleeName);
            if (stateVar) {
              const compProps = sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
              for (const p of compProps) {
                if (p.getExpression().getText() === stateVar) {
                  readFields.add(p.getName());
                }
              }
            }
          }
        }
      }

      // If dataVarName was assigned, trace accesses in enclosingScope and React state
      if (dataVarName) {
        // 1. Direct property accesses: data.userId
        const propAccesses = enclosingScope.getDescendantsOfKind(
          SyntaxKind.PropertyAccessExpression
        );
        for (const prop of propAccesses) {
          if (prop.getExpression().getText() === dataVarName) {
            readFields.add(prop.getName());
          }
        }

        // 2. Destructuring from data: const { userId } = data
        const scopeVarDecls = enclosingScope.getDescendantsOfKind(
          SyntaxKind.VariableDeclaration
        );
        for (const vd of scopeVarDecls) {
          if (vd.getInitializer()?.getText() === dataVarName) {
            const nameNode = vd.getNameNode();
            if (Node.isObjectBindingPattern(nameNode)) {
              for (const elem of nameNode.getElements()) {
                readFields.add(elem.getName());
              }
            }
          }
        }

        // 3. React useState setter: setUser(data) -> trace user.<prop>
        for (const [setterName, stateVar] of stateMap.entries()) {
          const setterCalls = enclosingScope.getDescendantsOfKind(
            SyntaxKind.CallExpression
          );
          for (const sc of setterCalls) {
            if (
              sc.getExpression().getText() === setterName &&
              sc.getArguments().some((a) => a.getText() === dataVarName)
            ) {
              const compProps = sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
              for (const p of compProps) {
                if (p.getExpression().getText() === stateVar) {
                  readFields.add(p.getName());
                }
              }
            }
          }
        }
      }

      // If Axios call: res.data.<key>
      if (isAxios && resVarName) {
        const propAccesses = enclosingScope.getDescendantsOfKind(
          SyntaxKind.PropertyAccessExpression
        );
        for (const prop of propAccesses) {
          const expr = prop.getExpression();
          if (
            Node.isPropertyAccessExpression(expr) &&
            expr.getExpression().getText() === resVarName &&
            expr.getName() === "data"
          ) {
            readFields.add(prop.getName());
          }
        }
      }

      fetchCalls.push({
        componentNodeId,
        url,
        method,
        fetchLine,
        hasTypeCheat,
        typeCheatLine,
        expectsResponseFields: Array.from(readFields),
        responseVarLine,
        sentBodyFields: sentBodyFields.length > 0 ? sentBodyFields : undefined,
        hasErrorHandling,
        isExternal,
        externalService: serviceName,
      });
    }
  }

  return { nodes, fetchCalls, supabaseInteractions, envUsages, externalServices };
}
