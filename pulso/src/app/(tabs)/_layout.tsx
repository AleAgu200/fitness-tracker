import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ColorValue } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { C, F } from '@/constants/colors';
import { AppProvider } from '@/context/app-state';
import { useSession } from '@/context/session';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function TabIcon({ color, name, focused }: { color: ColorValue; name: IconName; focused: boolean }) {
  const lit = useSharedValue(0);

  useEffect(() => {
    lit.value = withTiming(focused ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [focused, lit]);

  // "Light up" on focus: slight grow + brightness, no bounce
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lit.value * 0.1 }],
    opacity: 0.7 + lit.value * 0.3,
  }));

  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons name={name} size={22} color={color} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { userId, loading } = useSession();

  // Signing out (or an expired session) kicks the user back to the login
  if (!loading && !userId) {
    return <Redirect href={'/(auth)/login' as any} />;
  }

  return (
    <AppProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.bg,
            borderTopColor: C.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: C.yellow,
          tabBarInactiveTintColor: C.textTertiary,
          tabBarLabelStyle: {
            fontFamily: F.mono,
            fontSize: 9,
            letterSpacing: 1.0,
            textTransform: 'uppercase',
          },
        }}
      >
        <Tabs.Screen
          name="hoy"
          options={{
            title: 'HOY',
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="calendar-today" />,
          }}
        />
        <Tabs.Screen
          name="dieta"
          options={{
            title: 'DIETA',
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="silverware-fork-knife" />,
          }}
        />
        <Tabs.Screen
          name="entreno"
          options={{
            title: 'ENTRENO',
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="dumbbell" />,
          }}
        />
        <Tabs.Screen
          name="progreso"
          options={{
            title: 'PROGRESO',
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="chart-bar" />,
          }}
        />
        <Tabs.Screen
          name="pulso"
          options={{
            title: 'PULSO',
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="lightning-bolt" />,
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: 'PERFIL',
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} name="account" />,
          }}
        />
      </Tabs>
    </AppProvider>
  );
}
