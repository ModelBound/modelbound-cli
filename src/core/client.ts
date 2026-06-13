// Thin HTTP client for the ModelBound hosted API.
// All heavy logic lives server-side; this just wraps fetch with auth,
// retries, idempotency, and zod-validated responses.
import { z } from "zod";
import { loadProfile } from "./config.js";

export interface ClientOpts {
  profile?: string;
  apiKey?: string;
  apiUrl?: string;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public detail?: unknown) {
    super(message);
  }
}

export function createClient(opts: ClientOpts = {}) {
  const profile = loadProfile(opts.profile ?? "default");
  const apiKey = opts.apiKey ?? profile.apiKey ?? process.env.MODELBOUND_API_KEY;
  const apiUrl = opts.apiUrl ?? profile.apiUrl ?? "https://qwqfoyhnhszqqplsavxk.supabase.co/functions/v1";
  const f = opts.fetch ?? fetch;

  if (!/^https:\/\//.test(apiUrl) && !apiUrl.startsWith("http://localhost")) {
    throw new ApiError(0, "bad_api_url", `apiUrl must be https or localhost: ${apiUrl}`);
  }

  async function call<T>(path: string, body: unknown, schema: z.ZodType<T>, idempotencyKey?: string): Promise<T> {
    const url = `${apiUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    let attempt = 0;
    let lastErr: unknown;
    while (attempt < 3) {
      attempt++;
      try {
        const res = await f(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
            ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
          },
          body: JSON.stringify(body ?? {}),
        });
        if (res.status === 429) {
          const wait = Number(res.headers.get("retry-after") ?? "1") * 1000;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          throw new ApiError(res.status, json?.code ?? "http_error", json?.error ?? res.statusText, json);
        }
        return schema.parse(json);
      } catch (e) {
        lastErr = e;
        if (e instanceof ApiError && e.status < 500 && e.status !== 0) throw e;
        await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
      }
    }
    throw lastErr;
  }

  return { call, apiUrl, apiKey: apiKey ?? null };
}

export function uuidv4() {
  return crypto.randomUUID();
}
