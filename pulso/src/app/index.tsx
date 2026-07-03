import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/context/session';

export default function Index() {
  const { userId, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      router.replace('/(auth)/login' as any);
    } else {
      router.replace('/hoy' as any);
    }
  }, [loading, userId]);

  return null;
}
