import { firestoreGet, firestoreCreate, firestoreUpdate, firestoreQuery } from "../../utils/firestore";
import { generateAndSendOtp, verifyOtpAndGetToken } from "../auth/otp";
import { verifyVerificationToken } from "../auth/jwt";

/**
 * Generate a cryptographically secure demo access key.
 * Format: SENSA-DEMO-XXXX-XXXX-XXXX (where X is hex)
 */
function generateDemoAccessKey(): string {
  const bytes = new Uint8Array(6); // 6 bytes = 12 hex chars
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `SENSA-DEMO-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/**
 * SHA-256 hash a string
 */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleDemo(request: Request, env: any) {
  const url = new URL(request.url);
  const path = url.pathname;
  const user = (request as any).user;

  if (!user || !user.uid) {
    return new Response(JSON.stringify({ error: "Unauthorized. Please sign in." }), {
      status: 401, headers: { "Content-Type": "application/json" }
    });
  }

  // POST /api/v1/demo/send-otp — Send OTP for demo phone verification
  if (path === "/api/v1/demo/send-otp" && request.method === "POST") {
    try {
      const { phone } = await request.json() as any;
      if (!phone) {
        return new Response(JSON.stringify({ error: "Please enter a valid mobile number." }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      // Normalize phone
      const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
      if (sanitizedPhone.length < 10) {
        return new Response(JSON.stringify({ error: "Please enter a valid mobile number." }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      const result = await generateAndSendOtp(sanitizedPhone, env);
      if (!result.success) {
        // Map internal errors to user-friendly messages
        if (result.error?.includes("60 seconds")) {
          return new Response(JSON.stringify({ error: "Too many verification attempts. Please try again later." }), {
            status: 429, headers: { "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ error: "Verification service is temporarily unavailable. Please try again later." }), {
          status: 500, headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Verification code sent" }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    } catch (e: any) {
      console.error("Demo send-otp error:", e);
      return new Response(JSON.stringify({ error: "Verification service is temporarily unavailable. Please try again later." }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }

  // POST /api/v1/demo/verify-otp — Verify OTP for demo
  if (path === "/api/v1/demo/verify-otp" && request.method === "POST") {
    try {
      const { phone, otp } = await request.json() as any;
      if (!phone || !otp) {
        return new Response(JSON.stringify({ error: "Phone and verification code are required." }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      const result = await verifyOtpAndGetToken(phone, otp, env);
      if (!result.success) {
        // Map errors to user-friendly messages
        const errorMap: Record<string, string> = {
          "No OTP found for this number": "No verification code found. Please request a new code.",
          "OTP expired": "This verification code has expired. Please request a new code.",
          "Too many failed attempts": "Too many failed attempts. Please request a new code.",
          "Invalid OTP": "Incorrect verification code. Please try again."
        };
        const friendlyError = errorMap[result.error || ""] || "Verification failed. Please try again.";
        return new Response(JSON.stringify({ error: friendlyError }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ success: true, verificationToken: result.token }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    } catch (e: any) {
      console.error("Demo verify-otp error:", e);
      return new Response(JSON.stringify({ error: "Verification failed. Please try again." }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }

  // POST /api/v1/demo/book — Create demo booking + generate access key
  if (path === "/api/v1/demo/book" && request.method === "POST") {
    try {
      const { verificationToken, phone } = await request.json() as any;
      if (!verificationToken || !phone) {
        return new Response(JSON.stringify({ error: "Verification required before booking." }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      // Verify the OTP verification token
      const payload = await verifyVerificationToken(verificationToken, env);
      const verifiedPhone = payload.phone;

      // Check if user already has an active demo
      const existingDemos = await firestoreQuery(env, "demoRequests", {
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: user.uid } } },
              { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "active" } } }
            ]
          }
        },
        limit: 1
      });

      if (existingDemos && Array.isArray(existingDemos) && existingDemos[0]?.document) {
        const existing = existingDemos[0].document;
        const existingPrefix = existing.fields?.accessKeyPrefix?.stringValue || "";
        return new Response(JSON.stringify({
          success: true,
          existing: true,
          accessKeyPrefix: existingPrefix,
          message: "You already have an active demo booking."
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Generate demo access key
      const accessKey = generateDemoAccessKey();
      const accessKeyHash = await sha256(accessKey);
      const accessKeyPrefix = accessKey.substring(0, 15) + "..."; // "SENSA-DEMO-XXXX..."

      const demoRequestId = crypto.randomUUID();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

      const demoDoc = {
        fields: {
          id: { stringValue: demoRequestId },
          userId: { stringValue: user.uid },
          email: { stringValue: user.email || "" },
          phoneNumber: { stringValue: verifiedPhone },
          phoneVerified: { booleanValue: true },
          status: { stringValue: "active" },
          accessKeyHash: { stringValue: accessKeyHash },
          accessKeyPrefix: { stringValue: accessKeyPrefix },
          expiresAt: { timestampValue: expiresAt },
          createdAt: { timestampValue: now },
          updatedAt: { timestampValue: now },
        }
      };

      await firestoreCreate(env, "demoRequests", demoRequestId, demoDoc);

      // Return the full key ONLY ONCE — it won't be stored in plaintext
      return new Response(JSON.stringify({
        success: true,
        demoRequestId,
        accessKey,
        expiresAt,
        message: "Demo access confirmed"
      }), { status: 201, headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
      console.error("Demo book error:", e);
      if (e.message?.includes("expired")) {
        return new Response(JSON.stringify({ error: "Phone verification has expired. Please verify again." }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: "Failed to book demo. Please try again." }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }

  // GET /api/v1/demo/status — Check demo access status
  if (path === "/api/v1/demo/status" && request.method === "GET") {
    try {
      const demos = await firestoreQuery(env, "demoRequests", {
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: user.uid } } },
              { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "active" } } }
            ]
          }
        },
        limit: 1
      });

      if (demos && Array.isArray(demos) && demos[0]?.document) {
        const demo = demos[0].document;
        const expiresAt = demo.fields?.expiresAt?.timestampValue;
        const isExpired = expiresAt && new Date(expiresAt).getTime() < Date.now();

        if (isExpired) {
          return new Response(JSON.stringify({ hasDemo: false, expired: true }), {
            status: 200, headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          hasDemo: true,
          accessKeyPrefix: demo.fields?.accessKeyPrefix?.stringValue || "",
          expiresAt,
          createdAt: demo.fields?.createdAt?.timestampValue
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ hasDemo: false }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    } catch (e: any) {
      console.error("Demo status error:", e);
      return new Response(JSON.stringify({ error: "Failed to check demo status." }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404, headers: { "Content-Type": "application/json" }
  });
}
