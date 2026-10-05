import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ChipRow, Sheet, SheetButton } from '@/components/nutrition/sheet';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { ApiError } from '@/lib/api';
import { REPORT_REASONS, reportUser, type ReportReason } from '@/lib/team';

/** Report a professional to PULSO. Used from Equipo and from the chat. */
export function ReportSheet({ target, onClose }: {
  target: { userId: string; name: string } | null;
  onClose: () => void;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason(null);
    setDetail('');
    setSent(false);
    setError(null);
    onClose();
  }

  async function submit() {
    if (!target || !reason || sending) return;
    setSending(true);
    setError(null);
    try {
      await reportUser(target.userId, reason, detail.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'too_many_reports'
        ? 'Llegaste al límite de reportes por hoy. Escribinos a pulso@pulsofitness.tech.'
        : 'No se pudo enviar. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet visible={target != null} onClose={close} eyebrow="REPORTAR" title={target ? `Reportar a ${target.name}` : 'Reportar'}>
      {sent ? (
        <View style={{ gap: 14 }}>
          <Text style={{ fontFamily: F.inter, fontSize: 14, lineHeight: 21, color: C.textPrimary }}>
            Gracias. El equipo de PULSO revisa cada reporte y toma medidas si hace falta.
          </Text>
          <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
            Si no querés seguir en contacto, podés salir de su equipo desde Equipo: deja de ver tus datos y no puede escribirte.
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <SheetButton label="LISTO" onPress={close} primary accent={accent} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <ChipRow
            label="Motivo"
            options={REPORT_REASONS.map(option => ({ key: option.key, label: option.label }))}
            value={reason}
            onChange={setReason}
            accent={accent}
          />
          <TextInput
            value={detail}
            onChangeText={setDetail}
            placeholder="Contanos qué pasó (opcional)"
            placeholderTextColor={C.textTertiary}
            multiline
            maxLength={1000}
            style={{
              minHeight: 90, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, padding: 10,
              color: C.textPrimary, fontFamily: F.inter, fontSize: 14, textAlignVertical: 'top',
            }}
          />
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textTertiary }}>
            Junto con el reporte enviamos los últimos mensajes de la conversación para poder revisarlo. La otra persona no se entera de que la reportaste.
          </Text>
          {error && <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red }}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SheetButton label="CANCELAR" onPress={close} />
            <SheetButton label={sending ? 'ENVIANDO…' : 'ENVIAR REPORTE'} onPress={submit} primary accent={accent} disabled={!reason || sending} />
          </View>
        </View>
      )}
    </Sheet>
  );
}
