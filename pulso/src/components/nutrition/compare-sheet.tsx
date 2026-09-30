import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Label, PressableScale, Segmented } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { listSavedFoods, SavedFoodItem } from '@/db/consumption';
import { formatNutrient, NUTRIENT_LABEL, NUTRIENT_UNIT, NutrientKey } from '@/lib/nutrition-math';
import { ComparableFood, compareFoods } from '@/lib/nutrition-planning';

import { Sheet } from './sheet';

export interface CompareSubject extends ComparableFood {
  /** The saved food it is, so it isn't offered against itself. */
  id?: string | null;
  /** The amount being considered, or its named portion. */
  portion?: { amount: number; label: string } | null;
}

type Mode = 'reference' | 'portion';

function portionOf(food: CompareSubject): { amount: number; label: string } {
  return food.portion ?? { amount: food.basis.amount, label: `${food.basis.amount} ${food.basis.unit}` };
}

function subjectOf(food: SavedFoodItem): CompareSubject {
  return {
    id: food.id,
    name: food.brand ? `${food.name} · ${food.brand}` : food.name,
    basis: food.basis,
    nutrients: food.nutrients,
    portion: food.servingAmount ? { amount: food.servingAmount, label: `1 ${food.servingLabel || 'porción'}` } : null,
  };
}

function formatDifference(key: NutrientKey, value: number | null): string {
  if (value == null) return '—';
  if (Math.abs(value) < (NUTRIENT_UNIT[key] === 'g' ? 0.05 : 0.5)) return '=';
  return `${value > 0 ? '+' : '−'}${formatNutrient(key, Math.abs(value))}`;
}

/**
 * Two products side by side, on the same basis (per 100 g/ml) or each by its
 * own portion. Only compatible units are compared and no score is derived:
 * the athlete decides what matters. Nothing is saved from here.
 */
export function CompareSheet({ subject, onClose }: { subject: CompareSubject; onClose: () => void }) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const [foods, setFoods] = useState<SavedFoodItem[] | null>(null);
  const [other, setOther] = useState<CompareSubject | null>(null);
  const [mode, setMode] = useState<Mode>('reference');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!userId) return;
    listSavedFoods(userId).then(setFoods).catch(e => console.error('[compare-foods]', e));
  }, [userId]);

  const unit = subject.basis.unit;
  const candidates = (foods ?? []).filter(food => food.id !== subject.id
    && (!query.trim() || `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())));
  const comparison = other
    ? mode === 'reference'
      ? compareFoods(subject, other, 100)
      : compareFoods(subject, other, portionOf(subject).amount, portionOf(other).amount)
    : null;

  return (
    <Sheet visible onClose={onClose} eyebrow="COMPARAR · NO SE GUARDA" title={subject.name}>
      {!other ? (
        <>
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
            {`Elegí otro producto de Mis alimentos. Solo se comparan productos medidos en ${unit}: sin su densidad, gramos y mililitros no se pueden convertir.`}
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar en mis alimentos"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel="Buscar producto para comparar"
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
          />
          {foods && !candidates.length && (
            <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textTertiary }}>No hay otros productos guardados para comparar.</Text>
          )}
          {candidates.map(food => {
            const compatible = food.basis.unit === unit;
            return (
              <PressableScale
                key={food.id}
                onPress={() => setOther(subjectOf(food))}
                disabled={!compatible}
                accessibilityHint={compatible ? 'Comparar con este producto' : `Está en ${food.basis.unit}; no se puede comparar`}
                style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10, gap: 2, opacity: compatible ? 1 : 0.45 }}
              >
                <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{food.brand ? `${food.name} · ${food.brand}` : food.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
                  {compatible ? `por ${food.basis.amount} ${food.basis.unit} · ${formatNutrient('kcal', food.nutrients.kcal)}` : `EN ${food.basis.unit.toUpperCase()} · NO COMPARABLE`}
                </Text>
              </PressableScale>
            );
          })}
        </>
      ) : (
        <>
          <Segmented
            options={[{ key: 'reference', label: `POR 100 ${unit.toUpperCase()}` }, { key: 'portion', label: 'POR PORCIÓN' }]}
            value={mode}
            onChange={setMode}
            accent={accent}
            compact
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1.1 }} />
            {[subject, other].map((food, i) => (
              <View key={i} style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ fontFamily: F.interSemi, fontSize: 11, color: C.textPrimary, textAlign: 'right' }}>{food.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textAlign: 'right' }}>
                  {mode === 'reference' ? `100 ${unit}` : `${portionOf(food).label}${food.portion ? ` · ${Math.round(portionOf(food).amount)} ${unit}` : ''}`}
                </Text>
              </View>
            ))}
            <View style={{ flex: 0.8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textAlign: 'right' }}>DIFERENCIA</Text>
            </View>
          </View>
          {comparison?.rows.map(row => (
            <View key={row.key} style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 7 }}>
              <Text style={{ flex: 1.1, fontFamily: F.inter, fontSize: 12, color: C.textSecondary }}>{NUTRIENT_LABEL[row.key]}</Text>
              <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 11, color: C.textPrimary, textAlign: 'right' }}>{formatNutrient(row.key, row.a)}</Text>
              <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 11, color: C.textPrimary, textAlign: 'right' }}>{formatNutrient(row.key, row.b)}</Text>
              <Text style={{ flex: 0.8, fontFamily: F.mono, fontSize: 11, color: C.textTertiary, textAlign: 'right' }}>{formatDifference(row.key, row.difference)}</Text>
            </View>
          ))}
          <Label>CÓMO LEERLO</Label>
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary }}>
            {mode === 'reference'
              ? 'Misma cantidad de cada producto. La diferencia es el segundo menos el primero; no indica cuál es mejor.'
              : 'Cada producto con su porción, que pueden ser de tamaño distinto. “—” = la etiqueta no trae ese dato.'}
          </Text>
          <PressableScale onPress={() => setOther(null)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.textSecondary }}>COMPARAR CON OTRO</Text>
          </PressableScale>
        </>
      )}
    </Sheet>
  );
}
