import { firestoreGet, firestoreCreate, firestoreUpdate, firestoreQuery } from "../../utils/firestore";

export async function handleMemberships(request: Request, env: any) {
  const user = (request as any).user;
  const url = new URL(request.url);

  // Helper to verify membership role
  const checkMembership = async (orgId: string, allowedRoles: string[]) => {
    const memId = `${user.uid}_${orgId}`;
    const mem = await firestoreGet(env, "memberships", memId);
    if (!mem || !mem.fields) return false;
    const role = mem.fields.role?.stringValue;
    return allowedRoles.includes(role);
  };

  // POST /api/v1/memberships
  if (request.method === "POST" && url.pathname === "/api/v1/memberships") {
    try {
      const body = await request.json() as any;
      if (!body.organizationId || !body.userId || !body.role) {
        return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const hasAccess = await checkMembership(body.organizationId, ["owner", "admin"]);
      if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
      
      // Ensure role is valid
      const validRoles = ["admin", "operator", "viewer"]; // owner is not assignable here
      if (!validRoles.includes(body.role)) {
        return new Response(JSON.stringify({ error: "Invalid role" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const membershipId = `${body.userId}_${body.organizationId}`;
      const membershipDoc = {
        fields: {
          id: { stringValue: membershipId },
          userId: { stringValue: body.userId },
          organizationId: { stringValue: body.organizationId },
          role: { stringValue: body.role },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      
      await firestoreCreate(env, "memberships", membershipId, membershipDoc);
      return new Response(JSON.stringify({ success: true, membership: membershipDoc }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // GET /api/v1/memberships?organizationId=XYZ
  if (request.method === "GET" && url.pathname === "/api/v1/memberships") {
    try {
      const orgId = url.searchParams.get("organizationId");
      if (!orgId) return new Response(JSON.stringify({ error: "organizationId query param required" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const hasAccess = await checkMembership(orgId, ["owner", "admin", "operator", "viewer"]);
      if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });

      const query = {
        from: [{ collectionId: "memberships" }],
        where: { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: { stringValue: orgId } } }
      };
      const memRes = await firestoreQuery(env, "memberships", query);
      
      return new Response(JSON.stringify({ success: true, memberships: memRes }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const match = url.pathname.match(/^\/api\/v1\/memberships\/([^/]+)$/);
  if (match) {
    const memId = match[1];

    if (request.method === "DELETE") {
      try {
        const mem = await firestoreGet(env, "memberships", memId);
        if (!mem || !mem.fields) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        
        const orgId = mem.fields.organizationId.stringValue;
        const targetUserId = mem.fields.userId.stringValue;
        const targetRole = mem.fields.role.stringValue;

        // User can remove themselves (leave org) unless they are the owner
        if (targetUserId === user.uid && targetRole === "owner") {
            return new Response(JSON.stringify({ error: "Owner cannot leave. Transfer ownership first or delete org." }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const isSelf = targetUserId === user.uid;
        const hasAdminAccess = await checkMembership(orgId, ["owner", "admin"]);

        if (!isSelf && !hasAdminAccess) {
             return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
        
        // Prevent admin from removing owner
        if (!isSelf && targetRole === "owner") {
            return new Response(JSON.stringify({ error: "Cannot remove owner" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }

        const deleteUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/memberships/${memId}`;
        await fetch(deleteUrl, {
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
