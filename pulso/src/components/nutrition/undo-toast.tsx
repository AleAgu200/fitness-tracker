import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';

export interface UndoState {
  key: number;
  message: string;
  undo: () => void;
}

const UNDO_MS = 6000;

/** Short confirmation with a DESHACER action; dismisses itself. */
export function UndoToast({ state, onDismiss }: { state: UndoState | null; onDismiss: () => void }) {
  const C = useColors();

  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(onDismiss, UNDO_MS);
    return () => clearTimeout(timer);
  }, [state, onDismiss]);

  if (!state) return null;
  return (
    <Animated.View
      key={state.key}
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 16, right: 16, bottom: 96 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.textSecondary, paddingLeft: 14 }}>
        <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 13, color: C.textPrimary, paddingVertical: 12 }}>{state.message}</Text>
        <PressableScale
          onPress={() => { state.undo(); onDismiss(); }}
          haptic="medium"
          style={{ minHeight: 46, justifyContent: 'center', paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: C.border }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.cyan }}>DESHACER</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}
