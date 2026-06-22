import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS, FONTS, SHADOWS } from '@/constants';

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    const iconName = route.name === 'index' ? 'calendar' : 'user';
    const label    = route.name === 'index' ? 'Plans' : 'You';

    return { route, isFocused, iconName, label, onPress };
  });

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 16 }]}>
      {/* Left tab */}
      <TouchableOpacity style={styles.tab} onPress={tabs[0]?.onPress} activeOpacity={0.7}>
        <Feather
          name={tabs[0]?.iconName as any}
          size={22}
          color={tabs[0]?.isFocused ? COLORS.primary : COLORS.textFaint}
          strokeWidth={1.8}
        />
        <Text style={[styles.tabLabel, { color: tabs[0]?.isFocused ? COLORS.primary : COLORS.textFaint }]}>
          {tabs[0]?.label}
        </Text>
      </TouchableOpacity>

      {/* Center create button */}
      <View style={styles.centerWrap}>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/plan/create')}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={26} color="#fff" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {/* Right tab */}
      <TouchableOpacity style={styles.tab} onPress={tabs[1]?.onPress} activeOpacity={0.7}>
        <Feather
          name={tabs[1]?.iconName as any}
          size={22}
          color={tabs[1]?.isFocused ? COLORS.primary : COLORS.textFaint}
          strokeWidth={1.8}
        />
        <Text style={[styles.tabLabel, { color: tabs[1]?.isFocused ? COLORS.primary : COLORS.textFaint }]}>
          {tabs[1]?.label}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 34,
    paddingTop: 10,
  },
  tab: {
    width: 72,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    includeFontPadding: false,
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
  },
  createBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.surface,
    ...SHADOWS.button,
  },
});
