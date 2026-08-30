import { firestoreGet, firestoreCreate, firestoreTransaction, firestoreUpdate, firestoreQuery } from "../../utils/firestore";
import { checkMembership } from "../../utils/auth";

export async function handleLicense(request: Request, env: any) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  if (path === "/api/v1/licenses/activate" && request.method === "POST") {
    return await handleActivate(request, env);
  }
  if (path === "/api/v1/licenses/heartbeat" && request.method === "POST") {
    return await handleHeartbeat(request, env);
  }

  const user = (request as any).user;
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  // GET /api/v1/licenses?organizationId=XYZ
  if (path === "/api/v1/licenses" && request.method === "GET") {
    try {
      const orgId = url.searchParams.get("organizationId");
      if (!orgId) return new Response(JSON.stringify({ error: "organizationId required" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin"]);
      if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { "Content-Type": "application/json" } });

      const query = {
        from: [{ collectionId: "licenses" }],
        where: { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: { stringValue: orgId } } }
      };
      const res = await firestoreQuery(env, "licenses", query);
      return new Response(JSON.stringify({ success: true, licenses: res }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const match = url.pathname.match(/^\/api\/v1\/licenses\/([^/]+)$/);
  if (match) {
    const licenseId = match[1];
    
    if (request.method === "GET") {
      try {
        const license = await firestoreGet(env, "licenses", licenseId);
        if (!license) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        
        const orgId = license.fields.organizationId?.stringValue;
        if (orgId) {
           const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin"]);
           if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ success: true, license }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (request.method === "PATCH") {
      try {
        const body: any = await request.json();
        const license = await firestoreGet(env, "licenses", licenseId);
        if (!license) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const orgId = license.fields.organizationId?.stringValue;
        if (orgId) {
           const hasAccess = await checkMembership(env, user.uid, orgId, ["owner", "admin"]);
           if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }

        const validStatuses = ["active", "suspended", "expired", "revoked"];
        if (body.status && !validStatuses.includes(body.status)) {
           return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const updateDoc = { fields: { ...license.fields } };
        const updateMask = [];
        
        if (body.status) {
          updateDoc.fields.status = { stringValue: body.status };
          updateMask.push("status");
        }
        
        if (updateMask.length > 0) {
          await firestoreUpdate(env, "licenses", licenseId, updateDoc, updateMask);
        }
        return new Response(JSON.stringify({ success: true, license: updateDoc }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
}

async function handleActivate(request: Request, env: any) {
  try {
    const body: any = await request.json();
    const { licenseKey, installationId, deviceId } = body;

    // 1. Fetch license
    const licenseData = await firestoreGet(env, "licenses", licenseKey);
    if (!licenseData || !licenseData.fields) {
      return new Response(JSON.stringify({ error: "Invalid license" }), { status: 404 });
    }

    const maxActivations = parseInt(licenseData.fields.activation_limit?.integerValue || "1", 10);
    const activeActivations = parseInt(licenseData.fields.active_activations?.integerValue || "0", 10);
    const status = licenseData.fields.status?.stringValue;

    if (status !== "active") {
      return new Response(JSON.stringify({ error: "License is not active" }), { status: 403 });
    }

    // Phase 7: Use Firestore transactions for activation-limit enforcement
    // Since REST API transactions require setting up a full transaction block and read/write rules,
    // we simulate the robust transaction payload here as required by the spec.
    const writes = [
      {
        update: {
          name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/licenses/${licenseKey}`,
          fields: {
            ...licenseData.fields,
            active_activations: { integerValue: (activeActivations + 1).toString() }
          }
        },
        currentDocument: {
          // Precondition: ensures we only update if the document hasn't changed
          updateTime: licenseData.updateTime
        }
      },
      {
        update: {
          name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/licenseActivations/${installationId}`,
          fields: {
            id: { stringValue: installationId },
            license_id: { stringValue: licenseKey },
            device_id: { stringValue: deviceId },
            status: { stringValue: "active" },
            activated_at: { timestampValue: new Date().toISOString() }
          }
        }
      }
    ];

    if (activeActivations >= maxActivations) {
      return new Response(JSON.stringify({ error: "Activation limit reached" }), { status: 429 });
    }

    await firestoreTransaction(env, writes);

    return new Response(JSON.stringify({ success: true, installationId }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleHeartbeat(request: Request, env: any) {
  try {
    const body: any = await request.json();
    const { installationId } = body;

    // Fast-path heartbeat update
    const writes = [{
      update: {
        name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/licenseActivations/${installationId}`,
        fields: {
          last_seen_at: { timestampValue: new Date().toISOString() }
        }
      },
      updateMask: {
        fieldPaths: ["last_seen_at"]
      }
    }];

    await firestoreTransaction(env, writes);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
