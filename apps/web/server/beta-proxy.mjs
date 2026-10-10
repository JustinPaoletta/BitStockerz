const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const REQUEST_HEADERS = ['accept', 'authorization', 'content-type', 'idempotency-key'];
const RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'retry-after',
  'x-request-id',
  'location',
];
const MAX_BODY_BYTES = 1024 * 1024;

function failure(status, code) {
  return Response.json({ code }, { status, headers: { 'cache-control': 'private, no-store' } });
}

// Deployment Protection must cover this function as well as the Angular website.
// Only this server-side module reads the shared key; never import it into src/.
export async function proxy(request, env = process.env, fetchApi = fetch) {
  let upstream;
  try {
    upstream = new URL(env.API_UPSTREAM_ORIGIN);
    if (
      upstream.protocol !== 'https:' ||
      upstream.username ||
      upstream.password ||
      upstream.pathname !== '/' ||
      upstream.search ||
      upstream.hash ||
      !/^[a-f0-9]{64}$/.test(env.PRIVATE_BETA_PROXY_KEY ?? '')
    )
      throw new Error();
  } catch {
    return failure(503, 'BETA_PROXY_NOT_CONFIGURED');
  }

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return failure(404, 'NOT_FOUND');
  if (!METHODS.has(request.method)) return failure(405, 'METHOD_NOT_ALLOWED');
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return failure(403, 'CROSS_ORIGIN_REQUEST');
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES)
    return failure(413, 'BODY_TOO_LARGE');

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-bitstockerz-beta-key', env.PRIVATE_BETA_PROXY_KEY);
  // Plain Vercel Functions need an explicit rewrite for nested API routes.
  // The reserved path parameter also works when the runtime rewrites request.url.
  const paths = url.searchParams.getAll('__beta_path');
  if (paths.length > 1) return failure(400, 'INVALID_API_PATH');
  upstream.pathname = paths.length ? `/api/${paths[0]}` : url.pathname;
  if (!upstream.pathname.startsWith('/api/')) return failure(400, 'INVALID_API_PATH');
  url.searchParams.delete('__beta_path');
  upstream.search = url.search;

  try {
    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Vercel limits incoming requests too; keep the API's proxy limit smaller.
      body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY_BYTES) return failure(413, 'BODY_TOO_LARGE');
    }
    const response = await fetchApi(upstream, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
    });
    const outgoing = new Headers({ 'cache-control': 'private, no-store' });
    for (const name of RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    // URLs, authorization headers and upstream exceptions may contain secrets.
    console.error('BitStockerz API proxy request failed');
    return failure(502, 'API_UNAVAILABLE');
  }
}
