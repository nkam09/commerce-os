import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  error: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function apiError(error: string, status = 400): NextResponse<ApiError> {
  return NextResponse.json({ ok: false, error }, { status });
}

export function apiUnauthorized(): NextResponse<ApiError> {
  return apiError("Unauthorized", 401);
}

export function apiNotFound(entity = "Record"): NextResponse<ApiError> {
  return apiError(`${entity} not found`, 404);
}

export function apiServerError(err: unknown): NextResponse<ApiError> {
  console.error("[API error]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return apiError(message, 500);
}

/**
 * Extract optional brand filter from search params.
 * Returns undefined when brand is missing or "All Brands" (= no filter).
 */
export function parseBrand(sp: URLSearchParams): string | undefined {
  const raw = sp.get("brand");
  return raw && raw !== "All Brands" ? raw : undefined;
}

/**
 * Wraps an async route handler with standard error handling.
 */
export function withErrorHandler<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T | ApiError>> {
  return handler().catch((err: unknown) => {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized() as NextResponse<ApiError>;
    }
    return apiServerError(err) as NextResponse<ApiError>;
  });
}
