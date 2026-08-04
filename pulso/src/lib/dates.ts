// Local-timezone date helpers — all app dates are 'YYYY-MM-DD' strings

export function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return dateStr(new Date());
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Start of the day, local time */
export function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday of the week containing `d` */
export function mondayOf(d: Date): Date {
  const c = dayStart(d);
  const dow = (c.getDay() + 6) % 7; // 0 = Monday
  return addDays(c, -dow);
}

/** 1 = Sunday .. 7 = Saturday — matches trainingDays in lib/notifications.ts and
 *  workout_templates.weekday, so this is the one convention for "day of week" in the app. */
export function weekdayOf(d: Date): number {
  return d.getDay() + 1;
}

/** Monday-first display order using the weekdayOf() numbering above */
export const WEEKDAY_DISPLAY_ORDER = [2, 3, 4, 5, 6, 7, 1];

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'DOM', 2: 'LUN', 3: 'MAR', 4: 'MIÉ', 5: 'JUE', 6: 'VIE', 7: 'SÁB',
};

export const WEEKDAY_SHORT_LABELS: Record<number, string> = {
  1: 'D', 2: 'L', 3: 'M', 4: 'X', 5: 'J', 6: 'V', 7: 'S',
};
