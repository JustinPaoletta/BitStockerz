import express from 'express';
import request from 'supertest';
import { configureTrustedProxy } from './trusted-proxy';

describe('trusted ingress client addresses', () => {
  it('ignores forwarded addresses from an untrusted connection', async () => {
    const app = express();
    configureTrustedProxy(app, []);
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    const response = await request(app)
      .get('/')
      .set('X-Forwarded-For', '198.51.100.1');
    expect(response.body.ip).not.toBe('198.51.100.1');
  });

  it('takes the nearest untrusted address and ignores spoofed earlier hops', async () => {
    const app = express();
    configureTrustedProxy(app, ['loopback']);
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    const response = await request(app)
      .get('/')
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.1');
    expect(response.body.ip).toBe('198.51.100.1');
  });
});
