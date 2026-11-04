import type { NextConfig } from "next";
const config: NextConfig = {
  ...(process.env.SENSA_STATIC_EXPORT === "1"
    ? { output: "export" as const }
    : {}),
  poweredByHeader: false,
  // Polling must not reuse a socket that the Python server has already expired.
  httpAgentOptions: { keepAlive: false },
  ...(process.env.SENSA_STATIC_EXPORT === "1"
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8001"}/api/:path*`,
            },
          ];
        },
      }),
};
export default config;
