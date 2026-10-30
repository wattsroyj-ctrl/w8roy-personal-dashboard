# W8ROY Dashboard — Gmail bridge setup

This is a **separate test-branch component**. It does not alter the live dashboard or its news workflow.

## What it does

- Uses Google OAuth authorization-code flow with PKCE.
- Requests only OpenID/email identity and Gmail **read-only** access.
- Keeps Google client credentials in Cloudflare Worker secrets.
- Encrypts the long-lived Google refresh token before storing it in Cloudflare KV.
- Exposes a read-only endpoint returning the 10 newest inbox messages and unread count.
- Allows disconnecting the stored token at `/auth/disconnect`.

The GitHub Pages dashboard is public code. **Never put Google client secrets, refresh tokens, or other credentials in `index.html`, GitHub files, or browser JavaScript.**

## Files

- `cloudflare/gmail-worker.js`: Worker source.
- `cloudflare/README-gmail-setup.md`: this setup guide.

## Cloudflare setup (free Worker + KV)

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Create a Worker named `w8roy-gmail-bridge`.
3. Deploy the contents of `gmail-worker.js` as the Worker code.
4. In **Bindings**, add two KV namespace bindings:
   - Variable name `AUTH_STATE` → create/select a KV namespace named `w8roy-gmail-auth-state`.
   - Variable name `GMAIL_STORE` → create/select a KV namespace named `w8roy-gmail-store`.
5. In **Settings → Variables and Secrets**, add these as **secrets**:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `TOKEN_ENCRYPTION_KEY`

   Generate a random 32-byte encryption key locally and Base64-encode it. Do not send it in ChatGPT or commit it to GitHub. A Windows PowerShell command to generate one is:
   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

6. Note the Worker URL, for example `https://w8roy-gmail-bridge.<your-subdomain>.workers.dev`.

## Google OAuth setup

1. Open Google Cloud Console and create/select a project.
2. Configure the OAuth consent screen (External for a personal Gmail account). Add your own Google account as a test user while the app remains in Testing.
3. Create an OAuth Client ID of type **Web application**.
4. Add this exact Authorized redirect URI, replacing the example Worker host with your actual Worker URL:

   `https://w8roy-gmail-bridge.<your-subdomain>.workers.dev/oauth/callback`

5. Copy the Client ID and Client Secret into the Cloudflare Worker secrets above.
6. Deploy/redeploy the Worker after setting the secrets and KV bindings.

## Test before dashboard integration

1. Visit `https://YOUR-WORKER-HOST/health`. It should return a small JSON health response.
2. Visit `https://YOUR-WORKER-HOST/auth/start` and complete Google's consent flow with the intended Gmail account.
3. Google should return you to the dashboard with `?gmail=connected`.
4. Visit `https://YOUR-WORKER-HOST/api/emails`. It should return the connected account email, unread count, and up to 10 inbox message summaries.
5. Visit `https://YOUR-WORKER-HOST/auth/disconnect` to erase the stored refresh token if you want to disconnect.

## Important notes

- The Worker is restricted to requests from `https://wattsroyj-ctrl.github.io` for browser API calls. The OAuth redirect is a top-level navigation and does not rely on CORS.
- The Worker returns message summaries/snippets only, not full message bodies, and cannot send, delete, label, or modify mail.
- For personal use, Google's OAuth app can remain in Testing; refresh tokens for External apps in Testing may expire after 7 days. If that happens, reconnect, or follow Google's current publishing/verification guidance before relying on continuous access.
- Do not publish the app broadly or request broader Gmail scopes.
- Disconnecting deletes the stored encrypted refresh token from KV.
