import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
});

export const organizationMemberships = pgTable("organization_memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "restrict" }),
  orgRole: text("orgRole").notNull().default("professional"),
  status: text("status").notNull().default("invited"),
  invitedByMembershipId: text("invitedByMembershipId"),
  invitedAt: milliseconds("invitedAt").notNull(),
  activatedAt: milliseconds("activatedAt"),
  revokedAt: milliseconds("revokedAt"),
}, (table) => [
  check("organization_memberships_role_check", sql`${table.orgRole} in ('owner', 'admin', 'professional')`),
  check("organization_memberships_status_check", sql`${table.status} in ('invited', 'active', 'revoked')`),
  uniqueIndex("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
  index("organization_memberships_user_status").on(table.userId, table.status),
]);

export const professionalCapabilities = pgTable("professional_capabilities", {
  membershipId: text("membershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  discipline: text("discipline").notNull(),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  check("professional_capabilities_discipline_check", sql`${table.discipline} in ('coach', 'nutritionist')`),
  uniqueIndex("professional_capabilities_membership_discipline_unique").on(table.membershipId, table.discipline),
]);
