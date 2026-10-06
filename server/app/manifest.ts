import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "es",
    start_url: "/",
    display: "browser",
    background_color: "#0A0A0B",
    theme_color: "#0A0A0B",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
