import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { C, F } from '@/constants/colors';
import { AppProvider } from '@/context/app-state';

type TabIconProps = { color: string; name: string };

function TabIcon({ color, name }: TabIconProps) {
  return <SymbolView name={name as any} tintColor={color} type="hierarchical" style={{ width: 22, height: 22 }} />;
}

export default function TabsLayout() {
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
            tabBarIcon: ({ color }) => <TabIcon color={color} name="calendar.day.timeline.left" />,
          }}
        />
        <Tabs.Screen
          name="dieta"
          options={{
            title: 'DIETA',
            tabBarIcon: ({ color }) => <TabIcon color={color} name="fork.knife" />,
          }}
        />
        <Tabs.Screen
          name="entreno"
          options={{
            title: 'ENTRENO',
            tabBarIcon: ({ color }) => <TabIcon color={color} name="dumbbell" />,
          }}
        />
        <Tabs.Screen
          name="progreso"
          options={{
            title: 'PROGRESO',
            tabBarIcon: ({ color }) => <TabIcon color={color} name="chart.bar.fill" />,
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: 'PERFIL',
            tabBarIcon: ({ color }) => <TabIcon color={color} name="person.fill" />,
          }}
        />
      </Tabs>
    </AppProvider>
  );
}
