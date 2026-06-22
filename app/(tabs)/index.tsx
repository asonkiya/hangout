import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, SHADOWS } from '@/constants';
import { Avatar, AvatarRow, Card, Label, StatePill, VibeChip } from '@/components/ui';
import type { PlanRow } from '@/types/database';

type MemberPreview = { display_name: string };
type PlanWithMembers = PlanRow & { members: MemberPreview[]; heroPhoto?: string };

export default function HomeScreen() {
  const [plans, setPlans] = useState<PlanWithMembers[]>([]);
  const [myInitial, setMyInitial] = useState('?');
  const [loading, setLoading] = useState(true);
  const [pastExpanded, setPastExpanded] = useState(false);
  const router = useRouter();

  // Live ticker dot pulse
  const dotScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useFocusEffect(useCallback(() => { fetchPlans(); }, []));

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setMyInitial((user.email?.[0] ?? 'Y').toUpperCase());
    });

    const channel = supabase
      .channel('plans-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_members' }, () => fetchPlans())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plans' }, () => fetchPlans())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchPlans() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('plan_members')
      .select('plan_id, plans(*)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });

    const planList = (data ?? [])
      .map((row) => (row as Record<string, unknown>).plans as PlanRow)
      .filter(Boolean);

    // Enrich each plan with member names and venue photo
    const enriched = await Promise.all(planList.map(async (plan) => {
      const { data: members } = await supabase
        .from('plan_members')
        .select('users(display_name)')
        .eq('plan_id', plan.id)
        .limit(6);

      const memberNames: MemberPreview[] = (members ?? []).map((m: any) => ({
        display_name: m.users?.display_name ?? '?',
      }));

      let heroPhoto: string | undefined;
      if (plan.selected_place_id) {
        const { data: venue } = await supabase
          .from('venue_candidates')
          .select('photo_urls')
          .eq('plan_id', plan.id)
          .eq('google_place_id', plan.selected_place_id)
          .single();
        heroPhoto = (venue?.photo_urls as string[] | null)?.[0];
      }

      return { ...plan, members: memberNames, heroPhoto };
    }));

    setPlans(enriched);
    setLoading(false);
  }

  const active   = plans.filter((p) => p.state === 'active');
  const nextUp   = plans.find((p) => p.state === 'venue_locked' || p.state === 'open');
  const upcoming = plans.filter((p) => p !== nextUp && (p.state === 'open' || p.state === 'venue_locked'));
  const past     = plans.filter((p) => p.state === 'completed' || p.state === 'cancelled');

  function formatCountdown(iso: string | null): string {
    if (!iso) return '';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Now';
    const h = Math.floor(ms / 3_600_000);
    const d = Math.floor(h / 24);
    if (d > 0) return `in ${d}d`;
    if (h > 0) return `in ${h}h`;
    return 'Soon';
  }

  function formatScheduled(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>hangout</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
          <Avatar name={myInitial} size={34} index={0} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={COLORS.primary} />
      ) : plans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No plans yet</Text>
          <Text style={styles.emptySub}>Tap + below to create your first hangout</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Live ticker */}
          {active.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={styles.ticker}
              onPress={() => router.push(`/plan/${plan.id}`)}
              activeOpacity={0.85}
            >
              <Animated.View style={[styles.tickerDot, { transform: [{ scale: dotScale }] }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.tickerTitle} numberOfLines={1}>
                  {plan.title}{plan.selected_place_name ? ` · ${plan.selected_place_name}` : ''}
                </Text>
                <Text style={styles.tickerSub}>Happening now</Text>
              </View>
              <AvatarRow names={plan.members.map((m) => m.display_name)} size={26} />
            </TouchableOpacity>
          ))}

          {/* NEXT UP hero card */}
          {nextUp && (
            <>
              <Label>Next up</Label>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => router.push(`/plan/${nextUp.id}`)}
              >
                <Card pad={0} style={styles.heroCard}>
                  {nextUp.heroPhoto ? (
                    <Image
                      source={{ uri: nextUp.heroPhoto }}
                      style={styles.heroPhoto}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.heroPhoto, styles.heroPhotoPlaceholder]}>
                      <Text style={styles.heroPlaceholderText}>{nextUp.title[0]}</Text>
                    </View>
                  )}
                  {nextUp.scheduled_for && (
                    <View style={styles.countdownPill}>
                      <Text style={styles.countdownText}>{formatCountdown(nextUp.scheduled_for)}</Text>
                    </View>
                  )}
                  <View style={styles.heroBody}>
                    <View style={styles.heroTitleRow}>
                      <Text style={styles.heroTitle} numberOfLines={1}>{nextUp.title}</Text>
                      {nextUp.vibe && <VibeChip vibe={nextUp.vibe} selected small />}
                    </View>
                    {nextUp.scheduled_for && (
                      <Text style={styles.heroMeta}>{formatScheduled(nextUp.scheduled_for)}</Text>
                    )}
                    {nextUp.selected_place_name && (
                      <Text style={styles.heroMeta}>{nextUp.selected_place_name}</Text>
                    )}
                    <View style={{ marginTop: 4 }}>
                      <AvatarRow
                        names={nextUp.members.map((m) => m.display_name)}
                        size={28}
                        extraText={`${nextUp.members.length} going`}
                      />
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            </>
          )}

          {/* UPCOMING compact rows */}
          {upcoming.length > 0 && (
            <>
              <Label>Upcoming</Label>
              {upcoming.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/plan/${plan.id}`)}
                >
                  <Card pad={14} style={styles.rowCard}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{plan.title}</Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {plan.scheduled_for ? formatScheduled(plan.scheduled_for) : 'Time TBD'}
                        {plan.selected_place_name ? ` · ${plan.selected_place_name}` : ''}
                      </Text>
                    </View>
                    <AvatarRow names={plan.members.map((m) => m.display_name)} size={24} />
                    <StatePill state={plan.state} />
                  </Card>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Past plans (collapsible) */}
          {past.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.pastToggle}
                onPress={() => setPastExpanded((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.pastLabel}>Past plans</Text>
                <View style={styles.pastBadge}>
                  <Text style={styles.pastBadgeText}>{past.length}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={styles.pastChevron}>{pastExpanded ? '∧' : '∨'}</Text>
              </TouchableOpacity>

              {pastExpanded && past.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/plan/${plan.id}`)}
                >
                  <Card pad={14} style={styles.rowCard}>
                    <View style={styles.rowLeft}>
                      <Text style={[styles.rowTitle, { color: COLORS.textSecondary }]} numberOfLines={1}>
                        {plan.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {plan.selected_place_name ?? 'No venue'}
                      </Text>
                    </View>
                    <StatePill state={plan.state} />
                  </Card>
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  wordmark: {
    fontSize: 26,
    fontFamily: FONTS.extrabold,
    color: COLORS.primary,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },

  scroll: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },

  // Live ticker
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.successTint,
    borderWidth: 1.5,
    borderColor: '#C8EDDD',
    borderRadius: 18,
    padding: 14,
    marginBottom: SPACING.xs,
  },
  tickerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
    flexShrink: 0,
  },
  tickerTitle: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    includeFontPadding: false,
  },
  tickerSub: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.medium,
    color: COLORS.successDeep,
    includeFontPadding: false,
  },

  // Hero card
  heroCard: {
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  heroPhoto: {
    width: '100%',
    height: 148,
  },
  heroPhotoPlaceholder: {
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: {
    fontSize: 56,
    fontFamily: FONTS.extrabold,
    color: COLORS.primary,
    opacity: 0.25,
    includeFontPadding: false,
  },
  countdownPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  countdownText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    includeFontPadding: false,
  },
  heroBody: {
    padding: 16,
    gap: SPACING.xs,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroTitle: {
    flex: 1,
    fontSize: FONT_SIZE.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    includeFontPadding: false,
  },
  heroMeta: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },

  // Compact row card
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: FONT_SIZE.lg - 1,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    includeFontPadding: false,
  },
  rowMeta: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },

  // Past plans
  pastToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 4,
    marginTop: SPACING.sm,
  },
  pastLabel: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },
  pastBadge: {
    backgroundColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 1,
  },
  pastBadgeText: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },
  pastChevron: {
    fontSize: 12,
    color: COLORS.textFaint,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    includeFontPadding: false,
  },
  emptySub: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
