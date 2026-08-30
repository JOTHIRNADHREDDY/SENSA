import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAuth } from '../../cloudflare/middleware/auth';

// Helper to base64url encode
function base64UrlEncode(buffer: ArrayBuffer | Uint8Array) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function stringToBase64Url(str: string) {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('JWT Auth Middleware', () => {
  let mockKeyPair: CryptoKeyPair;
  let mockJwk: JsonWebKey;

  beforeEach(async () => {
    // Generate RSA key pair for tests
    mockKeyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"]
    );

    mockJwk = await crypto.subtle.exportKey("jwk", mockKeyPair.publicKey);
    mockJwk.kid = "test-kid-123";

    // Mock global fetch to return our JWKS
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        keys: [mockJwk]
      })
    }) as any;
  });

  async function createToken(payload: any, kid: string = "test-kid-123", keyToSignWith: CryptoKey = mockKeyPair.privateKey, alg = "RS256") {
    const header = { alg, kid, typ: "JWT" };
    
    const encodedHeader = stringToBase64Url(JSON.stringify(header));
    const encodedPayload = stringToBase64Url(JSON.stringify(payload));
    
    const data = `${encodedHeader}.${encodedPayload}`;
    const encoder = new TextEncoder();
    
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyToSignWith,
      encoder.encode(data)
    );
    
    return `${data}.${base64UrlEncode(signature)}`;
  }

  const validPayload = {
    sub: "user-123",
    email: "test@example.com",
    aud: "sensa-production",
    iss: "https://securetoken.google.com/sensa-production",
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it('accepts a valid signed token', async () => {
    const token = await createToken(validPayload);
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const result = await verifyAuth(request);
    expect(result).not.toBeNull();
    expect(result?.uid).toBe("user-123");
    expect(result?.email).toBe("test@example.com");
  });

  it('rejects tampered payload without changing signature', async () => {
    const token = await createToken(validPayload);
    const parts = token.split('.');
    
    // Tamper with payload (change sub to admin)
    const tamperedPayload = { ...validPayload, sub: "admin-999" };
    const tamperedEncoded = stringToBase64Url(JSON.stringify(tamperedPayload));
    
    const tamperedToken = `${parts[0]}.${tamperedEncoded}.${parts[2]}`;
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer ${tamperedToken}` }
    });
    
    const result = await verifyAuth(request);
    expect(result).toBeNull();
  });

  it('rejects expired token', async () => {
    const payload = { ...validPayload, exp: Math.floor(Date.now() / 1000) - 3600 };
    const token = await createToken(payload);
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const result = await verifyAuth(request);
    expect(result).toBeNull();
  });

  it('rejects wrong audience', async () => {
    const payload = { ...validPayload, aud: "wrong-audience" };
    const token = await createToken(payload);
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const result = await verifyAuth(request);
    expect(result).toBeNull();
  });

  it('rejects wrong issuer', async () => {
    const payload = { ...validPayload, iss: "https://wrong-issuer.com" };
    const token = await createToken(payload);
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const result = await verifyAuth(request);
    expect(result).toBeNull();
  });

  it('rejects unknown kid', async () => {
    const token = await createToken(validPayload, "unknown-kid");
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const result = await verifyAuth(request);
    expect(result).toBeNull();
  });

  it('rejects malformed token', async () => {
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer not.a.real.token` }
    });
    
    const result = await verifyAuth(request);
    expect(result).toBeNull();
  });

  it('rejects tampered signature', async () => {
    const token = await createToken(validPayload);
    const parts = token.split('.');
    
    // Generate a completely different key to sign with
    const rogueKey = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    
    // Sign the original payload with the rogue key
    const encoder = new TextEncoder();
    const rogueSignature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      rogueKey.privateKey,
      encoder.encode(`${parts[0]}.${parts[1]}`)
    );
    
    const tamperedToken = `${parts[0]}.${parts[1]}.${base64UrlEncode(rogueSignature)}`;
    
    const request = new Request("https://api.example.com", {
      headers: { "Authorization": `Bearer ${tamperedToken}` }
    });
    
    const result = await verifyAuth(request);
    expect(result).toBeNull(); // Because signature doesn't match the mockJwk
  });
});
