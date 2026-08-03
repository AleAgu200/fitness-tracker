import * as SecureStore from 'expo-secure-store';

export type WeightUnit = 'kg' | 'lb';

export const ACCENT_PRESETS = [
  { key: 'yellow', label: 'Amarillo', hex: '#E8FF59' },
  { key: 'cyan', label: 'Cian', hex: '#3DDCFF' },
  { key: 'coral', label: 'Coral', hex: '#FF3D5A' },
  { key: 'orange', label: 'Naranja', hex: '#FFA62B' },
  { key: 'mint', label: 'Menta', hex: '#42FFB0' },
  { key: 'violet', label: 'Violeta', hex: '#B98CFF' },
] as const;

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].hex;
export const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

const weightUnitKey = 'pulso_weight_unit';
const accentColorKey = 'pulso_accent_color';

export async function loadWeightUnit(): Promise<WeightUnit> {
  const saved = await SecureStore.getItemAsync(weightUnitKey);
  return saved === 'lb' ? 'lb' : DEFAULT_WEIGHT_UNIT;
}

export async function setWeightUnit(unit: WeightUnit): Promise<void> {
  await SecureStore.setItemAsync(weightUnitKey, unit);
}

export async function loadAccentColor(): Promise<string> {
  const saved = await SecureStore.getItemAsync(accentColorKey);
  const known = ACCENT_PRESETS.some(preset => preset.hex === saved);
  return known && saved ? saved : DEFAULT_ACCENT;
}

export async function setAccentColor(hex: string): Promise<void> {
  await SecureStore.setItemAsync(accentColorKey, hex);
}
