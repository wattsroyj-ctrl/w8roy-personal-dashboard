/**
 * W8ROY Personal Dashboard — read-only Gmail bridge
 * Deploy as a Cloudflare Worker. Never place credentials in the GitHub Pages app.
 */
const ORIGIN = "https://wattsroyj-ctrl.github.io";
const SCOPES = "openid email https://www.googleapis.com/auth/gmail.readonly";
const GOOGLE = "https://oauth2.googleapis.com";
const GMAIL = "https://gmail.googleapis.com/gmail/v1";

function json(data, status = 200, origin = ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      "vary": "Origin"
    }
  });
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomString(size = 48) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64url(bytes);
}
async function sha256(value) {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function encryptionKey(env) {
  const raw = Uint8Array.from(atob(env.TOKEN_ENCRYPTION_KEY), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return JSON.stringify({ iv: base64url(iv), data: base64url(ciphertext) });
}
async function unseal(value, env) {
  const saved = JSON.parse(value);
  const decode = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
  const key = await encryptionKey(env);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(saved.iv) }, key, decode(saved.data));
  return new TextDecoder().decode(clear);
}
function b64decode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
}
async function googleToken(form) {
  const response = await fetch(GOOGLE + "/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Google token request failed.");
  return data;
}
async function refreshAccessToken(env, saved) {
  const refreshToken = await unseal(saved.encryptedRefreshToken, env);
  const data = await googleToken({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  return data.access_token;
}
async function gmailGet(url, accessToken) {
  const response = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail API request failed.");
  return data;
}
function header(headers, name) {
  return (headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}
async function getRecent(env, saved) {
  const accessToken = await refreshAccessToken(env, saved);
  const [list, unread] = await Promise.all([
    gmailGet(GMAIL + "/users/me/messages?maxResults=10&q=" + encodeURIComponent("in:inbox"), accessToken),
    gmailGet(GMAIL + "/users/me/messages?maxResults=1&q=" + encodeURIComponent("in:inbox is:unread"), accessToken)
  ]);
  const messages = await Promise.all((list.messages || []).map(async item => {
    const m = await gmailGet(GMAIL + "/users/me/messages/" + item.id + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date", accessToken);
    const h = m.payload?.headers || [];
    return {
      id: m.id,
      threadId: m.threadId,
      from: header(h, "From"),
      subject: header(h, "Subject") || "(no subject)",
      date: header(h, "Date"),
      snippet: m.snippet || "",
      unread: (m.labelIds || []).includes("UNREAD"),
      gmailUrl: "https://mail.google.com/mail/u/0/#all/" + m.threadId
    };
  }));
  return { email: saved.email || "", unreadCount: Number(unread.resultSizeEstimate || 0), messages };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (origin !== ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": ORIGIN,
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
        "vary": "Origin"
      }});
    }
    if (origin && origin !== ORIGIN) return json({ error: "Origin not allowed." }, 403, ORIGIN);
    try {
      if (url.pathname === "/health") return json({ ok: true, service: "W8ROY Gmail bridge", mode: "read-only" });

      if (url.pathname === "/auth/start") {
        const state = randomString(32);
        const verifier = randomString(48);
        const challenge = await sha256(verifier);
        await env.AUTH_STATE.put(state, verifier, { expirationTtl: 600 });
        const redirectUri = url.origin + "/oauth/callback";
        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.search = new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: SCOPES,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256"
        }).toString();
        return Response.redirect(auth.toString(), 302);
      }

      if (url.pathname === "/oauth/callback") {
        const error = url.searchParams.get("error");
        if (error) return new Response("Google authorization was not completed: " + error, { status: 400 });
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!state || !code) return new Response("Missing Google authorization details.", { status: 400 });
        const verifier = await env.AUTH_STATE.get(state);
        if (!verifier) return new Response("Authorization expired. Start again from the dashboard connection link.", { status: 400 });
        await env.AUTH_STATE.delete(state);
        const token = await googleToken({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: url.origin + "/oauth/callback",
          grant_type: "authorization_code",
          code_verifier: verifier
        });
        if (!token.refresh_token) return new Response("Google did not return a refresh token. Revoke this app's access in your Google Account and connect again.", { status: 400 });
        const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { authorization: "Bearer " + token.access_token }
        });
        const profile = await profileResponse.json();
        const encryptedRefreshToken = await seal(token.refresh_token, env);
        await env.GMAIL_STORE.put("account", JSON.stringify({
          encryptedRefreshToken,
          email: profile.email || "",
          connectedAt: new Date().toISOString()
        }));
        return Response.redirect(ORIGIN + "/?gmail=connected", 302);
      }

      if (url.pathname === "/api/emails") {
        if (request.method !== "GET") return json({ error: "Read-only endpoint." }, 405);
        const raw = await env.GMAIL_STORE.get("account");
        if (!raw) return json({ connected: false, messages: [], unreadCount: 0 });
        const saved = JSON.parse(raw);
        const result = await getRecent(env, saved);
        return json({ connected: true, ...result });
      }

      if (url.pathname === "/auth/disconnect") {
        await env.GMAIL_STORE.delete("account");
        return json({ connected: false, disconnected: true });
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      return json({ error: error.message || "Unexpected service error." }, 500);
    }
  }
};
