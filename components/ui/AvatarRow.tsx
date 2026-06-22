import { View, Text, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { COLORS, FONTS, FONT_SIZE } from '@/constants';

type Props = {
  names: string[];
  max?: number;
  size?: number;
  extraText?: string;
};

export function AvatarRow({ names, max = 4, size = 28, extraText }: Props) {
  const visible = names.slice(0, max);
  const overflow = names.length - max;

  return (
    <View style={styles.row}>
      {visible.map((name, i) => (
        <Avatar
          key={i}
          name={name}
          index={i}
          size={size}
          ring
          style={{ marginLeft: i === 0 ? 0 : -size * 0.28 }}
        />
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.overflow,
            { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.28 },
          ]}
        >
          <Text style={[styles.overflowText, { fontSize: Math.round(size * 0.38) }]}>
            +{overflow}
          </Text>
        </View>
      )}
      {extraText && (
        <Text style={styles.extra}>{extraText}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overflow: {
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  overflowText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.bold,
    includeFontPadding: false,
  },
  extra: {
    marginLeft: 8,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },
});
