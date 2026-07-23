import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import type * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiFetch } from './api';

export interface NotificationPreferences {
  trainingEnabled: boolean;
  trainingTime: string;
  trainingDays: number[];
  waterEnabled: boolean;
  waterStart: string;
  waterEnd: string;
  waterIntervalHours: number;
  messagesEnabled: boolean;
}

export interface NotificationSetupResult {
  permission: NotificationPermissionStatus;
  pushReady: boolean;
}

export type NotificationPermissionStatus = 'undetermined' | 'denied' | 'granted';

export const NOTIFICATION_PERMISSION = {
  UNDETERMINED: 'undetermined',
  DENIED: 'denied',
  GRANTED: 'granted',
} as const satisfies Record<string, NotificationPermissionStatus>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  trainingEnabled: true,
  trainingTime: '18:00',
  trainingDays: [2, 4, 6], // Monday, Wednesday, Friday (Sunday = 1)
  waterEnabled: true,
  waterStart: '08:00',
  waterEnd: '20:00',
  waterIntervalHours: 2,
  messagesEnabled: true,
};

const REMINDER_MARKER = 'pulsoReminder';
const REST_TIMER_NOTIFICATION_ID = 'pulso-rest-timer';
const restTimerPreferenceKey = 'pulso_rest_timer_overlay_enabled';
const tokenKey = 'pulso_expo_push_token';
const preferencesKey = (userId: string) => `pulso_notification_preferences_${userId}`;
let restCompletionNotificationId: string | null = null;

type NotificationsModule = typeof Notifications;
let notificationsPromise: Promise<NotificationsModule | null> | null = null;

/**
 * expo-notifications deliberately throws while its module is evaluated in
 * Expo Go on Android. Load it lazily so the rest of the app remains usable;
 * development and production builds still receive the complete integration.
 */
function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return Promise.resolve(null);
  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications').then(module => {
      module.setNotificationHandler({
        handleNotification: async notification => {
          const isRestTimer = notification.request.content.data?.type === 'rest-timer';
          return {
            shouldPlaySound: !isRestTimer,
            shouldSetBadge: !isRestTimer,
            shouldShowBanner: !isRestTimer,
            shouldShowList: true,
          };
        },
      });
      return module;
    });
  }
  return notificationsPromise;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

async function configureChannels(): Promise<void> {
  if (process.env.EXPO_OS !== 'android') return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await Promise.all([
    Notifications.setNotificationChannelAsync('pulso-general', {
      name: 'PULSO',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#E8FF59',
    }),
    Notifications.setNotificationChannelAsync('pulso-reminders', {
      name: 'Entrenamiento y agua',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#E8FF59',
    }),
    Notifications.setNotificationChannelAsync('pulso-messages', {
      name: 'Mensajes del equipo',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
      lightColor: '#3DDCFF',
    }),
    Notifications.setNotificationChannelAsync('pulso-rest-timer', {
      name: 'Temporizador de descanso',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: [0],
      lightColor: '#3DDCFF',
    }),
  ]);
}

export async function loadNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const saved = await SecureStore.getItemAsync(preferencesKey(userId));
  if (!saved) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function storeNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<void> {
  await SecureStore.setItemAsync(preferencesKey(userId), JSON.stringify(preferences));
}

export async function getNotificationPermission(): Promise<NotificationPermissionStatus> {
  const Notifications = await getNotifications();
  if (!Notifications) return NOTIFICATION_PERMISSION.UNDETERMINED;
  return (await Notifications.getPermissionsAsync()).status;
}

export async function sendTestNotification(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) throw new Error('Las notificaciones requieren un development build en Android.');
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PULSO está listo ⚡',
      body: 'Tus recordatorios se verán así.',
      sound: 'default',
      data: { type: 'test' },
    },
    trigger: null,
  });
}

export async function loadRestTimerOverlayPreference(): Promise<boolean> {
  return (await SecureStore.getItemAsync(restTimerPreferenceKey)) === 'true';
}

export async function setRestTimerOverlayPreference(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await SecureStore.setItemAsync(restTimerPreferenceKey, 'false');
    await cancelRestTimerNotification();
    return false;
  }

  await configureChannels();
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  let permission = (await Notifications.getPermissionsAsync()).status;
  if (permission !== NOTIFICATION_PERMISSION.GRANTED) {
    permission = (await Notifications.requestPermissionsAsync()).status;
  }
  const granted = permission === NOTIFICATION_PERMISSION.GRANTED;
  await SecureStore.setItemAsync(restTimerPreferenceKey, String(granted));
  return granted;
}

async function cancelScheduledRestCompletion(Notifications: NotificationsModule): Promise<void> {
  if (!restCompletionNotificationId) return;
  await Notifications.cancelScheduledNotificationAsync(restCompletionNotificationId).catch(() => {});
  restCompletionNotificationId = null;
}

export async function showRestTimerNotification(
  seconds: number,
  exerciseName?: string,
): Promise<boolean> {
  if (seconds <= 0) return false;
  await configureChannels();
  const Notifications = await getNotifications();
  if (!Notifications) return false;
  if ((await Notifications.getPermissionsAsync()).status !== NOTIFICATION_PERMISSION.GRANTED) return false;

  await cancelScheduledRestCompletion(Notifications);
  const endsAt = new Date(Date.now() + seconds * 1000);
  const finishTime = endsAt.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  await Notifications.scheduleNotificationAsync({
    identifier: REST_TIMER_NOTIFICATION_ID,
    content: {
      title: `DESCANSO · ${duration}`,
      body: `${exerciseName ? `${exerciseName} · ` : ''}termina a las ${finishTime}`,
      color: '#3DDCFF',
      sound: false,
      sticky: true,
      autoDismiss: false,
      data: { type: 'rest-timer' },
    },
    trigger: { channelId: 'pulso-rest-timer' },
  });

  restCompletionNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'DESCANSO TERMINADO ⚡',
      body: exerciseName ? `Listo para continuar con ${exerciseName}.` : 'Listo para la siguiente serie.',
      color: '#E8FF59',
      sound: 'default',
      data: { type: 'rest-complete' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: 'pulso-reminders',
    },
  });
  return true;
}

export async function cancelRestTimerNotification(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await cancelScheduledRestCompletion(Notifications);
  await Notifications.dismissNotificationAsync(REST_TIMER_NOTIFICATION_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(REST_TIMER_NOTIFICATION_ID).catch(() => {});
}

export async function completeRestTimerNotification(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  // The scheduled completion alert is already due; only remove the persistent timer.
  restCompletionNotificationId = null;
  await Notifications.dismissNotificationAsync(REST_TIMER_NOTIFICATION_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(REST_TIMER_NOTIFICATION_ID).catch(() => {});
}

async function clearPulsoReminders(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(item => item.content.data?.[REMINDER_MARKER] === true)
      .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

async function scheduleLocalReminders(preferences: NotificationPreferences): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await clearPulsoReminders();

  const trainingTime = parseTime(preferences.trainingTime);
  if (preferences.trainingEnabled && trainingTime) {
    await Promise.all(preferences.trainingDays.map(weekday =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hora de entrenar ⚡',
          body: 'Tu plan está listo. Abrí PULSO y empezá la sesión.',
          sound: 'default',
          data: { [REMINDER_MARKER]: true, type: 'training' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: trainingTime.hour,
          minute: trainingTime.minute,
          channelId: 'pulso-reminders',
        },
      }),
    ));
  }

  const waterStart = parseTime(preferences.waterStart);
  const waterEnd = parseTime(preferences.waterEnd);
  if (preferences.waterEnabled && waterStart && waterEnd) {
    const startMinutes = waterStart.hour * 60 + waterStart.minute;
    const endMinutes = waterEnd.hour * 60 + waterEnd.minute;
    const step = Math.max(1, preferences.waterIntervalHours) * 60;
    const times: number[] = [];
    for (let at = startMinutes; at <= endMinutes && at < 24 * 60; at += step) times.push(at);

    await Promise.all(times.map(at =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Momento de hidratarte 💧',
          body: 'Tomá un vaso de agua y registralo en PULSO.',
          sound: 'default',
          data: { [REMINDER_MARKER]: true, type: 'water' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Math.floor(at / 60),
          minute: at % 60,
          channelId: 'pulso-reminders',
        },
      }),
    ));
  }
}

function easProjectId(): string | null {
  return process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId
    ?? null;
}

async function syncPushToken(userId: string, enabled: boolean): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;
  const existing = await SecureStore.getItemAsync(tokenKey);
  if (!enabled) {
    if (existing) {
      await apiFetch('/api/notifications/device', {
        method: 'POST',
        body: { token: existing, platform: process.env.EXPO_OS, enabled: false },
      });
    }
    return false;
  }

  const projectId = easProjectId();
  if (!projectId) return false;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (existing && existing !== token) {
    await apiFetch('/api/notifications/device', {
      method: 'POST',
      body: { token: existing, platform: process.env.EXPO_OS, enabled: false },
    }).catch(() => {});
  }
  await SecureStore.setItemAsync(tokenKey, token);
  await apiFetch('/api/notifications/device', {
    method: 'POST',
    body: { token, platform: process.env.EXPO_OS, enabled: true },
  });
  return true;
}

export async function applyNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
  requestPermission = false,
): Promise<NotificationSetupResult> {
  await configureChannels();
  const Notifications = await getNotifications();
  if (!Notifications) {
    await storeNotificationPreferences(userId, preferences);
    return { permission: NOTIFICATION_PERMISSION.UNDETERMINED, pushReady: false };
  }
  let permission = await getNotificationPermission();
  if (requestPermission && permission !== NOTIFICATION_PERMISSION.GRANTED) {
    permission = (await Notifications.requestPermissionsAsync()).status;
  }

  await storeNotificationPreferences(userId, preferences);
  if (permission !== NOTIFICATION_PERMISSION.GRANTED) {
    return { permission, pushReady: false };
  }

  await scheduleLocalReminders(preferences);
  let pushReady = false;
  try {
    pushReady = await syncPushToken(userId, preferences.messagesEnabled);
  } catch (error) {
    console.warn('[notifications-push]', error);
  }
  return { permission, pushReady };
}

/** Refresh schedules and push registration without showing a permission prompt. */
export async function initializeNotifications(userId: string): Promise<void> {
  const preferences = await loadNotificationPreferences(userId);
  await applyNotificationPreferences(userId, preferences, false);
}

export async function unregisterNotificationsForUser(userId: string): Promise<void> {
  const token = await SecureStore.getItemAsync(tokenKey);
  if (!token) return;
  await apiFetch('/api/notifications/device', {
    method: 'POST',
    body: { token, platform: process.env.EXPO_OS, enabled: false },
  });
}

export interface NotificationResponseData {
  type?: unknown;
  senderId?: unknown;
}

export async function subscribeToNotificationResponses(
  listener: (data: NotificationResponseData) => void,
): Promise<() => void> {
  const Notifications = await getNotifications();
  if (!Notifications) return () => {};

  const open = (response: Notifications.NotificationResponse | null | undefined) => {
    if (response) listener(response.notification.request.content.data ?? {});
  };
  open(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}
