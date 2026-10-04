// Results of watch commands, for exactly-once handling and acknowledgements.

import { and, desc, eq } from 'drizzle-orm';

import type { CommandResult, RejectReason } from '@/lib/watch/protocol';
import { db } from './index';
import { watchCommands } from './schema';

export async function getWatchCommandResult(commandId: string): Promise<CommandResult | null> {
  const [row] = await db.select().from(watchCommands).where(eq(watchCommands.commandId, commandId)).limit(1);
  return row ? { commandId: row.commandId, status: row.status, reason: (row.reason ?? undefined) as RejectReason | undefined, setId: row.setId } : null;
}

/** Records a refusal or a command without a set (rest, navigation). Idempotent by command ID. */
export async function recordWatchCommand(athleteId: string, result: CommandResult & { type: string }): Promise<void> {
  await db.insert(watchCommands).values({
    commandId: result.commandId,
    athleteId,
    type: result.type,
    status: result.status,
    reason: result.reason ?? null,
    setId: result.setId ?? null,
    receivedAt: new Date(),
  }).onConflictDoNothing();
}

export async function recentWatchResults(athleteId: string, limit = 20): Promise<CommandResult[]> {
  const rows = await db.select().from(watchCommands)
    .where(and(eq(watchCommands.athleteId, athleteId)))
    .orderBy(desc(watchCommands.receivedAt)).limit(limit);
  return rows.map(row => ({ commandId: row.commandId, status: row.status, reason: (row.reason ?? undefined) as RejectReason | undefined, setId: row.setId }));
}
