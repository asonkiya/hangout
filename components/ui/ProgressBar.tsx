import { View, StyleSheet } from 'react-native';
import { COLORS } from '@/constants';

type Props = {
  progress: number; // 0 to 1
  color?: string;
  height?: number;
};

export function ProgressBar({ progress, color = COLORS.primary, height = 6 }: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, height, borderRadius: height, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  fill: {},
});
