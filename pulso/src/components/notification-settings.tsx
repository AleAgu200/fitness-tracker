import { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { TimePickerField } from '@/components/ui/time-picker-field';
import { C, F, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  applyNotificationPreferences,
  getNotificationPermission,
  loadNotificationPreferences,
  loadRestTimerOverlayPreference,
  NOTIFICATION_PERMISSION,
  NotificationPermissionStatus,
  NotificationPreferences,
  NotificationSetupResult,
  sendTestNotification,
  setRestTimerOverlayPreference,
} from '@/lib/notifications';

const DAYS = [
  { value: 2, label: 'L' },
  { value: 3, label: 'M' },
  { value: 4, label: 'X' },
  { value: 5, label: 'J' },
  { value: 6, label: 'V' },
  { value: 7, label: 'S' },
  { value: 1, label: 'D' },
];

function SettingSwitch({ label, detail, value, onValueChange, accent }: {
  label: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accent: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{label}</Text>
        <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary }}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.border, true: withAlpha(accent, 0.45) }}
        thumbColor={value ? accent : C.textSecondary}
      />
    </View>
  );
}

export function NotificationSettings() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionStatus>(NOTIFICATION_PERMISSION.UNDETERMINED);
  const [pushReady, setPushReady] = useState(false);
  const [restTimerOverlayEnabled, setRestTimerOverlayEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [loaded, restTimerEnabled] = await Promise.all([
        loadNotificationPreferences(userId),
        loadRestTimerOverlayPreference(),
      ]);
      const status = await getNotificationPermission();
      if (!alive) return;
      setPreferences(loaded);
      setRestTimerOverlayEnabled(restTimerEnabled);
      setPermission(status);
      if (status === NOTIFICATION_PERMISSION.GRANTED) {
        const result = await applyNotificationPreferences(userId, loaded, false);
        if (alive) setPushReady(result.pushReady);
      }
    })().catch(cause => {
      if (alive) setError(cause instanceof Error ? cause.message : 'No se pudo cargar');
    });
    return () => { alive = false; };
  }, [userId]);

  async function commit(next: NotificationPreferences, requestPermission = false) {
    if (!userId) return;
    setPreferences(next);
    setSaving(true);
    setError(null);
    try {
      const result: NotificationSetupResult = await applyNotificationPreferences(userId, next, requestPermission);
      setPermission(result.permission);
      setPushReady(result.pushReady);
      if (result.permission === NOTIFICATION_PERMISSION.DENIED) {
        setError('Permiso bloqueado. Habilitá notificaciones desde los ajustes del teléfono.');
      }
    } catch {
      setError('No se pudieron actualizar las notificaciones.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRestTimerOverlay(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const active = await setRestTimerOverlayPreference(enabled);
      setRestTimerOverlayEnabled(active);
      if (enabled && !active) {
        setError('El timer superpuesto requiere permitir notificaciones y usar un development build.');
      }
    } catch {
      setError('No se pudo actualizar el timer superpuesto.');
    } finally {
      setSaving(false);
    }
  }

  if (!preferences) {
    return (
      <Card index={5} style={{ padding: 18, marginBottom: 14, alignItems: 'center' }}>
        <ActivityIndicator color={C.textTertiary} size="small" />
      </Card>
    );
  }

  const granted = permission === NOTIFICATION_PERMISSION.GRANTED;

  return (
    <Card index={5} style={{ padding: 14, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ gap: 4 }}>
          <Label>NOTIFICACIONES</Label>
          <Text style={{ fontFamily: F.inter, fontSize: 11, color: granted ? accent : C.textTertiary }}>
            {granted ? 'Activas en este dispositivo' : 'Necesitan tu permiso'}
          </Text>
        </View>
        {saving && <ActivityIndicator color={accent} size="small" />}
      </View>

      {!granted && (
        <PressableScale
          onPress={() => commit(preferences, true)}
          haptic="medium"
          style={{ backgroundColor: accent, padding: 12, alignItems: 'center', marginTop: 12 }}
        >
          <Text style={{ fontFamily: F.monoXBold, fontSize: 10, letterSpacing: 0.7, color: C.bg }}>
            ACTIVAR NOTIFICACIONES
          </Text>
        </PressableScale>
      )}
      {granted && (
        <PressableScale
          onPress={() => sendTestNotification().catch(() => setError('No se pudo mostrar la notificación de prueba.'))}
          style={{ borderWidth: 1, borderColor: accent, padding: 10, alignItems: 'center', marginTop: 12 }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.6, color: accent }}>
            ENVIAR NOTIFICACIÓN DE PRUEBA
          </Text>
        </PressableScale>
      )}

      <SettingSwitch
        label="Recordatorio de entrenamiento"
        detail="Te avisa los días y la hora que elijas."
        value={preferences.trainingEnabled}
        onValueChange={value => commit({ ...preferences, trainingEnabled: value })}
        accent={accent}
      />
      {preferences.trainingEnabled && (
        <View style={{ paddingBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {DAYS.map(day => {
              const selected = preferences.trainingDays.includes(day.value);
              return (
                <PressableScale
                  key={day.value}
                  onPress={() => {
                    const trainingDays = selected
                      ? preferences.trainingDays.filter(value => value !== day.value)
                      : [...preferences.trainingDays, day.value];
                    commit({ ...preferences, trainingDays });
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderWidth: 1,
                    borderColor: selected ? accent : C.border,
                    backgroundColor: selected ? withAlpha(accent, 0.10) : C.bgEl,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.4, color: selected ? accent : C.textTertiary }}>{day.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>HORA DEL ENTRENO</Label>
            <TimePickerField
              value={preferences.trainingTime}
              onChange={trainingTime => commit({ ...preferences, trainingTime })}
              accentColor={accent}
            />
          </View>
        </View>
      )}

      <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
        <SettingSwitch
          label="Recordatorios para tomar agua"
          detail="Se repiten durante el intervalo diario configurado."
          value={preferences.waterEnabled}
          onValueChange={value => commit({ ...preferences, waterEnabled: value })}
          accent={accent}
        />
      </View>
      {preferences.waterEnabled && (
        <View style={{ paddingBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>DESDE / HASTA</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {(['waterStart', 'waterEnd'] as const).map(field => (
                <TimePickerField
                  key={field}
                  value={preferences[field]}
                  onChange={value => commit({ ...preferences, [field]: value })}
                  accentColor={accent}
                />
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>FRECUENCIA</Label>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[1, 2, 3].map(hours => {
                const selected = preferences.waterIntervalHours === hours;
                return (
                  <PressableScale
                    key={hours}
                    onPress={() => commit({ ...preferences, waterIntervalHours: hours })}
                    style={{ borderWidth: 1, borderColor: selected ? C.cyan : C.border, backgroundColor: selected ? 'rgba(61,220,255,0.10)' : C.bgEl, paddingHorizontal: 10, paddingVertical: 8 }}
                  >
                    <Text style={{ fontFamily: F.monoBold, fontSize: 9, color: selected ? C.cyan : C.textTertiary }}>C/{hours}H</Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </View>
      )}

      <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
        <SettingSwitch
          label="Mensajes del equipo"
          detail="Push al recibir mensajes de tu entrenador o nutricionista."
          value={preferences.messagesEnabled}
          onValueChange={value => commit({ ...preferences, messagesEnabled: value })}
          accent={accent}
        />
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
        <SettingSwitch
          label="Timer de descanso superpuesto"
          detail="Muestra el descanso en la barra del teléfono después de guardar cada set."
          value={restTimerOverlayEnabled}
          onValueChange={toggleRestTimerOverlay}
          accent={accent}
        />
      </View>

      {granted && preferences.messagesEnabled && !pushReady && (
        <Text selectable style={{ fontFamily: F.inter, fontSize: 10, lineHeight: 15, color: C.orange }}>
          Los recordatorios locales están activos. El push de mensajes quedará disponible al instalar un development build conectado a EAS.
        </Text>
      )}
      {error && (
        <Text selectable style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.red, marginTop: 8 }}>
          {error}
        </Text>
      )}
    </Card>
  );
}
