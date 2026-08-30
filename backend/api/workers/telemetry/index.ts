import { firestoreCreate, firestoreGet, firestoreQuery } from "../../utils/firestore";
import { checkMembership } from "../../utils/auth";

export async function handleTelemetry(request: Request, env: any) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/v1/telemetry") {
    try {
      const body: any = await request.json();
      const { installationId, agentVersion, healthStatus, camerasOnline } = body;
      
      if (!installationId) return new Response(JSON.stringify({ error: "Missing installationId" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const telemetryId = crypto.randomUUID();
      const telemetryDoc = {
        fields: {
          id: { stringValue: telemetryId },
          installationId: { stringValue: installationId },
          agentVersion: { stringValue: agentVersion || "unknown" },
          healthStatus: { stringValue: healthStatus || "healthy" },
          camerasOnline: { integerValue: (camerasOnline || 0).toString() },
          timestamp: { timestampValue: new Date().toISOString() }
        }
      };

      await firestoreCreate(env, "telemetry", telemetryId, telemetryDoc);
      
      return new Response(JSON.stringify({ success: true }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/v1/telemetry") {
    try {
      const installationId = url.searchParams.get("installationId");
      if (!installationId) return new Response(JSON.stringify({ error: "installationId query param required" }), { status: 400, headers: { "Content-Type": "application/json" } });

      // Telemetry typically belongs to a license activation which belongs to an organization.
      // Assuming we verify the user has access to this org:
      const activation = await firestoreGet(env, "licenseActivations", installationId);
      if (!activation) return new Response(JSON.stringify({ error: "Activation not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

      const license = await firestoreGet(env, "licenses", activation.fields.license_id.stringValue);
      const orgId = license.fields.organizationId.stringValue;

      const hasAccess = await checkMembership(env, (request as any).user.uid, orgId, ["owner", "admin", "operator", "viewer"]);
      if (!hasAccess) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });

      const query = {
        from: [{ collectionId: "telemetry" }],
        where: { fieldFilter: { field: { fieldPath: "installationId" }, op: "EQUAL", value: { stringValue: installationId } } }
      };
      const res = await firestoreQuery(env, "telemetry", query);
      
      return new Response(JSON.stringify({ success: true, telemetry: res }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
}
