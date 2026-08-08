export interface AuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  user?: AuthUser;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string | null;
  base_currency?: string;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  requestId?: string;
}

export interface WebAuthnRegisterOptionsResponse {
  challenge_id: string;
  challenge: string;
  rp_id: string;
  rp_name: string;
  timeout_ms: number;
  user_email: string;
  options: Record<string, unknown>;
}

export interface WebAuthnLoginOptionsResponse {
  challenge_id: string;
  challenge: string;
  timeout_ms: number;
  user_email: string;
  allow_credentials: string[];
  options: Record<string, unknown>;
}
