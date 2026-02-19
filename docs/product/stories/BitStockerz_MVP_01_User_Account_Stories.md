# BitStockerz MVP – 1) User & Account (Stories)

> Scope: authentication (Passkeys + Google/Apple OAuth), basic user profile, and a single paper-trading account per user with a default $100,000 starting balance (USD).  
> Deferred: “Reset paper account” (per your note).

---

## Key decisions captured
- **Primary auth:** **Passkeys (WebAuthn)** (no passwords stored).
- **Secondary auth / fallback:** **OAuth (Google + Apple)**.
- **Sessions:** still required (cookie or bearer token) after successful passkey/OAuth verification.
- **Default paper balance:** **$100,000 USD**.

---

## Epic 1.1 – Authentication (Passkeys + OAuth)

### Story 1.1.1 – User can create an account with a passkey
**As a** new user  
**I want** to register using a passkey (FaceID/TouchID/security key)  
**So that** I can sign in securely without a password

**Acceptance criteria**
- User can register a passkey using WebAuthn.
- The server stores **only** WebAuthn credential metadata (public key, credential ID, counters, etc.), not secrets.
- Email (or username) is collected to identify the user record **before**/during registration (required for account lookup and recovery).
- On success, user is logged in and receives a session (cookie or bearer token).

**Frontend (Angular) tasks**
- “Create account” screen that:
  - collects email (or username)
  - triggers WebAuthn registration ceremony
- UX for unsupported browsers/devices (show fallback: OAuth)
- Error states: cancelled prompt, unsupported device, already-registered email

**Backend (NestJS) tasks**
- Endpoints to start/finish WebAuthn registration:
  - `POST /auth/webauthn/register/options`
  - `POST /auth/webauthn/register/verify`
- Persist user + WebAuthn credential
- Anti-replay protections (challenge storage/expiry)

**Data (MySQL)**
- `users` table (id, email, created_at, etc.)
- `webauthn_credentials` table (user_id, credential_id, public_key, sign_count, transports, aaguid, created_at)

---

### Story 1.1.2 – User can sign in with a passkey
**As a** returning user  
**I want** to sign in with my passkey  
**So that** I can access my account quickly

**Acceptance criteria**
- User enters email (or selects account) then completes WebAuthn authentication ceremony.
- Successful auth creates a valid session.
- Failed auth returns clear error (no account, mismatch, cancelled, etc.).

**Frontend (Angular) tasks**
- Login screen with email + “Use passkey”
- Handle multi-credential selection UI (if multiple passkeys exist)
- Graceful fallback to OAuth

**Backend (NestJS) tasks**
- Endpoints to start/finish WebAuthn authentication:
  - `POST /auth/webauthn/login/options`
  - `POST /auth/webauthn/login/verify`
- Session creation (cookie or JWT)

---

### Story 1.1.3 – User can connect/sign in with Google OAuth
**As a** user  
**I want** to sign in with Google  
**So that** I don’t have to type credentials

**Acceptance criteria**
- User can initiate Google OAuth flow.
- On callback, user is logged in.
- If email matches an existing user, accounts are linked (no duplicates).
- If not, create a new user and default paper account.

**Frontend (Angular) tasks**
- “Continue with Google” button
- Handle redirect/callback route

**Backend (NestJS) tasks**
- OAuth config + callback handler
- Create/link user
- Issue session

---

### Story 1.1.4 – User can connect/sign in with Apple OAuth
**As a** user  
**I want** to sign in with Apple  
**So that** I can use my Apple ID

**Acceptance criteria**
- User can complete Apple sign-in flow.
- Existing-user linking by stable Apple subject identifier (and email when available).
- New user gets default paper account.

**Frontend (Angular) tasks**
- “Continue with Apple” button
- Handle redirect/callback route

**Backend (NestJS) tasks**
- Apple OAuth/OpenID Connect config + callback handler
- Create/link user
- Issue session

---

### Story 1.1.5 – User can manage sessions (logout / token expiry)
**As a** user  
**I want** to log out and have sessions expire  
**So that** my account stays secure

**Acceptance criteria**
- Logout invalidates the current session (server-side if using cookies/session store).
- Tokens/cookies expire after a defined TTL.
- Protected routes require valid auth.

**Frontend (Angular) tasks**
- Logout action
- Auth guard + redirect to login

**Backend (NestJS) tasks**
- Logout endpoint
- Session middleware/guard
- Token refresh strategy (optional for MVP; keep simple)

---

### Story 1.1.6 – Account recovery & “lost device” path (minimum viable)
**As a** user  
**I want** a way back in if I lose my passkey device  
**So that** I’m not permanently locked out

**Acceptance criteria**
- If user has OAuth linked (Google/Apple), they can recover by signing in via OAuth.
- UI clearly communicates “Try Google/Apple sign-in if you lost your passkey device.”
- (Optional MVP+) allow registering an additional passkey from within the account.

**Frontend (Angular) tasks**
- Recovery hint on login screen
- “Add another passkey” UI (optional MVP+)

**Backend (NestJS) tasks**
- Endpoint to register additional passkeys for an authenticated user (optional MVP+)

---

## Epic 1.2 – User Profile

### Story 1.2.1 – User can view basic profile
**As a** user  
**I want** to view my account details  
**So that** I can confirm my info

**Acceptance criteria**
- Profile shows email and linked auth methods (Passkeys, Google, Apple).
- Profile endpoint requires auth.

**Frontend (Angular) tasks**
- Profile page
- Display linked methods

**Backend (NestJS) tasks**
- `GET /me` endpoint
- Include linked auth provider flags + passkey count

---

### Story 1.2.2 – User can update display preferences (minimal)
**As a** user  
**I want** to update basic preferences  
**So that** the app feels personalized

**Acceptance criteria**
- User can set display name (optional) and base currency display (USD for MVP default).
- Persisted and returned on `/me`.

**Frontend (Angular) tasks**
- Simple form + save

**Backend (NestJS) tasks**
- `PATCH /me` endpoint

---

## Epic 1.3 – Paper Account Bootstrap

### Story 1.3.1 – Default paper account is created on first signup
**As a** new user  
**I want** a paper trading account created automatically  
**So that** I can start trading immediately

**Acceptance criteria**
- On first successful signup (passkey or OAuth), create exactly one paper account.
- Default balance is **$100,000.00 USD**.
- Balance supports cents (DECIMAL), not float.

**Frontend (Angular) tasks**
- Post-auth “landing” route that loads account state
- Show starting balance on dashboard header (placeholder UI)

**Backend (NestJS) tasks**
- User creation transaction that also creates paper account
- `GET /paper-account` endpoint (or included on `/me`)

**Data (MySQL)**
- `paper_accounts` table (id, user_id, base_currency, starting_balance, created_at)

---

## Epic 1.4 – Platform Safety Basics (MVP-level)

### Story 1.4.1 – Rate limit auth endpoints
**As a** platform  
**I want** rate limiting on auth endpoints  
**So that** abuse is reduced

**Acceptance criteria**
- Rate limits applied to WebAuthn options/verify endpoints and OAuth initiation.
- Clear error on limit exceeded.

**Backend (NestJS) tasks**
- Add rate limiter middleware/guard

---

## Notes: Passkeys — do you “still need the other stuff”?
Passkeys remove **passwords**, but you still need:
- a **user record** (email/identifier),
- a **session** (cookie/JWT) after login,
- a **recovery path** (OAuth or another passkey/device), otherwise users can lock themselves out.

