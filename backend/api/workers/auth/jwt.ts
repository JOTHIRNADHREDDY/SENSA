export async function createFirebaseCustomToken(uid: string, env: any): Promise<string> {
  const privateKeyPem = env.FIREBASE_PRIVATE_KEY;
  if (!privateKeyPem) throw new Error("FIREBASE_PRIVATE_KEY not configured");
  
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  if (!clientEmail) throw new Error("FIREBASE_CLIENT_EMAIL not configured");

  // Format key properly
  const pemKey = privateKeyPem.replace(/\\n/g, '\n');
  const b64Lines = pemKey.replace(/-----(BEGIN|END)(.*)-----/g, '').replace(/\s/g, '');
  const b64Prefix = b64Lines.padEnd(b64Lines.length + (4 - b64Lines.length % 4) % 4, '=');
  const binaryDerString = atob(b64Prefix);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const algorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: { name: "SHA-256" },
  };

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    algorithm,
    false,
    ["sign"]
  );

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600, // 1 hour
    uid: uid
  };

  const encHeader = base64urlEncode(str2ab(JSON.stringify(header)));
  const encPayload = base64urlEncode(str2ab(JSON.stringify(payload)));

  const dataToSign = `${encHeader}.${encPayload}`;
  
  const signature = await crypto.subtle.sign(
    algorithm,
    cryptoKey,
    str2ab(dataToSign)
  );

  const encSignature = base64urlEncode(signature);

  return `${dataToSign}.${encSignature}`;
}

export async function createVerificationToken(payload: any, env: any): Promise<string> {
  const secret = env.SENSA_JWT_SECRET;
  if (!secret) throw new Error("SENSA_JWT_SECRET not configured");

  const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };
  
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    algorithm,
    false,
    ["sign"]
  );

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + 15 * 60 // 15 mins validity for verification
  };

  const encHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));

  const dataToSign = `${encHeader}.${encPayload}`;

  const signature = await crypto.subtle.sign(
    algorithm.name,
    key,
    new TextEncoder().encode(dataToSign)
  );

  const encSignature = base64urlEncode(signature);
  return `${dataToSign}.${encSignature}`;
}

export async function verifyVerificationToken(token: string, env: any): Promise<any> {
  const secret = env.SENSA_JWT_SECRET;
  if (!secret) throw new Error("SENSA_JWT_SECRET not configured");

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [encHeader, encPayload, encSignature] = parts;

  const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    algorithm,
    false,
    ["verify"]
  );

  const dataToVerify = `${encHeader}.${encPayload}`;

  const signatureStr = atob(encSignature.replace(/-/g, '+').replace(/_/g, '/'));
  const signature = new Uint8Array(signatureStr.length);
  for (let i = 0; i < signatureStr.length; i++) {
    signature[i] = signatureStr.charCodeAt(i);
  }

  const isValid = await crypto.subtle.verify(
    algorithm.name,
    key,
    signature,
    new TextEncoder().encode(dataToVerify)
  );

  if (!isValid) throw new Error("Invalid token signature");

  const payloadStr = atob(encPayload.replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(payloadStr);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("Token expired");

  return payload;
}

function str2ab(str: string) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function base64urlEncode(source: ArrayBuffer | Uint8Array) {
  let encoded = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(source))));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
