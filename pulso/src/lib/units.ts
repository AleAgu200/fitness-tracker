import { WeightUnit } from '@/lib/settings';

const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Converts a kg value to the display unit, rounded to 1 decimal. */
export function displayWeight(kg: number, unit: WeightUnit): number {
  const value = unit === 'lb' ? kgToLb(kg) : kg;
  return Math.round(value * 10) / 10;
}

/** Converts a value typed in the display unit back to kg for storage. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? lbToKg(value) : value;
}

/** Formats a kg value as "123.4 kg" / "272.2 lb" in the given unit. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${displayWeight(kg, unit).toFixed(1)} ${unit}`;
}
