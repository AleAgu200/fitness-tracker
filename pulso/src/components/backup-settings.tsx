import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  applyImport,
  BackupStatus,
  claimThisPhone,
  deleteAllBackups,
  getBackupStatus,
  previewImport,
  restoreBackup,
  setBackupEnabled,
  uploadBackup,
} from '@/lib/backup';
import { DeviceSyncStatus, getDeviceSyncStatus, localSyncSummary, setDeviceSync, SyncOutcome, syncDevices } from '@/lib/device-sync';

const CONSENT_TEXT = 'Si activás el respaldo personal, PULSO guarda una copia de tus datos en tu cuenta para recuperarlos en otro dispositivo. Esto no los comparte con tu coach ni nutricionista; compartir con profesionales se controla por separado.';

const RETENTION_TEXT = 'Guardamos hasta 7 copias completas mientras tengas PULSO Plus. Si Plus vence, dejamos de hacer copias nuevas y conservamos la última completa: podés restaurarla o exportarla gratis hasta que la borres o borres tu cuenta.';

const SEPARATE_TEXT = 'El respaldo es distinto de compartir con profesionales (se controla en Equipo) y de los permisos de Salud del teléfono. La copia se guarda cifrada en tránsito, en nuestro servidor; no es cifrado de extremo a extremo.';

const EXCLUDED_LABELS: Record<string, string> = {
  progress_photos: 'fotos de progreso (quedan en el teléfono)',
  personal_records: 'récords (se recalculan de tus series)',
  professional_sharing: 'permisos con profesionales (vienen del servidor)',
  checkin_requests: 'check-ins de tu equipo (vienen del servidor)',
  coach_messages: 'mensajes (vienen del servidor)',
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function coverageLine(counts: Record<string, number>): string {
  const parts = [
    counts.workout_sessions ? `${counts.workout_sessions} entrenos` : null,
    counts.logged_sets ? `${counts.logged_sets} series` : null,
    (counts.consumptions ?? 0) + (counts.meal_log_entries ?? 0) ? `${(counts.consumptions ?? 0) + (counts.meal_log_entries ?? 0)} registros de comida` : null,
    (counts.programs ?? 0) + (counts.meal_plans ?? 0) ? `${(counts.programs ?? 0) + (counts.meal_plans ?? 0)} planes` : null,
    counts.body_measurements ? `${counts.body_measurements} medidas` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Perfil y preferencias';
}

/** Personal backup: consent, Plus eligibility, newest copy, and restore/delete. */
export function BackupSection() {
  const { userId } = useSession();
  const { reloadAll } = useApp();
  const { accent, setAccent, setWeightUnit, setThemeMode } = usePreferences();
  const C = useColors();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<null | 'toggle' | 'backup' | 'restore' | 'delete'>(null);
  const currentUser = useRef(userId);
  useEffect(() => { currentUser.current = userId; }, [userId]);

  const load = useCallback(() => {
    getBackupStatus()
      .then(next => { setStatus(next); setOffline(false); })
      .catch(() => setOffline(true));
  }, []);
  useEffect(load, [load]);

  function toggle(next: boolean) {
    const apply = async () => {
      setBusy('toggle');
      try {
        await setBackupEnabled(next);
        load();
      } catch {
        Alert.alert('Sin conexión', 'Necesitás conexión para cambiar el respaldo.');
      } finally {
        setBusy(null);
      }
    };
    if (!next) {
      Alert.alert('Desactivar respaldo', 'Dejamos de hacer copias nuevas. Las que ya existen siguen guardadas hasta que las borres.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desactivar', onPress: () => void apply() },
      ]);
      return;
    }
    Alert.alert('Respaldo personal', CONSENT_TEXT, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Activar', onPress: () => void apply() },
    ]);
  }

  async function backupNow(confirmShrink = false) {
    if (!userId) return;
    setBusy('backup');
    const outcome = await uploadBackup(userId, { confirmShrink });
    setBusy(null);
    if (outcome.status === 'saved') {
      load();
      Alert.alert('Copia guardada', 'Tu copia está completa y verificada.');
    } else if (outcome.status === 'needs_confirmation') {
      Alert.alert(
        'Esta copia tiene mucho menos',
        'Este teléfono tiene bastante menos historial que tu última copia. Si la guardás, pasa a ser la más reciente (las anteriores se conservan un tiempo). Si cambiaste de teléfono, primero restaurá tu copia.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Guardar igual', style: 'destructive', onPress: () => void backupNow(true) },
        ],
      );
    } else if (outcome.status === 'other_phone') {
      Alert.alert(
        'Otro teléfono registra tu actividad',
        'Para respaldar desde este teléfono tiene que pasar a ser el principal: el otro deja de sincronizar.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Usar este teléfono',
            onPress: () => {
              claimThisPhone(userId).then(() => backupNow(confirmShrink)).catch(() => Alert.alert('Sin conexión', 'Probá de nuevo con conexión.'));
            },
          },
        ],
      );
    } else if (outcome.status === 'not_allowed') {
      Alert.alert('No se pudo respaldar', outcome.reason === 'plus_required'
        ? 'Las copias nuevas son parte de PULSO Plus.'
        : outcome.reason === 'disabled' ? 'Activá el respaldo personal primero.' : 'Tu cuenta está en proceso de borrado.');
    } else {
      Alert.alert('No se pudo respaldar', outcome.code === 'network_unavailable' ? 'Revisá tu conexión.' : 'Probá de nuevo en un momento.');
    }
  }

  function restore() {
    if (!userId || !status?.latest) return;
    const uid = userId;
    Alert.alert(
      'Restaurar la copia',
      'Agregamos a este teléfono lo que falte de tu copia. Lo que ya tenés acá no se reemplaza ni se borra. Este teléfono pasa a ser el principal.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: () => {
            setBusy('restore');
            restoreBackup(uid, { stillCurrent: () => currentUser.current === uid })
              .then(async outcome => {
                if (outcome.status === 'restored') {
                  if (outcome.settings.accentColor) setAccent(outcome.settings.accentColor);
                  if (outcome.settings.weightUnit) setWeightUnit(outcome.settings.weightUnit);
                  if (outcome.settings.themeMode) setThemeMode(outcome.settings.themeMode);
                  await reloadAll();
                  Alert.alert('Copia restaurada', outcome.inserted
                    ? `Se agregaron ${outcome.inserted} registros. ${outcome.kept ? `${outcome.kept} ya estaban en este teléfono.` : ''}`
                    : 'Este teléfono ya tenía todo lo de la copia.');
                } else if (outcome.status !== 'account_changed') {
                  Alert.alert('No se restauró', 'La copia no se pudo descargar o verificar. No cambió nada en este teléfono.');
                }
              })
              .finally(() => setBusy(null));
          },
        },
      ],
    );
  }

  function deleteCopies() {
    Alert.alert('Borrar mis copias', 'Borramos todas tus copias de respaldo y desactivamos el respaldo. Los datos de este teléfono no se tocan.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar copias',
        style: 'destructive',
        onPress: () => {
          setBusy('delete');
          deleteAllBackups().then(load).catch(() => Alert.alert('Sin conexión', 'Probá de nuevo con conexión.')).finally(() => setBusy(null));
        },
      },
    ]);
  }

  const buttonStyle = { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border } as const;
  const text = (size: number, color: string, family: string = F.inter) => ({ fontFamily: family, fontSize: size, lineHeight: size * 1.45, color });

  return (
    <View style={{ marginBottom: 20 }}>
      <Label style={{ marginBottom: 9 }}>RESPALDO PERSONAL</Label>
      <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12 }}>
        {offline ? (
          <View style={{ gap: 10 }}>
            <Text style={text(13, C.textSecondary)}>No pudimos consultar tu respaldo. Tus datos siguen en este teléfono.</Text>
            <PressableScale onPress={load} style={buttonStyle}><Text style={text(10, C.textPrimary, F.monoBold)}>REINTENTAR</Text></PressableScale>
          </View>
        ) : !status ? (
          <ActivityIndicator color={accent} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>Copia en tu cuenta</Text>
                <Text style={text(12, C.textTertiary)}>
                  {status.settings.enabled
                    ? status.entitled ? 'Activado · una copia por día cuando abrís la app' : 'Activado · las copias nuevas requieren Plus'
                    : 'Desactivado'}
                </Text>
              </View>
              <Switch
                value={status.settings.enabled}
                onValueChange={toggle}
                disabled={busy != null}
                trackColor={{ true: accent, false: C.border }}
                accessibilityLabel="Respaldo personal"
              />
            </View>

            <Text style={text(12, C.textSecondary)}>{CONSENT_TEXT}</Text>

            {status.latest ? (
              <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, gap: 4 }}>
                <Text style={text(10, C.textTertiary, F.mono)}>ÚLTIMA COPIA COMPLETA</Text>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{formatDate(status.latest.createdAt)}</Text>
                <Text style={text(12, C.textSecondary)}>{coverageLine(status.latest.manifest.counts)}</Text>
                <Text style={text(11, C.textTertiary)}>
                  {`No incluye: ${status.latest.manifest.excluded.map(item => EXCLUDED_LABELS[item.area]).filter(Boolean).join(', ')}.`}
                </Text>
                {!status.entitled && (
                  <Text style={text(11, C.textTertiary)}>Sin Plus esta copia queda congelada; restaurarla o exportarla es gratis.</Text>
                )}
              </View>
            ) : (
              <Text style={text(12, C.textTertiary)}>
                {status.entitled ? 'Todavía no hay copias.' : 'Todavía no hay copias. Las copias automáticas son parte de PULSO Plus; restaurar o exportar una copia es gratis siempre.'}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {status.canCreate && (
                <PressableScale containerStyle={{ flex: 1 }} onPress={() => void backupNow()} disabled={busy != null} style={buttonStyle}>
                  <Text style={text(10, C.textPrimary, F.monoBold)}>{busy === 'backup' ? 'GUARDANDO…' : 'RESPALDAR AHORA'}</Text>
                </PressableScale>
              )}
              {status.latest && (
                <PressableScale containerStyle={{ flex: 1 }} onPress={restore} disabled={busy != null} style={buttonStyle}>
                  <Text style={text(10, C.textPrimary, F.monoBold)}>{busy === 'restore' ? 'RESTAURANDO…' : 'RESTAURAR'}</Text>
                </PressableScale>
              )}
            </View>
            {status.latest && (
              <PressableScale onPress={deleteCopies} disabled={busy != null} style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <Text style={text(10, C.red, F.mono)}>{busy === 'delete' ? 'BORRANDO…' : 'BORRAR MIS COPIAS'}</Text>
              </PressableScale>
            )}

            <Text style={text(11, C.textTertiary)}>{RETENTION_TEXT}</Text>
            <Text style={text(11, C.textTertiary)}>{SEPARATE_TEXT}</Text>
          </>
        )}
      </View>
    </View>
  );
}

/** Imports a PULSO JSON export (format pulso-export v1) after a preview. */
export function ImportDataRow({ rowStyle }: { rowStyle: object }) {
  const { userId } = useSession();
  const { reloadAll } = useApp();
  const C = useColors();
  const [busy, setBusy] = useState(false);

  async function pick() {
    if (!userId || busy) return;
    const uid = userId;
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    try {
      const text = await new File(picked.assets[0].uri).text();
      const preview = await previewImport(uid, text);
      if (preview.status === 'invalid') {
        const reason = preview.problem === 'foreign_account'
          ? 'Es de otra cuenta. Solo podés importar tus propios datos.'
          : preview.problem === 'too_large'
            ? 'El archivo es demasiado grande.'
            : preview.problem === 'not_an_export' || preview.problem === 'unreadable'
              ? 'No es un archivo de exportación de PULSO.'
              : preview.problem === 'unsupported_version'
                ? 'Es de una versión de PULSO que esta app no conoce. Actualizá la app.'
                : preview.problem === 'empty'
                  ? 'El archivo no tiene datos para importar.'
                  : 'El archivo está incompleto o dañado. No importamos nada.';
        Alert.alert('No se puede importar', reason);
        return;
      }
      const { summary, alreadyHere } = preview;
      const lines = [
        `${summary.workouts} entrenos · ${summary.sets} series`,
        `${summary.meals} registros de comida · ${summary.plans} planes`,
        `${summary.measurements} medidas`,
        alreadyHere ? `${alreadyHere} registros ya están en este teléfono y no se tocan.` : 'Nada de esto está todavía en este teléfono.',
      ];
      Alert.alert('Importar datos', `${lines.join('\n')}\n\nSolo se agregan tus datos personales. No se comparte nada con profesionales.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: () => {
            setBusy(true);
            applyImport(uid, preview.tables)
              .then(async result => {
                await reloadAll();
                Alert.alert('Importación lista', result.inserted ? `Se agregaron ${result.inserted} registros.` : 'Este teléfono ya tenía todo lo del archivo.');
              })
              .catch(error => {
                console.error('[import]', error);
                Alert.alert('No se pudo importar', 'No se guardó nada. Probá de nuevo.');
              })
              .finally(() => setBusy(false));
          },
        },
      ]);
    } catch (error) {
      console.error('[import-read]', error);
      Alert.alert('No se pudo leer el archivo', 'Elegí un archivo .json exportado desde PULSO.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PressableScale onPress={() => void pick()} disabled={busy} style={{ ...rowStyle, marginBottom: 8 }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{busy ? 'Leyendo archivo…' : 'Importar mis datos'}</Text>
        <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textTertiary, marginTop: 3 }}>
          Desde un archivo JSON exportado de PULSO. No reemplaza lo que ya tenés
        </Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.textSecondary }}>↙</Text>
    </PressableScale>
  );
}

const SYNC_CONSENT_TEXT = 'Si activás la sincronización, PULSO guarda tus datos en tu cuenta para que todos tus dispositivos vean y registren lo mismo. No los comparte con tu coach ni nutricionista; eso se controla por separado.';

/** Multi-device sync (Plus): consent, status and "sync now". */
export function DeviceSyncSection() {
  const { userId } = useSession();
  const { reloadAll } = useApp();
  const { accent } = usePreferences();
  const C = useColors();
  const [status, setStatus] = useState<DeviceSyncStatus | null>(null);
  const [local, setLocal] = useState<{ lastSyncAt: Date | null; pending: number; lastError: string | null } | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    getDeviceSyncStatus()
      .then(next => { setStatus(next); setOffline(false); })
      .catch(() => setOffline(true));
    localSyncSummary(userId).then(setLocal).catch(() => {});
  }, [userId]);
  useEffect(load, [load]);

  async function runSync(action: () => Promise<SyncOutcome>) {
    setBusy(true);
    const outcome = await action().catch(() => ({ status: 'offline' as const }));
    setBusy(false);
    if (outcome.status === 'synced' && outcome.applied > 0) await reloadAll().catch(() => {});
    if (outcome.status === 'plus_required') Alert.alert('Parte de PULSO Plus', 'La sincronización entre dispositivos es parte de PULSO Plus.');
    else if (outcome.status === 'offline') Alert.alert('Sin conexión', 'Tus cambios quedan en este teléfono y se sincronizan cuando vuelva la conexión.');
    else if (outcome.status === 'failed') Alert.alert('No se pudo sincronizar', 'Probá de nuevo en un momento.');
    load();
  }

  function toggle(next: boolean) {
    if (!userId) return;
    const uid = userId;
    if (next) {
      Alert.alert('Sincronizar mis dispositivos', SYNC_CONSENT_TEXT, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Activar', onPress: () => void runSync(() => setDeviceSync(uid, true)) },
      ]);
      return;
    }
    Alert.alert('Desactivar la sincronización', 'Borramos la copia sincronizada del servidor. Cada dispositivo conserva lo que ya tiene, pero dejan de compartir cambios.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: () => void runSync(() => setDeviceSync(uid, false)) },
    ]);
  }

  const text = (size: number, color: string, family: string = F.inter) => ({ fontFamily: family, fontSize: size, lineHeight: size * 1.45, color });
  const lastSync = local?.lastSyncAt
    ? local.lastSyncAt.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={{ marginBottom: 20 }}>
      <Label style={{ marginBottom: 9 }}>MIS DISPOSITIVOS</Label>
      <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12 }}>
        {offline ? (
          <View style={{ gap: 10 }}>
            <Text style={text(13, C.textSecondary)}>No pudimos consultar la sincronización. Tus datos siguen en este teléfono.</Text>
            <PressableScale onPress={load} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
              <Text style={text(10, C.textPrimary, F.monoBold)}>REINTENTAR</Text>
            </PressableScale>
          </View>
        ) : !status ? (
          <ActivityIndicator color={accent} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>Sincronizar mis dispositivos</Text>
                <Text style={text(12, C.textTertiary)}>
                  {status.enabled
                    ? status.entitled ? 'Activado · lo que registres en uno aparece en todos' : 'En pausa · requiere PULSO Plus'
                    : 'Desactivado · cada dispositivo guarda solo lo suyo'}
                </Text>
              </View>
              <Switch
                value={status.enabled}
                onValueChange={toggle}
                disabled={busy}
                trackColor={{ true: accent, false: C.border }}
                accessibilityLabel="Sincronizar mis dispositivos"
              />
            </View>
            <Text style={text(12, C.textSecondary)}>{SYNC_CONSENT_TEXT}</Text>
            {status.enabled && (
              <>
                <Text style={text(11, C.textTertiary)}>
                  {[
                    lastSync ? `Última sincronización: ${lastSync}` : 'Todavía no se sincronizó este dispositivo',
                    local?.pending ? `${local.pending} cambios esperando` : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                {status.entitled && (
                  <PressableScale
                    onPress={() => { if (userId) void runSync(() => syncDevices(userId)); }}
                    disabled={busy}
                    style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}
                  >
                    <Text style={text(10, C.textPrimary, F.monoBold)}>{busy ? 'SINCRONIZANDO…' : 'SINCRONIZAR AHORA'}</Text>
                  </PressableScale>
                )}
              </>
            )}
            <Text style={text(11, C.textTertiary)}>
              Si editás lo mismo en dos dispositivos sin conexión, queda el cambio más reciente. Los récords y logros se recalculan en cada uno; los datos de Health Connect y Salud quedan en el teléfono que los importó.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
