import { AuthService } from './auth.service';
import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthPersistenceService } from './auth-persistence.service';
import type { MobileAdmissionService } from './mobile-admission.service';
import type { WebAuthnChallengeRecord } from './auth.records';
import { verifyRegistrationResponse } from '@simplewebauthn/server';

jest.mock('@simplewebauthn/server', () => ({
  ...jest.requireActual<typeof import('@simplewebauthn/server')>(
    '@simplewebauthn/server',
  ),
  verifyRegistrationResponse: jest.fn(),
}));

function fixture() {
  const challenges = new Map<string, WebAuthnChallengeRecord>();
  const config = {
    server: { privateBetaMobileEnabled: true },
    auth: {
      webauthnRpName: 'BitStockerz',
      webauthnRpId: 'login.example.com',
      challengeTtlSeconds: 300,
      sessionTtlSeconds: 1000,
      webauthnAllowedOrigins: ['https://login.example.com'],
      legacyWebauthnEnabled: false,
    },
  } as AppConfigService;
  const persistence = {
    enabled: true,
    saveWebAuthnChallenge: jest.fn(async (record: WebAuthnChallengeRecord) => {
      challenges.set(record.challengeId, record);
    }),
    consumeWebAuthnChallenge: jest.fn(
      async (id: string, purpose: string, email: string) => {
        const record = challenges.get(id);
        if (!record || record.email !== email || record.purpose !== purpose)
          return null;
        challenges.delete(id);
        return record;
      },
    ),
  } as unknown as AuthPersistenceService;
  const mobile = {
    enabled: true,
    authorizeInvitation: jest.fn().mockResolvedValue('a'.repeat(64)),
    enroll: jest.fn().mockResolvedValue(undefined),
  };
  const auth = new AuthService(
    config,
    { isEnabled: true } as PrismaService,
    persistence,
    undefined,
    mobile as unknown as MobileAdmissionService,
  );
  return { auth, persistence, mobile, challenges };
}

const verified = () => ({
  verified: true,
  registrationInfo: {
    credential: {
      id: 'credential-one',
      publicKey: new Uint8Array([1]),
      counter: 0,
      transports: ['internal'],
    },
    aaguid: 'aaguid',
  },
});
const proof = { id: 'credential-one', response: {} };

describe('mobile passkey enrollment binding', () => {
  beforeEach(() => jest.mocked(verifyRegistrationResponse).mockReset());

  it('binds only the authorized hash to the challenge; cancelled registration does not redeem it', async () => {
    const f = fixture();
    const options = await f.auth.createWebAuthnRegisterOptions(
      'OWNER@Example.com',
      'invitation-secret',
    );
    expect(f.mobile.authorizeInvitation).toHaveBeenCalledWith(
      'owner@example.com',
      'invitation-secret',
    );
    expect(f.challenges.get(options.challenge_id)?.invitationHash).toBe(
      'a'.repeat(64),
    );
    expect(JSON.stringify(options)).not.toContain('invitation-secret');
    expect(f.mobile.enroll).not.toHaveBeenCalled();
    await f.auth.createWebAuthnRegisterOptions(
      'owner@example.com',
      'invitation-secret',
    );
    expect(f.mobile.authorizeInvitation).toHaveBeenCalledTimes(2);
  });

  it('leaves invitation unconsumed on cryptographic failure and verifies exact RP/origin/challenge', async () => {
    const f = fixture();
    const options = await f.auth.createWebAuthnRegisterOptions(
      'owner@example.com',
      'invitation-secret',
    );
    jest
      .mocked(verifyRegistrationResponse)
      .mockRejectedValue(new Error('bad proof'));
    await expect(
      f.auth.verifyWebAuthnRegistration({
        email: 'owner@example.com',
        challengeId: options.challenge_id,
        response: proof,
      }),
    ).rejects.toThrow();
    expect(f.mobile.enroll).not.toHaveBeenCalled();
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: options.challenge,
        expectedRPID: 'login.example.com',
        expectedOrigin: ['https://login.example.com'],
      }),
    );
    await f.auth.createWebAuthnRegisterOptions(
      'owner@example.com',
      'invitation-secret',
    );
  });

  it('rejects a challenge belonging to another identity and a replay', async () => {
    const f = fixture();
    const options = await f.auth.createWebAuthnRegisterOptions(
      'owner@example.com',
      'invitation-secret',
    );
    jest
      .mocked(verifyRegistrationResponse)
      .mockResolvedValue(verified() as never);
    await expect(
      f.auth.verifyWebAuthnRegistration({
        email: 'other@example.com',
        challengeId: options.challenge_id,
        response: proof,
      }),
    ).rejects.toThrow();
    expect(verifyRegistrationResponse).not.toHaveBeenCalled();
    const result = await f.auth.verifyWebAuthnRegistration({
      email: 'owner@example.com',
      challengeId: options.challenge_id,
      response: proof,
    });
    expect(f.mobile.enroll).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationHash: 'a'.repeat(64),
        user: expect.objectContaining({
          id: result.user.id,
          email: 'owner@example.com',
        }),
        session: expect.objectContaining({ token: result.access_token }),
      }),
    );
    expect(f.auth.requireUserBySessionToken(result.access_token).id).toBe(
      result.user.id,
    );
    await expect(
      f.auth.verifyWebAuthnRegistration({
        email: 'owner@example.com',
        challengeId: options.challenge_id,
        response: proof,
      }),
    ).rejects.toThrow();
    expect(f.mobile.enroll).toHaveBeenCalledTimes(1);
  });

  it('does not publish in-memory users or sessions when the transaction fails', async () => {
    const f = fixture();
    const options = await f.auth.createWebAuthnRegisterOptions(
      'owner@example.com',
      'invitation-secret',
    );
    jest
      .mocked(verifyRegistrationResponse)
      .mockResolvedValue(verified() as never);
    f.mobile.enroll.mockRejectedValueOnce(new Error('transaction failed'));
    await expect(
      f.auth.verifyWebAuthnRegistration({
        email: 'owner@example.com',
        challengeId: options.challenge_id,
        response: proof,
      }),
    ).rejects.toThrow('transaction failed');
    // A fresh options request must remain possible; failure must not create an account.
    await expect(
      f.auth.createWebAuthnRegisterOptions(
        'owner@example.com',
        'invitation-secret',
      ),
    ).resolves.toHaveProperty('challenge_id');
  });
});
