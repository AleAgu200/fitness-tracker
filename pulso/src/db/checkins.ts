import { and, desc, eq, gte } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { addDays, dateStr, mondayOf, todayStr } from '@/lib/dates';
import { db } from './index';
import { dailyCheckIns } from './schema';

export interface CheckInFlags {
  workoutCompleted?: boolean;
  nutritionCompleted?: boolean;
  hydrationCompleted?: boolean;
}

export async function upsertTodayCheckIn(athleteId: string, flags: CheckInFlags): Promise<void> {
  const date = todayStr();
  const rows = await db
    .select({ id: dailyCheckIns.id })
    .from(dailyCheckIns)
    .where(and(eq(dailyCheckIns.athleteId, athleteId), eq(dailyCheckIns.date, date)))
    .limit(1);
  if (rows[0]) {
    await db.update(dailyCheckIns).set(flags).where(eq(dailyCheckIns.id, rows[0].id));
  } else {
    await db.insert(dailyCheckIns).values({
      id: nanoid(),
      athleteId,
      date,
      workoutCompleted: flags.workoutCompleted ?? false,
      nutritionCompleted: flags.nutritionCompleted ?? false,
      hydrationCompleted: flags.hydrationCompleted ?? false,
      streakDay: 0,
    });
  }
}

function qualifies(c: { workoutCompleted: boolean; nutritionCompleted: boolean; hydrationCompleted: boolean }): boolean {
  return c.workoutCompleted || c.nutritionCompleted || c.hydrationCompleted;
}

/** Consecutive qualifying days ending today (or yesterday if today is still pending) */
export async function computeStreak(athleteId: string): Promise<number> {
  const rows = await db
    .select()
    .from(dailyCheckIns)
    .where(eq(dailyCheckIns.athleteId, athleteId))
    .orderBy(desc(dailyCheckIns.date))
    .limit(400);

  const byDate = new Map(rows.map(r => [r.date, r]));
  let streak = 0;
  let cursor = new Date();

  // Today may still be in progress — start counting from yesterday if today doesn't qualify yet
  const today = byDate.get(todayStr());
  if (today && qualifies(today)) {
    streak = 1;
  }
  cursor = addDays(cursor, -1);

  for (let i = 0; i < 400; i++) {
    const c = byDate.get(dateStr(cursor));
    if (!c || !qualifies(c)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface WeekDay {
  label: string;
  done: boolean;
  isToday: boolean;
}

const WEEK_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Monday-first indicators for the current week */
export async function getWeekDays(athleteId: string): Promise<WeekDay[]> {
  const monday = mondayOf(new Date());
  const dates = Array.from({ length: 7 }, (_, i) => dateStr(addDays(monday, i)));
  const rows = await db
    .select()
    .from(dailyCheckIns)
    .where(and(eq(dailyCheckIns.athleteId, athleteId), gte(dailyCheckIns.date, dates[0])));
  const byDate = new Map(rows.map(r => [r.date, r]));
  const today = todayStr();
  return dates.map((d, i) => {
    const c = byDate.get(d);
    return { label: WEEK_LABELS[i], done: !!c && qualifies(c), isToday: d === today };
  });
}

/** 12-week heatmap, columns = weeks (oldest first), rows = Mon..Sun. 0..3 intensity */
export async function getHeatmap(athleteId: string): Promise<number[][]> {
  const thisMonday = mondayOf(new Date());
  const firstMonday = addDays(thisMonday, -7 * 11);
  const rows = await db
    .select()
    .from(dailyCheckIns)
    .where(and(
      eq(dailyCheckIns.athleteId, athleteId),
      gte(dailyCheckIns.date, dateStr(firstMonday)),
    ));
  const byDate = new Map(rows.map(r => [r.date, r]));

  const cols: number[][] = [];
  for (let w = 0; w < 12; w++) {
    const col: number[] = [];
    for (let d = 0; d < 7; d++) {
      const c = byDate.get(dateStr(addDays(firstMonday, w * 7 + d)));
      if (!c || !qualifies(c)) { col.push(0); continue; }
      let v = 1;
      if (c.workoutCompleted) v += 1;
      if (c.nutritionCompleted && c.hydrationCompleted) v += 1;
      col.push(v);
    }
    cols.push(col);
  }
  return cols;
}
