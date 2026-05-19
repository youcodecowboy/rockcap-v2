// Minimal Fireflies API client. GraphQL endpoint, bearer-token auth.
// Used by /api/fireflies/connect-token to validate a pasted token and
// resolve the connectedEmail. The full sync code (meetings, transcripts)
// lives in a separate module added in BL-3.3.

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

export interface FirefliesUserInfo {
  userId: string;
  name?: string;
  email?: string;
  integrations?: string[];
}

export class FirefliesAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirefliesAuthError";
  }
}

export class FirefliesApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "FirefliesApiError";
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: any }>;
}

async function firefliesGraphQL<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new FirefliesAuthError("Fireflies rejected the API token");
  }
  if (!res.ok) {
    throw new FirefliesApiError(`Fireflies returned ${res.status}`, res.status);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    const message = json.errors.map(e => e.message).join("; ");
    // Fireflies sometimes returns auth failures inside the errors array
    // with a 200 status, so check the message before raising a generic error.
    if (/auth|token|unauthorized|forbidden/i.test(message)) {
      throw new FirefliesAuthError(message);
    }
    throw new FirefliesApiError(message);
  }

  if (!json.data) {
    throw new FirefliesApiError("Fireflies returned no data");
  }

  return json.data;
}

/**
 * Validate a Fireflies API token by querying the authenticated user.
 * Throws FirefliesAuthError if the token is invalid, FirefliesApiError
 * for other failures. Returns the user's basic profile on success.
 */
export async function validateToken(apiToken: string): Promise<FirefliesUserInfo> {
  if (!apiToken || apiToken.trim().length === 0) {
    throw new FirefliesAuthError("API token is empty");
  }

  const query = `
    query {
      user {
        user_id
        name
        email
        integrations
      }
    }
  `;

  const data = await firefliesGraphQL<{ user: { user_id: string; name?: string; email?: string; integrations?: string[] } }>(
    apiToken,
    query,
  );

  if (!data.user || !data.user.user_id) {
    throw new FirefliesAuthError("Fireflies user query returned no user");
  }

  return {
    userId: data.user.user_id,
    name: data.user.name,
    email: data.user.email,
    integrations: data.user.integrations,
  };
}
