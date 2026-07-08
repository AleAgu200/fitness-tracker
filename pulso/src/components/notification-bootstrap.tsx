import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/context/session';
import { initializeNotifications } from '@/lib/notifications';

function openNotification(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return;
  const data = response.notification.request.content.data;
  if (data?.type === 'message' && typeof data.senderId === 'string') {
    router.push({ pathname: '/mensajes', params: { with: data.senderId } } as never);
  } else if (data?.type === 'training') {
    router.push('/(tabs)/entreno' as never);
  } else if (data?.type === 'water') {
    router.push('/(tabs)/dieta' as never);
  }
}

export function NotificationBootstrap() {
  const { userId } = useSession();

  useEffect(() => {
    if (userId) initializeNotifications(userId).catch(error => console.warn('[notifications-init]', error));
  }, [userId]);

  useEffect(() => {
    openNotification(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => subscription.remove();
  }, []);

  return null;
}
