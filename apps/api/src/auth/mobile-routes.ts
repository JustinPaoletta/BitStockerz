// Direct mobile access is deliberately narrower than the existing proxy path.
// New endpoints do not become public/mobile-accessible by default.
const bootstrap =
  /^\/api\/auth\/webauthn\/(register|login)\/(options|verify)\/?$/;
const signedIn: ReadonlyArray<readonly [string, RegExp]> = [
  ['GET', /^\/api\/symbols\/[^/]+\/?$/],
  ['GET', /^\/api\/market-data\/(equities|crypto)\/candles\/?$/],
  ['GET', /^\/api\/strategies(?:\/[^/]+)?\/?$/],
  ['POST', /^\/api\/strategies(?:\/validate)?\/?$/],
  ['PUT', /^\/api\/strategies\/[^/]+\/?$/],
  ['DELETE', /^\/api\/strategies\/[^/]+\/?$/],
  [
    'GET',
    /^\/api\/backtests(?:\/[^/]+(?:\/(results\.csv|trades\.csv|research))?)?\/?$/,
  ],
  ['POST', /^\/api\/backtests\/?$/],
  [
    'GET',
    /^\/api\/trading\/(positions|portfolio-summary|orders|executions|executions\.csv)\/?$/,
  ],
  ['POST', /^\/api\/trading\/orders\/?$/],
  ['GET', /^\/api\/paper-account\/?$/],
  [
    'GET',
    /^\/api\/workspace\/(watchlist|chart|prices\/[^/]+|paper\/archives|account-export)\/?$/,
  ],
  ['POST', /^\/api\/workspace\/(watchlist|paper\/reset)\/?$/],
  ['DELETE', /^\/api\/workspace\/(watchlist\/[^/]+|account)\/?$/],
  ['GET', /^\/api\/(?:auth\/)?me\/?$/],
  ['PATCH', /^\/api\/me\/?$/],
  ['POST', /^\/api\/auth\/logout\/?$/],
  ['GET', /^\/api\/me\/security\/(sessions|passkeys)\/?$/],
  ['DELETE', /^\/api\/me\/security\/(sessions|passkeys)\/[^/]+\/?$/],
  ['POST', /^\/api\/me\/security\/passkeys\/(options|verify)\/?$/],
  [
    'POST',
    /^\/api\/ai\/(explain-strategy|validate-strategy|explain-backtest|suggest-improvements)\/?$/,
  ],
  ['GET', /^\/api\/automations\/?$/],
  ['POST', /^\/api\/automations(?:\/[^/]+\/(control|evaluate))?\/?$/],
];

export function mobileBootstrap(method: string, path: string): boolean {
  return method === 'POST' && bootstrap.test(path);
}

export function mobileUserRoute(method: string, path: string): boolean {
  return signedIn.some(
    ([verb, pattern]) => method === verb && pattern.test(path),
  );
}
