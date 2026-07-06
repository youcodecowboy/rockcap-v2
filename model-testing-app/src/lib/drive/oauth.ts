// Google Drive OAuth client. Independent OAuth client from Gmail and
// Calendar (same convention: dedicated client, dedicated tokens,
// dedicated disconnect). Unlike Gmail, Drive is NOT per-user: exactly
// ONE org-wide account (app@rockcap.uk) connects and mirrors into the app.
//
// Scope: full drive (write-back is a committed fast-follow; drive.file
// cannot reorganize pre-existing files) plus userinfo.email to display the
// connected account address.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getClientId(): string {
  const id = process.env.DRIVE_CLIENT_ID;
  if (!id) throw new Error("DRIVE_CLIENT_ID not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.DRIVE_CLIENT_SECRET;
  if (!secret) throw new Error("DRIVE_CLIENT_SECRET not set");
  return secret;
}

function getRedirectUri(): string {
  const uri = process.env.DRIVE_OAUTH_REDIRECT_URI;
  if (!uri) throw new Error("DRIVE_OAUTH_REDIRECT_URI not set");
  return uri;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: DRIVE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive token exchange failed: ${err}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive token refresh failed: ${err}`);
  }

  return res.json();
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export async function getDriveEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error("Failed to fetch Drive user info");

  const data = await res.json();
  return data.email;
}
