import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { F, useColors, withAlpha } from '@/constants/colors';
import { useEntitlement } from '@/context/entitlement';
import { usePreferences } from '@/context/preferences';
import { purchasesSupported } from '@/lib/purchases';

const BENEFITS = [
  { title: 'Planes con IA sin límite', detail: 'Regenerá y ajustá tu plan cuando cambie tu objetivo.' },
  { title: 'Sin anuncios', detail: 'Entrá directo al entreno, sin esperas.' },
  { title: 'Progreso completo', detail: 'Historial sin recortes y exportación de tus datos.' },
  { title: 'Respaldo en la nube', detail: 'Recuperá todo si cambiás de teléfono.' },
];

/**
 * Shown when the athlete asks for paid work they are not entitled to.
 *
 * Never blocks logging or an assigned plan — those stay free by design. The
 * server is what actually refuses paid work; this is the explanation.
 */
export function Paywall({ visible, onClose, reason }: { visible: boolean; onClose: () => void; reason?: string }) {
  const C = useColors();
  const { accent } = usePreferences();
  const { packages, purchase, restore, freeUsed, freeLimit } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy(index: number) {
    const item = packages[index];
    if (!item) return;
    setBusy(true);
    setError(null);
    const outcome = await purchase(item);
    setBusy(false);
    if (outcome === 'purchased') onClose();
    else if (outcome === 'failed') setError('No se pudo completar la compra. Intentá de nuevo.');
  }

  async function onRestore() {
    setBusy(true);
    setError(null);
    const restored = await restore();
    setBusy(false);
    if (restored) onClose();
    else setError('No encontramos una suscripción activa para restaurar.');
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeIn.duration(180)} style={{ backgroundColor: C.bg, borderTopWidth: 1, borderColor: withAlpha(accent, 0.4), maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Image
                source={require('../../assets/expo.icon/Assets/1000399110(1).png')}
                style={{ width: 40, height: 40 }}
                contentFit="contain"
                accessibilityLabel="PULSO"
              />
              <View style={{ borderWidth: 1, borderColor: withAlpha(accent, 0.35), backgroundColor: withAlpha(accent, 0.06), paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: accent }}>PULSO PLUS</Text>
              </View>
            </View>

            <Text style={{ fontFamily: F.grotesk, fontSize: 24, lineHeight: 30, color: C.textPrimary }}>
              {reason === 'free_quota_exhausted'
                ? 'Ya usaste tu plan gratis'
                : 'Llevá PULSO más lejos'}
            </Text>

            {reason === 'free_quota_exhausted' && (
              <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 20, color: C.textSecondary }}>
                Generaste {freeUsed} de {freeLimit} {freeLimit === 1 ? 'plan incluido' : 'planes incluidos'}.
                Tu plan actual y todo tu registro siguen funcionando igual.
              </Text>
            )}

            <View style={{ gap: 12 }}>
              {BENEFITS.map(benefit => (
                <View key={benefit.title} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: accent }}>◆</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{benefit.title}</Text>
                    <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>{benefit.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            {!purchasesSupported ? (
              <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textTertiary }}>
                Las compras no están disponibles en esta versión de la app.
              </Text>
            ) : packages.length === 0 ? (
              <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textTertiary }}>
                No pudimos cargar los precios. Revisá tu conexión e intentá de nuevo.
              </Text>
            ) : (
              packages.map((item, index) => (
                <Pressable
                  key={item.identifier}
                  disabled={busy}
                  onPress={() => buy(index)}
                  style={{
                    borderWidth: 1,
                    borderColor: index === 0 ? accent : withAlpha(C.textTertiary, 0.4),
                    backgroundColor: index === 0 ? withAlpha(accent, 0.08) : 'transparent',
                    padding: 16,
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>
                    {item.product.title || item.identifier}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 18, color: accent, marginTop: 4 }}>
                    {item.product.priceString}
                  </Text>
                  {!!item.product.description && (
                    <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textSecondary, marginTop: 4 }}>
                      {item.product.description}
                    </Text>
                  )}
                </Pressable>
              ))
            )}

            {busy && <ActivityIndicator color={accent} />}
            {error && (
              <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.red }}>{error}</Text>
            )}

            <Pressable disabled={busy} onPress={onRestore} style={{ paddingVertical: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1, color: C.textTertiary, textAlign: 'center' }}>
                RESTAURAR COMPRA
              </Text>
            </Pressable>

            <Pressable onPress={onClose} style={{ paddingVertical: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1, color: C.textSecondary, textAlign: 'center' }}>
                AHORA NO
              </Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
