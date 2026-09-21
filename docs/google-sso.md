# Google SSO

This service uses Google OAuth 2.0 / OpenID Connect for browser sign-in. Google
authenticates the user, and the API verifies the Google ID token before issuing
its own signed Bearer access token.

## Prerequisites

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select
   a project.
2. Configure the OAuth consent screen.
3. Create an **OAuth client ID** of type **Web application**.
4. Add the exact callback URL as an authorized redirect URI. For local development:

   ```
   http://localhost:3000/auth/google/callback
   ```

5. Copy the client ID and client secret into `.env`.

## Configuration

```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
AUTH_JWT_SECRET=replace-with-a-long-random-secret
AUTH_JWT_EXPIRES_IN_SECONDS=86400

# Optional. When set, successful login redirects here with token data in the
# URL fragment rather than returning the token as JSON.
# AUTH_SUCCESS_REDIRECT_URL=http://localhost:5173/auth/callback
```

Generate `AUTH_JWT_SECRET` with a high-entropy value, for example:

```bash
openssl rand -base64 48
```

Keep `GOOGLE_CLIENT_SECRET` and `AUTH_JWT_SECRET` out of source control.

## Sign-in flow

```mermaid
sequenceDiagram
    participant Browser as User browser
    participant API as RAG Chatbot API
    participant Google as Google

    Browser->>API: Open auth google endpoint
    API->>Browser: Store signed state cookie
    API->>Google: Open Google sign in
    Google->>Browser: Show login or account picker
    Google->>API: Send authorization code and state
    API->>API: Validate cookie state and expiry
    API->>Google: Exchange code for tokens
    Google-->>API: Return Google ID token
    API->>API: Verify ID token and create access token
    API-->>Browser: Return token or redirect to frontend
    Browser->>API: Call protected API with Bearer token
    API->>API: Verify access token and identify user
```

The state cookie binds the Google callback to the browser that initiated login,
which protects against OAuth login-CSRF. The API only accepts a Google account
with a verified email address.

## How the authentication components work together

```mermaid
sequenceDiagram
    participant Browser
    participant Controller as AuthController
    participant Service as AuthService
    participant Google
    participant Guard as GoogleAuthGuard
    participant API as Protected API route

    Browser->>Controller: Open auth google endpoint
    Controller->>Service: beginGoogleSignIn
    Service->>Service: Create signed state
    Service-->>Controller: Return Google login URL
    Controller-->>Browser: Set state cookie and redirect

    Browser->>Google: Complete Google sign in
    Google-->>Controller: Return code and state
    Controller->>Service: signInWithGoogle
    Service->>Google: Exchange code for ID token
    Google-->>Service: Return ID token
    Service->>Service: Verify Google ID token
    Service-->>Browser: Return app access token

    Browser->>Guard: Request with Bearer app token
    Guard->>Service: verifySessionToken
    Service-->>Guard: Return authenticated user
    Guard->>API: Allow request and attach user
```

- `AuthController` owns HTTP behavior: redirects, cookies, query parameters,
  and endpoint responses.
- `AuthService` owns the authentication logic. It creates OAuth state, calls
  Google through `OAuth2Client`, verifies the Google ID token, creates the
  application token, and verifies that token later.
- `GoogleAuthGuard` protects chat and ingestion routes. It reads the
  `Authorization` header, asks `AuthService` to verify the application token,
  and attaches the verified user to `request.user`.

Google is involved only while the user signs in. On later API requests, the
guard verifies the application token locally with `AUTH_JWT_SECRET`; it does
not call Google for every request.

## Token types

- **Google ID token**: issued by Google to prove the user identity to this API
  during the callback. It is verified for signature, audience, expiration, and
  verified email address.
- **Application access token**: issued by this API after Google verification.
  Clients send it as `Authorization: Bearer <access-token>` to protected API
  endpoints. It contains the stable Google `sub` value, user email, optional
  profile information, and an expiration time. It is signed using
  `AUTH_JWT_SECRET`.

## Endpoints

### Start Google login

```
GET /auth/google
```

Open this endpoint in a browser. It sets the short-lived OAuth state cookie and
redirects the user to Google.

### Handle the Google callback

```
GET /auth/google/callback
```

Google calls this endpoint after successful login. When
`AUTH_SUCCESS_REDIRECT_URL` is not configured, the response contains:

```json
{
  "status": "success",
  "message": "Success",
  "data": {
    "accessToken": "<signed-token>",
    "tokenType": "Bearer",
    "expiresIn": 86400,
    "user": {
      "id": "google-subject-id",
      "email": "user@example.com",
      "name": "Example User",
      "picture": "https://..."
    }
  }
}
```

When `AUTH_SUCCESS_REDIRECT_URL` is configured, the API redirects to that URL
and puts `access_token`, `token_type`, and `expires_in` in its URL fragment.
Fragments are not sent in HTTP requests, which avoids exposing the token to the
redirect destination's server logs.

## Get an access token without a frontend

Google login is interactive, so start this flow in a browser rather than by
calling the callback endpoint manually.

1. Start the API:

   ```bash
   npm run start:dev
   ```

2. Make sure `AUTH_SUCCESS_REDIRECT_URL` is unset or commented out in `.env`.
   This makes the callback return JSON in the browser instead of redirecting to
   a frontend URL.

3. Open this URL in a browser:

   ```
   http://localhost:3000/auth/google
   ```

4. Sign in with Google and approve the consent screen. Google redirects the
   browser back to `/auth/google/callback` automatically.

5. Copy `data.accessToken` from the JSON callback response. Do not share this
   value or commit it to source control.

6. Verify the token with the current-user endpoint:

   ```bash
   curl http://localhost:3000/auth/me \
     -H "Authorization: Bearer PASTE_ACCESS_TOKEN_HERE"
   ```

The callback endpoint requires the authorization `code`, the signed `state`,
and the matching browser state cookie. Calling `/auth/google/callback` directly
will fail by design.

### Retrieve the current user

```
GET /auth/me
Authorization: Bearer <access-token>
```

## Calling protected APIs

All chat and ingestion routes require the application access token:

```http
POST /chat/messages
Authorization: Bearer <access-token>
Content-Type: application/json

{ "message": "Summarize my documents" }
```

```http
POST /ingest/file
Authorization: Bearer <access-token>
Content-Type: multipart/form-data
```

The API uses the stable Google `sub` claim as its internal user ID. It does not
read `x-user-id`; callers cannot select a different user's identity. Ingestion
job lookup also checks that the authenticated user owns the requested job.

## Production checklist

- Register the production callback URL exactly in Google Cloud Console.
- Use HTTPS for the API and `AUTH_SUCCESS_REDIRECT_URL`.
- Generate a unique, long `AUTH_JWT_SECRET` for each environment.
- Set an appropriate token lifetime with `AUTH_JWT_EXPIRES_IN_SECONDS`.
- Do not log authorization codes, Google tokens, application access tokens, or
  client secrets.
