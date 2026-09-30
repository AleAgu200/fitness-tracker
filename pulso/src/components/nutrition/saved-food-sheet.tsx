import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { draftFromNutrients, NutrientsEditor, nutrientsFromDraft } from '@/components/nutrition/nutrients-editor';
import { ChipRow, Sheet, SheetButton } from '@/components/nutrition/sheet';
import { Label } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { saveFood, SavedFoodItem } from '@/db/consumption';
import { parseAmount, PhysicalUnit } from '@/lib/nutrition-math';

/**
 * Create or edit a product in "Mis alimentos". Saving never logs it nor
 * touches a plan; logged items keep their own snapshot, so editing a product
 * later doesn't rewrite history.
 */
export function SavedFoodSheet({ food, onClose, onSaved }: {
  food: SavedFoodItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const [name, setName] = useState(food?.name ?? '');
  const [brand, setBrand] = useState(food?.brand ?? '');
  const [unit, setUnit] = useState<PhysicalUnit>(food?.basis.unit ?? 'g');
  const [basisText, setBasisText] = useState(String(food?.basis.amount ?? 100));
  const [servingLabel, setServingLabel] = useState(food?.servingLabel ?? '');
  const [servingText, setServingText] = useState(food?.servingAmount ? String(food.servingAmount) : '');
  const [draft, setDraft] = useState(draftFromNutrients(food?.nutrients ?? {}));
  const [error, setError] = useState<string | null>(null);

  const input = { backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 } as const;

  async function save() {
    const basisAmount = parseAmount(basisText);
    if (!userId || !name.trim() || !basisAmount) {
      setError('Hace falta un nombre y la cantidad de referencia.');
      return;
    }
    try {
      await saveFood(userId, {
        name,
        brand,
        source: food?.source ?? 'manual',
        sourceRef: food?.sourceRef ?? null,
        basis: { amount: basisAmount, unit },
        nutrients: nutrientsFromDraft(draft),
        servingLabel: servingLabel.trim() || null,
        servingAmount: parseAmount(servingText),
      }, food?.id);
      onSaved();
      onClose();
    } catch (e) {
      console.error('[saved-food]', e);
      setError('No se pudo guardar.');
    }
  }

  return (
    <Sheet visible onClose={onClose} eyebrow="MIS ALIMENTOS" title={food ? 'Editar alimento' : 'Nuevo alimento'}>
      <Label>NOMBRE</Label>
      <TextInput value={name} onChangeText={setName} placeholder="Yogur griego" placeholderTextColor={C.textTertiary} accessibilityLabel="Nombre" style={input} />
      <Label>MARCA (OPCIONAL)</Label>
      <TextInput value={brand} onChangeText={setBrand} placeholder="Sula" placeholderTextColor={C.textTertiary} accessibilityLabel="Marca" style={input} />
      <Label>LOS VALORES SON POR</Label>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={basisText}
          onChangeText={text => setBasisText(text.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          accessibilityLabel="Cantidad de referencia"
          style={{ ...input, width: 90, fontFamily: F.monoBold, fontSize: 13 }}
        />
        <ChipRow options={[{ key: 'g', label: 'g' }, { key: 'ml', label: 'ml' }]} value={unit} onChange={setUnit} accent={accent} label="Unidad" />
      </View>
      <Label>PORCIÓN (OPCIONAL)</Label>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput value={servingLabel} onChangeText={setServingLabel} placeholder="envase" placeholderTextColor={C.textTertiary} accessibilityLabel="Nombre de la porción" style={{ ...input, flex: 1 }} />
        <TextInput
          value={servingText}
          onChangeText={text => setServingText(text.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="200"
          placeholderTextColor={C.textTertiary}
          accessibilityLabel={`Tamaño de la porción en ${unit}`}
          style={{ ...input, width: 80, fontFamily: F.monoBold, fontSize: 13 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary }}>{unit}</Text>
      </View>
      <NutrientsEditor draft={draft} onChange={setDraft} basisLabel={`por ${basisText || '?'} ${unit}`} />
      {error && <Text accessibilityRole="alert" style={{ fontFamily: F.inter, fontSize: 12, color: C.red }}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SheetButton label="GUARDAR" onPress={() => void save()} primary accent={accent} />
        <SheetButton label="CANCELAR" onPress={onClose} />
      </View>
    </Sheet>
  );
}
