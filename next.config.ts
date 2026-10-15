import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // camera access for this page and any kiosk frame that embeds it
        source: "/(.*)",
        headers: [
          { key: "Permissions-Policy", value: "camera=*, microphone=(), fullscreen=*, autoplay=*" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // the offline service worker must always be re-checked so updates roll out
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // bundled hand-tracking engine + model never change between builds
        source: "/mediapipe/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
