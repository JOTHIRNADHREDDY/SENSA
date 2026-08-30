import { firestoreCreate, firestoreGet, firestoreQuery, firestoreUpdate } from "../../utils/firestore";
import { checkMembership } from "../../utils/auth";
import { sendWhatsAppNotification } from "../notifications";

export async function handleAlerts(request: Request, env: any) {
  const url = new URL(request.url);

  // Agent submits alerts here
  if (request.method === "POST" && url.pathname === "/api/v1/alerts") {
    try {
      const body: any = await request.json();
      if (!body.cameraId || !body.type) {
        return new Response(JSON.stringify({ error: "cameraId and type required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // Check auth if needed, but often alerts are posted by the agent API using a token or license key
      // For now, assuming standard JWT
      let hasAccess = false;
      const camera = await firestoreGet(env, "cameras", body.cameraId);
      if (!camera) return new Response(JSON.stringify({ error: "Camera not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

      if (camera.fields.siteId.stringValue === "personal") {
        hasAccess = true;
      } else {
        const site = await firestoreGet(env, "sites", camera.fields.siteId.stringValue);
        const orgId = site.fields.organizationId.stringValue;
        hasAccess = await checkMembership(env, (request as any).user.uid, orgId, ["owner", "admin"]);
      }
      if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
      
      const alertId = crypto.randomUUID();
      const alertDoc = {
        fields: {
          id: { stringValue: alertId },
          cameraId: { stringValue: body.cameraId },
          type: { stringValue: body.type }, // e.g. "intrusion"
          confidence: { doubleValue: body.confidence || 0.0 },
          snapshotUrl: { stringValue: body.snapshotUrl || "" },
          clipUrl: { stringValue: body.clipUrl || "" },
          acknowledged: { booleanValue: false },
          timestamp: { timestampValue: new Date().toISOString() }
        }
      };

      await firestoreCreate(env, "alerts", alertId, alertDoc);
      
      // Phase 14/23: Real notification logic
      // In a real system, you'd fetch the org's alert preferences (phone numbers)
      // Here we send a standardized test if env vars exist.
      const alertMsg = `⚠️ *SENSA ALERT* ⚠️\nIntrusion detected on camera: ${body.cameraId}\nConfidence: ${body.confidence}\nTime: ${alertDoc.fields.timestamp.timestampValue}`;
      // Fire and forget so we don't block the API response
      env.waitUntil(sendWhatsAppNotification(env, env.ADMIN_PHONE_NUMBER || "+1234567890", alertMsg));

      return new Response(JSON.stringify({ success: true, alertId }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // GET /api/v1/alerts?cameraId=XYZ or /api/v1/alerts?siteId=XYZ
  if (request.method === "GET" && url.pathname === "/api/v1/alerts") {
    try {
      const cameraId = url.searchParams.get("cameraId");
      const siteId = url.searchParams.get("siteId");
      if (!cameraId && !siteId) return new Response(JSON.stringify({ error: "cameraId or siteId query param required" }), { status: 400, headers: { "Content-Type": "application/json" } });

      let query: any = null;

      if (siteId) {
         if (siteId !== "personal") {
            const site = await firestoreGet(env, "sites", siteId);
            if (!site) return new Response(JSON.stringify({ error: "Site not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
            const orgId = site.fields.organizationId.stringValue;
            const hasAccess = await checkMembership(env, (request as any).user.uid, orgId, ["owner", "admin", "operator", "viewer"]);
            if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
         }
         
         // Fetch cameras in this site
         const camQuery = {
            from: [{ collectionId: "cameras" }],
            where: { fieldFilter: { field: { fieldPath: "siteId" }, op: "EQUAL", value: { stringValue: siteId } } }
         };
         const cams = await firestoreQuery(env, "cameras", camQuery);
         const camIds = cams.map((c: any) => c.fields.id.stringValue);
         
         if (camIds.length === 0) {
            return new Response(JSON.stringify({ success: true, alerts: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
         }

         // In Firestore, IN queries support max 10 elements. For prototype, we'll just query all alerts 
         // and filter in memory since this is a demo.
         const allAlerts = await firestoreQuery(env, "alerts", { from: [{ collectionId: "alerts" }] });
         const filteredAlerts = allAlerts.filter((a: any) => camIds.includes(a.fields.cameraId.stringValue));
         return new Response(JSON.stringify({ success: true, alerts: filteredAlerts }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (cameraId) {
         const camera = await firestoreGet(env, "cameras", cameraId);
         if (!camera) return new Response(JSON.stringify({ error: "Camera not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
   
         if (camera.fields.siteId.stringValue !== "personal") {
            const site = await firestoreGet(env, "sites", camera.fields.siteId.stringValue);
            const orgId = site.fields.organizationId.stringValue;
            const hasAccess = await checkMembership(env, (request as any).user.uid, orgId, ["owner", "admin", "operator", "viewer"]);
            if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
         }
   
         query = {
           from: [{ collectionId: "alerts" }],
           where: { fieldFilter: { field: { fieldPath: "cameraId" }, op: "EQUAL", value: { stringValue: cameraId } } }
         };
      }
      const res = await firestoreQuery(env, "alerts", query);
      
      return new Response(JSON.stringify({ success: true, alerts: res }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const match = url.pathname.match(/^\/api\/v1\/alerts\/([^/]+)$/);
  if (match) {
    const alertId = match[1];

    if (request.method === "PATCH") {
      try {
        const body: any = await request.json();
        const alert = await firestoreGet(env, "alerts", alertId);
        if (!alert) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const camera = await firestoreGet(env, "cameras", alert.fields.cameraId.stringValue);
        let hasAccess = false;
        if (camera.fields.siteId.stringValue === "personal") {
          hasAccess = true;
        } else {
          const site = await firestoreGet(env, "sites", camera.fields.siteId.stringValue);
          const orgId = site.fields.organizationId.stringValue;
          hasAccess = await checkMembership(env, (request as any).user.uid, orgId, ["owner", "admin", "operator"]);
        }
        if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Operators+" }), { status: 403, headers: { "Content-Type": "application/json" } });
        
        const updateDoc = { fields: { ...alert.fields } };
        const updateMask = [];
        
        if (body.acknowledged !== undefined) {
          updateDoc.fields.acknowledged = { booleanValue: body.acknowledged };
          updateMask.push("acknowledged");
        }
        
        if (updateMask.length > 0) {
          await firestoreUpdate(env, "alerts", alertId, updateDoc, updateMask);
        }
        return new Response(JSON.stringify({ success: true, alert: updateDoc }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
}
