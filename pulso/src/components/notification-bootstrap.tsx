import { router } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/context/session';
import {
  initializeNotifications,
  NotificationResponseData,
  subscribeToNotificationResponses,
} from '@/lib/notifications';

function openNotification(data: NotificationResponseData) {
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
    let unsubscribe = () => {};
    let alive = true;
    subscribeToNotificationResponses(openNotification).then(remove => {
      if (alive) unsubscribe = remove;
      else remove();
    }).catch(error => console.warn('[notifications-listener]', error));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return null;
}
