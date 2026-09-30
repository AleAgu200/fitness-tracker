import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import {
  CORE_NUTRIENTS,
  energyLooksInconsistent,
  NUTRIENT_KEYS,
  NUTRIENT_LABEL,
  NUTRIENT_UNIT,
  NutrientKey,
  Nutrients,
  parseAmount,
} from '@/lib/nutrition-math';

/** Text state for the fields; empty = unknown, never zero. */
export type NutrientDraft = Record<NutrientKey, string>;

export function draftFromNutrients(nutrients: Nutrients): NutrientDraft {
  return Object.fromEntries(NUTRIENT_KEYS.map(key => {
    const value = nutrients[key];
    return [key, typeof value === 'number' ? String(Math.round(value * 100) / 100) : ''];
  })) as NutrientDraft;
}

export function nutrientsFromDraft(draft: NutrientDraft): Nutrients {
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    const value = parseAmount(draft[key]);
    // Core values are always present (null = unknown); optional ones only when typed.
    if (value != null || CORE_NUTRIENTS.includes(key)) out[key] = value;
  }
  return out;
}

const OPTIONAL = NUTRIENT_KEYS.filter(key => !CORE_NUTRIENTS.includes(key));

/**
 * Manual nutrient entry — the advanced path. Energy and macros first; fibre,
 * sugars, saturated fat and sodium behind a toggle. Energy may be typed in kJ.
 */
export function NutrientsEditor({ draft, onChange, basisLabel }: {
  draft: NutrientDraft;
  onChange: (draft: NutrientDraft) => void;
  basisLabel: string;
}) {
  const C = useColors();
  const [showOptional, setShowOptional] = useState(OPTIONAL.some(key => draft[key] !== ''));
  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kJ'>('kcal');
  const [kjText, setKjText] = useState('');

  const field = (key: NutrientKey) => (
    <View key={key} style={{ width: '48%', gap: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: C.textTertiary }}>
        {`${NUTRIENT_LABEL[key].toUpperCase()} (${NUTRIENT_UNIT[key]})`}
      </Text>
      <TextInput
        value={draft[key]}
        onChangeText={text => onChange({ ...draft, [key]: text.replace(/[^0-9.,]/g, '') })}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={C.textTertiary}
        accessibilityLabel={`${NUTRIENT_LABEL[key]} en ${NUTRIENT_UNIT[key]}, ${basisLabel}. Vacío si no se conoce.`}
        style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13 }}
      />
    </View>
  );

  const inconsistent = energyLooksInconsistent(nutrientsFromDraft(draft));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>{`NUTRIENTES · ${basisLabel.toUpperCase()}`}</Label>
        <PressableScale
          onPress={() => setEnergyUnit(unit => (unit === 'kcal' ? 'kJ' : 'kcal'))}
          accessibilityLabel={`Energía en ${energyUnit}. Cambiar unidad`}
          style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: C.border }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>{`ENERGÍA EN ${energyUnit.toUpperCase()}`}</Text>
        </PressableScale>
      </View>
      {energyUnit === 'kJ' && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: C.textTertiary }}>ENERGÍA (kJ)</Text>
          <TextInput
            value={kjText}
            onChangeText={text => {
              const clean = text.replace(/[^0-9.,]/g, '');
              setKjText(clean);
              const kj = parseAmount(clean);
              onChange({ ...draft, kcal: kj == null ? '' : String(Math.round((kj / 4.184) * 10) / 10) });
            }}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel={`Energía en kilojulios, ${basisLabel}`}
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13 }}
          />
          <Text style={{ fontFamily: F.inter, fontSize: 11, color: C.textTertiary }}>Se guarda convertido a kcal.</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        {CORE_NUTRIENTS.filter(key => energyUnit === 'kcal' || key !== 'kcal').map(field)}
        {showOptional && OPTIONAL.map(field)}
      </View>
      {!showOptional && (
        <PressableScale onPress={() => setShowOptional(true)} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>+ FIBRA, AZÚCARES, SATURADAS Y SODIO</Text>
        </PressableScale>
      )}
      {inconsistent && (
        <Text accessibilityRole="alert" style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.orange }}>
          La energía no coincide con los macros. Revisá si la etiqueta estaba en kJ o si falta un valor.
        </Text>
      )}
      <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary }}>
        Dejá vacío lo que no sepas: queda como desconocido, no como cero.
      </Text>
    </View>
  );
}
