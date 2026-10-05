// Phone side of multi-device sync: reads the changes the triggers recorded,
// and applies other devices' changes without recording them again.

import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { BackupTable } from '@/lib/backup-format';
import {
  canonicalId,
  mergeNatural,
  naturalKey,
  orderForApply,
  pickActive,
  RemoteRecord,
  remoteWins,
  SYNC_TABLE_NAMES,
  SyncTableConfig,
  tableConfig,
} from '@/lib/device-sync-model';
import { collectBackupTables, TABLES, toInsertRow } from './backup-data';
import { ownedIds, within } from './account-data';
import { db } from './index';
import { deviceSyncState, mealPlans, mealSlots, personalRecords, programs, syncApplying, syncCaptureGuard, syncChanges } from './schema';
import { recomputeAllRecords } from './workout';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = Record<string, unknown>;

const SYNC_TABLE_MAP: Record<string, SQLiteTable> = {
  ...(TABLES as Record<string, SQLiteTable>),
  personal_records: personalRecords,
};

function tableOf(name: string): SQLiteTable {
  const table = SYNC_TABLE_MAP[name];
  if (!table) throw new Error(`unknown_sync_table:${name}`);
  return table;
}

function column(table: SQLiteTable, name: string): SQLiteColumn {
  return (getTableColumns(table) as Record<string, SQLiteColumn>)[name];
}

const nowMs = () => Date.now();

// ── state ───────────────────────────────────────────────────────────────────

export async function getDeviceSyncState(athleteId: string) {
  const [row] = await db.select().from(deviceSyncState).where(eq(deviceSyncState.athleteId, athleteId)).limit(1);
  return row ?? null;
}

export async function saveDeviceSyncState(athleteId: string, values: Partial<typeof deviceSyncState.$inferInsert>): Promise<void> {
  const now = new Date();
  await db.insert(deviceSyncState).values({ athleteId, updatedAt: now, ...values })
    .onConflictDoUpdate({ target: deviceSyncState.athleteId, set: { ...values, updatedAt: now } });
}

export async function countPendingChanges(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(syncChanges);
  return Number(row?.n ?? 0);
}

// ── push ────────────────────────────────────────────────────────────────────

export interface OutgoingChange {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  payload?: Row;
  changedAt: number;
}

/**
 * Pending changes of this account, with the current row for upserts. Rows of
 * another account on the same phone stay pending for that account; changes
 * whose row no longer exists are dropped.
 */
export async function pendingChangesFor(athleteId: string, limit = 200): Promise<{ changes: OutgoingChange[]; dropped: number }> {
  const pending = await db.select().from(syncChanges).orderBy(syncChanges.changedAt).limit(limit * 4);
  if (!pending.length) return { changes: [], dropped: 0 };
  const ids = await ownedIds(athleteId);
  const owned = await ownershipSets(athleteId, ids);
  const changes: OutgoingChange[] = [];
  const stale: { table: string; id: string }[] = [];

  for (const change of pending) {
    if (changes.length >= limit) break;
    const config = tableConfig(change.tableName);
    if (!config) {
      stale.push({ table: change.tableName, id: change.recordId });
      continue;
    }
    if (change.op === 'delete') {
      // The row is gone, so its owner can't be checked: the server ignores IDs it never had for this account.
      changes.push({ table: change.tableName, id: change.recordId, op: 'delete', changedAt: change.changedAt });
      continue;
    }
    const table = tableOf(change.tableName);
    const [row] = await db.select().from(table).where(eq(column(table, config.key), change.recordId)).limit(1) as Row[];
    if (!row) {
      stale.push({ table: change.tableName, id: change.recordId });
      continue;
    }
    if (!isOwned(config, row, athleteId, owned)) continue;
    changes.push({ table: change.tableName, id: change.recordId, op: 'upsert', payload: row, changedAt: change.changedAt });
  }
  for (const entry of stale) {
    await db.delete(syncChanges).where(and(eq(syncChanges.tableName, entry.table), eq(syncChanges.recordId, entry.id)));
  }
  return { changes, dropped: stale.length };
}

async function ownershipSets(athleteId: string, ids: Awaited<ReturnType<typeof ownedIds>>) {
  const slots = await db.select({ id: mealSlots.id }).from(mealSlots).where(within(mealSlots.mealPlanId, ids.mealPlanIds));
  return {
    programs: new Set(ids.programIds),
    templates: new Set(ids.templateIds),
    sessions: new Set(ids.sessionIds),
    loggedExercises: new Set(ids.loggedExerciseIds),
    mealPlans: new Set(ids.mealPlanIds),
    mealSlots: new Set(slots.map(slot => slot.id)),
    dailyLogs: new Set(ids.dailyLogIds),
    recommendations: new Set(ids.recommendationIds),
    athleteId,
  };
}

/** Child tables have no owner column: they belong to the account through their parent. */
function isOwned(config: SyncTableConfig, row: Row, athleteId: string, owned: Awaited<ReturnType<typeof ownershipSets>>): boolean {
  if ('athleteId' in row) return row.athleteId === athleteId;
  if ('userId' in row && config.table !== 'exercises') return row.userId === athleteId;
  switch (config.table) {
    case 'exercises': return true; // a name and catalog fields; no personal data
    case 'program_phases': return owned.programs.has(row.programId as string);
    case 'workout_templates': return owned.templates.has(row.id as string);
    case 'template_exercise_slots': return owned.templates.has(row.templateId as string);
    case 'logged_exercises': return owned.sessions.has(row.sessionId as string);
    case 'logged_sets': return owned.loggedExercises.has(row.loggedExerciseId as string);
    case 'meal_slots': return owned.mealPlans.has(row.mealPlanId as string);
    case 'meal_slot_skips': return owned.mealSlots.has(row.slotId as string);
    case 'meal_log_entries': return owned.dailyLogs.has(row.dailyLogId as string);
    default: return false;
  }
}

/** Forgets pushed changes, unless the record changed again since (then it is pushed next time). */
export async function clearPushed(changes: { table: string; id: string; changedAt: number }[]): Promise<void> {
  await db.transaction(async tx => {
    for (const change of changes) {
      await tx.delete(syncChanges).where(and(
        eq(syncChanges.tableName, change.table),
        eq(syncChanges.recordId, change.id),
        eq(syncChanges.changedAt, change.changedAt),
      ));
    }
  });
}

/**
 * First sync on this device: marks everything the account already has as a
 * change, with the oldest possible time, so any real edit elsewhere wins.
 */
export async function backfillChanges(athleteId: string): Promise<number> {
  const tables = await collectBackupTables(athleteId);
  let count = 0;
  await db.transaction(async tx => {
    for (const name of SYNC_TABLE_NAMES) {
      const config = tableConfig(name)!;
      const rows = (tables[name as BackupTable] ?? []) as Row[];
      for (const row of rows) {
        if (name === 'body_measurements' && row.source !== 'manual') continue;
        if (name === 'exercises' && String(row.id).startsWith('ex_')) continue;
        await tx.insert(syncChanges).values({ tableName: name, recordId: String(row[config.key]), op: 'upsert', changedAt: 1 })
          .onConflictDoNothing();
        count += 1;
      }
    }
  });
  return count;
}

// ── apply ───────────────────────────────────────────────────────────────────

async function pendingAt(tx: Transaction, table: string, id: string): Promise<number | null> {
  const [row] = await tx.select({ changedAt: syncChanges.changedAt }).from(syncChanges)
    .where(and(eq(syncChanges.tableName, table), eq(syncChanges.recordId, id))).limit(1);
  return row?.changedAt ?? null;
}

async function markChange(tx: Transaction, table: string, id: string, op: 'upsert' | 'delete'): Promise<void> {
  const changedAt = nowMs();
  await tx.insert(syncChanges).values({ tableName: table, recordId: id, op, changedAt })
    .onConflictDoUpdate({ target: [syncChanges.tableName, syncChanges.recordId], set: { op, changedAt } });
}

async function clearChange(tx: Transaction, table: string, id: string): Promise<void> {
  await tx.delete(syncChanges).where(and(eq(syncChanges.tableName, table), eq(syncChanges.recordId, id)));
}

/** Tells the triggers this row is being written by a sync, so it isn't recorded as a local change. */
async function applying(tx: Transaction, table: string, id: string): Promise<void> {
  await tx.insert(syncApplying).values({ tableName: table, recordId: id }).onConflictDoNothing();
}

async function upsertRow(tx: Transaction, config: SyncTableConfig, row: Row): Promise<void> {
  const table = tableOf(config.table);
  await applying(tx, config.table, String(row[config.key]));
  const values = toInsertRow(table, row);
  await tx.insert(table).values(values as never)
    .onConflictDoUpdate({ target: column(table, config.key) as never, set: values as never });
}

/** A local row describing the same thing (same natural key) under another ID. */
async function findNaturalTwin(tx: Transaction, config: SyncTableConfig, row: Row): Promise<Row | null> {
  const key = naturalKey(config, row);
  if (!key || !config.natural) return null;
  const table = tableOf(config.table);
  let candidates: Row[];
  if (config.table === 'exercises') {
    candidates = await tx.select().from(table)
      .where(sql`lower(trim(${column(table, 'name')})) = ${String(row.name).trim().toLowerCase()}`) as Row[];
  } else {
    const conditions = config.natural.columns.map(name => eq(column(table, name), row[name] as never));
    candidates = await tx.select().from(table).where(and(...conditions)) as Row[];
  }
  return candidates.find(candidate => candidate[config.key] !== row[config.key] && naturalKey(config, candidate) === key) ?? null;
}

/** Moves children from one parent ID to another (both directions of a merge). */
async function reparent(tx: Transaction, config: SyncTableConfig, fromId: string, toId: string): Promise<void> {
  for (const child of config.natural?.children ?? []) {
    const table = tableOf(child.table);
    const ref = column(table, child.column);
    const childConfig = tableConfig(child.table);
    const moved = childConfig
      ? await tx.select({ id: column(table, childConfig.key) }).from(table).where(eq(ref, fromId)) as { id: string }[]
      : [];
    await tx.update(table).set({ [child.column]: toId } as never).where(eq(ref, fromId));
    for (const row of moved) await markChange(tx, child.table, row.id, 'upsert');
  }
}

export interface ApplyResult {
  applied: number;
  skipped: number;
  tables: Set<string>;
}

/**
 * Applies pulled changes in one transaction, parents first. The rows being
 * written are marked in sync_applying so their triggers don't push them back;
 * anything else written meanwhile is still recorded. A local change not yet pushed is kept when
 * it is more recent. Two rows for the same thing collapse onto one canonical
 * ID, and that merge is itself recorded so the other devices converge too.
 */
export async function applyRemoteRecords(athleteId: string, records: RemoteRecord[], myDeviceId: string): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0, tables: new Set() };
  if (!records.length) return result;

  await db.transaction(async tx => {
    for (const record of orderForApply(records)) {
      const config = tableConfig(record.table);
      if (!config) { result.skipped += 1; continue; }
      const local = await pendingAt(tx, record.table, record.id);
      if (!remoteWins(record, local, myDeviceId)) { result.skipped += 1; continue; }

      if (record.deleted) {
        const table = tableOf(record.table);
        await applying(tx, record.table, record.id);
        await tx.delete(table).where(eq(column(table, config.key), record.id));
        await clearChange(tx, record.table, record.id);
        result.applied += 1;
        result.tables.add(record.table);
        continue;
      }

      const row = record.payload ?? {};
      if (('athleteId' in row && row.athleteId !== athleteId) || ('userId' in row && record.table !== 'exercises' && row.userId !== athleteId)) {
        result.skipped += 1;
        continue;
      }

      const twin = config.natural ? await findNaturalTwin(tx, config, row) : null;
      if (twin) {
        const twinId = String(twin[config.key]);
        const keep = canonicalId(twinId, record.id);
        const twinChangedAt = (await pendingAt(tx, record.table, twinId)) ?? 0;
        const merged = mergeNatural(config, { row: twin, changedAt: twinChangedAt }, { row, changedAt: record.changedAt });
        const table = tableOf(record.table);
        if (keep === record.id) {
          await applying(tx, record.table, twinId);
          await tx.delete(table).where(eq(column(table, config.key), twinId));
          await upsertRow(tx, config, { ...merged, [config.key]: record.id });
          await reparent(tx, config, twinId, record.id);
          await markChange(tx, record.table, twinId, 'delete');
          await markChange(tx, record.table, record.id, 'upsert');
        } else {
          await upsertRow(tx, config, { ...merged, [config.key]: twinId });
          await markChange(tx, record.table, twinId, 'upsert');
          await markChange(tx, record.table, record.id, 'delete');
        }
        result.applied += 1;
        result.tables.add(record.table);
        continue;
      }

      await upsertRow(tx, config, row);
      await clearChange(tx, record.table, record.id);
      result.applied += 1;
      result.tables.add(record.table);
    }

    await tx.delete(syncApplying);
  });

  if (result.tables.has('programs')) await keepOneActive(athleteId, 'programs');
  if (result.tables.has('meal_plans')) await keepOneActive(athleteId, 'meal_plans');
  const workout = ['workout_sessions', 'logged_exercises', 'logged_sets', 'exercises'];
  if (workout.some(name => result.tables.has(name))) await recomputeAllRecords(athleteId);
  return result;
}

/** Two devices may each have activated a plan: the one activated last stays active everywhere. */
async function keepOneActive(athleteId: string, kind: 'programs' | 'meal_plans'): Promise<void> {
  const table = kind === 'programs' ? programs : mealPlans;
  const rows = await db.select({ id: table.id, lastActivatedAt: table.lastActivatedAt }).from(table)
    .where(and(eq(table.athleteId, athleteId), eq(table.active, true)));
  if (rows.length <= 1) return;
  const keep = pickActive(rows.map(row => ({ id: row.id, lastActivatedAt: row.lastActivatedAt?.getTime() ?? null })));
  const others = rows.filter(row => row.id !== keep?.id).map(row => row.id);
  if (others.length) await db.update(table).set({ active: false }).where(inArray(table.id, others));
}

/** Account deletion wipes the phone; that must not become deletions on the other devices. */
export async function withCapturePaused<T>(run: () => Promise<T>): Promise<T> {
  await db.update(syncCaptureGuard).set({ paused: 1 }).where(eq(syncCaptureGuard.id, 1));
  try {
    return await run();
  } finally {
    await db.update(syncCaptureGuard).set({ paused: 0 }).where(eq(syncCaptureGuard.id, 1));
  }
}
