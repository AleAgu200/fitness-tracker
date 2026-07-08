import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

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
  permission: Notifications.PermissionStatus;
  pushReady: boolean;
}

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
const tokenKey = 'pulso_expo_push_token';
const preferencesKey = (userId: string) => `pulso_notification_preferences_${userId}`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

export async function getNotificationPermission(): Promise<Notifications.PermissionStatus> {
  return (await Notifications.getPermissionsAsync()).status;
}

export async function sendTestNotification(): Promise<void> {
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

async function clearPulsoReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(item => item.content.data?.[REMINDER_MARKER] === true)
      .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

async function scheduleLocalReminders(preferences: NotificationPreferences): Promise<void> {
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
  let permission = await getNotificationPermission();
  if (requestPermission && permission !== Notifications.PermissionStatus.GRANTED) {
    permission = (await Notifications.requestPermissionsAsync()).status;
  }

  await storeNotificationPreferences(userId, preferences);
  if (permission !== Notifications.PermissionStatus.GRANTED) {
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
