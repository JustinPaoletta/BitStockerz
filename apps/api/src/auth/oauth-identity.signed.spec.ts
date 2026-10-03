import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('Production OAuth verification with real signed tokens', () => {
  it('validates both providers using local public JWKS and rejects invalid signatures and claims', async () => {
    const apiRoot = resolve(__dirname, '../..');
    const result = await execFileAsync(
      process.execPath,
      [
        '-r',
        require.resolve('ts-node/register/transpile-only'),
        resolve(apiRoot, 'test/oauth-signed-tokens.ts'),
      ],
      {
        cwd: apiRoot,
        env: {
          ...process.env,
          TS_NODE_PROJECT: resolve(apiRoot, 'tsconfig.json'),
        },
        timeout: 20_000,
      },
    );
    expect(result.stdout).toContain('Signed OAuth token checks PASS');
    expect(result.stderr).toBe('');
  }, 25_000);
});
