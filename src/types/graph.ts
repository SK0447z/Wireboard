import { z } from "zod";

export const WireStatusSchema = z.enum(["VERIFIED", "SUSPICIOUS", "BROKEN"]);
export type WireStatus = z.infer<typeof WireStatusSchema>;

export const NodeKindSchema = z.enum([
  "FRONTEND_COMPONENT",
  "BACKEND_ROUTE",
  "DB_TABLE",
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const DiagnosticCodeSchema = z.enum([
  "FIELD_MISMATCH",
  "MISSING_ENDPOINT",
  "SWALLOWED_ERROR",
  "TYPE_CHEAT",
  "SCHEMA_DRIFT",
]);
export type DiagnosticCode = z.infer<typeof DiagnosticCodeSchema>;

export const FieldShapeSchema = z.record(z.string(), z.string());
export type FieldShape = z.infer<typeof FieldShapeSchema>;

export const AnchorNodeSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  label: z.string(),
  filePath: z.string(),
  line: z.number(),
  httpMethod: HttpMethodSchema.optional(),
  routePath: z.string().optional(),
  expectsPayload: FieldShapeSchema.optional(),
  returnsPayload: FieldShapeSchema.optional(),
});
export type AnchorNode = z.infer<typeof AnchorNodeSchema>;

export const DiagnosticIssueSchema = z.object({
  id: z.string(),
  wireId: z.string(),
  severity: WireStatusSchema,
  code: DiagnosticCodeSchema,
  title: z.string(),
  explanation: z.string(),
  sourceFile: z.string(),
  sourceLine: z.number(),
  targetFile: z.string().optional(),
  targetLine: z.number().optional(),
  expectedShape: FieldShapeSchema.optional(),
  actualShape: FieldShapeSchema.optional(),
  repairPrompt: z.string(),
});
export type DiagnosticIssue = z.infer<typeof DiagnosticIssueSchema>;

export const ContractWireSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  status: WireStatusSchema,
  label: z.string().optional(),
  issues: z.array(DiagnosticIssueSchema),
});
export type ContractWire = z.infer<typeof ContractWireSchema>;

export const GraphSummarySchema = z.object({
  totalNodes: z.number(),
  verifiedWires: z.number(),
  brokenWires: z.number(),
  suspiciousWires: z.number(),
});
export type GraphSummary = z.infer<typeof GraphSummarySchema>;

export const ArchitectureGraphSchema = z.object({
  projectName: z.string(),
  scannedAt: z.string(),
  nodes: z.array(AnchorNodeSchema),
  wires: z.array(ContractWireSchema),
  issues: z.array(DiagnosticIssueSchema),
  summary: GraphSummarySchema,
});
export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>;

