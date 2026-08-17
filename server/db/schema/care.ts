import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { organizationMemberships, organizations } from "./organizations";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const organizationClients = pgTable("organization_clients", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("invited"),
  createdAt: milliseconds("createdAt").notNull(),
  activatedAt: milliseconds("activatedAt"),
  pausedAt: milliseconds("pausedAt"),
  revokedAt: milliseconds("revokedAt"),
}, (table) => [
  check("organization_clients_status_check", sql`${table.status} in ('invited', 'active', 'paused', 'revoked')`),
  uniqueIndex("organization_clients_org_athlete_unique").on(table.organizationId, table.athleteId),
  index("organization_clients_athlete_status").on(table.athleteId, table.status),
]);

export const careAssignments = pgTable("care_assignments", {
  id: text("id").primaryKey(),
  organizationClientId: text("organizationClientId").notNull().references(() => organizationClients.id, { onDelete: "restrict" }),
  professionalMembershipId: text("professionalMembershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  discipline: text("discipline").notNull(),
  primary: boolean("primary").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: milliseconds("createdAt").notNull(),
  revokedAt: milliseconds("revokedAt"),
}, (table) => [
  check("care_assignments_discipline_check", sql`${table.discipline} in ('coach', 'nutritionist')`),
  check("care_assignments_status_check", sql`${table.status} in ('active', 'revoked')`),
  uniqueIndex("care_assignments_member_client_discipline_unique").on(
    table.organizationClientId,
    table.professionalMembershipId,
    table.discipline,
  ),
  uniqueIndex("care_assignments_one_primary_active")
    .on(table.organizationClientId, table.discipline)
    .where(sql`${table.primary} = true and ${table.status} = 'active'`),
  index("care_assignments_membership_status").on(table.professionalMembershipId, table.status),
]);

export const sharingConsents = pgTable("sharing_consents", {
  id: text("id").primaryKey(),
  organizationClientId: text("organizationClientId").notNull().references(() => organizationClients.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  grantedAt: milliseconds("grantedAt").notNull(),
  revokedAt: milliseconds("revokedAt"),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  check("sharing_consents_category_check", sql`${table.category} in ('training', 'nutrition', 'metrics', 'checkins', 'photos')`),
  uniqueIndex("sharing_consents_client_category_unique").on(table.organizationClientId, table.category),
]);

export const checkinTemplateVersions = pgTable("checkin_template_versions", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  discipline: text("discipline").notNull(),
  schemaVersion: integer("schemaVersion").notNull(),
  questions: jsonb("questions").$type<unknown>().notNull(),
  createdByMembershipId: text("createdByMembershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  check("checkin_template_versions_discipline_check", sql`${table.discipline} in ('coach', 'nutritionist')`),
  uniqueIndex("checkin_template_versions_org_discipline_version_unique").on(table.organizationId, table.discipline, table.schemaVersion),
]);

export const checkinRequests = pgTable("checkin_requests", {
  id: text("id").primaryKey(),
  careAssignmentId: text("careAssignmentId").notNull().references(() => careAssignments.id, { onDelete: "restrict" }),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  templateVersionId: text("templateVersionId").notNull().references(() => checkinTemplateVersions.id, { onDelete: "restrict" }),
  dueAt: milliseconds("dueAt").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: milliseconds("createdAt").notNull(),
  submittedAt: milliseconds("submittedAt"),
  reviewedAt: milliseconds("reviewedAt"),
}, (table) => [
  check("checkin_requests_status_check", sql`${table.status} in ('pending', 'submitted', 'reviewed', 'cancelled')`),
  index("checkin_requests_athlete_status_due").on(table.athleteId, table.status, table.dueAt),
  index("checkin_requests_assignment_status").on(table.careAssignmentId, table.status),
]);

export const checkinResponses = pgTable("checkin_responses", {
  id: text("id").primaryKey(),
  requestId: text("requestId").notNull().references(() => checkinRequests.id, { onDelete: "restrict" }),
  schemaVersion: integer("schemaVersion").notNull(),
  answers: jsonb("answers").$type<unknown>().notNull(),
  submittedAt: milliseconds("submittedAt").notNull(),
  supersedesId: text("supersedesId"),
}, (table) => [
  uniqueIndex("checkin_responses_request_unique").on(table.requestId),
]);

export const attentionSignals = pgTable("attention_signals", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  ownerAssignmentId: text("ownerAssignmentId").notNull().references(() => careAssignments.id, { onDelete: "restrict" }),
  checkinRequestId: text("checkinRequestId").references(() => checkinRequests.id, { onDelete: "restrict" }),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  reasonCode: text("reasonCode").notNull(),
  dedupeKey: text("dedupeKey").notNull(),
  evidence: jsonb("evidence").$type<unknown>().notNull(),
  severity: text("severity").notNull().default("attention"),
  status: text("status").notNull().default("open"),
  suggestedAction: text("suggestedAction"),
  openedAt: milliseconds("openedAt").notNull(),
  acknowledgedAt: milliseconds("acknowledgedAt"),
  resolvedAt: milliseconds("resolvedAt"),
  resolutionNote: text("resolutionNote"),
}, (table) => [
  check("attention_signals_severity_check", sql`${table.severity} in ('info', 'attention', 'urgent')`),
  check("attention_signals_status_check", sql`${table.status} in ('open', 'acknowledged', 'resolved', 'dismissed')`),
  uniqueIndex("attention_signals_dedupe_unique").on(table.organizationId, table.athleteId, table.dedupeKey),
  index("attention_signals_owner_status_opened").on(table.ownerAssignmentId, table.status, table.openedAt),
]);

export const followUpTasks = pgTable("follow_up_tasks", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  attentionSignalId: text("attentionSignalId").references(() => attentionSignals.id, { onDelete: "restrict" }),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  assigneeMembershipId: text("assigneeMembershipId").references(() => organizationMemberships.id, { onDelete: "restrict" }),
  createdByMembershipId: text("createdByMembershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  detail: text("detail"),
  dueAt: milliseconds("dueAt"),
  status: text("status").notNull().default("open"),
  createdAt: milliseconds("createdAt").notNull(),
  completedAt: milliseconds("completedAt"),
}, (table) => [
  check("follow_up_tasks_status_check", sql`${table.status} in ('open', 'done', 'cancelled')`),
  index("follow_up_tasks_assignee_status_due").on(table.assigneeMembershipId, table.status, table.dueAt),
]);

export const professionalNotes = pgTable("professional_notes", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  authorMembershipId: text("authorMembershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  visibility: text("visibility").notNull().default("author"),
  body: text("body").notNull(),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  check("professional_notes_visibility_check", sql`${table.visibility} in ('author', 'care_team', 'athlete')`),
  index("professional_notes_athlete_created").on(table.athleteId, table.createdAt),
]);

export const checkinReviews = pgTable("checkin_reviews", {
  id: text("id").primaryKey(),
  requestId: text("requestId").notNull().references(() => checkinRequests.id, { onDelete: "restrict" }),
  reviewerMembershipId: text("reviewerMembershipId").notNull().references(() => organizationMemberships.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  note: text("note"),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  check("checkin_reviews_action_check", sql`${table.action} in ('message', 'task', 'plan_adjustment', 'no_changes')`),
  uniqueIndex("checkin_reviews_request_unique").on(table.requestId),
]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  actorMembershipId: text("actorMembershipId").references(() => organizationMemberships.id, { onDelete: "restrict" }),
  actorUserId: text("actorUserId").references(() => user.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  subjectType: text("subjectType").notNull(),
  subjectId: text("subjectId").notNull(),
  metadata: jsonb("metadata").$type<unknown>(),
  occurredAt: milliseconds("occurredAt").notNull(),
}, (table) => [
  index("audit_events_org_subject_time").on(table.organizationId, table.subjectId, table.occurredAt),
  index("audit_events_actor_time").on(table.actorMembershipId, table.occurredAt),
]);
