import type { Express } from 'express';

/** Only configured ingress addresses may supply forwarded client addresses. */
export function configureTrustedProxy(
  app: Pick<Express, 'set'>,
  trustedProxyCidrs: string[],
): void {
  app.set('trust proxy', trustedProxyCidrs);
}
