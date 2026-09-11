// Dynamic Google OAuth2 Access Token Generator for Cloudflare Workers
// Generates short-lived access tokens from Firebase service account credentials
// This replaces the broken static FIREBASE_SERVICE_ACCOUNT_TOKEN approach

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) {
    view[i] = str.charCodeAt(i);
  }
  return buf;
}

/**
 * Create a signed JWT for Google OAuth2 token exchange.
 * Uses the service account's private key to sign a JWT that can be
 * exchanged for a short-lived access token via Google's token endpoint.
 */
async function createServiceAccountJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  // Parse the PEM private key
  const pemKey = privateKeyPem.replace(/\\n/g, '\n');
  const b64Lines = pemKey.replace(/-----(BEGIN|END)(.*)-----/g, '').replace(/\s/g, '');
  const b64Padded = b64Lines.padEnd(b64Lines.length + (4 - b64Lines.length % 4) % 4, '=');
  const binaryStr = atob(b64Padded);
  const binaryDer = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    binaryDer[i] = binaryStr.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase"
  };

  const encHeader = base64urlEncode(str2ab(JSON.stringify(header)));
  const encPayload = base64urlEncode(str2ab(JSON.stringify(payload)));
  const dataToSign = `${encHeader}.${encPayload}`;

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    str2ab(dataToSign)
  );

  return `${dataToSign}.${base64urlEncode(signature)}`;
}

/**
 * Get a valid Google OAuth2 access token.
 * Uses caching to avoid generating new tokens on every request.
 * Tokens are valid for ~1 hour; we refresh 5 minutes early.
 */
export async function getFirestoreAccessToken(env: any): Promise<string> {
  // Check cache first (refresh 5 min before expiry)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  // If a static token is provided (for backward compat / dev), use it
  if (env.FIREBASE_SERVICE_ACCOUNT_TOKEN) {
    return env.FIREBASE_SERVICE_ACCOUNT_TOKEN;
  }

  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be configured");
  }

  // Create a signed JWT assertion
  const jwt = await createServiceAccountJwt(clientEmail, privateKey);

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }).toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Failed to get access token:", errText);
    throw new Error("Failed to obtain Firestore access token");
  }

  const tokenData = await tokenRes.json() as any;
  const accessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  // Cache the token
  cachedToken = {
    token: accessToken,
    expiresAt: Date.now() + expiresIn * 1000
  };

  return accessToken;
}
