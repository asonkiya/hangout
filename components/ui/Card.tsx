import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SHADOWS } from '@/constants';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  pad?: number;
};

export function Card({ children, style, pad = 16 }: Props) {
  return (
    <View style={[styles.card, { padding: pad }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    ...SHADOWS.card,
  },
});
