export const OVERVIEW_PERIODS = [7, 28, 90] as const;
export type OverviewPeriod = typeof OVERVIEW_PERIODS[number];

/**
 * What a category's progress block may show. Never a zero chart in place of a
 * missing permission: `revoked` and `not_authorized` are distinct from `empty`
 * (granted, but nothing synced in the period).
 */
export type ProgressState = "ok" | "empty" | "revoked" | "not_authorized";

export function progressState(permission: "granted" | "revoked" | "not_authorized", daysWithData: number): ProgressState {
  if (permission !== "granted") return permission;
  return daysWithData > 0 ? "ok" : "empty";
}

export function parseOverviewPeriod(raw: string | null): OverviewPeriod | null {
  const value = Number(raw ?? 28);
  return (OVERVIEW_PERIODS as readonly number[]).includes(value) ? value as OverviewPeriod : null;
}
