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

  // POST /api/v1/auth/check — Check if email exists
  if (path === "/api/v1/auth/check" && request.method === "POST") {
    try {
      const { email } = await request.json() as any;
      let emailExists = false;

      if (email) {
        const u = await findUserByField(env, "email", email.toLowerCase().trim());
        if (u) emailExists = true;
      }
      return new Response(JSON.stringify({ exists: emailExists, emailExists }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/send-otp — Used by demo flow
  if (path === "/api/v1/auth/send-otp" && request.method === "POST") {
    try {
      const { phone } = await request.json() as any;
      if (!phone) return new Response(JSON.stringify({ error: "Phone number required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const result = await generateAndSendOtp(phone, env);
      if (!result.success) return new Response(JSON.stringify({ error: result.error }), { status: 429, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/verify-otp — Used by demo flow
  if (path === "/api/v1/auth/verify-otp" && request.method === "POST") {
    try {
      const { phone, otp } = await request.json() as any;
      if (!phone || !otp) return new Response(JSON.stringify({ error: "Phone and OTP required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      
      const result = await verifyOtpAndGetToken(phone, otp, env);
      if (!result.success) return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: { "Content-Type": "application/json" } });
      
      return new Response(JSON.stringify({ 
        success: true, 
        verificationToken: result.token
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/register — Email/password signup (NO phone required)
  if (path === "/api/v1/auth/register" && request.method === "POST") {
    try {
      const { email, password, displayName, firebaseApiKey } = await request.json() as any;
      if (!email || !password) return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const normalizedEmail = email.toLowerCase().trim();

      // Check email uniqueness
      const existingEmail = await findUserByField(env, "email", normalizedEmail);
      if (existingEmail) return new Response(JSON.stringify({ error: "Email is already in use." }), { status: 409, headers: { "Content-Type": "application/json" } });

      let uid = crypto.randomUUID();

      // Create user in Firebase Auth via REST API
      if (firebaseApiKey) {
        const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`;
        const signUpRes = await fetch(signUpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, password, returnSecureToken: true })
        });
        
        const signUpData = await signUpRes.json() as any;
        if (!signUpRes.ok) {
          if (signUpData.error?.message === "EMAIL_EXISTS") {
            return new Response(JSON.stringify({ error: "Email is already in use." }), { status: 409, headers: { "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ error: signUpData.error?.message || "Failed to create account" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        uid = signUpData.localId;
      }

      const profileDoc = {
        fields: {
          uid: { stringValue: uid },
          email: { stringValue: normalizedEmail },
          displayName: { stringValue: displayName || "" },
          storageMode: { stringValue: "hybrid" },
          provider: { stringValue: "password" },
          createdAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() },
        }
      };

      await firestoreCreate(env, "users", uid, profileDoc);

      // Auto-create default organization
      const orgId = crypto.randomUUID();
      const orgDoc = {
        fields: {
          id: { stringValue: orgId },
          name: { stringValue: `${displayName || "My"}'s Organization` },
          ownerId: { stringValue: uid },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      await firestoreCreate(env, "organizations", orgId, orgDoc);

      // Create membership
      const membershipId = `${uid}_${orgId}`;
      const membershipDoc = {
        fields: {
          id: { stringValue: membershipId },
          userId: { stringValue: uid },
          organizationId: { stringValue: orgId },
          role: { stringValue: "owner" },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      await firestoreCreate(env, "memberships", membershipId, membershipDoc);

      const firebaseToken = await createFirebaseCustomToken(uid, env);
      
      return new Response(JSON.stringify({ success: true, firebaseToken }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // POST /api/v1/auth/link-google — Google signup profile creation (NO phone required)
  if (path === "/api/v1/auth/link-google" && request.method === "POST") {
    try {
      const { uid, email, displayName, photoURL } = await request.json() as any;
      if (!uid) return new Response(JSON.stringify({ error: "Missing uid" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const normalizedEmail = (email || "").toLowerCase().trim();

      // Check if profile already exists
      const existingProfile = await firestoreGet(env, "users", uid);
      if (existingProfile && existingProfile.fields) {
        return new Response(JSON.stringify({ success: true, existing: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      const profileDoc = {
        fields: {
          uid: { stringValue: uid },
          email: { stringValue: normalizedEmail },
          displayName: { stringValue: displayName || "" },
          photoURL: { stringValue: photoURL || "" },
          storageMode: { stringValue: "hybrid" },
          provider: { stringValue: "google" },
          createdAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() },
        }
      };

      await firestoreCreate(env, "users", uid, profileDoc);

      // Auto-create default organization
      const orgId = crypto.randomUUID();
      const orgDoc = {
        fields: {
          id: { stringValue: orgId },
          name: { stringValue: `${displayName || "My"}'s Organization` },
          ownerId: { stringValue: uid },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      await firestoreCreate(env, "organizations", orgId, orgDoc);

      const membershipId = `${uid}_${orgId}`;
      const membershipDoc = {
        fields: {
          id: { stringValue: membershipId },
          userId: { stringValue: uid },
          organizationId: { stringValue: orgId },
          role: { stringValue: "owner" },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      await firestoreCreate(env, "memberships", membershipId, membershipDoc);

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

      // Create new profile
      const profileDoc = {
        fields: {
          uid: { stringValue: user.uid },
          email: { stringValue: user.email || body.email || "" },
          displayName: { stringValue: body.displayName || "" },
          photoURL: { stringValue: body.photoURL || "" },
          storageMode: { stringValue: body.storageMode || "hybrid" },
          provider: { stringValue: body.provider || "password" },
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
