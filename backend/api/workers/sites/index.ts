import { firestoreCreate, firestoreGet, firestoreQuery, firestoreUpdate } from "../../utils/firestore";
import { checkMembership } from "../../utils/auth";

export async function handleSites(request: Request, env: any) {
  const user = (request as any).user;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/v1/sites") {
    try {
      const body: any = await request.json();
      if (!body.organizationId || !body.name) {
        return new Response(JSON.stringify({ error: "organizationId and name required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // Authorization: Check if user is in org with admin rights to create site
      const hasAccess = await checkMembership(env, user.uid, body.organizationId, ["owner", "admin"]);
      if (!hasAccess) {
         return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }

      const siteId = crypto.randomUUID();
      const siteDoc = {
        fields: {
          id: { stringValue: siteId },
          organizationId: { stringValue: body.organizationId },
          name: { stringValue: body.name },
          timezone: { stringValue: body.timezone || "UTC" },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };

      await firestoreCreate(env, "sites", siteId, siteDoc);
      return new Response(JSON.stringify({ success: true, site: siteDoc }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // GET /api/v1/sites?organizationId=XYZ
  if (request.method === "GET" && url.pathname === "/api/v1/sites") {
    try {
      const orgId = url.searchParams.get("organizationId");
      if (!orgId) return new Response(JSON.stringify({ error: "organizationId query param required" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin", "operator", "viewer"]);
      if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });

      const query = {
        from: [{ collectionId: "sites" }],
        where: { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: { stringValue: orgId } } }
      };
      const res = await firestoreQuery(env, "sites", query);
      
      return new Response(JSON.stringify({ success: true, sites: res }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const match = url.pathname.match(/^\/api\/v1\/sites\/([^/]+)$/);
  if (match) {
    const siteId = match[1];

    if (request.method === "GET") {
      try {
        const site = await firestoreGet(env, "sites", siteId);
        if (!site) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const orgId = site.fields.organizationId.stringValue;
        const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin", "operator", "viewer"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        return new Response(JSON.stringify({ success: true, site: site }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (request.method === "PUT") {
      try {
        const body: any = await request.json();
        const site = await firestoreGet(env, "sites", siteId);
        if (!site) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const orgId = site.fields.organizationId.stringValue;
        const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        const updateDoc = { fields: { ...site.fields } };
        const updateMask = [];
        
        if (body.name) { updateDoc.fields.name = { stringValue: body.name }; updateMask.push("name"); }
        if (body.timezone) { updateDoc.fields.timezone = { stringValue: body.timezone }; updateMask.push("timezone"); }
        
        if (updateMask.length > 0) {
          await firestoreUpdate(env, "sites", siteId, updateDoc, updateMask);
        }
        return new Response(JSON.stringify({ success: true, site: updateDoc }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (request.method === "DELETE") {
      try {
        const site = await firestoreGet(env, "sites", siteId);
        if (!site) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const orgId = site.fields.organizationId.stringValue;
        const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        const deleteUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/sites/${siteId}`;
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
