import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { VIBE_COLORS, COLORS, FONTS, FONT_SIZE } from '@/constants';

type Props = {
  vibe: string;
  selected?: boolean;
  small?: boolean;
  onPress?: () => void;
};

export function VibeChip({ vibe, selected, small, onPress }: Props) {
  const c = VIBE_COLORS[vibe];

  const containerStyle = [
    styles.base,
    small ? styles.small : styles.normal,
    selected && c
      ? { backgroundColor: c.bg, borderColor: c.bd }
      : styles.unselected,
  ];

  const textStyle = [
    styles.label,
    small ? styles.labelSmall : styles.labelNormal,
    selected && c ? { color: c.fg } : styles.labelUnselected,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <Text style={textStyle}>{vibe}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  normal: {
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  small: {
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  unselected: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  label: {
    fontFamily: FONTS.semibold,
    includeFontPadding: false,
  },
  labelNormal: {
    fontSize: FONT_SIZE.md,
  },
  labelSmall: {
    fontSize: 12.5,
  },
  labelUnselected: {
    color: COLORS.textSecondary,
  },
});
