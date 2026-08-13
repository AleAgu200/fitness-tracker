import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { catalogMediaUrl } from '@/lib/exercise-catalog';
import { workoutXGifSource, workoutXGifUrlFromId } from '@/lib/workoutx';

/** Full-screen GIF viewer for an already-saved exercise, opened by tapping its
 *  animation button in the plan/session lists. Tap outside the card (or ✕) to close.
 *  `gifPath` (local catalog, public URL) is preferred; `wxId` (WorkoutX, legacy/disabled)
 *  is the fallback so exercises saved before the switch keep working. */
export function ExerciseAnimationModal({ nombre, wxId, gifPath, onClose }: {
  nombre: string;
  wxId?: string | null;
  gifPath?: string | null;
  onClose: () => void;
}) {
  const C = useColors();
  const [imageFailed, setImageFailed] = useState(false);
  const source = gifPath ? { uri: catalogMediaUrl(gifPath) } : wxId ? workoutXGifSource(workoutXGifUrlFromId(wxId)) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 360 }}>
          <Animated.View entering={FadeIn.duration(180)} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ flex: 1, fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary, paddingRight: 10 }} numberOfLines={2}>
                {nombre}
              </Text>
              <PressableScale
                haptic="light"
                onPress={onClose}
                accessibilityLabel="Cerrar animación"
                style={{ paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>✕</Text>
              </PressableScale>
            </View>

            <View style={{ aspectRatio: 1, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
              {source && !imageFailed ? (
                <Image
                  source={source}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                  autoplay
                  cachePolicy="memory-disk"
                  transition={150}
                  accessibilityLabel={`Demostración de ${nombre}`}
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textTertiary }}>ANIMACIÓN NO DISPONIBLE</Text>
              )}
            </View>

            <View style={{ padding: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.6, color: C.textTertiary, textTransform: 'uppercase' }}>
                TOCÁ FUERA PARA CERRAR
              </Text>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
