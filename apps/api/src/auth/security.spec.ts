import { Test } from '@nestjs/testing';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { AppModule } from '../app.module';
import { AuthService } from './auth.service';
jest.mock('@simplewebauthn/server', () => ({
  ...jest.requireActual<typeof import('@simplewebauthn/server')>(
    '@simplewebauthn/server',
  ),
  verifyRegistrationResponse: jest.fn(),
}));
describe('additional passkey ownership and purpose', () => {
  let auth: AuthService;
  let module: Awaited<
    ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
  >;
  beforeEach(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await module.init();
    auth = module.get(AuthService);
    jest.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'additional-key',
          publicKey: new Uint8Array([1, 2]),
          counter: 0,
        },
        aaguid: 'test',
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    } as never);
  });
  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });
  it('enrolls into the existing account with required cryptographic user verification', async () => {
    const session = await auth.register('key-owner@example.com');
    const user = auth.requireUserBySessionToken(session.access_token);
    const options = await auth.createAdditionalPasskeyOptions(
      session.access_token,
    );
    expect(options.options.excludeCredentials).toHaveLength(1);
    await auth.verifyAdditionalPasskey(
      session.access_token,
      options.challenge_id,
      { id: 'additional-key' } as never,
    );
    expect(auth.requireUserBySessionToken(session.access_token).id).toBe(
      user.id,
    );
    expect(auth.listPasskeys(session.access_token).passkeys).toHaveLength(2);
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: options.options.challenge,
        requireUserVerification: true,
      }),
    );
    await expect(
      auth.verifyAdditionalPasskey(session.access_token, options.challenge_id, {
        id: 'additional-key',
      } as never),
    ).rejects.toThrow();
    const key = auth
      .listPasskeys(session.access_token)
      .passkeys.find(
        (item) =>
          !options.options.excludeCredentials?.some(
            (excluded) => excluded.id === item.id,
          ),
      )!;
    await auth.removePasskey(session.access_token, key.id);
    expect(auth.listPasskeys(session.access_token).passkeys).toHaveLength(1);
    await expect(
      auth.removePasskey(
        session.access_token,
        auth.listPasskeys(session.access_token).passkeys[0].id,
      ),
    ).rejects.toThrow();
  });
  it('rejects other users, other sessions, signup-purpose challenges, and malformed attestations', async () => {
    const session = await auth.register('key-owner@example.com'),
      other = await auth.register('other-key@example.com');
    const options = await auth.createAdditionalPasskeyOptions(
      session.access_token,
    );
    await expect(
      auth.verifyAdditionalPasskey(
        other.access_token,
        options.challenge_id,
        {} as never,
      ),
    ).rejects.toThrow();
    expect(verifyRegistrationResponse).not.toHaveBeenCalled();
    const second = await auth.login('key-owner@example.com');
    await expect(
      auth.verifyAdditionalPasskey(
        second.access_token,
        options.challenge_id,
        {} as never,
      ),
    ).rejects.toThrow();
    const signup = await auth.createWebAuthnRegisterOptions(
      'new-key@example.com',
    );
    await expect(
      auth.verifyAdditionalPasskey(
        session.access_token,
        signup.challenge_id,
        {} as never,
      ),
    ).rejects.toThrow();
    const bad = await auth.createAdditionalPasskeyOptions(session.access_token);
    jest
      .mocked(verifyRegistrationResponse)
      .mockRejectedValueOnce(new Error('bad origin or attestation'));
    await expect(
      auth.verifyAdditionalPasskey(
        session.access_token,
        bad.challenge_id,
        {} as never,
      ),
    ).rejects.toThrow();
    const unverified = await auth.createAdditionalPasskeyOptions(
      session.access_token,
    );
    jest
      .mocked(verifyRegistrationResponse)
      .mockResolvedValueOnce({ verified: false } as never);
    await expect(
      auth.verifyAdditionalPasskey(
        session.access_token,
        unverified.challenge_id,
        {} as never,
      ),
    ).rejects.toThrow();
  });
});
