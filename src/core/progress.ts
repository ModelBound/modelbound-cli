// Shared progress event schema. The MCP server uses the same union so
// CLI / IDE / MCP renderers stay consistent.
export type ProgressEvent =
  | { type: "stage_started"; stage: string; ts: string }
  | { type: "stage_progress"; stage: string; pct?: number; msg?: string; ts: string }
  | { type: "stage_done"; stage: string; ok: boolean; meta?: Record<string, unknown>; ts: string }
  | { type: "warn"; msg: string; ts: string }
  | { type: "error"; msg: string; code?: string; ts: string }
  | { type: "summary"; summary: Record<string, unknown>; ts: string };

export type ProgressHandler = (e: ProgressEvent) => void;
