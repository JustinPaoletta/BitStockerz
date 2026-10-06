import { HttpErrorResponse } from '@angular/common/http';
import { withRequestReference } from './error-reference';
it('adds a correlation ID without losing the error code or mutating the original', () => {
  const original = new HttpErrorResponse({
    status: 500,
    error: {
      detail: 'Request failed.',
      code: 'INTERNAL_ERROR',
      requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    },
  });
  const result = withRequestReference(original);
  expect(result.error.detail).toContain('Request ID:');
  expect(result.error.code).toBe('INTERNAL_ERROR');
  expect(original.error.detail).toBe('Request failed.');
});
it.each([
  null,
  'invalid',
  { detail: 'failure', requestId: 'https://secret.example/key' },
  { detail: 7, requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
])('ignores unsafe or malformed references %p', (body) => {
  const error = new HttpErrorResponse({ status: 500, error: body });
  expect(withRequestReference(error)).toBe(error);
});
