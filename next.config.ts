import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // TMDB poster/backdrop CDN, required by next/image for remote hosts.
    // Scoped to the image delivery path only.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        port: "",
        pathname: "/t/p/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
