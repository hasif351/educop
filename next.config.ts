import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets parallel local builds use separate output folders.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Render metadata before the body so "not found" pages return a real 404 status.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Live classroom pages run Educop live (our own page, so 'self') or embed
      // the Jitsi Meet room; both need the camera, microphone, screen share and
      // autoplay for class audio. Later rules override earlier ones.
      {
        source: "/:role(teacher|student)/live/:id",
        headers: [
          { key: "Permissions-Policy", value: 'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), display-capture=(self "https://meet.jit.si"), fullscreen=(self "https://meet.jit.si"), autoplay=(self "https://meet.jit.si"), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
