import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, FONTS } from '@/constants';
import type { PlanState } from '@/types/database';

const CONFIG: Record<string, { bg: string; fg: string; label: string; dot?: boolean }> = {
  open:         { bg: COLORS.warningTint,  fg: COLORS.warningDeep,  label: 'Planning' },
  venue_locked: { bg: COLORS.primaryLight, fg: COLORS.primary,      label: 'Locked in' },
  active:       { bg: COLORS.successTint,  fg: COLORS.successDeep,  label: 'LIVE', dot: true },
  completed:    { bg: COLORS.border,       fg: COLORS.textSecondary, label: 'Done' },
  cancelled:    { bg: COLORS.errorTint,    fg: COLORS.error,         label: 'Cancelled' },
};

type Props = { state: PlanState };

export function StatePill({ state }: Props) {
  const c = CONFIG[state] ?? CONFIG.open;
  const dotScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!c.dot) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [c.dot]);

  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      {c.dot && (
        <Animated.View
          style={[styles.dot, { backgroundColor: c.fg, transform: [{ scale: dotScale }] }]}
        />
      )}
      <Text style={[styles.label, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 12.5,
    fontFamily: FONTS.bold,
    includeFontPadding: false,
  },
});
