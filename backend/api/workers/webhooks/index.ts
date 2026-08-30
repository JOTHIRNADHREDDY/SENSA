import { firestoreGet, firestoreCreate, firestoreUpdate } from "../../utils/firestore";

export async function handleWebhooks(request: Request, env: any) {
  const url = new URL(request.url);

  if (url.pathname === "/api/v1/webhooks/stripe") {
    return handleStripeWebhook(request, env);
  }

  return new Response("Webhooks endpoint", { status: 200 });
}

async function handleStripeWebhook(request: Request, env: any) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });
    if (!env.STRIPE_WEBHOOK_SECRET) return new Response("Stripe webhook secret not configured", { status: 500 });

    const payload = await request.text();
    
    // Parse signature header (t=..., v1=..., v0=...)
    const sigMap: Record<string, string[]> = {};
    signature.split(',').forEach(part => {
      const [key, value] = part.split('=');
      if (key && value) {
        if (!sigMap[key]) sigMap[key] = [];
        sigMap[key].push(value);
      }
    });

    const timestamp = sigMap['t']?.[0];
    const signatures = sigMap['v1'] || [];

    if (!timestamp || signatures.length === 0) {
      return new Response("Invalid signature format", { status: 400 });
    }

    // Check tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (Math.abs(now - ts) > 5 * 60) {
      return new Response("Signature expired", { status: 400 });
    }

    // Verify cryptographic signature using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.STRIPE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSigBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );
    
    // Convert expected signature to hex
    const expectedSigHex = Array.from(new Uint8Array(expectedSigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Check if any of the provided signatures match
    const isValid = signatures.some(sig => sig === expectedSigHex);
    
    if (!isValid) {
      return new Response("Invalid signature", { status: 400 });
    }
    
    // Parse manually since we verified it
    const event = JSON.parse(payload);
    const eventId = event.id;

    // 3. Check idempotency
    const existingEvent = await firestoreGet(env, "webhookEvents", eventId);
    if (existingEvent) {
      // 5. Process exactly once
      return new Response("Already processed", { status: 200 });
    }

    // 4. Store provider event ID
    await firestoreCreate(env, "webhookEvents", eventId, {
      fields: {
        id: { stringValue: eventId },
        type: { stringValue: event.type },
        processedAt: { timestampValue: new Date().toISOString() }
      }
    });

    // 6. Update Firestore based on event type
    if (event.type === "checkout.session.completed") {
       const session = event.data.object;
       // Provision license
       const licenseId = crypto.randomUUID();
       // Try to pull user email or client reference id
       const customerEmail = session.customer_details?.email || session.customer_email;
       const planName = session.line_items?.data[0]?.price?.product?.name || "SENSA Plan";
       
       await firestoreCreate(env, "licenses", licenseId, {
         fields: {
           id: { stringValue: licenseId },
           status: { stringValue: "active" },
           plan: { stringValue: planName },
           email: { stringValue: customerEmail || "unknown" },
           stripeCustomerId: { stringValue: session.customer || "" },
           stripeSubscriptionId: { stringValue: session.subscription || "" },
           activation_limit: { integerValue: "5" }, // Default 5 devices
           active_activations: { integerValue: "0" },
           createdAt: { timestampValue: new Date().toISOString() }
         }
       });
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      // You would query licenses by stripeSubscriptionId and mark them expired/suspended
    }

    // 7. Return correct provider response
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e: any) {
    return new Response(`Webhook Error: ${e.message}`, { status: 400 });
  }
}
