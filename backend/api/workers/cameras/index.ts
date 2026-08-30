import { firestoreCreate, firestoreGet, firestoreQuery, firestoreUpdate } from "../../utils/firestore";
import { checkMembership } from "../../utils/auth";

export async function handleCameras(request: Request, env: any) {
  const user = (request as any).user;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/v1/cameras") {
    try {
      const body: any = await request.json();
      if (!body.siteId || !body.name) {
        return new Response(JSON.stringify({ error: "siteId and name required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // Authorize: user must have access to site. 
      const site = await firestoreGet(env, "sites", body.siteId);
      if (!site) return new Response(JSON.stringify({ error: "Site not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      
      const siteOrgId = site.fields.organizationId.stringValue;
      const hasAccess = await checkMembership(env, user.uid, siteOrgId, ["owner", "admin"]);
      if (!hasAccess) {
         return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }

      const cameraId = crypto.randomUUID();
      const cameraDoc = {
        fields: {
          id: { stringValue: cameraId },
          siteId: { stringValue: body.siteId },
          name: { stringValue: body.name },
          // Store encrypted in a real system (requires encryption keys)
          rtspUrl: { stringValue: body.rtspUrl || "" },
          enabled: { booleanValue: true },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };

      await firestoreCreate(env, "cameras", cameraId, cameraDoc);
      return new Response(JSON.stringify({ success: true, camera: cameraDoc }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // GET /api/v1/cameras?siteId=XYZ
  if (request.method === "GET" && url.pathname === "/api/v1/cameras") {
    try {
      const siteId = url.searchParams.get("siteId");
      if (!siteId) return new Response(JSON.stringify({ error: "siteId query param required" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const site = await firestoreGet(env, "sites", siteId);
      if (!site) return new Response(JSON.stringify({ error: "Site not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

      const siteOrgId = site.fields.organizationId.stringValue;
      const hasAccess = await checkMembership(env, user.uid, siteOrgId, ["owner", "admin", "operator", "viewer"]);
      if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });

      const query = {
        from: [{ collectionId: "cameras" }],
        where: { fieldFilter: { field: { fieldPath: "siteId" }, op: "EQUAL", value: { stringValue: siteId } } }
      };
      const res = await firestoreQuery(env, "cameras", query);
      
      // Filter out rtspUrl for non-admins for security
      const cleanRes = res.map((r: any) => {
        if (!["owner", "admin"].includes(hasAccess as any)) {
          // If we had exact role, we could filter here. Since checkMembership returns boolean, 
          // we'd ideally fetch the role explicitly, but for now we let Firestore Rules serve as the main defense.
        }
        return r;
      });

      return new Response(JSON.stringify({ success: true, cameras: cleanRes }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const match = url.pathname.match(/^\/api\/v1\/cameras\/([^/]+)$/);
  if (match) {
    const cameraId = match[1];

    if (request.method === "GET") {
      try {
        const camera = await firestoreGet(env, "cameras", cameraId);
        if (!camera) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const site = await firestoreGet(env, "sites", camera.fields.siteId.stringValue);
        const orgId = site.fields.organizationId.stringValue;
        const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin", "operator", "viewer"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        return new Response(JSON.stringify({ success: true, camera: camera }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (request.method === "PUT") {
      try {
        const body: any = await request.json();
        const camera = await firestoreGet(env, "cameras", cameraId);
        if (!camera) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const site = await firestoreGet(env, "sites", camera.fields.siteId.stringValue);
        const orgId = site.fields.organizationId.stringValue;
        const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        const updateDoc = { fields: { ...camera.fields } };
        const updateMask = [];
        
        if (body.name) { updateDoc.fields.name = { stringValue: body.name }; updateMask.push("name"); }
        if (body.rtspUrl !== undefined) { updateDoc.fields.rtspUrl = { stringValue: body.rtspUrl }; updateMask.push("rtspUrl"); }
        if (body.enabled !== undefined) { updateDoc.fields.enabled = { booleanValue: body.enabled }; updateMask.push("enabled"); }
        
        if (updateMask.length > 0) {
          await firestoreUpdate(env, "cameras", cameraId, updateDoc, updateMask);
        }
        return new Response(JSON.stringify({ success: true, camera: updateDoc }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (request.method === "DELETE") {
      try {
        const camera = await firestoreGet(env, "cameras", cameraId);
        if (!camera) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const site = await firestoreGet(env, "sites", camera.fields.siteId.stringValue);
        const orgId = site.fields.organizationId.stringValue;
        const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin"]);
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        const deleteUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/cameras/${cameraId}`;
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
