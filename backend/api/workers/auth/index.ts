import { firestoreGet, firestoreCreate, firestoreUpdate } from "../../utils/firestore";

export async function handleAuth(request: Request, env: any) {
  const url = new URL(request.url);
  const path = url.pathname;
  const user = (request as any).user;

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
