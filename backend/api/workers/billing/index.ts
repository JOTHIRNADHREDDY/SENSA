import { determinePrice, COUNTRY_DATA, PRICING_TIERS } from "../../utils/pricing";

const PLAN_MAPPING: Record<string, string> = {
  pilot: "starter", // Free trial
  base_license: "starter",
  professional: "basic",
  business: "pro",
  enterprise: "custom"
};

export async function handleBilling(request: Request, env: any) {
  const url = new URL(request.url);
  const path = url.pathname;
  const user = (request as any).user;

  if (path === "/api/v1/billing/price" && request.method === "POST") {
    try {
      const body: any = await request.json();
      const { country, planId, cycle } = body;
      const safeCountry = COUNTRY_DATA[country] ? country : "US";
      
      // If fetching all prices for a country
      if (!planId) {
        const prices: any = {};
        const targetPlans = ['pilot', 'base_license', 'professional', 'business'];
        
        targetPlans.forEach(uiPlan => {
          const sensaPlan = PLAN_MAPPING[uiPlan];
          let monthly = 0;
          let annual = 0;
          let currency = "USD";
          
          if (uiPlan !== 'pilot') {
            const mPrice = determinePrice(safeCountry, sensaPlan, "monthly");
            const aPrice = determinePrice(safeCountry, sensaPlan, "yearly");
            monthly = mPrice.price * 100;
            annual = aPrice.price * 100;
            currency = mPrice.currency;
          } else {
            const fallback = determinePrice(safeCountry, "starter", "monthly");
            currency = fallback.currency;
          }
          
          prices[uiPlan] = {
            planId: uiPlan,
            country: safeCountry.toUpperCase(),
            currency,
            monthly,
            annual
          };
        });
        
        return new Response(JSON.stringify({ success: true, country: safeCountry.toUpperCase(), prices }), { headers: { "Content-Type": "application/json" } });
      }

      if (planId === 'enterprise' || !PLAN_MAPPING[planId]) {
        return new Response(JSON.stringify({ success: false, error: "Plan not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      }

      const sensaPlan = PLAN_MAPPING[planId];
      const authoritativePrice = determinePrice(safeCountry, sensaPlan, cycle === 'annual' ? "yearly" : "monthly");

      return new Response(JSON.stringify({
        success: true,
        price: {
          currency: authoritativePrice.currency,
          amountMinor: authoritativePrice.price * 100
        }
      }), { headers: { "Content-Type": "application/json" } });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  if (path === "/api/v1/billing/checkout" && request.method === "POST") {
    try {
      const body: any = await request.json();
      const { countryCode, planId, billingCycle } = body;

      // Phase 10: Backend determines authoritative price
      const { price, currency } = determinePrice(countryCode, planId, billingCycle);

      if (!env.STRIPE_SECRET_KEY) {
        throw new Error("Stripe is not configured on the backend");
      }

      // Call Stripe API to create Checkout Session
      const auth = btoa(`${env.STRIPE_SECRET_KEY}:`);
      
      const formData = new URLSearchParams();
      formData.append("payment_method_types[0]", "card");
      formData.append("line_items[0][price_data][currency]", currency.toLowerCase());
      formData.append("line_items[0][price_data][product_data][name]", `SENSA ${planId.toUpperCase()} Plan`);
      formData.append("line_items[0][price_data][unit_amount]", (price * 100).toString());
      formData.append("line_items[0][quantity]", "1");
      formData.append("mode", "subscription"); // SENSA is subscription based
      // In a real app we'd get the actual frontend origin from env or referer
      const origin = request.headers.get("Origin") || "https://sensa.io";
      formData.append("success_url", `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
      formData.append("cancel_url", `${origin}/checkout/cancel`);
      
      // If we have an authenticated user
      if (user && user.email) {
        formData.append("customer_email", user.email);
      }

      const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString()
      });

      if (!stripeResponse.ok) {
        const err = await stripeResponse.json() as any;
        throw new Error(`Stripe error: ${err.error?.message || stripeResponse.statusText}`);
      }

      const session = await stripeResponse.json() as any;
      
      return new Response(JSON.stringify({ 
        success: true, 
        checkoutSessionUrl: session.url
      }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
  if (path === "/api/v1/billing/portal" && request.method === "POST") {
    try {
      if (!user || !user.email) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");

      // We need a customer ID. In a real app we'd fetch it from the user's subscription doc.
      // For now, we return a mock URL or require the client to pass the stripeCustomerId.
      const body: any = await request.json();
      const customerId = body.stripeCustomerId;
      if (!customerId) return new Response(JSON.stringify({ error: "No customer ID found" }), { status: 400, headers: { "Content-Type": "application/json" } });

      const auth = btoa(`${env.STRIPE_SECRET_KEY}:`);
      const formData = new URLSearchParams();
      formData.append("customer", customerId);
      const origin = request.headers.get("Origin") || "https://sensa.io";
      formData.append("return_url", `${origin}/dashboard`);

      const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString()
      });

      if (!stripeResponse.ok) {
        const err = await stripeResponse.json() as any;
        throw new Error(`Stripe error: ${err.error?.message}`);
      }

      const session = await stripeResponse.json() as any;
      return new Response(JSON.stringify({ success: true, url: session.url }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  if (path === "/api/v1/billing/razorpay" && request.method === "POST") {
    // Placeholder for Razorpay order creation
    return new Response(JSON.stringify({ error: "Razorpay integration pending real merchant account credentials." }), { status: 501, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
}
