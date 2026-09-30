import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { draftFromNutrients, NutrientsEditor, nutrientsFromDraft } from '@/components/nutrition/nutrients-editor';
import { ChipRow, Sheet, SheetButton } from '@/components/nutrition/sheet';
import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  ConsumptionComponent,
  listRecentComponents,
  listSavedFoods,
  markFoodUsed,
  saveFood,
  SavedFoodItem,
} from '@/db/consumption';
import { FoodResult, searchFoods } from '@/lib/foods';
import {
  combineNutrients,
  formatNutrient,
  hasCoreNutrients,
  parseAmount,
  PhysicalUnit,
} from '@/lib/nutrition-math';

export const MEAL_LABELS = ['DESAYUNO', 'MERIENDA AM', 'ALMUERZO', 'MERIENDA PM', 'CENA', 'OTRO'] as const;

/** A sensible default meal from the time of day; always changeable. */
export function mealLabelForNow(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 10) return 'DESAYUNO';
  if (hour < 12) return 'MERIENDA AM';
  if (hour < 15) return 'ALMUERZO';
  if (hour < 18) return 'MERIENDA PM';
  return 'CENA';
}

interface Draft extends ConsumptionComponent {
  key: string;
  servingLabel: string | null;
  servingAmount: number | null;
  savedFoodId: string | null;
  amountText: string;
}

function fromCatalog(food: FoodResult): Draft {
  return {
    key: `catalog:${food.source}:${food.id}`,
    name: food.name,
    source: 'catalog',
    sourceRef: `${food.source}:${food.id}`,
    basis: { amount: 100, unit: 'g' },
    nutrientsPerBasis: { kcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG },
    amount: 100,
    unit: 'g',
    servingLabel: null,
    servingAmount: null,
    savedFoodId: null,
    amountText: '100',
  };
}

function fromSaved(food: SavedFoodItem): Draft {
  const amount = food.servingAmount ?? food.basis.amount;
  return {
    key: `saved:${food.id}`,
    name: food.brand ? `${food.name} · ${food.brand}` : food.name,
    source: 'library',
    sourceRef: food.id,
    basis: food.basis,
    nutrientsPerBasis: food.nutrients,
    amount,
    unit: food.basis.unit,
    servingLabel: food.servingLabel,
    servingAmount: food.servingAmount,
    savedFoodId: food.id,
    amountText: String(amount),
  };
}

function fromRecent(component: ConsumptionComponent, index: number): Draft {
  return {
    ...component,
    key: `recent:${index}:${component.name}`,
    servingLabel: null,
    servingAmount: null,
    savedFoodId: component.source === 'library' ? component.sourceRef ?? null : null,
    amountText: String(component.amount),
  };
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .includes(query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
}

/**
 * Logs what was eaten: pick foods (Mis alimentos and recents work offline, the
 * catalog when online, or type one by hand), set the quantity, confirm.
 * Nothing is recorded until "Lo consumí"; nutrients are computed, not typed,
 * whenever the food is known.
 */
export function FoodLogger({ visible, onClose, dateLabel, mode, fixedMealLabel, initialFood, onSubmit }: {
  visible: boolean;
  onClose: () => void;
  dateLabel: string;
  mode: 'extra' | 'replace';
  /** Replacing a planned meal keeps its label. */
  fixedMealLabel?: string;
  /** Start with this saved food selected (from Mis alimentos). */
  initialFood?: SavedFoodItem | null;
  onSubmit: (components: ConsumptionComponent[], mealLabel: string) => Promise<void>;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<SavedFoodItem[]>([]);
  const [recent, setRecent] = useState<ConsumptionComponent[]>([]);
  const [catalog, setCatalog] = useState<FoodResult[]>([]);
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [items, setItems] = useState<Draft[]>(() => (initialFood ? [fromSaved(initialFood)] : []));
  const [mealLabel, setMealLabel] = useState(fixedMealLabel ?? mealLabelForNow());
  const [manual, setManual] = useState<null | { name: string; unit: PhysicalUnit; basisText: string; draft: ReturnType<typeof draftFromNutrients>; save: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    Promise.all([listSavedFoods(userId), listRecentComponents(userId)])
      .then(([savedFoods, recentFoods]) => { setSaved(savedFoods); setRecent(recentFoods); })
      .catch(e => console.error('[food-logger]', e));
  }, [userId]);
  useEffect(() => { if (visible) load(); }, [visible, load]);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setCatalogState('loading');
      searchFoods(q, controller.signal)
        .then(results => { setCatalog(results); setCatalogState('idle'); })
        .catch(() => { if (!controller.signal.aborted) { setCatalog([]); setCatalogState('error'); } });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);

  const savedMatches = useMemo(() => (q ? saved.filter(food => matches(`${food.name} ${food.brand ?? ''}`, q)) : saved).slice(0, 8), [saved, q]);
  const recentMatches = useMemo(() => (q ? recent.filter(food => matches(food.name, q)) : recent).slice(0, 6), [recent, q]);

  function add(draft: Draft) {
    setItems(current => (current.some(item => item.key === draft.key) ? current : [...current, draft]));
    setQuery('');
    setCatalog([]);
  }

  function setAmount(key: string, text: string) {
    setItems(current => current.map(item => {
      if (item.key !== key) return item;
      const amount = parseAmount(text);
      return { ...item, amountText: text, amount: amount ?? 0 };
    }));
  }

  const valid = items.length > 0 && items.every(item => item.amount > 0);
  const preview = valid ? combineNutrients(items) : null;

  function addManual() {
    if (!manual) return;
    const basisAmount = parseAmount(manual.basisText);
    if (!manual.name.trim() || !basisAmount) { setError('Poné un nombre y la base (por ejemplo 100 g).'); return; }
    const nutrients = nutrientsFromDraft(manual.draft);
    const key = `manual:${Date.now()}`;
    const draft: Draft = {
      key,
      name: manual.name.trim(),
      source: 'manual',
      sourceRef: null,
      basis: { amount: basisAmount, unit: manual.unit },
      nutrientsPerBasis: nutrients,
      amount: basisAmount,
      unit: manual.unit,
      servingLabel: null,
      servingAmount: null,
      savedFoodId: null,
      amountText: String(basisAmount),
    };
    if (manual.save && userId) {
      saveFood(userId, { name: draft.name, source: 'manual', basis: draft.basis, nutrients })
        .then(id => setItems(current => current.map(item => (item.key === key ? { ...item, savedFoodId: id, source: 'library', sourceRef: id } : item))))
        .catch(e => console.error('[food-save]', e));
    }
    setItems(current => [...current, draft]);
    setManual(null);
    setError(null);
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const components: ConsumptionComponent[] = items.map(({ name, source, sourceRef, basis, amount, unit, nutrientsPerBasis }) => ({
        name, source, sourceRef: sourceRef ?? null, basis, amount, unit, nutrientsPerBasis,
      }));
      await onSubmit(components, mealLabel);
      if (userId) await Promise.all(items.filter(item => item.savedFoodId).map(item => markFoodUsed(userId, item.savedFoodId!)));
      setItems([]);
      onClose();
    } catch (e) {
      console.error('[food-log]', e);
      setError('No se pudo registrar. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const row = (key: string, title: string, detail: string, onPress: () => void, tag?: string) => (
    <PressableScale
      key={key}
      onPress={onPress}
      accessibilityHint="Agrega este alimento"
      style={{ borderTopWidth: 1, borderTopColor: C.borderLight, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: C.bgEl, gap: 2 }}
    >
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }} numberOfLines={2}>{title}</Text>
        {tag && <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.8, color: C.textTertiary }}>{tag}</Text>}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>{detail}</Text>
    </PressableScale>
  );

  const perBasis = (nutrients: ConsumptionComponent['nutrientsPerBasis'], amount: number, unit: string) =>
    `por ${amount} ${unit} · ${formatNutrient('kcal', nutrients.kcal)} · P ${formatNutrient('proteinG', nutrients.proteinG)}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow={dateLabel}
      title={mode === 'replace' ? `¿Qué comiste en ${fixedMealLabel?.toLowerCase() ?? 'esta comida'}?` : 'Agregar lo que comiste'}
    >
      {!manual && (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscá: pollo, frijoles, baleadas…"
            placeholderTextColor={C.textTertiary}
            autoCorrect={false}
            accessibilityLabel="Buscar alimento"
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 11, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
          />

          {savedMatches.length > 0 && (
            <View>
              <Label style={{ marginBottom: 4 }}>MIS ALIMENTOS</Label>
              {savedMatches.map(food => row(`s:${food.id}`, food.brand ? `${food.name} · ${food.brand}` : food.name,
                perBasis(food.nutrients, food.basis.amount, food.basis.unit), () => add(fromSaved(food)), food.favorite ? '★' : undefined))}
            </View>
          )}

          {recentMatches.length > 0 && (
            <View>
              <Label style={{ marginBottom: 4 }}>RECIENTES</Label>
              {recentMatches.map((food, i) => row(`r:${i}`, food.name, perBasis(food.nutrientsPerBasis, food.basis.amount, food.basis.unit), () => add(fromRecent(food, i))))}
            </View>
          )}

          {q.length >= 2 && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Label>CATÁLOGO</Label>
                {catalogState === 'loading' && <ActivityIndicator size="small" color={C.textTertiary} />}
              </View>
              {catalogState === 'error' && (
                <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textSecondary }}>
                  Sin conexión con el catálogo. Podés usar Mis alimentos o escribirlo a mano.
                </Text>
              )}
              {catalogState === 'idle' && catalog.length === 0 && (
                <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textSecondary }}>{`No encontramos “${q}” en el catálogo.`}</Text>
              )}
              {catalog.slice(0, 8).map(food => row(`c:${food.source}:${food.id}`, food.name,
                perBasis({ kcal: food.kcal, proteinG: food.proteinG }, 100, 'g'), () => add(fromCatalog(food)), food.source === 'pulso' ? 'PULSO' : 'USDA'))}
            </View>
          )}

          <PressableScale
            onPress={() => setManual({ name: q, unit: 'g', basisText: '100', draft: draftFromNutrients({}), save: true })}
            style={{ minHeight: 40, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>+ NO ESTÁ · ESCRIBIRLO A MANO</Text>
          </PressableScale>
        </>
      )}

      {manual && (
        <Animated.View entering={FadeIn.duration(150)} style={{ gap: 10, borderWidth: 1, borderColor: C.border, padding: 12, backgroundColor: C.bgEl }}>
          <Label>NOMBRE</Label>
          <TextInput
            value={manual.name}
            onChangeText={name => setManual({ ...manual, name })}
            placeholder="Yogur natural"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel="Nombre del alimento"
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
          />
          <Label>LOS VALORES SON POR</Label>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={manual.basisText}
              onChangeText={basisText => setManual({ ...manual, basisText: basisText.replace(/[^0-9.,]/g, '') })}
              keyboardType="decimal-pad"
              accessibilityLabel="Cantidad de referencia"
              style={{ width: 90, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13 }}
            />
            <ChipRow options={[{ key: 'g', label: 'g' }, { key: 'ml', label: 'ml' }]} value={manual.unit} onChange={unit => setManual({ ...manual, unit })} accent={accent} label="Unidad" />
          </View>
          <NutrientsEditor draft={manual.draft} onChange={draft => setManual({ ...manual, draft })} basisLabel={`por ${manual.basisText || '?'} ${manual.unit}`} />
          <PressableScale
            onPress={() => setManual({ ...manual, save: !manual.save })}
            accessibilityRole="checkbox"
            selected={manual.save}
            style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 40 }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: manual.save ? accent : C.textTertiary }}>{manual.save ? '■' : '□'}</Text>
            <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textSecondary }}>Guardar en Mis alimentos</Text>
          </PressableScale>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SheetButton label="AGREGAR" onPress={addManual} primary />
            <SheetButton label="VOLVER" onPress={() => setManual(null)} />
          </View>
        </Animated.View>
      )}

      {items.length > 0 && !manual && (
        <View style={{ gap: 8 }}>
          <Label>CANTIDAD</Label>
          {items.map(item => (
            <View key={item.key} style={{ borderWidth: 1, borderColor: C.border, padding: 10, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }} numberOfLines={2}>{item.name}</Text>
                <TextInput
                  value={item.amountText}
                  onChangeText={text => setAmount(item.key, text.replace(/[^0-9.,]/g, ''))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Cantidad de ${item.name} en ${item.unit}`}
                  style={{ width: 70, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 7, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13, textAlign: 'center' }}
                />
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, width: 18 }}>{item.unit}</Text>
                <PressableScale
                  onPress={() => setItems(current => current.filter(other => other.key !== item.key))}
                  accessibilityLabel={`Quitar ${item.name}`}
                  style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>✕</Text>
                </PressableScale>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[
                  ...(item.servingAmount ? [
                    { label: `½ ${item.servingLabel ?? 'PORCIÓN'}`, amount: item.servingAmount / 2 },
                    { label: `1 ${item.servingLabel ?? 'PORCIÓN'}`, amount: item.servingAmount },
                    { label: `2 ${item.servingLabel ?? 'PORCIONES'}`, amount: item.servingAmount * 2 },
                  ] : []),
                  { label: `${item.basis.amount} ${item.unit}`, amount: item.basis.amount },
                ].map(option => (
                  <PressableScale
                    key={option.label}
                    onPress={() => setAmount(item.key, String(option.amount))}
                    style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: item.amount === option.amount ? accent : C.border }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>{option.label.toUpperCase()}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {items.length > 0 && !manual && mode === 'extra' && (
        <View style={{ gap: 6 }}>
          <Label>COMIDA</Label>
          <ChipRow options={MEAL_LABELS.map(label => ({ key: label, label }))} value={mealLabel as typeof MEAL_LABELS[number]} onChange={setMealLabel} accent={accent} label="Comida" />
        </View>
      )}

      {preview && !manual && (
        <View style={{ borderWidth: 1, borderColor: accent, padding: 10, gap: 3 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: C.textPrimary }}>
            {`${formatNutrient('kcal', preview.kcal)} · P ${formatNutrient('proteinG', preview.proteinG)} · C ${formatNutrient('carbsG', preview.carbsG)} · G ${formatNutrient('fatG', preview.fatG)}`}
          </Text>
          {!hasCoreNutrients(preview) && (
            <Text style={{ fontFamily: F.inter, fontSize: 11, color: C.orange }}>Faltan datos de algún alimento: se registra igual y se marca incompleto.</Text>
          )}
        </View>
      )}

      {error && <Text accessibilityRole="alert" style={{ fontFamily: F.inter, fontSize: 12, color: C.red }}>{error}</Text>}

      {!manual && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SheetButton
            label={busy ? 'GUARDANDO…' : mode === 'replace' ? 'REGISTRAR SUSTITUCIÓN' : 'LO CONSUMÍ'}
            onPress={() => void submit()}
            primary
            accent={accent}
            disabled={!valid || busy}
          />
          <SheetButton label="CANCELAR" onPress={onClose} />
        </View>
      )}
    </Sheet>
  );
}
