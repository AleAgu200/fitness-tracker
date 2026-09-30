import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { markFoodUsed, SavedFoodItem } from '@/db/consumption';
import { planFood } from '@/db/nutrition';
import { todayStr } from '@/lib/dates';
import { combineNutrients, formatNutrient, parseAmount } from '@/lib/nutrition-math';

import { DayFitPreview } from './day-fit';
import { MEAL_LABELS, mealLabelForNow } from './food-logger';
import { describePlanTarget, PlanDatePicker, PlanTarget } from './plan-date-picker';
import { ChipRow, Sheet, SheetButton } from './sheet';

/**
 * Plans a saved food for a date (or every week, when asked). Shows how the
 * day's plan would change before saving; planning never logs consumption.
 */
export function PlanFoodSheet({ food, onClose, onPlanned }: {
  food: SavedFoodItem;
  onClose: () => void;
  onPlanned: (message: string, date: string, repeatWeekly: boolean) => void;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const unit = food.basis.unit;
  const [amountText, setAmountText] = useState(String(food.servingAmount ?? food.basis.amount));
  const [mealLabel, setMealLabel] = useState(mealLabelForNow());
  const [target, setTarget] = useState<PlanTarget>({ date: todayStr(), repeatWeekly: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const name = food.brand ? `${food.name} · ${food.brand}` : food.name;
  const totals = amount ? combineNutrients([{ nutrientsPerBasis: food.nutrients, basis: food.basis, amount, unit }]) : null;
  const input = { backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13 } as const;

  async function confirm() {
    if (!userId || !amount || !totals) return;
    setBusy(true);
    setError(null);
    try {
      await planFood(userId, {
        date: target.date,
        repeatWeekly: target.repeatWeekly,
        mealLabel,
        description: `${name} (${Math.round(amount)} ${unit})`,
        nutrients: totals,
      });
      await markFoodUsed(userId, food.id);
      onPlanned(`Planificado para ${describePlanTarget(target)}. No se registró como consumido.`, target.date, target.repeatWeekly);
      onClose();
    } catch (e) {
      console.error('[plan-food]', e);
      setError('No se pudo planificar. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const options = [
    ...(food.servingAmount ? [
      { label: `½ ${food.servingLabel || 'porción'}`, value: food.servingAmount / 2 },
      { label: `1 ${food.servingLabel || 'porción'}`, value: food.servingAmount },
    ] : []),
    { label: `${food.basis.amount} ${unit}`, value: food.basis.amount },
  ];

  return (
    <Sheet visible onClose={onClose} eyebrow="PLANIFICAR · NO SE REGISTRA" title={name}>
      <Label>CANTIDAD</Label>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={amountText}
          onChangeText={text => setAmountText(text.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          accessibilityLabel={`Cantidad en ${unit}`}
          style={{ ...input, width: 90 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary }}>{unit}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map(option => (
          <PressableScale
            key={option.label}
            onPress={() => setAmountText(String(option.value))}
            style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: amount === option.value ? accent : C.border }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>{option.label.toUpperCase()}</Text>
          </PressableScale>
        ))}
      </View>
      {totals && (
        <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: C.textPrimary }}>
          {`${formatNutrient('kcal', totals.kcal)} · P ${formatNutrient('proteinG', totals.proteinG)} · C ${formatNutrient('carbsG', totals.carbsG)} · G ${formatNutrient('fatG', totals.fatG)}`}
        </Text>
      )}
      <Label>COMIDA</Label>
      <ChipRow options={MEAL_LABELS.map(label => ({ key: label, label }))} value={mealLabel as typeof MEAL_LABELS[number]} onChange={setMealLabel} accent={accent} label="Comida" />
      <Label>¿CUÁNDO?</Label>
      <PlanDatePicker value={target} onChange={setTarget} accent={accent} />
      <DayFitPreview date={target.date} basis="planned" addition={totals} repeatWeekly={target.repeatWeekly} />
      {error && <Text accessibilityRole="alert" style={{ fontFamily: F.inter, fontSize: 12, color: C.red }}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SheetButton
          label={busy ? 'GUARDANDO…' : target.repeatWeekly ? 'AGREGAR A LA SEMANA' : 'AGREGAR A ESA FECHA'}
          onPress={() => void confirm()}
          primary
          accent={accent}
          disabled={!amount || busy}
        />
      </View>
    </Sheet>
  );
}
