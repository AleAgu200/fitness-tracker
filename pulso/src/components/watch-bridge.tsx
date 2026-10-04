import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { getWatchCommandResult, recentWatchResults, recordWatchCommand } from '@/db/watch';
import { lastSetOfSlot, slotOfSet, UndoRefusedError } from '@/db/workout';
import { recordStep } from '@/lib/crash-reporting';
import { todayStr } from '@/lib/dates';
import {
  CommandResult,
  decideCommand,
  parseCommand,
  RejectReason,
  sessionKeyFor,
  signedOutSnapshot,
  WATCH_PROTOCOL_VERSION,
  WatchCommand,
  WatchSnapshot,
} from '@/lib/watch/protocol';
import {
  addWatchCommandListener,
  publishWatchState,
  sendWatchAck,
  takePendingWatchCommands,
  watchBridgeAvailable,
} from '@/modules/pulso-watch';

/** Pseudonymous, stable per account: lets the watch tell accounts apart without holding the user ID. */
async function accountKeyFor(userId: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `pulso-watch:${userId}`);
  return digest.slice(0, 24);
}

/**
 * Phone side of the watch companions (Wear OS and Apple Watch). Publishes the
 * active session to the watch and applies the watch's queued commands through
 * the same actions the app uses — each exactly once, acknowledged with its
 * result. Renders nothing; inert where the native bridge is not linked.
 */
export function WatchBridge() {
  const { userId } = useSession();
  const { state, logSetFromWatch, undoSetFromWatch, selectEx, startRestFor, skipRest, currentTemplateId } = useApp();
  const { weightUnit } = usePreferences();
  // The key belongs to the account it was computed for; after a switch it is null until recomputed.
  const [keyed, setKeyed] = useState<{ userId: string; key: string } | null>(null);
  const accountKey = userId && keyed?.userId === userId ? keyed.key : null;
  const stateRef = useRef(state);
  const processing = useRef(false);
  const again = useRef(false);
  const lastPublished = useRef<string | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    accountKeyFor(userId).then(key => { if (active) setKeyed({ userId, key }); }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  const buildSnapshot = useCallback(async (): Promise<WatchSnapshot> => {
    const now = Date.now();
    if (!userId || !accountKey) return signedOutSnapshot(now, now);
    const s = stateRef.current;
    return {
      v: WATCH_PROTOCOL_VERSION,
      accountKey,
      sessionKey: s.exercises.length ? sessionKeyFor(todayStr(), currentTemplateId()) : null,
      revision: now,
      publishedAt: now,
      sessionDone: s.sessionDone,
      weightUnit,
      currentIndex: s.exIndex,
      exercises: s.exercises.map(exercise => ({
        slotId: exercise.id,
        name: exercise.nombre,
        targetSets: exercise.target,
        reps: exercise.reps,
        weightKg: exercise.peso,
        stepKg: exercise.step,
        sets: (s.log[exercise.id] ?? []).map(set => ({ weightKg: set.peso, reps: set.reps })),
      })),
      rest: { endAt: s.restActive ? now + s.restLeft * 1000 : null, total: s.restTotal },
      results: await recentWatchResults(userId),
    };
  }, [userId, accountKey, weightUnit, currentTemplateId]);

  const publish = useCallback(async () => {
    if (!watchBridgeAvailable()) return;
    const snapshot = await buildSnapshot();
    // The rest countdown is derived from the deadline, so per-second ticks don't republish.
    const { revision: _r, publishedAt: _p, ...comparable } = snapshot;
    const key = JSON.stringify({ ...comparable, rest: { ...comparable.rest, endAt: comparable.rest.endAt ? Math.round(comparable.rest.endAt / 5000) : null } });
    if (key === lastPublished.current) return;
    lastPublished.current = key;
    await publishWatchState(JSON.stringify(snapshot));
  }, [buildSnapshot]);

  const apply = useCallback(async (command: WatchCommand, key: string): Promise<CommandResult> => {
    const uid = userId!;
    const s = stateRef.current;
    // Everything the decision needs, read before deciding (the decision itself is pure).
    const previous = new Map<string, CommandResult | null>();
    previous.set(command.commandId, await getWatchCommandResult(command.commandId));
    let undoSlot: string | null = null;
    let lastSet: { setId: string; unsynced: boolean } | null = null;
    if (command.type === 'undo_set' && command.targetCommandId) {
      const target = await getWatchCommandResult(command.targetCommandId);
      previous.set(command.targetCommandId, target);
      if (target?.setId) {
        undoSlot = await slotOfSet(target.setId);
        if (undoSlot) lastSet = await lastSetOfSlot(uid, undoSlot);
      }
    }
    const decision = decideCommand(command, {
      accountKey: key,
      sessionKey: s.exercises.length ? sessionKeyFor(todayStr(), currentTemplateId()) : null,
      sessionDone: s.sessionDone,
      slotIds: new Set(s.exercises.map(exercise => exercise.id)),
      exerciseCount: s.exercises.length,
      now: Date.now(),
      previous: id => previous.get(id) ?? null,
      lastSet: slot => (slot === undoSlot ? lastSet : null),
      slotOfSet: () => undoSlot,
    });

    if (decision.kind === 'duplicate') return decision.result;
    const reject = async (reason: RejectReason): Promise<CommandResult> => {
      const result: CommandResult = { commandId: command.commandId, status: 'rejected', reason };
      await recordWatchCommand(uid, { ...result, type: command.type });
      return result;
    };
    if (decision.kind === 'reject') return reject(decision.reason);

    switch (command.type) {
      case 'log_set': {
        const setId = await logSetFromWatch({ slotId: command.slotId!, weightKg: command.weightKg!, reps: command.reps!, commandId: command.commandId });
        return setId ? { commandId: command.commandId, status: 'saved', setId } : reject('unknown_exercise');
      }
      case 'undo_set':
        try {
          await undoSetFromWatch({ slotId: decision.undo!.slotId, setId: decision.undo!.setId, commandId: command.commandId });
          return { commandId: command.commandId, status: 'saved', setId: decision.undo!.setId };
        } catch (error) {
          const reason = error instanceof UndoRefusedError ? error.message as RejectReason : 'conflict';
          return reject(reason);
        }
      case 'select_exercise':
        selectEx(command.index!);
        break;
      case 'start_rest':
        startRestFor(command.seconds!);
        break;
      case 'skip_rest':
        skipRest();
        break;
    }
    const result: CommandResult = { commandId: command.commandId, status: 'saved' };
    await recordWatchCommand(uid, { ...result, type: command.type });
    return result;
  }, [userId, currentTemplateId, logSetFromWatch, undoSetFromWatch, selectEx, startRestFor, skipRest]);

  const drain = useCallback(async () => {
    if (!userId || !accountKey || !stateRef.current.ready) return;
    if (processing.current) {
      again.current = true;
      return;
    }
    processing.current = true;
    try {
      do {
        again.current = false;
        const commands: WatchCommand[] = [];
        for (const raw of takePendingWatchCommands()) {
          let parsed: WatchCommand | null = null;
          let commandId: string | null = null;
          try {
            const value = JSON.parse(raw) as { commandId?: unknown };
            commandId = typeof value.commandId === 'string' ? value.commandId : null;
            parsed = parseCommand(value);
          } catch {
            // Not JSON: nothing to acknowledge.
          }
          if (parsed) commands.push(parsed);
          else if (commandId) await sendWatchAck(JSON.stringify({ commandId, status: 'rejected', reason: 'invalid' }));
        }
        // Apply in the order they happened on the watch.
        commands.sort((a, b) => a.issuedAt - b.issuedAt || a.seq - b.seq);
        for (const command of commands) {
          const result = await apply(command, accountKey);
          await sendWatchAck(JSON.stringify(result));
          recordStep('watch', result.status === 'saved' ? `${command.type}_saved` : `${command.type}_${result.reason}`);
        }
        if (commands.length) await publish();
      } while (again.current);
    } catch (error) {
      console.error('[watch]', error);
    } finally {
      processing.current = false;
    }
  }, [userId, accountKey, apply, publish]);

  // Commands that arrived while the app was closed, and new ones as they come.
  useEffect(() => {
    if (!watchBridgeAvailable()) return;
    void drain();
    const subscription = addWatchCommandListener(() => { void drain(); });
    const appState = AppState.addEventListener('change', next => { if (next === 'active') void drain(); });
    return () => {
      subscription.remove();
      appState.remove();
    };
  }, [drain]);

  // Keep the watch on the current session; a sign-out clears it there.
  useEffect(() => {
    const timer = setTimeout(() => { void publish(); }, 300);
    return () => clearTimeout(timer);
  }, [publish, state.exercises, state.log, state.exIndex, state.restActive, state.restTotal, state.sessionDone, state.ready]);

  return null;
}
