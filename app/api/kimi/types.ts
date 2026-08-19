export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type SessionPayload = {
  unionId: string;
  clientId: string;
  /** Issued-at (seconds) — compared against users.sessionsRevokedAt. */
  iat?: number;
};

export type UserProfile = {
  user_id: string;
  name: string;
  avatar_url: string;
};
