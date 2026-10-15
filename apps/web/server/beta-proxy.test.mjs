import test from 'node:test';
import assert from 'node:assert/strict';
import { proxy } from './beta-proxy.mjs';

const env = {
  API_UPSTREAM_ORIGIN: 'https://api.example.test',
  PRIVATE_BETA_PROXY_KEY: 'a'.repeat(64),
};
const site = 'https://beta.example.test';
const unavailable = () => {
  throw new Error('must not contact upstream');
};

test('routes nested Vercel rewrites without leaking internal parameters', async () => {
  const response = await proxy(
    new Request(
      site + '/api/proxy?__beta_path=auth%2Fwebauthn%2Flogin%2Foptions&email=test%40example.test',
    ),
    env,
    async (url) => {
      assert.equal(url.pathname, '/api/auth/webauthn/login/options');
      assert.equal(url.searchParams.get('email'), 'test@example.test');
      assert.equal(url.searchParams.has('__beta_path'), false);
      return Response.json({ ok: true });
    },
  );
  assert.equal(response.status, 200);
  for (const query of ['__beta_path=../../outside', '__beta_path=a&__beta_path=b']) {
    assert.equal(
      (await proxy(new Request(site + '/api/proxy?' + query), env, unavailable)).status,
      400,
    );
  }
});

test('fails closed for missing or unsafe server configuration', async () => {
  for (const settings of [
    {},
    { ...env, PRIVATE_BETA_PROXY_KEY: 'short' },
    { ...env, API_UPSTREAM_ORIGIN: 'http://api.example.test' },
    { ...env, API_UPSTREAM_ORIGIN: 'https://user:secret@api.example.test' },
    { ...env, API_UPSTREAM_ORIGIN: 'https://api.example.test/other' },
  ]) {
    assert.equal(
      (await proxy(new Request(site + '/api/symbols'), settings, unavailable)).status,
      503,
    );
  }
});

test('forwards only allowed headers and pins the upstream origin', async () => {
  let calls = 0;
  const result = await proxy(
    new Request(site + '/api/candles?symbol=BTC%2FUSD&url=https://evil.test', {
      headers: {
        authorization: 'Bearer user-session',
        cookie: 'vercel-cookie',
        'x-bitstockerz-beta-key': 'attacker-value',
        'x-forwarded-for': 'attacker-ip',
        accept: 'application/json',
      },
    }),
    env,
    async (url, options) => {
      calls++;
      assert.equal(url.origin, env.API_UPSTREAM_ORIGIN);
      assert.equal(url.pathname, '/api/candles');
      assert.equal(url.searchParams.get('symbol'), 'BTC/USD');
      assert.equal(options.headers.get('authorization'), 'Bearer user-session');
      assert.equal(options.headers.get('x-bitstockerz-beta-key'), env.PRIVATE_BETA_PROXY_KEY);
      assert.equal(options.headers.has('cookie'), false);
      assert.equal(options.headers.has('x-forwarded-for'), false);
      assert.equal(options.redirect, 'manual');
      return Response.json(
        { bars: [] },
        {
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-bitstockerz-beta-key': 'must-not-return',
            'set-cookie': 'must-not-return',
          },
        },
      );
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(await result.json(), { bars: [] });
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.has('x-bitstockerz-beta-key'), false);
  assert.equal(result.headers.has('set-cookie'), false);
});

test('rejects cross-origin calls and non-API paths before forwarding', async () => {
  for (const headers of [{ origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal(
      (
        await proxy(
          new Request(site + '/api/auth/register', { method: 'POST', headers }),
          env,
          unavailable,
        )
      ).status,
      403,
    );
  }
  assert.equal((await proxy(new Request(site + '/api/../outside'), env, unavailable)).status, 404);
});

test('preserves request bodies, errors, exports and redirects without following them', async () => {
  const result = await proxy(
    new Request(site + '/api/auth/oauth/apple/callback', {
      method: 'POST',
      body: 'code=abc&state=xyz',
      headers: { origin: site, 'content-type': 'application/x-www-form-urlencoded' },
    }),
    env,
    async (_url, options) => {
      assert.equal(Buffer.from(options.body).toString(), 'code=abc&state=xyz');
      assert.equal(options.headers.get('content-type'), 'application/x-www-form-urlencoded');
      return new Response(null, {
        status: 302,
        headers: { location: site + '/auth/callback#code=handoff' },
      });
    },
  );
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), site + '/auth/callback#code=handoff');
  const csv = await proxy(
    new Request(site + '/api/export'),
    env,
    async () =>
      new Response('a,b\n1,2', {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-disposition': 'attachment; filename=export.csv',
        },
      }),
  );
  assert.equal(await csv.text(), 'a,b\n1,2');
  assert.equal(csv.headers.get('content-disposition'), 'attachment; filename=export.csv');
});

test('limits request size even without content-length and sanitizes upstream failures', async () => {
  for (const headers of [{}, { 'content-length': '1048577' }]) {
    const request = new Request(site + '/api/strategies', {
      method: 'POST',
      headers,
      body: 'x'.repeat(1048577),
    });
    assert.equal((await proxy(request, env, unavailable)).status, 413);
  }
  const oldError = console.error;
  const messages = [];
  console.error = (message) => messages.push(message);
  try {
    const result = await proxy(new Request(site + '/api/symbols'), env, () => {
      throw new Error('sensitive-provider-detail');
    });
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { code: 'API_UNAVAILABLE' });
    assert.deepEqual(messages, ['BitStockerz API proxy request failed']);
  } finally {
    console.error = oldError;
  }
});
