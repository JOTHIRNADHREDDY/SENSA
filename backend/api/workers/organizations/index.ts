import { firestoreGet, firestoreCreate, firestoreQuery, firestoreUpdate } from "../../utils/firestore";

export async function handleOrganizations(request: Request, env: any) {
  const user = (request as any).user;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/v1/organizations") {
    // Create new organization
    try {
      const body = await request.json() as any;
      const orgId = crypto.randomUUID();
      const orgDoc = {
        fields: {
          id: { stringValue: orgId },
          name: { stringValue: body.name || "My Organization" },
          ownerId: { stringValue: user.uid },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };

      // Create Org
      await firestoreCreate(env, "organizations", orgId, orgDoc);

      // Create Membership
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

      return new Response(JSON.stringify({ success: true, organization: orgDoc }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // Helper to verify membership
  const checkMembership = async (orgId: string, allowedRoles: string[]) => {
    const memId = `${user.uid}_${orgId}`;
    const mem = await firestoreGet(env, "memberships", memId);
    if (!mem || !mem.fields) return false;
    const role = mem.fields.role?.stringValue;
    return allowedRoles.includes(role);
  };

  if (request.method === "GET" && url.pathname === "/api/v1/organizations") {
    try {
      // Query memberships where userId == user.uid
      const query = {
        from: [{ collectionId: "memberships" }],
        where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: user.uid } } }
      };
      const memRes = await firestoreQuery(env, "memberships", query);
      const orgIds = memRes.map((r: any) => r.document?.fields?.organizationId?.stringValue).filter(Boolean);
      
      const orgs = [];
      for (const oid of orgIds) {
        const org = await firestoreGet(env, "organizations", oid);
        if (org) orgs.push(org);
      }
      return new Response(JSON.stringify({ success: true, organizations: orgs }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const match = url.pathname.match(/^\/api\/v1\/organizations\/([^/]+)$/);
  if (match) {
    const orgId = match[1];

    if (request.method === "GET") {
      try {
        const hasAccess = await checkMembership(orgId, ["owner", "admin", "operator", "viewer"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        const org = await firestoreGet(env, "organizations", orgId);
        if (!org) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: true, organization: org }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (request.method === "PATCH") {
      try {
        const hasAccess = await checkMembership(orgId, ["owner", "admin"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        const body = await request.json() as any;
        const org = await firestoreGet(env, "organizations", orgId);
        if (!org) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        
        const updateDoc = {
          fields: { ...org.fields }
        };
        const updateMask = [];
        
        if (body.name) {
          updateDoc.fields.name = { stringValue: body.name };
          updateMask.push("name");
        }
        
        if (updateMask.length > 0) {
          await firestoreUpdate(env, "organizations", orgId, updateDoc, updateMask);
        }
        return new Response(JSON.stringify({ success: true, organization: updateDoc }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (request.method === "DELETE") {
      // Deletes are only allowed by owner
      try {
        const hasAccess = await checkMembership(orgId, ["owner"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Owners only" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        // In a real system, you'd trigger a background job to delete all related data (sites, cameras, etc.)
        // For REST, you would delete the doc. We simulate the REST DELETE call via fetch.
        const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/organizations/${orgId}`;
        await fetch(url, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${env.FIREBASE_SERVICE_ACCOUNT_TOKEN}` }
        });
        
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
}
