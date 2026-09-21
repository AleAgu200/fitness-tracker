import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { organizationClients } from "./care";
import { organizationMemberships, organizations } from "./organizations";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

/** Reusable plan skeletons owned by the organization, not by one athlete. */
export const planTemplates = pgTable("plan_templates", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  discipline: text("discipline").notNull(),
  name: text("name").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  createdByMembershipId: text("createdByMembershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
  archivedAt: milliseconds("archivedAt"),
}, (table) => [
  check("plan_templates_discipline_check", sql`${table.discipline} in ('coach', 'nutritionist')`),
  index("plan_templates_org_discipline").on(table.organizationId, table.discipline, table.archivedAt),
]);

/**
 * Work in progress on an athlete's next plan. Kept in its own table so a draft
 * can never be selected by the athlete-facing queries in `lib/assignments.ts` —
 * only `publishDraft` moves a payload into `assigned_workouts`/`assigned_meal_plans`.
 *
 * `baseVersion` is the published version the draft was started from; publishing
 * against a stale base raises AssignmentConflictError instead of overwriting
 * whatever the other professional published in the meantime.
 */
export const planDrafts = pgTable("plan_drafts", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  organizationClientId: text("organizationClientId").notNull().references(() => organizationClients.id, { onDelete: "restrict" }),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  discipline: text("discipline").notNull(),
  authorMembershipId: text("authorMembershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  sourceTemplateId: text("sourceTemplateId").references(() => planTemplates.id, { onDelete: "set null" }),
  baseVersion: integer("baseVersion").notNull(),
  name: text("name"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  effectiveAt: milliseconds("effectiveAt"),
  endsAt: milliseconds("endsAt"),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  check("plan_drafts_discipline_check", sql`${table.discipline} in ('coach', 'nutritionist')`),
  // One open draft per athlete per discipline: "prepare the next phase" is a
  // single piece of work, and a second concurrent draft would silently lose one.
  uniqueIndex("plan_drafts_client_discipline_unique").on(table.organizationClientId, table.discipline),
  index("plan_drafts_athlete").on(table.athleteId, table.discipline),
]);
