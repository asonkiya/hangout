import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE, AUTO_SELECT_THRESHOLD } from '@/constants';
import type { VenueCandidateRow } from '@/types/database';

const CARD_WIDTH = Dimensions.get('window').width - SPACING.lg * 2;

export default function VenuesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [candidates, setCandidates] = useState<VenueCandidateRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [myName, setMyName] = useState('Someone');
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUid(user.id);
        const { data: u } = await supabase.from('users').select('display_name').eq('id', user.id).single();
        if (u) setMyName(u.display_name);
      }
      const { data: plan } = await supabase.from('plans').select('title').eq('id', id!).single();
      if (plan) setPlanTitle(plan.title);
    })();
    loadVenues();
  }, [id]);

  async function loadVenues() {
    setLoading(true);
    setError(null);

    // Fetch existing candidates first
    const { data: existing } = await supabase
      .from('venue_candidates')
      .select('*')
      .eq('plan_id', id!)
      .order('created_at');

    if (existing && existing.length > 0) {
      setCandidates(existing);
      setLoading(false);
      return;
    }

    // No candidates yet — get location then invoke edge function
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Location permission is needed to find venues near you.');
      setLoading(false);
      return;
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await supabase
      .from('plans')
      .update({ anchor_lat: pos.coords.latitude, anchor_lng: pos.coords.longitude })
      .eq('id', id!);

    const { data: { session } } = await supabase.auth.getSession();
    const { error: fnError } = await supabase.functions.invoke('search-venues', {
      body: { plan_id: id! },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });

    if (fnError) {
      setError('Could not load venues. Check your internet connection and try again.');
      setLoading(false);
      return;
    }

    // Re-fetch after population
    const { data: fresh } = await supabase
      .from('venue_candidates')
      .select('*')
      .eq('plan_id', id!)
      .order('created_at');

    if (!fresh || fresh.length === 0) {
      setError('No venues found nearby. Try setting an anchor location for this plan.');
    }
    const sorted = (fresh ?? []).slice().sort((a, b) => {
      if (a.eta_seconds == null && b.eta_seconds == null) return 0;
      if (a.eta_seconds == null) return 1;
      if (b.eta_seconds == null) return -1;
      return a.eta_seconds - b.eta_seconds;
    });
    setCandidates(sorted);
    setLoading(false);
  }

  async function checkAutoSelect(venue: VenueCandidateRow) {
    const [{ count: totalMembers }, { count: rightSwipes }] = await Promise.all([
      supabase
        .from('plan_members')
        .select('*', { count: 'exact', head: true })
        .eq('plan_id', id!),
      supabase
        .from('venue_swipes')
        .select('*', { count: 'exact', head: true })
        .eq('venue_candidate_id', venue.id)
        .eq('direction', 'right'),
    ]);

    if (!totalMembers || !rightSwipes) return;
    if (rightSwipes / totalMembers < AUTO_SELECT_THRESHOLD) return;

    // Threshold met — auto-lock
    await supabase
      .from('plans')
      .update({
        selected_place_id: venue.google_place_id,
        selected_place_name: venue.name,
        state: 'venue_locked' as const,
      })
      .eq('id', id!);

    await supabase.from('venue_selection_events').insert({
      plan_id: id!,
      venue_candidate_id: venue.id,
      selected_by_user_id: uid!,
      selection_type: 'auto' as const,
    });

    supabase.functions.invoke('notify', {
      body: {
        event: 'venue_locked',
        plan_id: id,
        actor_user_id: uid,
        extra: { actor_name: myName, plan_title: planTitle, place_name: venue.name },
      },
    });

    Alert.alert(
      'Venue locked!',
      `The group voted — "${venue.name}" is your destination.`,
      [{ text: 'Let\'s go!', onPress: () => router.back() }],
    );
  }

  async function swipe(direction: 'right' | 'left') {
    const venue = candidates[idx];
    if (!venue || !uid) return;

    await supabase.from('venue_swipes').upsert({
      plan_id: id!,
      user_id: uid,
      venue_candidate_id: venue.id,
      direction,
    });

    if (direction === 'right') {
      await checkAutoSelect(venue);
    }

    setIdx((i) => i + 1);
  }

  async function selectVenue(venue: VenueCandidateRow) {
    Alert.alert('Lock this venue?', `Set "${venue.name}" as the destination?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Lock it in',
        onPress: async () => {
          await supabase
            .from('plans')
            .update({
              selected_place_id: venue.google_place_id,
              selected_place_name: venue.name,
              state: 'venue_locked' as const,
            })
            .eq('id', id!);
          await supabase.from('venue_selection_events').insert({
            plan_id: id!,
            venue_candidate_id: venue.id,
            selected_by_user_id: uid!,
            selection_type: 'host' as const,
          });
          supabase.functions.invoke('notify', {
            body: {
              event: 'venue_locked',
              plan_id: id,
              actor_user_id: uid,
              extra: { actor_name: myName, plan_title: planTitle, place_name: venue.name },
            },
          });
          router.back();
        },
      },
    ]);
  }

  const current = candidates[idx];
  const done = idx >= candidates.length && candidates.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>{'<-'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pick a spot</Text>
        <Text style={styles.counter}>
          {candidates.length > 0 ? `${Math.min(idx + 1, candidates.length)}/${candidates.length}` : ''}
        </Text>
      </View>
      <View style={styles.body}>
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.emptySub}>Finding spots nearby…</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No venues found</Text>
            <Text style={styles.emptySub}>{error}</Text>
            <TouchableOpacity style={styles.restartBtn} onPress={loadVenues}>
              <Text style={styles.restartText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : done ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>All done swiping!</Text>
            <Text style={styles.emptySub}>Check back to see what the group picked.</Text>
            <TouchableOpacity style={styles.restartBtn} onPress={() => setIdx(0)}>
              <Text style={styles.restartText}>Start over</Text>
            </TouchableOpacity>
          </View>
        ) : current ? (
          <>
            <View style={[styles.card, { width: CARD_WIDTH }]}>
              <View style={styles.cardContent}>
                <Text style={styles.venueName}>{current.name}</Text>
                {current.category && <Text style={styles.venueCat}>{current.category}</Text>}
                <View style={styles.meta}>
                  {current.eta_seconds != null && (
                    <Text style={styles.etaChip}>
                      {current.eta_seconds < 60
                        ? `< 1 min`
                        : `~${Math.round(current.eta_seconds / 60)} min away`}
                    </Text>
                  )}
                  {current.rating != null && <Text style={styles.metaChip}>★ {current.rating}</Text>}
                  {current.price_level != null && current.price_level > 0 && (
                    <Text style={styles.metaChip}>{'$'.repeat(current.price_level)}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.lockBtn} onPress={() => selectVenue(current)}>
                <Text style={styles.lockBtnText}>Lock this in</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.swipeActions}>
              <TouchableOpacity style={[styles.swipeBtn, styles.swipeNo]} onPress={() => swipe('left')}>
                <Text style={styles.swipeNoText}>Pass</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.swipeBtn, styles.swipeYes]} onPress={() => swipe('right')}>
                <Text style={styles.swipeYesText}>Like</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { fontSize: FONT_SIZE.xl, color: COLORS.primary, marginRight: SPACING.md },
  headerTitle: { flex: 1, fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  counter: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.xl },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  cardContent: { padding: SPACING.xl, gap: SPACING.sm, minHeight: 200 },
  venueName: { fontSize: FONT_SIZE.xxl, fontWeight: '700', color: COLORS.text },
  venueCat: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  meta: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  metaChip: {
    fontSize: FONT_SIZE.sm,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 8,
    color: COLORS.text,
    overflow: 'hidden',
  },
  etaChip: {
    fontSize: FONT_SIZE.sm,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 8,
    color: COLORS.primary,
    fontWeight: '600',
    overflow: 'hidden',
  },
  lockBtn: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: SPACING.md, alignItems: 'center' },
  lockBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
  swipeActions: { flexDirection: 'row', gap: SPACING.lg },
  swipeBtn: { flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  swipeNo: { backgroundColor: '#FEE2E2' },
  swipeNoText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.error },
  swipeYes: { backgroundColor: '#DCFCE7' },
  swipeYesText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.success },
  emptyState: { alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  restartBtn: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  restartText: { color: COLORS.primary, fontWeight: '600', fontSize: FONT_SIZE.md },
});
