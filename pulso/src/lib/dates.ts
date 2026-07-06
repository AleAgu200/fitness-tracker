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
