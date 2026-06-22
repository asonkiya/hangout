import { View, Text, StyleSheet } from 'react-native';
import { AVATAR_COLORS, FONTS } from '@/constants';

type Props = {
  name: string;
  index?: number;
  size?: number;
  ring?: boolean;
  style?: object;
};

export function Avatar({ name, index = 0, size = 36, ring = false, style }: Props) {
  const letter = (name?.[0] ?? '?').toUpperCase();
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const fontSize = Math.round(size * 0.42);

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        ring && styles.ring,
        style,
      ]}
    >
      <Text style={[styles.letter, { fontSize, fontFamily: FONTS.bold }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ring: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  letter: {
    color: '#fff',
    includeFontPadding: false,
  },
});
