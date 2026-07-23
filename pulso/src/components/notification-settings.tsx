import { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, TextInput, View } from 'react-native';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { C, F } from '@/constants/colors';
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

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function validTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return !!match && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function SettingSwitch({ label, detail, value, onValueChange }: {
  label: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
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
        trackColor={{ false: C.border, true: 'rgba(232,255,89,0.45)' }}
        thumbColor={value ? C.yellow : C.textSecondary}
      />
    </View>
  );
}

export function NotificationSettings() {
  const { userId } = useSession();
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
  const inputStyle = {
    width: 78,
    height: 38,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgEl,
    color: C.textPrimary,
    fontFamily: F.monoBold,
    fontSize: 13,
    textAlign: 'center' as const,
  };

  return (
    <Card index={5} style={{ padding: 14, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ gap: 4 }}>
          <Label>NOTIFICACIONES</Label>
          <Text style={{ fontFamily: F.inter, fontSize: 11, color: granted ? C.yellow : C.textTertiary }}>
            {granted ? 'Activas en este dispositivo' : 'Necesitan tu permiso'}
          </Text>
        </View>
        {saving && <ActivityIndicator color={C.yellow} size="small" />}
      </View>

      {!granted && (
        <PressableScale
          onPress={() => commit(preferences, true)}
          haptic="medium"
          style={{ backgroundColor: C.yellow, padding: 12, alignItems: 'center', marginTop: 12 }}
        >
          <Text style={{ fontFamily: F.monoXBold, fontSize: 10, letterSpacing: 0.7, color: C.bg }}>
            ACTIVAR NOTIFICACIONES
          </Text>
        </PressableScale>
      )}
      {granted && (
        <PressableScale
          onPress={() => sendTestNotification().catch(() => setError('No se pudo mostrar la notificación de prueba.'))}
          style={{ borderWidth: 1, borderColor: C.yellow, padding: 10, alignItems: 'center', marginTop: 12 }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.6, color: C.yellow }}>
            ENVIAR NOTIFICACIÓN DE PRUEBA
          </Text>
        </PressableScale>
      )}

      <SettingSwitch
        label="Recordatorio de entrenamiento"
        detail="Te avisa los días y la hora que elijas."
        value={preferences.trainingEnabled}
        onValueChange={value => commit({ ...preferences, trainingEnabled: value })}
      />
      {preferences.trainingEnabled && (
        <View style={{ paddingBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
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
                    flex: 1,
                    height: 34,
                    borderWidth: 1,
                    borderColor: selected ? C.yellow : C.border,
                    backgroundColor: selected ? 'rgba(232,255,89,0.10)' : C.bgEl,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: selected ? C.yellow : C.textTertiary }}>{day.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>HORA DEL ENTRENO</Label>
            <TextInput
              value={preferences.trainingTime}
              onChangeText={trainingTime => setPreferences({ ...preferences, trainingTime: formatTimeInput(trainingTime) })}
              onEndEditing={() => {
                if (validTime(preferences.trainingTime)) commit(preferences);
                else setError('Usá una hora válida en formato HH:MM.');
              }}
              keyboardType="number-pad"
              maxLength={5}
              placeholder="18:00"
              placeholderTextColor={C.textTertiary}
              style={inputStyle}
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
        />
      </View>
      {preferences.waterEnabled && (
        <View style={{ paddingBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>DESDE / HASTA</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {(['waterStart', 'waterEnd'] as const).map(field => (
                <TextInput
                  key={field}
                  value={preferences[field]}
                  onChangeText={value => setPreferences({ ...preferences, [field]: formatTimeInput(value) })}
                  onEndEditing={() => {
                    if (validTime(preferences[field])) commit(preferences);
                    else setError('Usá horas válidas en formato HH:MM.');
                  }}
                  keyboardType="number-pad"
                  maxLength={5}
                  style={inputStyle}
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
        />
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
        <SettingSwitch
          label="Timer de descanso superpuesto"
          detail="Muestra el descanso en la barra del teléfono después de guardar cada set."
          value={restTimerOverlayEnabled}
          onValueChange={toggleRestTimerOverlay}
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
