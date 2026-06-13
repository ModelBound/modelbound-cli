// Thin HTTP client around the ModelBound public API. All endpoints expect
// a Bearer token (either an MODELBOUND_API_KEY or the device-code-issued
// session token). Errors are normalized into a single ApiError class so
// command handlers can render them consistently.
import { resolveApiUrl, resolveToken } from "./config.js";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

interface CallOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;     // explicit override (used by device-code flow)
  apiUrl?: string;    // explicit override (--api-url)
  // If true, do not auto-attach a token; used for unauthenticated endpoints
  // like /api/cli/device/start.
  anonymous?: boolean;
}

export async function api<T = unknown>(
  path: string,
  opts: CallOptions = {},
): Promise<T> {
  const base = (opts.apiUrl || resolveApiUrl()).replace(/\/+$/, "");
  const token = opts.anonymous ? undefined : opts.token ?? resolveToken();
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "modelbound-cli/0.1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const resp = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await resp.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { _raw: text }; }
  }

  if (!resp.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && typeof (body as any).error === "string"
        ? (body as any).error
        : null) ||
      (body && typeof body === "object" && "message" in body && typeof (body as any).message === "string"
        ? (body as any).message
        : null) ||
      `HTTP ${resp.status}`;
    throw new ApiError(resp.status, msg, body);
  }

  return body as T;
}
