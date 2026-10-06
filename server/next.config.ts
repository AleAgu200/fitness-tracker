import type { NextConfig } from "next";

// Private surfaces: reachable, never indexed. A header (not robots.txt) so Google can
// still fetch the page and see the instruction.
const NOINDEX = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/portal", headers: NOINDEX },
      { source: "/portal/:path*", headers: NOINDEX },
      { source: "/cuenta/:path*", headers: NOINDEX },
      { source: "/api/:path*", headers: NOINDEX },
    ];
  },
};

export default nextConfig;
