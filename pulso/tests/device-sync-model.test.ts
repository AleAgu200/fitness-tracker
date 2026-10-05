/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalId,
  mergeNatural,
  naturalKey,
  orderForApply,
  pickActive,
  remoteWins,
  tableConfig,
} from '../src/lib/device-sync-model';

describe('remoteWins', () => {
  it('applies another device change when nothing is pending here', () => {
    assert.equal(remoteWins({ changedAt: 10, deviceId: 'tablet' }, null, 'phone'), true);
  });

  it('skips our own changes coming back', () => {
    assert.equal(remoteWins({ changedAt: 10, deviceId: 'phone' }, null, 'phone'), false);
  });

  it('lets the most recent change win against a local pending edit', () => {
    assert.equal(remoteWins({ changedAt: 20, deviceId: 'tablet' }, 10, 'phone'), true);
    assert.equal(remoteWins({ changedAt: 5, deviceId: 'tablet' }, 10, 'phone'), false);
  });

  it('breaks ties by device the same way as the server', () => {
    assert.equal(remoteWins({ changedAt: 10, deviceId: 'zz' }, 10, 'aa'), true);
    assert.equal(remoteWins({ changedAt: 10, deviceId: 'aa' }, 10, 'zz'), false);
  });
});

describe('natural keys', () => {
  const exercises = tableConfig('exercises')!;
  const checkIns = tableConfig('daily_check_ins')!;

  it('matches exercises by name regardless of case and spaces', () => {
    assert.equal(naturalKey(exercises, { name: ' Press Banca ' }), naturalKey(exercises, { name: 'press banca' }));
    assert.equal(naturalKey(exercises, { name: '' }), null);
    assert.equal(naturalKey(tableConfig('logged_sets')!, { id: 'x' }), null);
  });

  it('picks the same canonical ID on every device', () => {
    assert.equal(canonicalId('b', 'a'), 'a');
    assert.equal(canonicalId('a', 'b'), 'a');
  });

  it('combines check-in flags instead of losing one device', () => {
    const merged = mergeNatural(
      checkIns,
      { row: { id: 'x', date: '2026-10-05', workoutCompleted: true, nutritionCompleted: false, hydrationCompleted: false, streakDay: 3 }, changedAt: 100 },
      { row: { id: 'y', date: '2026-10-05', workoutCompleted: false, nutritionCompleted: false, hydrationCompleted: true, streakDay: 1 }, changedAt: 200 },
    );
    assert.equal(merged.workoutCompleted, true);
    assert.equal(merged.hydrationCompleted, true);
    assert.equal(merged.streakDay, 3);
  });

  it('keeps the latest version for other tables', () => {
    const sleep = tableConfig('sleep_entries')!;
    assert.equal(mergeNatural(sleep, { row: { minutes: 400 }, changedAt: 300 }, { row: { minutes: 450 }, changedAt: 200 }).minutes, 400);
    assert.equal(mergeNatural(sleep, { row: { minutes: 400 }, changedAt: 100 }, { row: { minutes: 450 }, changedAt: 200 }).minutes, 450);
  });
});

describe('orderForApply', () => {
  it('inserts parents before children and deletes children before parents', () => {
    const record = (table: string, deleted: boolean) => ({ table, id: table, deleted, payload: null, changedAt: 1, deviceId: 'd' });
    const ordered = orderForApply([
      record('logged_sets', false), record('workout_sessions', false), record('logged_exercises', false),
      record('workout_sessions', true), record('logged_sets', true),
    ]);
    assert.deepEqual(ordered.map(item => `${item.table}:${item.deleted ? 'del' : 'put'}`), [
      'workout_sessions:put', 'logged_exercises:put', 'logged_sets:put', 'logged_sets:del', 'workout_sessions:del',
    ]);
  });
});

describe('pickActive', () => {
  it('keeps the plan activated last', () => {
    assert.equal(pickActive([{ id: 'a', lastActivatedAt: 10 }, { id: 'b', lastActivatedAt: 20 }])?.id, 'b');
    assert.equal(pickActive([{ id: 'b', lastActivatedAt: null }, { id: 'a', lastActivatedAt: null }])?.id, 'a');
    assert.equal(pickActive([]), null);
  });
});
