/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  buildBootstrap,
  remapExercises,
  summarizeTables,
  tablesFromExport,
  validateSnapshot,
  validateTables,
} from '../src/lib/backup-format';

const OWNER = 'u1';

function history() {
  return {
    athlete_profiles: [{ userId: OWNER, fullName: 'Ana López', initials: 'AL' }],
    onboarding_state: [{ userId: OWNER, status: 'completed' }],
    exercises: [{ id: 'ex_a', name: 'Press banca' }, { id: 'ex_b', name: 'Remo con mancuerna' }],
    programs: [{ id: 'p1', athleteId: OWNER, active: true, archivedAt: null }],
    workout_templates: [{ id: 't1', programId: 'p1' }],
    template_exercise_slots: [{ id: 'sl1', templateId: 't1', exerciseId: 'ex_a' }],
    workout_sessions: [{ id: 's1', athleteId: OWNER, templateId: 't1' }, { id: 's2', athleteId: OWNER, templateId: 't_deleted' }],
    logged_exercises: [{ id: 'le1', sessionId: 's1', exerciseId: 'ex_a', slotId: 'sl1' }, { id: 'le2', sessionId: 's2', exerciseId: 'ex_b', slotId: 'gone' }],
    logged_sets: [{ id: 'ls1', loggedExerciseId: 'le1' }, { id: 'ls2', loggedExerciseId: 'le2' }],
    meal_plans: [{ id: 'mp1', athleteId: OWNER, active: true }],
    meal_slots: [{ id: 'ms1', mealPlanId: 'mp1' }],
    meal_slot_skips: [{ id: 'sk1', slotId: 'ms1' }],
    consumptions: [{ id: 'c1', athleteId: OWNER }],
  };
}

describe('validateTables', () => {
  it('accepts a consistent history and clears only stale optional references', () => {
    const result = validateTables(history(), OWNER);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.clearedReferences, 2);
    assert.equal(result.tables.workout_sessions?.[1].templateId, null);
    assert.equal(result.tables.logged_exercises?.[1].slotId, null);
    assert.equal(result.tables.workout_sessions?.[0].templateId, 't1');
  });

  it('does not modify its input', () => {
    const input = history();
    validateTables(input, OWNER);
    assert.equal(input.workout_sessions[1].templateId, 't_deleted');
  });

  it("rejects another account's rows", () => {
    const input = history();
    input.consumptions.push({ id: 'c2', athleteId: 'intruder' });
    assert.deepEqual(validateTables(input, OWNER), { ok: false, problem: 'foreign_account', detail: 'consumptions' });
  });

  it('rejects a required reference to a missing parent', () => {
    const input = history();
    input.logged_sets.push({ id: 'ls3', loggedExerciseId: 'nowhere' });
    const result = validateTables(input, OWNER);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.problem, 'dangling_references');
  });

  it('rejects duplicate IDs and rows without a key', () => {
    const duplicated = history();
    duplicated.consumptions.push({ id: 'c1', athleteId: OWNER });
    assert.equal((validateTables(duplicated, OWNER) as { problem?: string }).problem, 'duplicate_ids');
    const keyless = history();
    (keyless.consumptions as Record<string, unknown>[]).push({ athleteId: OWNER });
    assert.equal((validateTables(keyless, OWNER) as { problem?: string }).problem, 'malformed_rows');
  });

  it('ignores unknown tables and refuses an empty history', () => {
    assert.equal((validateTables({ sessions_tokens: [{ id: 'x' }] }, OWNER) as { problem?: string }).problem, 'empty');
    const result = validateTables({ ...history(), auth_sessions: [{ id: 'tok' }] }, OWNER);
    assert.ok(result.ok && !('auth_sessions' in result.tables));
  });
});

describe('validateSnapshot', () => {
  const snapshot = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, owner: OWNER, tables: history(), settings: { weightUnit: 'lb', accentColor: 'javascript:x', themeMode: 'dark' } };

  it('checks format, version and owner before the tables', () => {
    assert.equal((validateSnapshot({ ...snapshot, format: 'other' }, OWNER) as { problem?: string }).problem, 'not_a_backup');
    assert.equal((validateSnapshot({ ...snapshot, formatVersion: 2 }, OWNER) as { problem?: string }).problem, 'unsupported_version');
    assert.equal((validateSnapshot(snapshot, 'u2') as { problem?: string }).problem, 'foreign_account');
  });

  it('keeps only valid personal settings', () => {
    const result = validateSnapshot(snapshot, OWNER);
    assert.ok(result.ok);
    assert.deepEqual(result.settings, { weightUnit: 'lb', themeMode: 'dark' });
  });
});

describe('remapExercises', () => {
  it('maps an exercise that exists locally under another ID by name', () => {
    const result = validateTables(history(), OWNER);
    assert.ok(result.ok);
    if (!result.ok) return;
    const { tables, remapped } = remapExercises(result.tables, [{ id: 'local_press', name: 'press banca ' }, { id: 'ex_b', name: 'Remo con mancuerna' }]);
    assert.equal(remapped, 1);
    assert.deepEqual(tables.exercises, []);
    assert.equal(tables.template_exercise_slots?.[0].exerciseId, 'local_press');
    assert.equal(tables.logged_exercises?.[0].exerciseId, 'local_press');
    assert.equal(tables.logged_exercises?.[1].exerciseId, 'ex_b');
  });

  it('keeps exercises the phone does not have', () => {
    const result = validateTables(history(), OWNER);
    assert.ok(result.ok);
    if (!result.ok) return;
    const { tables, remapped } = remapExercises(result.tables, []);
    assert.equal(remapped, 0);
    assert.equal(tables.exercises?.length, 2);
  });
});

describe('buildBootstrap and summarizeTables', () => {
  it('names the profile, onboarding status and active plans', () => {
    assert.deepEqual(buildBootstrap(history()), {
      profile: { fullName: 'Ana López' },
      onboardingStatus: 'completed',
      activeProgramId: 'p1',
      activeMealPlanId: 'mp1',
      hasGenerationPreferences: false,
    });
  });

  it('counts what the athlete recognises', () => {
    const summary = summarizeTables(history());
    assert.equal(summary.workouts, 2);
    assert.equal(summary.sets, 2);
    assert.equal(summary.plans, 2);
    assert.equal(summary.meals, 1);
  });
});

describe('tablesFromExport', () => {
  it('reads the phone section of a pulso-export v1 file and ignores the server section', () => {
    const exported = {
      format: 'pulso-export',
      version: 1,
      exportedAt: '2026-10-01T00:00:00.000Z',
      phone: {
        profile: { userId: OWNER, fullName: 'Ana' },
        bodyMeasurements: [{ id: 'bm1', athleteId: OWNER }],
        progressPhotos: [{ id: 'ph1', takenAt: 1 }],
        training: { exercises: [{ id: 'ex_a', name: 'Press banca' }], sessions: [{ id: 's1', athleteId: OWNER }], personalRecords: [{ id: 'pr1' }] },
        team: { sharingConsents: [{ id: 'grant', granted: true }] },
        nutrition: { consumptions: [{ id: 'c1', athleteId: OWNER }] },
      },
      server: { account: { email: 'ana@example.com' }, sessions: [{ token: 'secret' }] },
    };
    const result = tablesFromExport(exported);
    assert.ok(result.ok);
    if (!result.ok) return;
    const json = JSON.stringify(result.tables);
    assert.ok(!json.includes('secret') && !json.includes('ana@example.com') && !json.includes('grant') && !json.includes('pr1') && !json.includes('ph1'));
    const validated = validateTables(result.tables, OWNER);
    assert.ok(validated.ok);
    if (validated.ok) assert.equal(validated.tables.workout_sessions?.length, 1);
  });

  it('rejects other files and versions', () => {
    assert.deepEqual(tablesFromExport({ format: 'something' }), { ok: false, problem: 'not_an_export' });
    assert.deepEqual(tablesFromExport({ format: 'pulso-export', version: 2 }), { ok: false, problem: 'unsupported_version' });
    assert.deepEqual(tablesFromExport(null), { ok: false, problem: 'not_an_export' });
  });
});
