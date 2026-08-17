"use client";

import { createContext, useContext } from "react";

import { SessionUser } from "./lib";

export const PortalContext = createContext<{
  user: SessionUser;
  logout: () => void;
  refreshUser: () => Promise<void>;
} | null>(null);

export function usePortalUser() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortalUser must be used within the portal layout");
  return ctx;
}
