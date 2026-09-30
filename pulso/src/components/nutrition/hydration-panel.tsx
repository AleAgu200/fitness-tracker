import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChipRow, Sheet, SheetButton } from '@/components/nutrition/sheet';
import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  archiveContainer,
  listContainers,
  listSavedFoods,
  logBeverage,
  saveContainer,
  SavedFoodItem,
  setWaterGoal,
} from '@/db/consumption';
import { BeverageContainer } from '@/db/schema';
import { formatVolume, goalProgress, parseAmount } from '@/lib/nutrition-math';

/** Fill that follows the day's volume; past the goal it simply stays full. */
function LevelBar({ progress }: { progress: number | null }) {
  const C = useColors();
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(0);
  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress ?? 0));
    fill.value = reduceMotion ? target : withTiming(target, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, [progress, fill, reduceMotion]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  if (progress == null) return null;
  return (
    <View style={{ height: 10, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: withAlpha(C.cyan, 0.5) }, style]} />
    </View>
  );
}

/**
 * Drinks for one date: total volume and plain water apart, an optional goal
 * the athlete sets, and personal containers — one tap logs capacity × usual
 * drink with an undo; long-press (or "Otra bebida") changes amount or drink.
 */
export function HydrationPanel({ localDate, totalMl, plainWaterMl, goalMl, onLogged, onGoalChanged }: {
  localDate: string;
  totalMl: number;
  plainWaterMl: number;
  goalMl: number | null;
  /** Called with the new record id so the parent can offer undo. */
  onLogged: (id: string, message: string) => void;
  onGoalChanged: () => void;
}) {
  const C = useColors();
  const { userId } = useSession();
  const [containers, setContainers] = useState<BeverageContainer[]>([]);
  const [drinkSheet, setDrinkSheet] = useState<{ container: BeverageContainer | null } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalText, setGoalText] = useState('');

  const load = useCallback(() => {
    if (!userId) return;
    listContainers(userId).then(setContainers).catch(e => console.error('[containers]', e));
  }, [userId]);
  useEffect(load, [load]);

  async function quickAdd(container: BeverageContainer) {
    if (!userId) return;
    try {
      const saved = container.savedFoodId ? (await listSavedFoods(userId)).find(food => food.id === container.savedFoodId) ?? null : null;
      const id = await logBeverage(userId, {
        localDate,
        name: container.beverageName,
        volumeMl: container.capacityMl,
        plainWater: container.plainWater,
        containerId: container.id,
        savedFood: saved,
      });
      onLogged(id, `+${formatVolume(container.capacityMl)} · ${container.beverageName}`);
    } catch (e) {
      console.error('[drink]', e);
    }
  }

  async function saveGoal() {
    if (!userId) return;
    const liters = parseAmount(goalText);
    await setWaterGoal(userId, liters ? liters * 1000 : null);
    setEditingGoal(false);
    onGoalChanged();
  }

  const progress = goalProgress(totalMl, goalMl);

  return (
    <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Label style={{ color: C.cyan }}>LÍQUIDOS</Label>
          <Text accessibilityLabel={`Bebiste ${formatVolume(totalMl)}${goalMl ? ` de ${formatVolume(goalMl)}` : ''}`} style={{ fontFamily: F.monoXBold, fontSize: 26, color: C.textPrimary, marginTop: 4 }}>
            {formatVolume(totalMl)}
            {goalMl != null && <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textTertiary }}>{` / ${formatVolume(goalMl)}`}</Text>}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary, marginTop: 2 }}>{`AGUA SOLA · ${formatVolume(plainWaterMl)}`}</Text>
        </View>
        <PressableScale
          onPress={() => { setGoalText(goalMl ? String(goalMl / 1000) : ''); setEditingGoal(!editingGoal); }}
          accessibilityLabel={goalMl ? `Meta ${formatVolume(goalMl)}. Cambiar meta` : 'Fijar una meta de líquidos'}
          style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: C.border }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>{goalMl ? 'META ✎' : 'FIJAR META'}</Text>
        </PressableScale>
      </View>

      <LevelBar progress={progress} />
      {progress != null && progress >= 1 && (
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.cyan }}>META CUMPLIDA · PODÉS SEGUIR REGISTRANDO</Text>
      )}

      {editingGoal && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={goalText}
            onChangeText={text => setGoalText(text.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="2,5"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel="Meta diaria en litros. Vacío para no tener meta"
            style={{ width: 80, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13 }}
          />
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary }}>L/DÍA</Text>
          <View style={{ flex: 1 }} />
          <SheetButton label="GUARDAR" onPress={() => void saveGoal()} primary />
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {containers.map(container => (
          <PressableScale
            key={container.id}
            onPress={() => void quickAdd(container)}
            onLongPress={() => setDrinkSheet({ container })}
            haptic="medium"
            accessibilityLabel={`Agregar ${container.name}, ${formatVolume(container.capacityMl)} de ${container.beverageName}`}
            accessibilityHint="Mantené presionado para cambiar cantidad o bebida"
            style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: C.cyan, backgroundColor: withAlpha(C.cyan, 0.07) }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.cyan }}>{`+ ${container.name.toUpperCase()}`}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, marginTop: 2 }}>{`${formatVolume(container.capacityMl)} · ${container.beverageName}`}</Text>
          </PressableScale>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <PressableScale onPress={() => setDrinkSheet({ container: null })} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>+ OTRA BEBIDA</Text>
        </PressableScale>
        <PressableScale onPress={() => setManageOpen(true)} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>RECIPIENTES</Text>
        </PressableScale>
      </View>

      {drinkSheet && (
        <DrinkSheet
          container={drinkSheet.container}
          onClose={() => setDrinkSheet(null)}
          onSubmit={async input => {
            if (!userId) return;
            const id = await logBeverage(userId, { localDate, ...input, containerId: drinkSheet.container?.id ?? null });
            onLogged(id, `+${formatVolume(input.volumeMl)} · ${input.name}`);
            setDrinkSheet(null);
          }}
        />
      )}
      {manageOpen && <ContainersSheet onClose={() => { setManageOpen(false); load(); }} />}
    </View>
  );
}

function DrinkSheet({ container, onClose, onSubmit }: {
  container: BeverageContainer | null;
  onClose: () => void;
  onSubmit: (input: { name: string; volumeMl: number; plainWater: boolean; savedFood: SavedFoodItem | null }) => Promise<void>;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const [drinks, setDrinks] = useState<SavedFoodItem[]>([]);
  const [name, setName] = useState(container?.beverageName ?? 'Agua');
  const [volumeText, setVolumeText] = useState(container ? String(container.capacityMl) : '250');
  const [plainWater, setPlainWater] = useState(container?.plainWater ?? true);
  const [savedFood, setSavedFood] = useState<SavedFoodItem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    listSavedFoods(userId).then(foods => {
      const liquid = foods.filter(food => food.basis.unit === 'ml');
      setDrinks(liquid);
      if (container?.savedFoodId) setSavedFood(liquid.find(food => food.id === container.savedFoodId) ?? null);
    }).catch(e => console.error('[drinks]', e));
  }, [userId, container]);

  const volume = parseAmount(volumeText);

  return (
    <Sheet visible onClose={onClose} eyebrow="LÍQUIDOS" title={container ? `${container.name}: otra cantidad o bebida` : 'Otra bebida'}>
      <Label>CANTIDAD (ml)</Label>
      <TextInput
        value={volumeText}
        onChangeText={text => setVolumeText(text.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        accessibilityLabel="Cantidad en mililitros"
        style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15 }}
      />
      {container && (
        <ChipRow
          options={[
            { key: 'half', label: `½ · ${formatVolume(container.capacityMl / 2)}` },
            { key: 'full', label: `1 · ${formatVolume(container.capacityMl)}` },
            { key: 'double', label: `2 · ${formatVolume(container.capacityMl * 2)}` },
          ]}
          value={volume === container.capacityMl / 2 ? 'half' : volume === container.capacityMl ? 'full' : volume === container.capacityMl * 2 ? 'double' : null}
          onChange={key => setVolumeText(String(container.capacityMl * (key === 'half' ? 0.5 : key === 'full' ? 1 : 2)))}
          accent={accent}
          label="Porción del recipiente"
        />
      )}
      <Label>BEBIDA</Label>
      <ChipRow
        options={[{ key: 'water', label: 'AGUA' }, ...drinks.map(food => ({ key: food.id, label: food.name.toUpperCase() })), { key: 'other', label: 'OTRA' }]}
        value={savedFood ? savedFood.id : plainWater ? 'water' : 'other'}
        onChange={key => {
          if (key === 'water') { setSavedFood(null); setPlainWater(true); setName('Agua'); return; }
          if (key === 'other') { setSavedFood(null); setPlainWater(false); setName(''); return; }
          const food = drinks.find(item => item.id === key) ?? null;
          setSavedFood(food);
          setPlainWater(false);
          setName(food?.name ?? '');
        }}
        accent={accent}
        label="Bebida"
      />
      {!plainWater && !savedFood && (
        <>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Café con leche, refresco…"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel="Nombre de la bebida"
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
          />
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textTertiary }}>
            Se suma al volumen; su nutrición queda incompleta. Para que cuente, guardala en Mis alimentos con sus valores por ml.
          </Text>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SheetButton
          label={busy ? 'GUARDANDO…' : 'REGISTRAR'}
          primary
          accent={accent}
          disabled={!volume || !name.trim() || busy}
          onPress={() => {
            if (!volume) return;
            setBusy(true);
            onSubmit({ name: name.trim(), volumeMl: volume, plainWater, savedFood })
              .catch(e => console.error('[drink-sheet]', e))
              .finally(() => setBusy(false));
          }}
        />
        <SheetButton label="CANCELAR" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function ContainersSheet({ onClose }: { onClose: () => void }) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const [containers, setContainers] = useState<BeverageContainer[]>([]);
  const [drinks, setDrinks] = useState<SavedFoodItem[]>([]);
  const [editing, setEditing] = useState<null | { id?: string; name: string; capacityText: string; drinkKey: string; beverageName: string }>(null);

  const load = useCallback(() => {
    if (!userId) return;
    Promise.all([listContainers(userId), listSavedFoods(userId)])
      .then(([list, foods]) => { setContainers(list); setDrinks(foods.filter(food => food.basis.unit === 'ml')); })
      .catch(e => console.error('[containers]', e));
  }, [userId]);
  useEffect(load, [load]);

  async function save() {
    if (!userId || !editing) return;
    const capacity = parseAmount(editing.capacityText);
    if (!capacity || !editing.name.trim()) return;
    const food = drinks.find(item => item.id === editing.drinkKey) ?? null;
    await saveContainer(userId, {
      name: editing.name,
      capacityMl: capacity,
      beverageName: food?.name ?? (editing.drinkKey === 'water' ? 'Agua' : editing.beverageName || 'Bebida'),
      plainWater: editing.drinkKey === 'water',
      savedFoodId: food?.id ?? null,
    }, editing.id);
    setEditing(null);
    load();
  }

  return (
    <Sheet visible onClose={onClose} eyebrow="LÍQUIDOS" title="Tus recipientes">
      {containers.map(container => (
        <View key={container.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{container.name}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>{`${formatVolume(container.capacityMl)} · ${container.beverageName}`}</Text>
          </View>
          <PressableScale
            onPress={() => setEditing({
              id: container.id, name: container.name, capacityText: String(container.capacityMl),
              drinkKey: container.savedFoodId ?? (container.plainWater ? 'water' : 'other'), beverageName: container.beverageName,
            })}
            style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: C.border }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>EDITAR</Text>
          </PressableScale>
          <PressableScale
            onPress={() => { if (userId) archiveContainer(userId, container.id).then(load).catch(e => console.error('[container-delete]', e)); }}
            accessibilityLabel={`Quitar ${container.name}`}
            style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: C.border }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>QUITAR</Text>
          </PressableScale>
        </View>
      ))}
      {!containers.length && (
        <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textSecondary }}>No tenés recipientes. Agregá el vaso o la botella que usás.</Text>
      )}

      {editing ? (
        <View style={{ gap: 8, borderWidth: 1, borderColor: C.border, padding: 12, backgroundColor: C.bgEl }}>
          <Label>NOMBRE</Label>
          <TextInput
            value={editing.name}
            onChangeText={name => setEditing({ ...editing, name })}
            placeholder="Termo del gym"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel="Nombre del recipiente"
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
          />
          <Label>CAPACIDAD (ml)</Label>
          <TextInput
            value={editing.capacityText}
            onChangeText={text => setEditing({ ...editing, capacityText: text.replace(/[^0-9.,]/g, '') })}
            keyboardType="decimal-pad"
            accessibilityLabel="Capacidad en mililitros"
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13 }}
          />
          <Label>BEBIDA HABITUAL</Label>
          <ChipRow
            options={[{ key: 'water', label: 'AGUA' }, ...drinks.map(food => ({ key: food.id, label: food.name.toUpperCase() })), { key: 'other', label: 'OTRA' }]}
            value={editing.drinkKey}
            onChange={drinkKey => setEditing({ ...editing, drinkKey })}
            accent={accent}
            label="Bebida habitual"
          />
          {editing.drinkKey === 'other' && (
            <TextInput
              value={editing.beverageName}
              onChangeText={beverageName => setEditing({ ...editing, beverageName })}
              placeholder="Café"
              placeholderTextColor={C.textTertiary}
              accessibilityLabel="Nombre de la bebida habitual"
              style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
            />
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SheetButton label="GUARDAR" onPress={() => void save()} primary accent={accent} disabled={!editing.name.trim() || !parseAmount(editing.capacityText)} />
            <SheetButton label="CANCELAR" onPress={() => setEditing(null)} />
          </View>
        </View>
      ) : (
        <SheetButton label="+ NUEVO RECIPIENTE" onPress={() => setEditing({ name: '', capacityText: '', drinkKey: 'water', beverageName: '' })} />
      )}
    </Sheet>
  );
}
