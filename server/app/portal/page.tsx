"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { api } from "./lib";
import { usePortalUser } from "./portal-context";
import { resolveDefaultPortalPath } from "@/lib/portal-access";

export default function PortalPage() {
  const router = useRouter();
  const { user } = usePortalUser();
  useEffect(() => {
    api<{ settings?: { defaultPortalSection?: string } }>("/api/portal/settings")
      .then(result => {
        router.replace(resolveDefaultPortalPath(user.role === "nutritionist" ? "nutritionist" : "coach", result.settings?.defaultPortalSection));
      })
      .catch(() => router.replace("/portal/atencion"));
  }, [router, user.role]);
  return <div className="p-8 font-mono-app text-xs text-fg-ter">ABRIENDO TU ESPACIO…</div>;
}
