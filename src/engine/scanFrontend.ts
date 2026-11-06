import path from "node:path";
import { Project, SyntaxKind, Node } from "ts-morph";
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
}

export interface ScanFrontendResult {
  nodes: AnchorNode[];
  fetchCalls: FrontendFetchCall[];
}

export function scanFrontendComponents(
  project: Project,
  projectRoot: string
): ScanFrontendResult {
  const normalizedRoot = projectRoot.replace(/\\/g, "/");
  const globPatterns = [
    path.join(projectRoot, "**/*.tsx").replace(/\\/g, "/"),
    path.join(projectRoot, "**/*.jsx").replace(/\\/g, "/"),
  ];

  project.addSourceFilesAtPaths(globPatterns);

  const frontendFiles = project.getSourceFiles().filter((sf) => {
    const p = sf.getFilePath().replace(/\\/g, "/");
    return (
      p.startsWith(normalizedRoot) &&
      !p.includes("/api/") &&
      !p.includes("/node_modules/") &&
      !p.includes("/.next/") &&
      /\.[tj]sx$/.test(p)
    );
  });

  const nodes: AnchorNode[] = [];
  const fetchCalls: FrontendFetchCall[] = [];

  for (const sf of frontendFiles) {
    const relPath = path.relative(projectRoot, sf.getFilePath()).replace(/\\/g, "/");
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

    // Find fetch calls
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const callExpr = call.getExpression();
      if (callExpr.getText() !== "fetch") continue;

      const args = call.getArguments();
      if (args.length === 0) continue;

      // Extract URL
      let url = "";
      const arg0 = args[0];
      if (Node.isStringLiteral(arg0)) {
        url = arg0.getLiteralValue();
      } else if (Node.isNoSubstitutionTemplateLiteral(arg0)) {
        url = arg0.getLiteralValue();
      } else {
        url = arg0.getText().replace(/['"`]/g, "");
      }

      // Extract HTTP method
      let method: HttpMethod = "GET";
      if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
        const methodProp = args[1].getProperty("method");
        if (methodProp && Node.isPropertyAssignment(methodProp)) {
          const methodVal = methodProp.getInitializer()?.getText().replace(/['"`]/g, "").toUpperCase();
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
      });
    }
  }

  return { nodes, fetchCalls };
}
