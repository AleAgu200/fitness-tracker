import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Sheet, SheetButton } from '@/components/nutrition/sheet';
import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { deleteSleepEntry, saveSleepEntry } from '@/db/health';
import type { SourcedValue } from '@/lib/health/model';
import { formatSleep, getSleepSummary, PROVIDER_LABELS } from '@/lib/health/summary';

/**
 * Last night's sleep on Hoy. Manual entry works without any health app; a
 * manual value overrides the provider's summary for that wake-up date (and
 * removing it brings the provider's back). Imported data is read-only here.
 * Sleep is shown, not scored: the Núcleo is unchanged.
 */
export function SleepCard() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const [summary, setSummary] = useState<{ wakeDate: string; sleep: SourcedValue | null; manual: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');

  const load = useCallback(() => {
    if (!userId) return;
    getSleepSummary(userId).then(setSummary).catch(e => console.error('[sleep]', e));
  }, [userId]);
  useFocusEffect(load);

  function open() {
    const current = summary?.sleep?.value ?? null;
    setHours(current != null ? String(Math.floor(current / 60)) : '');
    setMinutes(current != null ? String(current % 60) : '');
    setEditing(true);
  }

  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const valid = Number.isInteger(total) && total > 0 && total <= 20 * 60 && (Number(minutes) || 0) < 60;

  async function save() {
    if (!userId || !summary || !valid) return;
    await saveSleepEntry(userId, summary.wakeDate, total);
    setEditing(false);
    load();
  }

  async function removeManual() {
    if (!userId || !summary) return;
    await deleteSleepEntry(userId, summary.wakeDate);
    setEditing(false);
    load();
  }

  const sleep = summary?.sleep ?? null;
  const inputStyle = { width: 70, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15 } as const;

  return (
    <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Label>SUEÑO · ANOCHE</Label>
        {sleep ? (
          <>
            <Text accessibilityLabel={`Dormiste ${formatSleep(sleep.value)}`} style={{ fontFamily: F.monoXBold, fontSize: 22, color: C.textPrimary }}>
              {formatSleep(sleep.value)}
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>{PROVIDER_LABELS[sleep.source].toUpperCase()}</Text>
          </>
        ) : (
          <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textSecondary }}>Sin datos de anoche</Text>
        )}
      </View>
      <PressableScale
        onPress={open}
        accessibilityLabel={sleep ? 'Corregir horas de sueño' : 'Registrar horas de sueño'}
        style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: C.border }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>{sleep ? 'CORREGIR' : 'REGISTRAR'}</Text>
      </PressableScale>

      {editing && (
        <Sheet visible onClose={() => setEditing(false)} eyebrow="SUEÑO" title="¿Cuánto dormiste anoche?">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput value={hours} onChangeText={text => setHours(text.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="7" placeholderTextColor={C.textTertiary} accessibilityLabel="Horas" style={inputStyle} />
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.textSecondary }}>H</Text>
            <TextInput value={minutes} onChangeText={text => setMinutes(text.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="30" placeholderTextColor={C.textTertiary} accessibilityLabel="Minutos" style={inputStyle} />
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.textSecondary }}>MIN</Text>
          </View>
          {sleep && sleep.source !== 'manual' && (
            <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textTertiary }}>
              {`Tu valor reemplaza al de ${PROVIDER_LABELS[sleep.source]} solo en PULSO; no cambia nada en esa app.`}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SheetButton label="GUARDAR" primary accent={accent} disabled={!valid} onPress={() => void save()} />
            {summary?.manual
              ? <SheetButton label="QUITAR MANUAL" onPress={() => void removeManual()} />
              : <SheetButton label="CANCELAR" onPress={() => setEditing(false)} />}
          </View>
        </Sheet>
      )}
    </View>
  );
}
