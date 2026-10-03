import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompareSheet } from '@/components/nutrition/compare-sheet';
import { DayFitPreview } from '@/components/nutrition/day-fit';
import { MEAL_LABELS, mealLabelForNow } from '@/components/nutrition/food-logger';
import { draftFromNutrients, NutrientDraft, NutrientsEditor, nutrientsFromDraft } from '@/components/nutrition/nutrients-editor';
import { describePlanTarget, PlanDatePicker, PlanTarget } from '@/components/nutrition/plan-date-picker';
import { ChipRow, SheetButton } from '@/components/nutrition/sheet';
import { Paywall } from '@/components/paywall';
import { Label, PressableScale, Segmented } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { useEntitlement } from '@/context/entitlement';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { listSavedFoods, logConsumption, saveFood } from '@/db/consumption';
import { planFood } from '@/db/nutrition';
import { todayStr, weekdayOf } from '@/lib/dates';
import { combineNutrients, formatNutrient, NUTRIENT_LABEL, parseAmount, PhysicalUnit } from '@/lib/nutrition-math';
import { draftFromSavedFood, isNewBarcodeProduct, labelReadingStatus, lookupBarcode, NutritionDraft, readLabel, ScanOutcome, shareBarcodeProduct, withBarcode } from '@/lib/scan';

type Mode = 'code' | 'label';
type Stage =
  | { k: 'input' }
  | { k: 'working'; message: string }
  | { k: 'problem'; outcome: ScanOutcome; code?: string }
  | { k: 'review'; draft: NutritionDraft };

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

function emptyDraft(code: string | null): NutritionDraft {
  return {
    source: code ? 'barcode' : 'label',
    sourceRef: code,
    productName: null,
    brand: null,
    basis: { amount: 100, unit: 'g' },
    serving: null,
    nutrients: { kcal: null, proteinG: null, carbsG: null, fatG: null },
    uncertain: [],
    derived: [],
    energyInconsistent: false,
    attribution: null,
  };
}

/**
 * Scan a product by barcode or read its nutrition label. The result is always
 * a draft to review: nothing is logged or saved until the athlete picks one of
 * the three destinations (consumed, plan, saved).
 */
export default function EscanearScreen() {
  const C = useColors();
  const { accent } = usePreferences();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('code');
  const [stage, setStage] = useState<Stage>({ k: 'input' });
  const [paywall, setPaywall] = useState(false);
  // Barcode that wasn't found, carried into label reading (see withBarcode).
  const [labelCode, setLabelCode] = useState<string | null>(null);

  const reset = useCallback(() => setStage({ k: 'input' }), []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PressableScale
            onPress={() => (stage.k === 'input' ? router.back() : reset())}
            accessibilityLabel={stage.k === 'input' ? 'Volver' : 'Volver a escanear'}
            style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Label>NUTRICIÓN</Label>
            <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 2 }}>
              {stage.k === 'review' ? 'Revisá el producto' : 'Escanear'}
            </Text>
          </View>
        </View>

        {stage.k !== 'review' && (
          <Segmented
            options={[{ key: 'code', label: 'CÓDIGO DE BARRAS' }, { key: 'label', label: 'TABLA NUTRICIONAL' }]}
            value={mode}
            onChange={value => { setMode(value); setLabelCode(null); reset(); }}
            accent={accent}
          />
        )}

        {stage.k === 'input' && mode === 'code' && <BarcodeInput onStage={setStage} />}
        {stage.k === 'input' && mode === 'label' && <LabelInput code={labelCode} onStage={setStage} onPaywall={() => setPaywall(true)} />}

        {stage.k === 'working' && (
          <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 12, paddingVertical: 50 }}>
            <ActivityIndicator color={accent} />
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>{stage.message}</Text>
          </View>
        )}

        {stage.k === 'problem' && (
          <Problem
            outcome={stage.outcome}
            code={stage.code}
            onRetry={reset}
            onLabel={() => { setLabelCode(stage.code ?? null); setMode('label'); reset(); }}
            onManual={() => setStage({ k: 'review', draft: emptyDraft(stage.code ?? null) })}
            onPaywall={() => setPaywall(true)}
          />
        )}

        {stage.k === 'review' && <DraftReview key={stage.draft.sourceRef ?? 'label'} draft={stage.draft} onScanAnother={() => { setLabelCode(null); reset(); }} />}
      </ScrollView>
      <Paywall visible={paywall} onClose={() => setPaywall(false)} />
    </View>
  );
}

// ── barcode ─────────────────────────────────────────────────────────────────

function BarcodeInput({ onStage }: { onStage: (stage: Stage) => void }) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const handled = useRef(false);

  const resolve = useCallback(async (raw: string) => {
    const code = raw.replace(/\D/g, '');
    if (!code || handled.current) return;
    handled.current = true;
    // A product saved from this code before needs no connection.
    if (userId) {
      const saved = (await listSavedFoods(userId)).find(food => food.source === 'barcode' && food.sourceRef === code);
      if (saved) { onStage({ k: 'review', draft: draftFromSavedFood(saved) }); return; }
    }
    onStage({ k: 'working', message: 'BUSCANDO EL PRODUCTO…' });
    const outcome = await lookupBarcode(code);
    onStage(outcome.status === 'draft' ? { k: 'review', draft: outcome.draft } : { k: 'problem', outcome, code });
  }, [onStage, userId]);

  return (
    <>
      {permission?.granted ? (
        <View style={{ height: 260, borderWidth: 1, borderColor: accent, overflow: 'hidden' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={result => { void resolve(result.data); }}
            accessibilityLabel="Cámara: apuntá al código de barras del envase"
          />
          <View pointerEvents="none" style={{ position: 'absolute', left: '12%', right: '12%', top: '42%', height: 2, backgroundColor: withAlpha(accent, 0.8) }} />
        </View>
      ) : (
        <View style={{ borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 }}>
          <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
            {permission && !permission.canAskAgain
              ? 'PULSO no tiene permiso para usar la cámara. Podés activarlo en Ajustes o escribir el número del código abajo.'
              : 'Para leer el código usamos la cámara solo mientras estás en esta pantalla. No se guardan fotos.'}
          </Text>
          <SheetButton
            label={permission && !permission.canAskAgain ? 'ABRIR AJUSTES' : 'PERMITIR CÁMARA'}
            onPress={() => (permission && !permission.canAskAgain ? void Linking.openSettings() : void requestPermission())}
            primary
          />
        </View>
      )}
      <Label>O ESCRIBÍ EL NÚMERO</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={typed}
          onChangeText={text => setTyped(text.replace(/\D/g, '').slice(0, 14))}
          keyboardType="number-pad"
          placeholder="7421234567890"
          placeholderTextColor={C.textTertiary}
          accessibilityLabel="Número del código de barras"
          style={{ flex: 1, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 14 }}
        />
        <PressableScale
          onPress={() => { handled.current = false; void resolve(typed); }}
          disabled={typed.length < 8}
          style={{ minWidth: 80, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.textSecondary, opacity: typed.length < 8 ? 0.4 : 1 }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textPrimary }}>BUSCAR</Text>
        </PressableScale>
      </View>
    </>
  );
}

// ── label ───────────────────────────────────────────────────────────────────

function LabelInput({ code, onStage, onPaywall }: { code: string | null; onStage: (stage: Stage) => void; onPaywall: () => void }) {
  const C = useColors();
  const [status, setStatus] = useState<{ available: boolean; entitled: boolean } | null | 'loading'>('loading');

  // Asked again when the subscription changes: buying Plus from the paywall
  // right here must unlock the reader without leaving the screen.
  const { entitled } = useEntitlement();
  useEffect(() => {
    let active = true;
    labelReadingStatus().then(result => { if (active) setStatus(result); });
    return () => { active = false; };
  }, [entitled]);

  async function capture(source: 'camera' | 'library') {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 1 };
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        onStage({ k: 'problem', outcome: { status: 'unreadable', reason: 'camera_denied' } });
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
    const asset = !result.canceled ? result.assets[0] : null;
    if (!asset) return;
    onStage({ k: 'working', message: 'LEYENDO LA TABLA…' });
    const outcome = await readLabel(asset.uri);
    onStage(outcome.status === 'draft' ? { k: 'review', draft: withBarcode(outcome.draft, code) } : { k: 'problem', outcome });
  }

  if (status === 'loading') return <ActivityIndicator color={C.textTertiary} style={{ marginVertical: 30 }} />;
  if (status === null) {
    return <Notice text="Leer una etiqueta necesita conexión. Mientras tanto podés buscar el producto en Mis alimentos o escribir sus valores." />;
  }
  if (!status.available) {
    return <Notice text="La lectura de etiquetas todavía no está activa. Podés escanear el código de barras o escribir los valores a mano." />;
  }
  if (!status.entitled) {
    return (
      <View style={{ gap: 10 }}>
        <Notice text="Leer la tabla nutricional con una foto es parte de PULSO Plus. El código de barras y la carga manual siguen siendo gratis." />
        <SheetButton label="VER PULSO PLUS" onPress={onPaywall} primary />
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
        Encuadrá solo la tabla y recortala si hace falta. La foto se envía una vez para leerla y no se guarda: ni en PULSO ni en tu historial.
      </Text>
      {code && (
        <Text style={{ fontFamily: F.mono, fontSize: 10, lineHeight: 15, color: C.textTertiary }}>
          SI LO GUARDÁS, LA PRÓXIMA VEZ QUE ESCANEES EL CÓDIGO {code} LO VAMOS A ENCONTRAR.
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SheetButton label="TOMAR FOTO" onPress={() => void capture('camera')} primary />
        <SheetButton label="ELEGIR DE LA GALERÍA" onPress={() => void capture('library')} />
      </View>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  const C = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, padding: 14 }}>
      <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>{text}</Text>
    </View>
  );
}

function Problem({ outcome, code, onRetry, onLabel, onManual, onPaywall }: {
  outcome: ScanOutcome;
  code?: string;
  onRetry: () => void;
  onLabel: () => void;
  onManual: () => void;
  onPaywall: () => void;
}) {
  const reason = outcome.status === 'unreadable' ? outcome.reason : null;
  const message = outcome.status === 'not_found' ? `No encontramos el código ${code ?? ''}. Podés leer la tabla del envase o escribir sus valores.`
    : outcome.status === 'offline' ? 'Sin conexión. Podés usar Mis alimentos o escribir los valores a mano.'
      : outcome.status === 'invalid' ? 'Ese número no es un código de barras válido. Probá de nuevo.'
        : outcome.status === 'plus_required' ? 'Leer etiquetas es parte de PULSO Plus.'
          : outcome.status === 'busy' ? 'Ya estamos leyendo otra etiqueta. Esperá unos segundos.'
            : reason === 'camera_denied' ? 'Sin permiso de cámara. Podés elegir una foto de la galería.'
              : reason === 'not_a_nutrition_label' ? 'No vimos una tabla nutricional en la foto. Encuadrá solo la tabla.'
                : outcome.status === 'unreadable' ? 'No pudimos leer la tabla. Probá con más luz, sin reflejos y recortando solo la tabla.'
                  : 'El servicio no está disponible ahora. Podés escribir los valores a mano.';
  return (
    <Animated.View entering={FadeIn.duration(160)} style={{ gap: 10 }}>
      <Notice text={message} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {outcome.status === 'plus_required'
          ? <SheetButton label="VER PULSO PLUS" onPress={onPaywall} primary />
          : <SheetButton label="REINTENTAR" onPress={onRetry} primary />}
        {outcome.status === 'not_found' && <SheetButton label="LEER LA TABLA" onPress={onLabel} />}
      </View>
      <SheetButton label="ESCRIBIR A MANO" onPress={onManual} />
    </Animated.View>
  );
}

// ── review + destinations ───────────────────────────────────────────────────

type Destination = 'consumed' | 'plan' | 'saved';

function DraftReview({ draft, onScanAnother }: { draft: NutritionDraft; onScanAnother: () => void }) {
  const C = useColors();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const { reloadNutritionToday, reloadAll } = useApp();
  const [name, setName] = useState(draft.productName ?? '');
  const [brand, setBrand] = useState(draft.brand ?? '');
  const [unit, setUnit] = useState<PhysicalUnit>(draft.basis.unit);
  const [basisText, setBasisText] = useState(String(draft.basis.amount));
  const [servingLabel, setServingLabel] = useState(draft.serving?.label ?? '');
  const [servingText, setServingText] = useState(draft.serving ? String(draft.serving.amount) : '');
  const [nutrients, setNutrients] = useState<NutrientDraft>(draftFromNutrients(draft.nutrients));
  const [destination, setDestination] = useState<Destination>('consumed');
  const [amountText, setAmountText] = useState(String(draft.serving?.amount ?? draft.basis.amount));
  const [mealLabel, setMealLabel] = useState<string>(mealLabelForNow());
  const [target, setTarget] = useState<PlanTarget>({ date: todayStr(), repeatWeekly: false });
  const [comparing, setComparing] = useState(false);
  const [alsoSave, setAlsoSave] = useState(draft.source === 'barcode');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const basisAmount = parseAmount(basisText);
  const amount = parseAmount(amountText);
  const servingAmount = parseAmount(servingText);
  const perBasis = nutrientsFromDraft(nutrients);
  const valid = Boolean(name.trim() && basisAmount);
  const preview = valid && amount ? combineNutrients([{ nutrientsPerBasis: perBasis, basis: { amount: basisAmount!, unit }, amount, unit }]) : null;
  const uncertainLabels = draft.uncertain.map(key => NUTRIENT_LABEL[key].toLowerCase());

  // A code Open Food Facts didn't have joins the shared catalog once reviewed.
  const shareable = isNewBarcodeProduct(draft);
  function share() {
    if (!shareable || !basisAmount) return;
    void shareBarcodeProduct(draft.sourceRef!, {
      productName: name.trim(),
      brand: brand.trim() || null,
      basis: { amount: basisAmount, unit },
      serving: servingAmount ? { label: servingLabel.trim() || null, amount: servingAmount } : null,
      nutrients: perBasis,
    });
  }

  async function persistFood(): Promise<string> {
    return saveFood(userId!, {
      name,
      brand,
      source: draft.source,
      sourceRef: draft.sourceRef,
      basis: { amount: basisAmount!, unit },
      nutrients: perBasis,
      servingLabel: servingLabel || null,
      servingAmount,
    });
  }

  async function confirm() {
    if (!userId || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (destination === 'saved') {
        await persistFood();
        share();
        setDone('Guardado en Mis alimentos. No se registró como consumido.');
        return;
      }
      if (!amount) { setError('Indicá la cantidad.'); return; }
      const component = {
        name: brand.trim() ? `${name.trim()} · ${brand.trim()}` : name.trim(),
        source: draft.source,
        sourceRef: draft.sourceRef,
        basis: { amount: basisAmount!, unit },
        amount,
        unit,
        nutrientsPerBasis: perBasis,
      };
      if (destination === 'consumed') {
        if (alsoSave) await persistFood();
        await logConsumption(userId, {
          localDate: todayStr(),
          kind: unit === 'ml' ? 'beverage' : 'food',
          mealLabel,
          name: component.name,
          amount,
          unit,
          source: draft.source,
          components: [component],
          // A scanned drink adds its volume once, together with its nutrients.
          volumeMl: unit === 'ml' ? amount : null,
        });
        await reloadNutritionToday();
        share();
        setDone(`Registrado en ${mealLabel.toLowerCase()} de hoy.`);
        return;
      }
      // Planning never logs consumption, and a date never changes the usual
      // week unless repeating was asked for.
      await planFood(userId, {
        date: target.date,
        repeatWeekly: target.repeatWeekly,
        mealLabel,
        description: `${component.name} (${Math.round(amount)} ${unit})`,
        nutrients: combineNutrients([component]),
      });
      const today = todayStr();
      if (target.date === today || (target.repeatWeekly && weekdayOf(new Date(`${target.date}T12:00:00`)) === weekdayOf(new Date()))) await reloadAll();
      share();
      setDone(`Planificado para ${describePlanTarget(target)}. No se registró como consumido.`);
    } catch (e) {
      console.error('[scan-confirm]', e);
      setError('No se pudo guardar. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const input = { backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 } as const;

  if (done) {
    return (
      <Animated.View entering={FadeIn.duration(180)} style={{ gap: 12 }}>
        <View accessibilityLiveRegion="polite" style={{ borderWidth: 1, borderColor: accent, padding: 16 }}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{done}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SheetButton label="ESCANEAR OTRO" onPress={onScanAnother} primary />
          <SheetButton label="VOLVER A DIETA" onPress={() => router.back()} />
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>
        {draft.source === 'barcode' ? `CÓDIGO ${draft.sourceRef ?? ''}` : 'LEÍDO DE LA ETIQUETA'}{draft.attribution ? ` · ${draft.attribution.toUpperCase()}` : ''}
      </Text>
      {(uncertainLabels.length > 0 || draft.derived.length > 0) && (
        <View style={{ borderWidth: 1, borderColor: C.orange, padding: 12, gap: 4 }}>
          {uncertainLabels.length > 0 && (
            <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textPrimary }}>{`Revisá: ${uncertainLabels.join(', ')} (difícil de leer).`}</Text>
          )}
          {draft.derived.map(note => (
            <Text key={note} style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textSecondary }}>{`· ${note}`}</Text>
          ))}
        </View>
      )}
      <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textTertiary }}>
        Confirmá que es el producto que tenés en la mano: el envase puede haber cambiado.
      </Text>
      {shareable && (
        <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textTertiary }}>
          Este código no estaba en el catálogo. Al confirmarlo se suma al catálogo compartido de PULSO (solo el producto, nada tuyo) para que quien lo escanee después lo encuentre.
        </Text>
      )}

      <Label>PRODUCTO</Label>
      <TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={C.textTertiary} accessibilityLabel="Nombre del producto" style={input} />
      <TextInput value={brand} onChangeText={setBrand} placeholder="Marca (opcional)" placeholderTextColor={C.textTertiary} accessibilityLabel="Marca" style={input} />

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
        <TextInput value={servingLabel} onChangeText={setServingLabel} placeholder="1 envase" placeholderTextColor={C.textTertiary} accessibilityLabel="Nombre de la porción" style={{ ...input, flex: 1 }} />
        <TextInput
          value={servingText}
          onChangeText={text => setServingText(text.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={C.textTertiary}
          accessibilityLabel={`Tamaño de la porción en ${unit}`}
          style={{ ...input, width: 80, fontFamily: F.monoBold, fontSize: 13 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary }}>{unit}</Text>
      </View>

      <NutrientsEditor draft={nutrients} onChange={setNutrients} basisLabel={`por ${basisText || '?'} ${unit}`} />

      <View style={{ flexDirection: 'row' }}>
        <SheetButton label="COMPARAR CON OTRO PRODUCTO" onPress={() => setComparing(true)} disabled={!valid} hint="Compara sin guardar nada" />
      </View>
      {comparing && valid && (
        <CompareSheet
          subject={{
            name: brand.trim() ? `${name.trim()} · ${brand.trim()}` : name.trim(),
            basis: { amount: basisAmount!, unit },
            nutrients: perBasis,
            portion: amount ? { amount, label: `${Math.round(amount)} ${unit}` } : null,
          }}
          onClose={() => setComparing(false)}
        />
      )}

      <Label>¿QUÉ HACEMOS CON ÉL?</Label>
      <Segmented
        options={[{ key: 'consumed', label: 'LO CONSUMÍ' }, { key: 'plan', label: 'AL PLAN' }, { key: 'saved', label: 'GUARDAR' }]}
        value={destination}
        onChange={setDestination}
        accent={accent}
        compact
      />

      {destination !== 'saved' && (
        <View style={{ gap: 10 }}>
          <Label>CANTIDAD</Label>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={amountText}
              onChangeText={text => setAmountText(text.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
              accessibilityLabel={`Cantidad en ${unit}`}
              style={{ ...input, width: 90, fontFamily: F.monoBold, fontSize: 13 }}
            />
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary }}>{unit}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[
              ...(servingAmount ? [
                { label: `½ ${servingLabel || 'porción'}`, value: servingAmount / 2 },
                { label: `1 ${servingLabel || 'porción'}`, value: servingAmount },
              ] : []),
              ...(basisAmount ? [{ label: `${basisAmount} ${unit}`, value: basisAmount }] : []),
            ].map(option => (
              <PressableScale
                key={option.label}
                onPress={() => setAmountText(String(option.value))}
                style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: amount === option.value ? accent : C.border }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>{option.label.toUpperCase()}</Text>
              </PressableScale>
            ))}
          </View>
          {destination === 'plan' && (
            <>
              <Label>¿CUÁNDO?</Label>
              <PlanDatePicker value={target} onChange={setTarget} accent={accent} />
            </>
          )}
          <Label>COMIDA</Label>
          <ChipRow options={MEAL_LABELS.map(label => ({ key: label, label }))} value={mealLabel as typeof MEAL_LABELS[number]} onChange={setMealLabel} accent={accent} label="Comida" />
          {preview && (
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: C.textPrimary }}>
              {`${formatNutrient('kcal', preview.kcal)} · P ${formatNutrient('proteinG', preview.proteinG)} · C ${formatNutrient('carbsG', preview.carbsG)} · G ${formatNutrient('fatG', preview.fatG)}`}
            </Text>
          )}
          <DayFitPreview
            date={destination === 'plan' ? target.date : todayStr()}
            basis={destination === 'plan' ? 'planned' : 'consumed'}
            addition={preview}
            repeatWeekly={destination === 'plan' && target.repeatWeekly}
          />
          {destination === 'consumed' && (
            <PressableScale
              onPress={() => setAlsoSave(!alsoSave)}
              accessibilityRole="checkbox"
              selected={alsoSave}
              style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 40 }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: alsoSave ? accent : C.textTertiary }}>{alsoSave ? '■' : '□'}</Text>
              <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textSecondary }}>También guardar en Mis alimentos</Text>
            </PressableScale>
          )}
        </View>
      )}

      {error && <Text accessibilityRole="alert" style={{ fontFamily: F.inter, fontSize: 12, color: C.red }}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SheetButton
          label={busy ? 'GUARDANDO…' : destination === 'consumed' ? 'LO CONSUMÍ' : destination === 'plan' ? 'AGREGAR AL PLAN' : 'GUARDAR'}
          onPress={() => void confirm()}
          primary
          accent={accent}
          disabled={!valid || busy || (destination !== 'saved' && !amount)}
        />
      </View>
    </View>
  );
}
