import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// The portal and account pages stay crawlable so Google can read their noindex header
// (next.config.ts); only the API is blocked outright.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
