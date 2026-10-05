import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { F, useColors } from '@/constants/colors';

/** Password field with an eye button that shows or hides what was typed. */
export function PasswordInput({ style, ...props }: Omit<TextInputProps, 'secureTextEntry'>) {
  const C = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={C.textTertiary}
        style={[
          {
            backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
            padding: 14, paddingRight: 50, color: C.textPrimary, fontFamily: F.inter, fontSize: 15,
          },
          style,
        ]}
      />
      <Pressable
        onPress={() => setVisible(value => !value)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        hitSlop={8}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <MaterialCommunityIcons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.textSecondary} />
      </Pressable>
    </View>
  );
}
