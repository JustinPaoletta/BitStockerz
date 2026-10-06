import { HttpErrorResponse } from '@angular/common/http';
/** Expose a safe correlation ID with the existing user-facing API detail. */
export function withRequestReference(error: HttpErrorResponse): HttpErrorResponse {
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error;
  const problem = body as { detail?: unknown; requestId?: unknown };
  if (
    typeof problem.detail !== 'string' ||
    typeof problem.requestId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(problem.requestId)
  )
    return error;
  return new HttpErrorResponse({
    error: { ...body, detail: `${problem.detail} Request ID: ${problem.requestId}` },
    headers: error.headers,
    status: error.status,
    statusText: error.statusText,
    url: error.url ?? undefined,
  });
}
