import { useRef } from 'react';
import { Text, StyleSheet, Pressable, ViewStyle, Animated } from 'react-native';
import { COLORS, FONTS, FONT_SIZE, RADIUS, SHADOWS } from '@/constants';

type Variant = 'primary' | 'ghost' | 'tint' | 'text';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  variant?: Variant;
  size?: Size;
  onPress?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const HEIGHT: Record<Size, number> = { sm: 44, md: 52, lg: 56 };
const FONT: Record<Size, number> = { sm: FONT_SIZE.sm, md: FONT_SIZE.md, lg: FONT_SIZE.lg };

export function HButton({
  label,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled,
  fullWidth,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start();
  }
  function handlePressOut() {
    Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }).start();
  }

  const containerStyle = [
    styles.base,
    { height: HEIGHT[size] },
    variant === 'primary' && styles.primary,
    variant === 'ghost' && styles.ghost,
    variant === 'tint' && styles.tint,
    variant === 'text' && styles.textBtn,
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ];

  const textStyle = [
    styles.label,
    { fontSize: FONT[size] },
    variant === 'primary' && styles.labelPrimary,
    variant === 'ghost' && styles.labelGhost,
    variant === 'tint' && styles.labelTint,
    variant === 'text' && styles.labelText,
  ];

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth]}>
      <Pressable
        style={containerStyle}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
      >
        <Text style={textStyle}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.button,
  },
  ghost: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  tint: {
    backgroundColor: COLORS.primaryLight,
  },
  textBtn: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.45,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    fontFamily: FONTS.semibold,
    includeFontPadding: false,
  },
  labelPrimary: { color: '#fff' },
  labelGhost:   { color: COLORS.text },
  labelTint:    { color: COLORS.primary },
  labelText:    { color: COLORS.textSecondary },
});
