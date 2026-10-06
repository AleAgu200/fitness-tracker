import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/** Public pages only: the portal, account flows and API are not meant to be found. */
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-10-06");
  return [
    { url: `${SITE_URL}/`, lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacidad`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terminos`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/eliminar-cuenta`, lastModified: updated, changeFrequency: "yearly", priority: 0.2 },
  ];
}
