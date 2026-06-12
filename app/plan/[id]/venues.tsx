import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  Alert,
  Linking,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  clamp,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS, SHADOWS } from '@/constants';
import { NavHead, ProgressBar, AvatarRow } from '@/components/ui';
import { MatchMoment } from '@/components/MatchMoment';
import type { VenueCandidateRow } from '@/types/database';

type VenueWithSuggester = VenueCandidateRow & { suggester_name?: string | null };

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - SPACING.lg * 2;
const FLING_THRESHOLD = 120;
const AUTO_SELECT_THRESHOLD = 0.6;

export default function VenuesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [candidates, setCandidates] = useState<VenueWithSuggester[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [myName, setMyName] = useState('Someone');
  const [isHost, setIsHost] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [matchVisible, setMatchVisible] = useState(false);
  const [matchVenue, setMatchVenue] = useState<VenueWithSuggester | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const router = useRouter();

  // Swipe animation values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const pastThreshold = useSharedValue(false);

  // Reset card position when index changes
  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    setPhotoIdx(0);
  }, [idx]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUid(user.id);
        const { data: u } = await supabase.from('users').select('display_name').eq('id', user.id).single();
        if (u) setMyName(u.display_name);
        const { data: mem } = await supabase.from('plan_members').select('role').eq('plan_id', id!).eq('user_id', user.id).single();
        if (mem?.role === 'host') setIsHost(true);
      }
      const { data: plan } = await supabase.from('plans').select('title').eq('id', id!).single();
      if (plan) setPlanTitle(plan.title);

      const { count } = await supabase
        .from('plan_members')
        .select('*', { count: 'exact', head: true })
        .eq('plan_id', id!);
      setMemberCount(count ?? 0);
    })();
    loadVenues();
    const channel = supabase
      .channel(`venues-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'venue_candidates', filter: `plan_id=eq.${id}` }, async (payload) => {
        const row = payload.new as VenueCandidateRow;
        let suggester_name: string | null = null;
        if (row.suggested_by_user_id) {
          const { data: u } = await supabase.from('users').select('display_name').eq('id', row.suggested_by_user_id).single();
          suggester_name = u?.display_name ?? null;
        }
        setCandidates((prev) => prev.some((c) => c.id === row.id) ? prev : [...prev, { ...row, suggester_name }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  async function loadVenues() {
    setLoading(true);
    setError(null);
    const { data: existing } = await supabase
      .from('venue_candidates')
      .select('*, suggester:users!suggested_by_user_id(display_name)')
      .eq('plan_id', id!)
      .order('created_at');
    const enriched: VenueWithSuggester[] = (existing ?? []).map((row: any) => ({
      ...row,
      suggester_name: row.suggester?.display_name ?? null,
    }));
    const hasNearbySearch = enriched.some((r) => r.source === 'nearby_search');
    if (enriched.length > 0 && hasNearbySearch) {
      setCandidates(enriched);
      setLoading(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Location permission is needed to find venues near you.');
      setLoading(false);
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await supabase.from('plans').update({ anchor_lat: pos.coords.latitude, anchor_lng: pos.coords.longitude }).eq('id', id!);
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
    const { data: fresh } = await supabase
      .from('venue_candidates')
      .select('*, suggester:users!suggested_by_user_id(display_name)')
      .eq('plan_id', id!)
      .order('created_at');
    const freshEnriched: VenueWithSuggester[] = (fresh ?? []).map((row: any) => ({
      ...row,
      suggester_name: row.suggester?.display_name ?? null,
    }));
    const sorted = freshEnriched.slice().sort((a, b) => {
      if (a.eta_seconds == null && b.eta_seconds == null) return 0;
      if (a.eta_seconds == null) return 1;
      if (b.eta_seconds == null) return -1;
      return a.eta_seconds - b.eta_seconds;
    });
    if (!sorted.length) setError('No venues found nearby. Try setting an anchor location for this plan.');
    setCandidates(sorted);
    setLoading(false);
  }

  async function checkAutoSelect(venue: VenueWithSuggester) {
    const [{ count: totalMembers }, { count: rightSwipes }] = await Promise.all([
      supabase.from('plan_members').select('*', { count: 'exact', head: true }).eq('plan_id', id!),
      supabase.from('venue_swipes').select('*', { count: 'exact', head: true }).eq('venue_candidate_id', venue.id).eq('direction', 'right'),
    ]);
    if (!totalMembers || !rightSwipes) return;
    if (rightSwipes / totalMembers < AUTO_SELECT_THRESHOLD) return;

    await supabase.from('plans').update({
      selected_place_id: venue.google_place_id,
      selected_place_name: venue.name,
      state: 'venue_locked' as const,
    }).eq('id', id!);
    await supabase.from('venue_selection_events').insert({
      plan_id: id!, venue_candidate_id: venue.id, selected_by_user_id: uid!, selection_type: 'auto' as const,
    });
    supabase.functions.invoke('notify', {
      body: { event: 'venue_locked', plan_id: id, actor_user_id: uid, extra: { actor_name: myName, plan_title: planTitle, place_name: venue.name } },
    });
    setMatchVenue(venue);
    setMatchVisible(true);
  }

  function doSwipe(direction: 'right' | 'left') {
    const venue = candidates[idx];
    if (!venue || !uid) return;
    supabase.from('venue_swipes').upsert({
      plan_id: id!, user_id: uid, venue_candidate_id: venue.id, direction,
    }).then(() => {
      if (direction === 'right') checkAutoSelect(venue);
    });
    setIdx((i) => i + 1);
  }

  function flingCard(direction: 'right' | 'left') {
    'worklet';
    translateX.value = withTiming(direction === 'right' ? SCREEN_W * 1.5 : -SCREEN_W * 1.5, { duration: 220 }, () => {
      runOnJS(doSwipe)(direction);
    });
  }

  async function selectVenue(venue: VenueWithSuggester) {
    Alert.alert('Lock this venue?', `Set "${venue.name}" as the destination?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock it in', onPress: async () => {
        await supabase.from('plans').update({
          selected_place_id: venue.google_place_id, selected_place_name: venue.name, state: 'venue_locked' as const,
        }).eq('id', id!);
        await supabase.from('venue_selection_events').insert({
          plan_id: id!, venue_candidate_id: venue.id, selected_by_user_id: uid!, selection_type: 'host' as const,
        });
        supabase.functions.invoke('notify', {
          body: { event: 'venue_locked', plan_id: id, actor_user_id: uid, extra: { actor_name: myName, plan_title: planTitle, place_name: venue.name } },
        });
        router.back();
      }},
    ]);
  }

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.15;
      const over = Math.abs(e.translationX) > FLING_THRESHOLD;
      if (over !== pastThreshold.value) {
        pastThreshold.value = over;
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onEnd((e) => {
      const shouldFling = Math.abs(e.translationX) > FLING_THRESHOLD || Math.abs(e.velocityX) > 800;
      if (shouldFling) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        flingCard(e.translationX > 0 ? 'right' : 'left');
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 180 });
        translateY.value = withSpring(0, { damping: 15, stiffness: 180 });
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(translateX.value, [-SCREEN_W / 2, 0, SCREEN_W / 2], [-12, 0, 12], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, FLING_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const nopeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-20, -FLING_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const current = candidates[idx];
  const photos = (current?.photo_urls as string[] | null) ?? [];
  const done = idx >= candidates.length && candidates.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <NavHead
          onBack={() => router.back()}
          title="Pick the spot"
          right={
            <TouchableOpacity onPress={() => router.push(`/plan/${id}/suggest`)} hitSlop={10} style={styles.suggestBtn}>
              <Feather name="plus" size={14} color={COLORS.primary} strokeWidth={2.4} />
              <Text style={styles.suggestBtnText}>Suggest</Text>
            </TouchableOpacity>
          }
        />
        {candidates.length > 0 && (
          <View style={styles.progress}>
            <ProgressBar progress={idx / candidates.length} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Finding spots nearby…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No venues found</Text>
            <Text style={styles.emptySub}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadVenues}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : done ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>All done swiping!</Text>
            <Text style={styles.emptySub}>Check back to see what the group picked.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setIdx(0)}>
              <Text style={styles.retryText}>Start over</Text>
            </TouchableOpacity>
          </View>
        ) : current ? (
          <>
            {/* Card stack */}
            <View style={styles.stack}>
              {/* Back cards */}
              {[1, 0].map((offset) => {
                const nextCard = candidates[idx + offset + 1];
                if (!nextCard) return null;
                return (
                  <View
                    key={nextCard.id}
                    style={[
                      styles.card,
                      { width: CARD_W },
                      { transform: [{ translateY: -(offset + 1) * 8 }, { scale: 1 - (offset + 1) * 0.03 }] },
                    ]}
                  />
                );
              })}

              {/* Front card */}
              <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.card, styles.frontCard, { width: CARD_W }, cardStyle]}>
                  {/* LIKE / NOPE stamps */}
                  <Animated.View style={[styles.stamp, styles.likeStamp, likeStampStyle]}>
                    <Text style={[styles.stampText, { color: COLORS.success }]}>LIKE</Text>
                  </Animated.View>
                  <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStampStyle]}>
                    <Text style={[styles.stampText, { color: COLORS.error }]}>NOPE</Text>
                  </Animated.View>

                  {/* Suggested-by pill */}
                  {current.suggester_name && (
                    <View style={styles.suggestedPill}>
                      <Feather name="user" size={11} color="#fff" strokeWidth={2.4} />
                      <Text style={styles.suggestedPillText}>Suggested by {current.suggester_name}</Text>
                    </View>
                  )}

                  {/* Photo area */}
                  <View style={styles.photoWrap}>
                    {photos.length > 0 ? (
                      <>
                        <Image source={{ uri: photos[photoIdx] }} style={styles.photo} resizeMode="cover" />
                        {/* Story segments */}
                        {photos.length > 1 && (
                          <View style={styles.segments}>
                            {photos.map((_, i) => (
                              <View key={i} style={[styles.segment, { opacity: i === photoIdx ? 1 : 0.45 }]} />
                            ))}
                          </View>
                        )}
                        {/* Tap zones */}
                        <TouchableOpacity
                          style={[styles.tapZone, { left: 0 }]}
                          onPress={() => setPhotoIdx((i) => Math.max(0, i - 1))}
                          activeOpacity={1}
                        />
                        <TouchableOpacity
                          style={[styles.tapZone, { right: 0 }]}
                          onPress={() => setPhotoIdx((i) => Math.min(photos.length - 1, i + 1))}
                          activeOpacity={1}
                        />
                      </>
                    ) : (
                      <View style={[styles.photo, styles.photoPlaceholder]}>
                        <Text style={styles.photoPlaceholderText}>{current.name[0]}</Text>
                      </View>
                    )}
                    {/* Scrim */}
                    <View style={styles.scrim}>
                      <Text style={styles.venueName}>{current.name}</Text>
                      {current.category && <Text style={styles.venueCat}>{current.category}</Text>}
                    </View>
                  </View>

                  {/* Info strip */}
                  <View style={styles.infoStrip}>
                    {current.eta_seconds != null && (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>
                          {current.eta_seconds < 60 ? '< 1 min' : `${Math.round(current.eta_seconds / 60)} min`}
                        </Text>
                      </View>
                    )}
                    {current.rating != null && (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>★ {current.rating}{current.user_rating_count ? ` (${current.user_rating_count})` : ''}</Text>
                      </View>
                    )}
                    {current.price_level != null && current.price_level > 0 && (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{'$'.repeat(current.price_level)}</Text>
                      </View>
                    )}
                    {current.is_open != null && (
                      <View style={[styles.chip, current.is_open ? styles.openChip : styles.closedChip]}>
                        <Text style={[styles.chipText, current.is_open ? { color: COLORS.successDeep } : { color: COLORS.error }]}>
                          {current.is_open ? 'Open' : 'Closed'}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    {current.maps_url && (
                      <TouchableOpacity onPress={() => Linking.openURL(current.maps_url!)}>
                        <Text style={styles.mapsLink}>Maps ↗</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              </GestureDetector>
            </View>

            {/* Action buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.passBtn]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  flingCard('left');
                }}
                activeOpacity={0.85}
              >
                <Feather name="x" size={28} color={COLORS.error} strokeWidth={2.4} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.likeBtn]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  flingCard('right');
                }}
                activeOpacity={0.85}
              >
                <Feather name="check" size={28} color="#fff" strokeWidth={2.6} />
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>

      <MatchMoment
        visible={matchVisible}
        venueName={matchVenue?.name ?? ''}
        venuePhoto={(matchVenue?.photo_urls as string[] | null)?.[0]}
        likedCount={memberCount}
        totalCount={memberCount}
        isHost={isHost}
        onLockIn={() => { setMatchVisible(false); router.back(); }}
        onKeepSwiping={() => setMatchVisible(false)}
      />
    </SafeAreaView>
  );
}

const PHOTO_HEIGHT = Dimensions.get('window').height * 0.42;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  progress: { height: 6 },
  counter: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.textSecondary, includeFontPadding: false },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  suggestBtnText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.bold, color: COLORS.primary, includeFontPadding: false },
  suggestedPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  suggestedPillText: { fontSize: 11.5, fontFamily: FONTS.bold, color: '#fff', includeFontPadding: false },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.lg },

  stack: { width: CARD_W, position: 'relative', alignItems: 'center', flex: 1, maxHeight: PHOTO_HEIGHT + 100 },
  card: {
    position: 'absolute',
    top: 16,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    ...SHADOWS.floating,
  },
  frontCard: { zIndex: 10 },

  stamp: {
    position: 'absolute',
    top: 32,
    zIndex: 20,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  likeStamp: { right: 20, borderColor: COLORS.success, transform: [{ rotate: '12deg' }] },
  nopeStamp: { left: 20, borderColor: COLORS.error, transform: [{ rotate: '-12deg' }] },
  stampText: { fontSize: 22, fontFamily: FONTS.extrabold, includeFontPadding: false },

  photoWrap: { height: PHOTO_HEIGHT, position: 'relative' },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderText: { fontSize: 72, fontFamily: FONTS.extrabold, color: COLORS.primary, opacity: 0.25, includeFontPadding: false },

  segments: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 5,
    zIndex: 10,
  },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#fff' },
  tapZone: { position: 'absolute', top: 0, bottom: 0, width: '33%', zIndex: 5 },

  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 18,
    paddingTop: 60,
    gap: 3,
    // gradient simulation via solid overlay — real LinearGradient would require expo-linear-gradient
    backgroundColor: 'transparent',
    backgroundImage: undefined,
  },
  venueName: { fontSize: 26, fontFamily: FONTS.extrabold, color: '#fff', letterSpacing: -0.3, includeFontPadding: false },
  venueCat:  { fontSize: FONT_SIZE.sm, fontFamily: FONTS.medium, color: 'rgba(255,255,255,0.85)', includeFontPadding: false },

  infoStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    gap: SPACING.xs,
  },
  chip: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.chip,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  chipText: { fontSize: FONT_SIZE.xs, fontFamily: FONTS.medium, color: COLORS.text, includeFontPadding: false },
  openChip:   { backgroundColor: COLORS.successTint },
  closedChip: { backgroundColor: COLORS.errorTint },
  mapsLink: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.primary, includeFontPadding: false },

  actions: { flexDirection: 'row', gap: 36, paddingBottom: SPACING.md },
  actionBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  passBtn: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, ...SHADOWS.card },
  likeBtn: { backgroundColor: COLORS.success, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 6 },

  center: { alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  loadingText: { fontSize: FONT_SIZE.md, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontFamily: FONTS.bold, color: COLORS.text, textAlign: 'center', includeFontPadding: false },
  emptySub:   { fontSize: FONT_SIZE.md, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, includeFontPadding: false },
  retryBtn: { marginTop: SPACING.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, borderRadius: RADIUS.button, borderWidth: 1.5, borderColor: COLORS.primary },
  retryText: { fontSize: FONT_SIZE.md, fontFamily: FONTS.semibold, color: COLORS.primary, includeFontPadding: false },
});
