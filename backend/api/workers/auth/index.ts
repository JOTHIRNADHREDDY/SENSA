import { firestoreGet, firestoreCreate, firestoreUpdate, firestoreQuery } from "../../utils/firestore";
import { generateAndSendOtp, verifyOtpAndGetToken } from "./otp";
import { createFirebaseCustomToken, verifyVerificationToken } from "./jwt";

// Helper for finding a user by a specific field
async function findUserByField(env: any, field: string, value: string) {
  const q = {
    where: {
      fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } }
    },
    limit: 1
  };
  const result = await firestoreQuery(env, "users", q);
  if (result && Array.isArray(result) && result[0] && result[0].document) {
    return result[0].document;
  }
  return null;
}

export async function handleAuth(request: Request, env: any) {
  const url = new URL(request.url);
  const path = url.pathname;
  const user = (request as any).user;

  // POST /api/v1/auth/check — Check if email/phone exists
  if (path === "/api/v1/auth/check" && request.method === "POST") {
    try {
      const { email, phone } = await request.json() as any;
      let emailExists = false;
      let phoneExists = false;

      if (email) {
        const u = await findUserByField(env, "email", email.toLowerCase());
        if (u) emailExists = true;
      }
      if (phone) {
        const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
        const u = await findUserByField(env, "phone", sanitizedPhone);
        if (u) phoneExists = true;
      }
      return new Response(JSON.stringify({ exists: emailExists || phoneExists, emailExists, phoneExists }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/send-otp
  if (path === "/api/v1/auth/send-otp" && request.method === "POST") {
    try {
      const { phone } = await request.json() as any;
      if (!phone) return new Response(JSON.stringify({ error: "Phone number required" }), { status: 400 });
      const result = await generateAndSendOtp(phone, env);
      if (!result.success) return new Response(JSON.stringify({ error: result.error }), { status: 429 });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/verify-otp
  if (path === "/api/v1/auth/verify-otp" && request.method === "POST") {
    try {
      const { phone, otp } = await request.json() as any;
      if (!phone || !otp) return new Response(JSON.stringify({ error: "Phone and OTP required" }), { status: 400 });
      
      const result = await verifyOtpAndGetToken(phone, otp, env);
      if (!result.success) return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: { "Content-Type": "application/json" } });
      
      // Check if user already exists to log them in directly
      const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
      const existingUser = await findUserByField(env, "phone", sanitizedPhone);
      let firebaseToken = null;
      let isNewUser = true;

      if (existingUser) {
        isNewUser = false;
        const uid = existingUser.fields?.uid?.stringValue || existingUser.name.split("/").pop();
        firebaseToken = await createFirebaseCustomToken(uid, env);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        verificationToken: result.token, 
        firebaseToken,
        isNewUser 
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/register
  if (path === "/api/v1/auth/register" && request.method === "POST") {
    try {
      const { verificationToken, email, password, displayName, firebaseApiKey } = await request.json() as any;
      if (!verificationToken) return new Response(JSON.stringify({ error: "Verification token required" }), { status: 400 });

      // Verify the token (valid for 15 mins)
      const payload = await verifyVerificationToken(verificationToken, env);
      const sanitizedPhone = payload.phone;

      // Re-check uniqueness
      const existingPhone = await findUserByField(env, "phone", sanitizedPhone);
      if (existingPhone) return new Response(JSON.stringify({ error: "Phone number already registered" }), { status: 409 });
      
      if (email) {
        const existingEmail = await findUserByField(env, "email", email.toLowerCase());
        if (existingEmail) return new Response(JSON.stringify({ error: "Email already registered" }), { status: 409 });
      }

      let uid = crypto.randomUUID();

      // If email, password, and firebaseApiKey are provided, create user in Firebase Auth via REST API
      if (email && password && firebaseApiKey) {
        const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`;
        const signUpRes = await fetch(signUpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        
        const signUpData = await signUpRes.json() as any;
        if (!signUpRes.ok) {
          // If the email is already in Firebase Auth, but not in our DB, we can just login?
          // For simplicity, return the Firebase error
          if (signUpData.error && signUpData.error.message === "EMAIL_EXISTS") {
             // Edge case: orphaned auth record. We can just use it if we can authenticate.
             // But we don't have a way to force-link without Admin SDK.
             return new Response(JSON.stringify({ error: "Email already in use in auth provider. Please log in with Google or reset your password." }), { status: 409 });
          }
          return new Response(JSON.stringify({ error: signUpData.error?.message || "Failed to create Firebase Auth user" }), { status: 400 });
        }
        
        uid = signUpData.localId;
      }

      const profileDoc = {
        fields: {
          uid: { stringValue: uid },
          email: { stringValue: email ? email.toLowerCase() : "" },
          displayName: { stringValue: displayName || "" },
          phone: { stringValue: sanitizedPhone },
          storageMode: { stringValue: "hybrid" },
          provider: { stringValue: "phone" },
          createdAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() },
        }
      };

      await firestoreCreate(env, "users", uid, profileDoc);

      const firebaseToken = await createFirebaseCustomToken(uid, env);
      
      return new Response(JSON.stringify({ success: true, firebaseToken }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/link-google
  if (path === "/api/v1/auth/link-google" && request.method === "POST") {
    try {
      // Used when Google Sign-in requires phone verification for new accounts
      const { verificationToken, uid, email, displayName, photoURL } = await request.json() as any;
      if (!verificationToken || !uid) return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });

      const payload = await verifyVerificationToken(verificationToken, env);
      const sanitizedPhone = payload.phone;

      const existingPhone = await findUserByField(env, "phone", sanitizedPhone);
      if (existingPhone) return new Response(JSON.stringify({ error: "Phone number already registered to another account" }), { status: 409 });

      const profileDoc = {
        fields: {
          uid: { stringValue: uid },
          email: { stringValue: email || "" },
          displayName: { stringValue: displayName || "" },
          phone: { stringValue: sanitizedPhone },
          photoURL: { stringValue: photoURL || "" },
          storageMode: { stringValue: "hybrid" },
          provider: { stringValue: "google" },
          createdAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() },
        }
      };

      await firestoreCreate(env, "users", uid, profileDoc);

      return new Response(JSON.stringify({ success: true }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // GET /api/v1/auth/profile — Check if SENSA profile exists for authenticated user
  if (path === "/api/v1/auth/profile" && request.method === "GET") {
    try {
      if (!user || !user.uid) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, headers: { "Content-Type": "application/json" } 
        });
      }

      const profile = await firestoreGet(env, "users", user.uid);
      if (!profile || !profile.fields) {
        return new Response(JSON.stringify({ exists: false }), { 
          status: 200, headers: { "Content-Type": "application/json" } 
        });
      }

      return new Response(JSON.stringify({ exists: true, profile }), { 
        status: 200, headers: { "Content-Type": "application/json" } 
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { "Content-Type": "application/json" } 
      });
    }
  }

  // POST /api/v1/auth/profile — Create or update SENSA user profile
  if (path === "/api/v1/auth/profile" && request.method === "POST") {
    try {
      if (!user || !user.uid) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, headers: { "Content-Type": "application/json" } 
        });
      }

      const body = await request.json() as any;

      // Check if profile already exists
      const existing = await firestoreGet(env, "users", user.uid);
      
      if (existing && existing.fields) {
        // Update existing profile — only update allowed fields
        const updateDoc = { fields: { ...existing.fields } };
        const updateMask: string[] = [];

        if (body.displayName) {
          updateDoc.fields.displayName = { stringValue: body.displayName };
          updateMask.push("displayName");
        }
        if (body.phone) {
          updateDoc.fields.phone = { stringValue: body.phone };
          updateMask.push("phone");
        }
        if (body.storageMode) {
          updateDoc.fields.storageMode = { stringValue: body.storageMode };
          updateMask.push("storageMode");
        }
        updateDoc.fields.updatedAt = { timestampValue: new Date().toISOString() };
        updateMask.push("updatedAt");

        if (updateMask.length > 0) {
          await firestoreUpdate(env, "users", user.uid, updateDoc, updateMask);
        }

        return new Response(JSON.stringify({ success: true, profile: updateDoc, created: false }), { 
          status: 200, headers: { "Content-Type": "application/json" } 
        });
      }

      // Create new profile — derive identity from verified JWT, not frontend fields
      const profileDoc = {
        fields: {
          uid: { stringValue: user.uid },
          email: { stringValue: user.email || body.email || "" },
          displayName: { stringValue: body.displayName || "" },
          phone: { stringValue: body.phone || "" },
          photoURL: { stringValue: body.photoURL || "" },
          storageMode: { stringValue: body.storageMode || "hybrid" },
          provider: { stringValue: body.provider || "password" },
          legalAccepted: { booleanValue: body.legalAccepted === true },
          termsVersion: { stringValue: body.termsVersion || "" },
          privacyVersion: { stringValue: body.privacyVersion || "" },
          marketingConsent: { booleanValue: body.marketingConsent === true },
          createdAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() },
        }
      };

      await firestoreCreate(env, "users", user.uid, profileDoc);

      // Auto-create a default organization for the new user
      const orgId = crypto.randomUUID();
      const orgDoc = {
        fields: {
          id: { stringValue: orgId },
          name: { stringValue: `${body.displayName || "My"}'s Organization` },
          ownerId: { stringValue: user.uid },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      await firestoreCreate(env, "organizations", orgId, orgDoc);

      // Create membership
      const membershipId = `${user.uid}_${orgId}`;
      const membershipDoc = {
        fields: {
          id: { stringValue: membershipId },
          userId: { stringValue: user.uid },
          organizationId: { stringValue: orgId },
          role: { stringValue: "owner" },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      await firestoreCreate(env, "memberships", membershipId, membershipDoc);

      return new Response(JSON.stringify({ success: true, profile: profileDoc, created: true }), { 
        status: 201, headers: { "Content-Type": "application/json" } 
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { "Content-Type": "application/json" } 
      });
    }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), { 
    status: 404, headers: { "Content-Type": "application/json" } 
  });
}
