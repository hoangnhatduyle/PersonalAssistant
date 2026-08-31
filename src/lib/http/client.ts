import type { ApiResponseBody, ApiResponseMeta } from "@/lib/api/response";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiFetchInit = Omit<RequestInit, "body"> & {
  /**
   * A plain object is JSON-serialized automatically (Content-Type set for
   * you). Pass a FormData (Knowledge multipart create) or Blob (raw audio/*
   * turn body) to send it as-is — the browser sets FormData's multipart
   * boundary itself, and a Blob's Content-Type must be set explicitly via
   * `headers` by the caller (there's no single right mimetype to infer).
   */
  body?: unknown;
};

/**
 * Wraps fetch against this app's ApiResponseBody<T> envelope
 * (src/lib/api/response.ts), identical across every route. Throws ApiError
 * (carrying the HTTP status) when the envelope reports success: false.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<{ data: T; meta?: ApiResponseMeta }> {
  const { body, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);

  let finalBody: BodyInit | undefined;
  if (body === undefined) {
    finalBody = undefined;
  } else if (body instanceof FormData || body instanceof Blob) {
    finalBody = body;
  } else {
    finalBody = JSON.stringify(body);
    if (!finalHeaders.has("Content-Type")) finalHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...rest, headers: finalHeaders, body: finalBody });

  let payload: ApiResponseBody<T>;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("Unexpected response from server", response.status);
  }

  if (!payload.success) throw new ApiError(payload.error ?? "Request failed", response.status);
  return { data: payload.data as T, meta: payload.meta };
}

type QueryValue = string | number | boolean | string[] | undefined | null;

/** Builds a query string from a filter object, dropping undefined/null/empty-array values. */
export function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters) as Array<[string, QueryValue]>) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(","));
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
