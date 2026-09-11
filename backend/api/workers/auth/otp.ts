import { firestoreCreate, firestoreGet, firestoreUpdate } from "../../utils/firestore";
import { createVerificationToken } from "./jwt";

// Helper to hash OTP (simple SHA-256)
async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

export async function generateAndSendOtp(phone: string, env: any): Promise<{ success: boolean; error?: string }> {
  // Normalize phone for ID
  const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
  
  // Rate limiting check
  const existingOtpDoc = await firestoreGet(env, "otps", sanitizedPhone);
  if (existingOtpDoc && existingOtpDoc.fields) {
    const lastSentStr = existingOtpDoc.fields.lastSent?.timestampValue;
    if (lastSentStr) {
      const lastSentTime = new Date(lastSentStr).getTime();
      const now = Date.now();
      // Rate limit: max 1 OTP every 60 seconds
      if (now - lastSentTime < 60000) {
        return { success: false, error: "Please wait 60 seconds before requesting another OTP." };
      }
    }
  }

  // Generate 6-digit OTP using cryptographically secure random
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  const otp = (randomBytes[0] % 900000 + 100000).toString();
  const hashedOtp = await hashOtp(otp);

  const nowIso = new Date().toISOString();
  // Store in Firestore
  const otpDoc = {
    fields: {
      phone: { stringValue: sanitizedPhone },
      hash: { stringValue: hashedOtp },
      lastSent: { timestampValue: nowIso },
      expiresAt: { timestampValue: new Date(Date.now() + 5 * 60 * 1000).toISOString() }, // 5 mins
      attempts: { integerValue: "0" }
    }
  };

  if (existingOtpDoc && existingOtpDoc.fields) {
    await firestoreUpdate(
      env, 
      "otps", 
      sanitizedPhone, 
      otpDoc, 
      ["phone", "hash", "lastSent", "expiresAt", "attempts"]
    );
  } else {
    await firestoreCreate(env, "otps", sanitizedPhone, otpDoc);
  }

  // Send via Twilio
  const twilioSid = env.TWILIO_ACCOUNT_SID;
  const twilioToken = env.TWILIO_AUTH_TOKEN;
  const twilioFrom = env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioToken || !twilioFrom) {
    // If not configured, we just log it in dev mode
    console.log(`[DEV ONLY] OTP for ${sanitizedPhone} is ${otp}`);
    return { success: true };
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const auth = btoa(`${twilioSid}:${twilioToken}`);

  const body = new URLSearchParams();
  body.append("To", sanitizedPhone);
  body.append("From", twilioFrom);
  body.append("Body", `Your SENSA verification code is: ${otp}. It expires in 10 minutes.`);

  try {
    const res = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Twilio Error:", errorText);
      return { success: false, error: "Failed to send SMS" };
    }
    return { success: true };
  } catch (e: any) {
    console.error("Twilio Fetch Error:", e);
    return { success: false, error: "Failed to send SMS" };
  }
}

export async function verifyOtpAndGetToken(phone: string, otp: string, env: any): Promise<{ success: boolean; token?: string; error?: string }> {
  const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
  const otpDoc = await firestoreGet(env, "otps", sanitizedPhone);

  if (!otpDoc || !otpDoc.fields) {
    return { success: false, error: "No OTP found for this number" };
  }

  const expiresAt = new Date(otpDoc.fields.expiresAt?.timestampValue || 0).getTime();
  if (Date.now() > expiresAt) {
    return { success: false, error: "OTP expired" };
  }

  const attempts = parseInt(otpDoc.fields.attempts?.integerValue || "0", 10);
  if (attempts >= 5) {
    return { success: false, error: "Too many failed attempts" };
  }

  const expectedHash = otpDoc.fields.hash?.stringValue;
  const inputHash = await hashOtp(otp);

  if (expectedHash !== inputHash) {
    // Increment attempts
    const updateDoc = { fields: { ...otpDoc.fields, attempts: { integerValue: (attempts + 1).toString() } } };
    await firestoreUpdate(env, "otps", sanitizedPhone, updateDoc, ["attempts"]);
    return { success: false, error: "Invalid OTP" };
  }

  // OTP valid! Invalidate the OTP doc to prevent reuse
  const invalidateDoc = { fields: { ...otpDoc.fields, expiresAt: { timestampValue: new Date(0).toISOString() } } };
  await firestoreUpdate(env, "otps", sanitizedPhone, invalidateDoc, ["expiresAt"]);

  // Generate verification token
  const token = await createVerificationToken({ phone: sanitizedPhone }, env);
  
  return { success: true, token };
}
