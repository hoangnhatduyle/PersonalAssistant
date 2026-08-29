import { NextResponse } from "next/server";

export interface ApiResponseMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponseBody<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: ApiResponseMeta;
}

export function successResponse<T>(
  data: T,
  options?: { status?: number; meta?: ApiResponseMeta },
): NextResponse<ApiResponseBody<T>> {
  const body: ApiResponseBody<T> = { success: true, data, error: null };
  if (options?.meta) body.meta = options.meta;
  return NextResponse.json(body, { status: options?.status ?? 200 });
}

function errorResponse(message: string, status: number): NextResponse<ApiResponseBody<null>> {
  return NextResponse.json({ success: false, data: null, error: message }, { status });
}

export function unauthorizedResponse(): NextResponse<ApiResponseBody<null>> {
  return errorResponse("Unauthorized", 401);
}

export function notFoundResponse(): NextResponse<ApiResponseBody<null>> {
  return errorResponse("Not found", 404);
}

export function validationErrorResponse(message: string): NextResponse<ApiResponseBody<null>> {
  return errorResponse(message, 400);
}

/** SPEC-API-008 NC-API-018: the knowledge create route's per-user rate limit. */
export function rateLimitedResponse(message = "Rate limit exceeded"): NextResponse<ApiResponseBody<null>> {
  return errorResponse(message, 429);
}

/**
 * NC-API-004: error responses must never leak internal details (stack
 * traces, raw DB errors) to the client. Log the real error server-side and
 * return a fixed generic message.
 */
export function serverErrorResponse(context: string, error: unknown): NextResponse<ApiResponseBody<null>> {
  console.error(context, error);
  return errorResponse("Internal server error", 500);
}
