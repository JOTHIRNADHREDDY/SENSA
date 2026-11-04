import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // Polling must not reuse a socket that the Python server has already expired.
  httpAgentOptions: { keepAlive: false },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8001"}/api/:path*`,
      },
    ];
  },
};
export default config;
