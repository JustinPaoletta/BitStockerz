import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { OAuthAppleCallbackDto } from './oauth-apple-callback.dto';
import { OAuthGoogleCallbackDto } from './oauth-google-callback.dto';
import { RegisterDto } from './register.dto';
import { UpdateProfileDto } from './update-profile.dto';
import { WebAuthnLoginOptionsDto } from './webauthn-login-options.dto';
import { WebAuthnLoginVerifyDto } from './webauthn-login-verify.dto';
import { WebAuthnRegisterOptionsDto } from './webauthn-register-options.dto';
import { WebAuthnRegisterVerifyDto } from './webauthn-register-verify.dto';

describe('Auth DTOs', () => {
  it('accepts valid register payload', async () => {
    const dto = new RegisterDto();
    dto.email = 'user@example.com';
    dto.display_name = 'User';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid register payload', async () => {
    const dto = new RegisterDto();
    dto.email = 'not-an-email';
    dto.display_name = 123 as unknown as string;

    const errors = await validate(dto);
    const fields = errors.map((error) => error.property);
    expect(fields).toEqual(expect.arrayContaining(['email', 'display_name']));
  });

  it('accepts valid login payload', async () => {
    const dto = new LoginDto();
    dto.email = 'user@example.com';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid login payload', async () => {
    const dto = new LoginDto();
    dto.email = 'not-an-email';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('email');
  });

  it('accepts valid update-profile payload', async () => {
    const dto = new UpdateProfileDto();
    dto.display_name = 'Trader';
    dto.base_currency = 'USD';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid update-profile payload', async () => {
    const dto = new UpdateProfileDto();
    dto.display_name = 42 as unknown as string;
    dto.base_currency = 'EUR' as 'USD';

    const errors = await validate(dto);
    const fields = errors.map((error) => error.property);
    expect(fields).toEqual(
      expect.arrayContaining(['display_name', 'base_currency']),
    );
  });

  it('accepts valid webauthn register options payload', async () => {
    const dto = new WebAuthnRegisterOptionsDto();
    dto.email = 'user@example.com';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid webauthn register verify payload', async () => {
    const dto = new WebAuthnRegisterVerifyDto();
    dto.email = 'user@example.com';
    dto.challenge_id = 'challenge-1';
    dto.challenge = 'challenge-token';
    dto.credential_id = 'cred-1';
    dto.public_key = 'public-key';
    dto.sign_count = 1;
    dto.transports = ['internal'];
    dto.aaguid = 'aaguid-1';
    dto.display_name = 'User';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid webauthn verify payloads', async () => {
    const registerDto = new WebAuthnRegisterVerifyDto();
    registerDto.email = 'invalid';
    registerDto.challenge_id = '';
    registerDto.challenge = '';
    registerDto.credential_id = '';
    registerDto.public_key = '';
    registerDto.sign_count = -1;

    const loginDto = new WebAuthnLoginVerifyDto();
    loginDto.email = 'invalid';
    loginDto.challenge_id = '';
    loginDto.challenge = '';
    loginDto.credential_id = '';
    loginDto.sign_count = -1;

    const registerErrors = await validate(registerDto);
    const loginErrors = await validate(loginDto);

    expect(registerErrors.length).toBeGreaterThan(0);
    expect(loginErrors.length).toBeGreaterThan(0);
  });

  it('accepts valid webauthn login options payload', async () => {
    const dto = new WebAuthnLoginOptionsDto();
    dto.email = 'user@example.com';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid oauth callback payloads', async () => {
    const google = new OAuthGoogleCallbackDto();
    google.state = 'g-state';
    google.code = 'g-code';
    google.email = 'user@example.com';
    google.sub = 'google-sub';

    const apple = new OAuthAppleCallbackDto();
    apple.state = 'a-state';
    apple.code = 'a-code';
    apple.sub = 'apple-sub';
    apple.email = 'apple@example.com';

    const googleErrors = await validate(google);
    const appleErrors = await validate(apple);

    expect(googleErrors).toHaveLength(0);
    expect(appleErrors).toHaveLength(0);
  });

  it('rejects invalid oauth callback payloads', async () => {
    const google = new OAuthGoogleCallbackDto();
    google.state = '';
    google.code = '';
    google.email = 'not-email';

    const apple = new OAuthAppleCallbackDto();
    apple.state = '';
    apple.code = '';
    apple.sub = '';
    apple.email = 'not-email';

    const googleErrors = await validate(google);
    const appleErrors = await validate(apple);

    expect(googleErrors.length).toBeGreaterThan(0);
    expect(appleErrors.length).toBeGreaterThan(0);
  });
});
