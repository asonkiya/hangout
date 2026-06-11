import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';
import type { PlanRow } from '@/types/database';

export default function HomeScreen() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    fetchPlans();
  }, []));

  useEffect(() => {
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
    setPlans(planList);
    setLoading(false);
  }

  const active = plans.filter((p) => p.state === 'active' || p.state === 'venue_locked');
  const upcoming = plans.filter((p) => p.state === 'open');
  const past = plans.filter((p) => p.state === 'completed' || p.state === 'cancelled');

  type ListItem =
    | { type: 'section'; label: string }
    | { type: 'plan'; plan: PlanRow }
    | { type: 'empty' };

  const items: ListItem[] = [
    ...(active.length ? [{ type: 'section' as const, label: 'Active' }, ...active.map((p) => ({ type: 'plan' as const, plan: p }))] : []),
    ...(upcoming.length ? [{ type: 'section' as const, label: 'Upcoming' }, ...upcoming.map((p) => ({ type: 'plan' as const, plan: p }))] : []),
    ...(past.length ? [{ type: 'section' as const, label: 'Past' }, ...past.map((p) => ({ type: 'plan' as const, plan: p }))] : []),
    ...(plans.length === 0 ? [{ type: 'empty' as const }] : []),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>hangout</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={COLORS.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) =>
            item.type === 'plan' ? item.plan.id : `${item.type}-${i}`
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (item.type === 'section') {
              return <Text style={styles.sectionLabel}>{item.label}</Text>;
            }
            if (item.type === 'empty') {
              return (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No plans yet</Text>
                  <Text style={styles.emptySub}>Tap + to create your first hangout</Text>
                </View>
              );
            }
            const p = item.plan;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/plan/${p.id}`)}
              >
                <Text style={styles.cardTitle}>{p.title}</Text>
                {p.scheduled_for && (
                  <Text style={styles.cardTime}>
                    {new Date(p.scheduled_for).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                )}
                <View style={styles.cardMeta}>
                  <View style={[styles.badge, badgeBg(p.state)]}>
                    <Text style={[styles.badgeText, badgeFg(p.state)]}>
                      {stateLabel(p.state)}
                    </Text>
                  </View>
                  {p.selected_place_name && (
                    <Text style={styles.placeName}>{p.selected_place_name}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/plan/create')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function stateLabel(s: string) {
  return (
    { open: 'Planning', venue_locked: 'Destination set', active: 'Happening now', completed: 'Done', cancelled: 'Cancelled' }[s] ?? s
  );
}
function badgeBg(s: string) {
  if (s === 'active') return { backgroundColor: '#DCFCE7' };
  if (s === 'venue_locked') return { backgroundColor: COLORS.primaryLight };
  return { backgroundColor: COLORS.background };
}
function badgeFg(s: string) {
  if (s === 'active') return { color: COLORS.success };
  if (s === 'venue_locked') return { color: COLORS.primary };
  return { color: COLORS.textSecondary };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  wordmark: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.primary, letterSpacing: -0.5 },
  loader: { marginTop: 60 },
  list: { padding: SPACING.md, paddingBottom: 100 },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: FONT_SIZE.lg, fontWeight: '600', color: COLORS.text },
  cardTime: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: FONT_SIZE.xs, fontWeight: '600' },
  placeName: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  empty: { alignItems: 'center', paddingTop: 80, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '600', color: COLORS.text },
  emptySub: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 32 },
});
