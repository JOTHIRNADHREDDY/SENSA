// Firebase Auth JWT Verification in Cloudflare Workers using Web Crypto API
// Validates RS256 JWTs against Google's public JWKS

// Firebase project ID is resolved per request using env

// Cache for Google's public keys
let cachedKeys: any = null;
let keysCacheTime = 0;

async function fetchGooglePublicKeys() {
  const now = Date.now();
  if (cachedKeys && now - keysCacheTime < 1000 * 60 * 60) {
    return cachedKeys; // Cache for 1 hour
  }
  // Use JWK endpoint for native Web Crypto API support
  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const keys = await response.json() as any;
  cachedKeys = keys;
  keysCacheTime = now;
  return keys;
}

// Helper to base64url decode JSON
function base64UrlDecode(str: string) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) { base64 += '='; }
  return JSON.parse(atob(base64));
}

// Convert Base64URL string to Uint8Array for Crypto API
function base64UrlToUint8Array(base64Url: string) {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = (base64Url + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function verifyAuth(request: Request, env?: any): Promise<{ uid: string, email: string, phone_number?: string, orgId?: string } | null> {
  const FIREBASE_PROJECT_ID = env?.FIREBASE_PROJECT_ID || "sensa-f74e9";
  const ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = base64UrlDecode(parts[0]);
    const payload = base64UrlDecode(parts[1]);

    // 1. Validate Algorithm
    if (header.alg !== 'RS256') return null;

    // 2. Validate claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null; // Expired
    if (payload.iat > now) return null; // Issued in future
    if (payload.aud !== FIREBASE_PROJECT_ID) return null; // Wrong audience
    if (payload.iss !== ISSUER) return null; // Wrong issuer
    if (typeof payload.sub !== 'string' || payload.sub === "") return null; // Invalid subject

    // 3. Verify signature using Web Crypto API and Google's JWKS
    if (!header.kid) return null;
    const keyset = await fetchGooglePublicKeys();
    
    // Find matching JWK
    const jwk = keyset.keys.find((k: any) => k.kid === header.kid);
    if (!jwk) return null; // Unknown kid

    // Import public key
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Prepare data and signature
    const encoder = new TextEncoder();
    const data = encoder.encode(parts[0] + '.' + parts[1]);
    const signature = base64UrlToUint8Array(parts[2]);

    // Verify cryptographic signature
    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      data
    );

    if (!isValid) return null; // Tampered token or invalid signature

    return {
      uid: payload.sub,
      email: payload.email,
      phone_number: payload.phone_number,
      orgId: payload.orgId // Custom claim
    };
  } catch (e) {
    console.error("Auth verification failed", e);
    return null;
  }
}
