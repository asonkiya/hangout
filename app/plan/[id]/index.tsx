import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS, SHADOWS, AVATAR_COLORS } from '@/constants';
import { NavHead, HButton, Avatar, AvatarRow, Label, Card, VibeChip, StatePill, ProgressBar } from '@/components/ui';
import { LiveMap, type LiveMember } from '@/components/LiveMap';
import type { PlanRow, PlanMemberRow, UserRow, DepartureStatus, VenueCandidateRow } from '@/types/database';

type MemberWithUser = PlanMemberRow & { users: UserRow };

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [venueDetails, setVenueDetails] = useState<VenueCandidateRow | null>(null);
  const [swipeProgress, setSwipeProgress] = useState({ swiped: 0, total: 0 });
  const [lastMessage, setLastMessage] = useState<{ body: string; name: string } | null>(null);
  const [memberLocations, setMemberLocations] = useState<LiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [settingArrival, setSettingArrival] = useState(false);
  const [arrivalDate, setArrivalDate] = useState<Date>(new Date());
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
    const channel = supabase
      .channel(`plan-${id}`)
      .on('broadcast', { event: 'plan_updated' }, () => fetchAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plans', filter: `id=eq.${id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_members', filter: `plan_id=eq.${id}` }, () => fetchAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_points' }, () => fetchMemberLocations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eta_snapshots', filter: `plan_id=eq.${id}` }, () => fetchMemberLocations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useFocusEffect(useCallback(() => { fetchAll(); fetchMemberLocations(); }, [id]));

  async function fetchAll() {
    const [planRes, membersRes] = await Promise.all([
      supabase.from('plans').select('*').eq('id', id!).single(),
      supabase.from('plan_members').select('*, users(*)').eq('plan_id', id!),
    ]);
    if (planRes.data) {
      setPlan(planRes.data);
      // Fetch venue details if locked
      if (planRes.data.selected_place_id) {
        const { data: v } = await supabase
          .from('venue_candidates')
          .select('*')
          .eq('plan_id', id!)
          .eq('google_place_id', planRes.data.selected_place_id)
          .single();
        if (v) setVenueDetails(v);
      }
    }
    if (membersRes.data) setMembers(membersRes.data as unknown as MemberWithUser[]);

    // Swipe progress
    const { count: total } = await supabase
      .from('venue_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('plan_id', id!);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { count: swiped } = await supabase
      .from('venue_swipes')
      .select('*', { count: 'exact', head: true })
      .eq('plan_id', id!)
      .eq('user_id', uid!);
    setSwipeProgress({ swiped: swiped ?? 0, total: total ?? 0 });

    // Last chat message
    const { data: msgs } = await supabase
      .from('plan_messages')
      .select('body, users(display_name)')
      .eq('plan_id', id!)
      .order('created_at', { ascending: false })
      .limit(1);
    if (msgs?.[0]) {
      setLastMessage({ body: msgs[0].body, name: (msgs[0].users as any)?.display_name ?? '?' });
    }

    setLoading(false);
  }

  async function fetchMemberLocations() {
    const { data: sessions } = await supabase
      .from('location_share_sessions')
      .select('id, user_id, users(display_name)')
      .eq('plan_id', id!)
      .eq('status', 'active');
    if (!sessions || sessions.length === 0) { setMemberLocations([]); return; }

    const { data: etas } = await supabase
      .from('eta_snapshots')
      .select('user_id, duration_seconds, computed_at')
      .eq('plan_id', id!)
      .order('computed_at', { ascending: false });
    const etaByUser = new Map<string, number>();
    for (const e of etas ?? []) {
      if (!etaByUser.has(e.user_id) && e.duration_seconds != null) {
        etaByUser.set(e.user_id, Math.round(e.duration_seconds / 60));
      }
    }

    const locations: LiveMember[] = [];
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const { data: point } = await supabase
        .from('location_points')
        .select('lat, lng')
        .eq('session_id', session.id)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!point) continue;
      const user = session.users as unknown as { display_name: string } | null;
      const memberIdx = members.findIndex((m) => m.user_id === session.user_id);
      const member = members.find((m) => m.user_id === session.user_id);
      locations.push({
        user_id: session.user_id,
        display_name: user?.display_name ?? 'Friend',
        index: memberIdx >= 0 ? memberIdx : i,
        lat: point.lat,
        lng: point.lng,
        departure_status: member?.departure_status ?? 'not_left',
        eta_minutes: etaByUser.get(session.user_id) ?? null,
      });
    }
    setMemberLocations(locations);
  }

  async function shareInviteLink() {
    if (!currentUserId || !plan) return;
    const token = Math.random().toString(36).slice(2, 10);
    const { data: invite } = await supabase
      .from('plan_invites')
      .insert({ plan_id: id!, token, inviter_user_id: currentUserId, status: 'pending', expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .select().single();
    if (!invite) return;
    Share.share({ message: `Pull up with us: ${plan.title}\npullup://join/${invite.token}` });
  }

  function notifyMembers(event: string, extra?: Record<string, string>) {
    if (!currentUserId || !plan) return;
    const myName = members.find(m => m.user_id === currentUserId)?.users?.display_name ?? 'Someone';
    supabase.functions.invoke('notify', {
      body: { event, plan_id: id, actor_user_id: currentUserId, extra: { actor_name: myName, plan_title: plan.title, ...extra } },
    });
  }

  async function activatePlan() {
    const { data, error } = await supabase
      .from('plans')
      .update({ state: 'active' })
      .eq('id', id!)
      .select()
      .single();
    if (error) { Alert.alert('Could not start plan', error.message); return; }
    if (!data) { Alert.alert('Could not start plan', 'You may not have permission. Only the plan creator can start it.'); return; }
    notifyMembers('plan_activated');
    fetchAll();
  }

  async function reopenVoting() {
    Alert.alert('Re-open voting?', 'The locked venue stays as a suggestion in the deck; the crew can swipe again or add more.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Re-open', onPress: async () => {
        const { error } = await supabase.from('plans').update({
          state: 'open',
          selected_place_id: null,
          selected_place_name: null,
        }).eq('id', id!);
        if (error) { Alert.alert('Could not re-open voting', error.message); return; }
        notifyMembers('voting_reopened');
        fetchAll();
      }},
    ]);
  }

  async function endPlan() {
    Alert.alert('End plan?', 'This marks the plan as done for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End it', style: 'destructive', onPress: async () => {
        await supabase.from('plans').update({ state: 'completed' }).eq('id', id!);
        notifyMembers('plan_ended');
        router.back();
      }},
    ]);
  }

  async function cancelPlan() {
    Alert.alert('Cancel plan?', 'This cancels the plan for everyone.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel plan', style: 'destructive', onPress: async () => {
        await supabase.from('plans').update({ state: 'cancelled' }).eq('id', id!);
        notifyMembers('plan_cancelled');
        router.back();
      }},
    ]);
  }

  function openArrivalPicker() {
    const seed = plan?.arrival_time
      ? new Date(plan.arrival_time)
      : plan?.scheduled_for
      ? new Date(plan.scheduled_for)
      : new Date();
    setArrivalDate(isNaN(seed.getTime()) ? new Date() : seed);
    setSettingArrival(true);
  }

  async function saveArrivalTime() {
    const { error } = await supabase
      .from('plans')
      .update({ arrival_time: arrivalDate.toISOString() })
      .eq('id', id!);
    if (error) { Alert.alert('Could not save arrival time', error.message); return; }
    setSettingArrival(false);
    fetchAll();
  }

  async function updateDepartureStatus(status: DepartureStatus) {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('plan_members')
      .update({ departure_status: status })
      .eq('plan_id', id!)
      .eq('user_id', currentUserId);
    if (error) { Alert.alert('Could not update status', error.message); return; }
    notifyMembers(status === 'leaving' ? 'leaving' : 'arrived');
    fetchAll();
  }

  const isHost     = members.find(m => m.user_id === currentUserId)?.role === 'host';
  const myMember   = members.find(m => m.user_id === currentUserId);
  const isActive   = plan?.state === 'active';
  const isTerminal = plan?.state === 'completed' || plan?.state === 'cancelled';
  const hasVenue   = !!plan?.selected_place_id;

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
    </SafeAreaView>
  );

  if (!plan) return (
    <SafeAreaView style={styles.container}>
      <Text style={{ textAlign: 'center', marginTop: 80, color: COLORS.textSecondary }}>Plan not found.</Text>
    </SafeAreaView>
  );

  const isLocked = plan?.state === 'venue_locked';
  const overflowMenu = isHost ? (
    <TouchableOpacity
      onPress={() => Alert.alert('Options', '', [
        { text: 'Edit plan', onPress: () => router.push(`/plan/${id}/edit`) },
        ...(isLocked ? [{ text: 'Re-open voting', onPress: reopenVoting }] : []),
        { text: 'Cancel plan', style: 'destructive', onPress: cancelPlan },
        ...(isActive ? [{ text: 'End plan', style: 'destructive' as const, onPress: endPlan }] : []),
        { text: 'Dismiss', style: 'cancel' },
      ])}
    >
      <Feather name="more-horizontal" size={22} color={COLORS.textSecondary} />
    </TouchableOpacity>
  ) : undefined;

  // ── PLANNING state ────────────────────────────────────────────────────────
  if (plan.state === 'open') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <NavHead onBack={() => router.back()} title={plan.title} right={
            <View style={styles.headerRight}>
              <StatePill state={plan.state} />
              {overflowMenu}
            </View>
          } />
          <View style={styles.metaRow}>
            {plan.vibe && <VibeChip vibe={plan.vibe} selected small />}
            {plan.scheduled_for && (
              <Text style={styles.metaText}>
                {new Date(plan.scheduled_for).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            )}
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {/* Voting card */}
          <View style={styles.votingCard}>
            <Text style={styles.votingTitle}>Find the spot</Text>
            {swipeProgress.total > 0 ? (
              <>
                <Text style={styles.votingSub}>
                  {swipeProgress.swiped} of {swipeProgress.total} venues swiped
                </Text>
                <ProgressBar progress={swipeProgress.swiped / swipeProgress.total} color={COLORS.primary} />
              </>
            ) : (
              <Text style={styles.votingSub}>Browse venues and vote with your crew</Text>
            )}
            <HButton label="Swipe venues" variant="primary" size="md" fullWidth onPress={() => router.push(`/plan/${id}/venues`)} />
            <TouchableOpacity onPress={() => router.push(`/plan/${id}/suggest`)} style={styles.suggestLink}>
              <Feather name="plus" size={13} color={COLORS.primary} strokeWidth={2.4} />
              <Text style={styles.suggestLinkText}>Suggest a place</Text>
            </TouchableOpacity>
          </View>

          {/* Crew */}
          <View style={styles.section}>
            <Label>Crew · {members.length}</Label>
            <View style={styles.crewRow}>
              {members.map((m, i) => (
                <Avatar key={m.id} name={m.users?.display_name ?? '?'} index={i} size={38} />
              ))}
              <TouchableOpacity style={styles.addCircle} onPress={shareInviteLink}>
                <Feather name="plus" size={17} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Bottom actions */}
          <View style={styles.actionRow}>
            <HButton label="Chat" variant="ghost" size="sm" fullWidth onPress={() => router.push(`/plan/${id}/chat`)} />
            {isHost && (
              <HButton label="Edit plan" variant="ghost" size="sm" fullWidth onPress={() => router.push(`/plan/${id}/edit`)} />
            )}
          </View>

          <Text style={styles.footerHint}>Map, ETA and arrivals appear once the plan is locked.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── LOCKED state ──────────────────────────────────────────────────────────
  if (plan.state === 'venue_locked') {
    const venuePhoto = (venueDetails?.photo_urls as string[] | null)?.[0];
    const daysTo = plan.scheduled_for
      ? Math.ceil((new Date(plan.scheduled_for).getTime() - Date.now()) / 86_400_000)
      : null;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <NavHead onBack={() => router.back()} title={plan.title} right={
            <View style={styles.headerRight}>
              <StatePill state={plan.state} />
              {overflowMenu}
            </View>
          } />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {/* Venue card */}
          <Card pad={0} style={{ overflow: 'hidden' }}>
            {venuePhoto ? (
              <Image source={{ uri: venuePhoto }} style={styles.venuePhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.venuePhoto, { backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 60, fontFamily: FONTS.extrabold, color: COLORS.primary, opacity: 0.25 }}>
                  {plan.selected_place_name?.[0]}
                </Text>
              </View>
            )}
            <View style={{ padding: 16, gap: SPACING.sm }}>
              <View style={styles.venueTitleRow}>
                <Text style={styles.venueCardName}>{plan.selected_place_name}</Text>
                {venueDetails?.eta_seconds != null && (
                  <View style={styles.etaChip}>
                    <Text style={styles.etaChipText}>{Math.round(venueDetails.eta_seconds / 60)} min away</Text>
                  </View>
                )}
              </View>
              {venueDetails?.address && (
                <Text style={styles.venueAddress}>{venueDetails.address}</Text>
              )}
              <View style={styles.actionRow}>
                {venueDetails?.maps_url && (
                  <HButton label="Directions" variant="primary" size="sm" fullWidth onPress={() => Linking.openURL(venueDetails.maps_url!)} />
                )}
                {venueDetails?.website_url && (
                  <HButton label="Website" variant="ghost" size="sm" fullWidth onPress={() => Linking.openURL(venueDetails.website_url!)} />
                )}
              </View>
            </View>
          </Card>

          {/* Countdown */}
          {daysTo != null && daysTo > 0 && (
            <View style={styles.countdownStrip}>
              <Text style={styles.countdownText}>
                {daysTo === 1 ? 'Tomorrow!' : `${daysTo} days to go`}
              </Text>
            </View>
          )}

          {/* Arrival time */}
          <View style={styles.section}>
            {plan.arrival_time ? (
              <View style={styles.arrivalRow}>
                <Text style={styles.arrivalLabel}>Arrive by</Text>
                <Text style={styles.arrivalTime}>
                  {new Date(plan.arrival_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
                {isHost && <TouchableOpacity onPress={openArrivalPicker}><Text style={styles.editLink}>Edit</Text></TouchableOpacity>}
              </View>
            ) : isHost && !settingArrival ? (
              <TouchableOpacity onPress={openArrivalPicker}>
                <Text style={styles.setArrivalLink}>+ Set arrival time</Text>
              </TouchableOpacity>
            ) : null}
            {settingArrival && (
              <View style={{ gap: SPACING.sm }}>
                <DateTimePicker
                  value={arrivalDate}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_, date) => {
                    if (date) setArrivalDate(date);
                    if (Platform.OS !== 'ios') setSettingArrival(false);
                  }}
                  minimumDate={new Date()}
                />
                <View style={styles.arrivalInputRow}>
                  <HButton label="Save" variant="primary" size="sm" onPress={saveArrivalTime} />
                  <TouchableOpacity onPress={() => setSettingArrival(false)}><Text style={styles.editLink}>Cancel</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Who's in */}
          <View style={styles.section}>
            <Label>Who's in</Label>
            <View style={styles.crewRow}>
              {members.map((m, i) => (
                <View key={m.id} style={{ alignItems: 'center', gap: 4 }}>
                  <Avatar name={m.users?.display_name ?? '?'} index={i} size={42} />
                  <Text style={styles.memberLabel}>{m.role === 'host' ? 'Host' : 'In'}</Text>
                </View>
              ))}
              <TouchableOpacity style={[styles.addCircle, { width: 42, height: 42, borderRadius: 21 }]} onPress={() => router.push(`/plan/${id}/invite`)}>
                <Feather name="plus" size={17} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.actionRow}>
            <HButton label="Chat" variant="ghost" size="sm" fullWidth onPress={() => router.push(`/plan/${id}/chat`)} />
            <HButton label="Share ETA" variant="ghost" size="sm" fullWidth onPress={() => router.push(`/plan/${id}/eta`)} />
          </View>

          {isHost && (
            <HButton label="Start plan — happening now" variant="primary" size="lg" fullWidth onPress={activatePlan} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── LIVE state ────────────────────────────────────────────────────────────
  if (plan.state === 'active') {
    const arrived   = members.filter(m => m.departure_status === 'arrived');
    const onTheWay  = members.filter(m => m.departure_status === 'leaving');
    const notLeft   = members.filter(m => m.departure_status === 'not_left');
    const myStatus  = myMember?.departure_status;

    const venueLat = venueDetails?.lat;
    const venueLng = venueDetails?.lng;
    const destination = venueLat != null && venueLng != null
      ? { lat: venueLat, lng: venueLng, name: plan.selected_place_name ?? undefined }
      : null;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <NavHead onBack={() => router.back()} title={plan.title} right={
            <View style={styles.headerRight}>
              <StatePill state={plan.state} />
              {overflowMenu}
            </View>
          } />
          {plan.selected_place_name && (
            <Text style={styles.metaText}>{plan.selected_place_name}{plan.arrival_time ? ` · arrive by ${new Date(plan.arrival_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</Text>
          )}
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {/* Live map */}
          {destination && (
            <LiveMap destination={destination} members={memberLocations} style={styles.mapCard} />
          )}
          {destination && memberLocations.length === 0 && (
            <Text style={styles.mapHint}>Tap "Share ETA" so your crew can see you on the map.</Text>
          )}

          {/* Status rows */}
          {[
            { label: 'Arrived',    list: arrived,  bg: COLORS.successTint, fg: COLORS.successDeep },
            { label: 'On the way', list: onTheWay, bg: COLORS.warningTint, fg: COLORS.warningDeep },
            { label: 'Not left',   list: notLeft,  bg: COLORS.border,      fg: COLORS.textSecondary },
          ].map(({ label, list, bg, fg }) => list.length > 0 && (
            <View key={label} style={[styles.statusRow, { shadowColor: '#000', ...SHADOWS.card }]}>
              <View style={[styles.statusPill, { backgroundColor: bg }]}>
                <Text style={[styles.statusPillText, { color: fg }]}>{label}</Text>
              </View>
              <AvatarRow names={list.map(m => m.users?.display_name ?? '?')} size={26} />
            </View>
          ))}

          {/* Chat peek */}
          {lastMessage && (
            <TouchableOpacity style={styles.chatPeek} onPress={() => router.push(`/plan/${id}/chat`)}>
              <Avatar name={lastMessage.name} size={26} index={0} />
              <Text style={styles.chatPeekText} numberOfLines={1}>
                <Text style={{ fontFamily: FONTS.semibold }}>{lastMessage.name}: </Text>
                {lastMessage.body}
              </Text>
              <Feather name="chevron-right" size={16} color={COLORS.textFaint} />
            </TouchableOpacity>
          )}

          {/* Departure action */}
          <View style={styles.departureSection}>
            {myStatus !== 'arrived' ? (
              <HButton
                label={myStatus === 'not_left' ? "I'm leaving" : "I've arrived"}
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => updateDepartureStatus(myStatus === 'not_left' ? 'leaving' : 'arrived')}
              />
            ) : (
              <View style={styles.arrivedBanner}>
                <Feather name="check" size={18} color={COLORS.successDeep} />
                <Text style={styles.arrivedText}>You're here</Text>
              </View>
            )}
            <Text style={styles.footerHint}>
              {myStatus === 'not_left' ? "Tap when you leave — your crew will know." : "Flips to \"I've arrived\" once you're moving."}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── DONE / CANCELLED state ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <NavHead onBack={() => router.back()} title={plan.title} right={<StatePill state={plan.state} />} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { alignItems: 'center' }]}>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={styles.recapHeadline}>
            {plan.state === 'completed' ? 'That was fun.' : 'Plan cancelled.'}
          </Text>
          <Text style={styles.recapMeta}>
            {plan.title}{plan.selected_place_name ? ` · ${plan.selected_place_name}` : ''}
          </Text>
        </View>

        <Card style={{ width: '100%' }}>
          <View style={{ gap: SPACING.md }}>
            <View style={styles.crewRow}>
              <AvatarRow names={members.map(m => m.users?.display_name ?? '?')} size={30} />
              <Text style={styles.madeItText}>{members.length} attended</Text>
            </View>
            <View style={styles.addPicsArea}>
              <Feather name="image" size={20} color={COLORS.textFaint} />
              <Text style={styles.addPicsText}>Add pics from the night</Text>
            </View>
          </View>
        </Card>

        {plan.state === 'completed' && (
          <HButton label="Plan another with this crew" variant="primary" size="lg" fullWidth onPress={() => router.push('/plan/create')} />
        )}
        <HButton label="View chat" variant="ghost" size="md" fullWidth onPress={() => router.push(`/plan/${id}/chat`)} />
        <View style={{ flex: 1 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.xs,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingLeft: 46 },
  metaText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },

  body: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },

  // Planning
  votingCard: {
    backgroundColor: COLORS.primaryFaint,
    borderWidth: 1.5,
    borderColor: '#DDD8FA',
    borderRadius: RADIUS.card,
    padding: 18,
    gap: SPACING.sm,
  },
  votingTitle: { fontSize: FONT_SIZE.xl, fontFamily: FONTS.extrabold, color: COLORS.text, includeFontPadding: false },
  votingSub: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },
  suggestLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6, marginTop: -SPACING.xs },
  suggestLinkText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.primary, includeFontPadding: false },

  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: SPACING.md, gap: SPACING.sm, ...SHADOWS.card },
  crewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center' },
  addCircle: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1.5, borderColor: COLORS.textFaint,
    borderStyle: 'dashed',
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberLabel: { fontSize: 11.5, fontFamily: FONTS.semibold, color: COLORS.textSecondary, includeFontPadding: false },

  divider: { height: 1, backgroundColor: COLORS.border },
  actionRow: { flexDirection: 'row', gap: SPACING.sm },

  footerHint: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textFaint,
    textAlign: 'center',
    includeFontPadding: false,
  },

  // Locked
  venuePhoto: { width: '100%', height: 165 },
  venueTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  venueCardName: { flex: 1, fontSize: 23, fontFamily: FONTS.extrabold, color: COLORS.text, includeFontPadding: false },
  etaChip: { backgroundColor: COLORS.background, borderRadius: RADIUS.chip, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  etaChipText: { fontSize: FONT_SIZE.xs, fontFamily: FONTS.medium, color: COLORS.text, includeFontPadding: false },
  venueAddress: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },

  countdownStrip: {
    backgroundColor: COLORS.primaryFaint,
    borderRadius: RADIUS.card,
    padding: 12,
    alignItems: 'center',
  },
  countdownText: { fontSize: FONT_SIZE.lg, fontFamily: FONTS.bold, color: COLORS.primary, includeFontPadding: false },

  arrivalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  arrivalLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },
  arrivalTime: { flex: 1, fontSize: FONT_SIZE.xl, fontFamily: FONTS.bold, color: COLORS.text, includeFontPadding: false },
  editLink: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.primary, includeFontPadding: false },
  setArrivalLink: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.primary, includeFontPadding: false },
  arrivalInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  arrivalInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.regular,
    color: COLORS.text,
  },

  // Live
  mapCard: { width: '100%', height: 196, borderRadius: RADIUS.card, overflow: 'hidden' },
  mapHint: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textFaint, textAlign: 'center', marginTop: -SPACING.xs, includeFontPadding: false },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: SPACING.sm,
  },
  statusPill: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 3,
    width: 96,
    alignItems: 'center',
  },
  statusPillText: { fontSize: 12, fontFamily: FONTS.bold, includeFontPadding: false },

  chatPeek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: 14,
    ...SHADOWS.card,
  },
  chatPeekText: { flex: 1, fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.text, includeFontPadding: false },

  departureSection: { gap: SPACING.sm, marginTop: SPACING.sm },
  arrivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.successTint,
    borderRadius: RADIUS.button,
  },
  arrivedText: { fontSize: FONT_SIZE.lg, fontFamily: FONTS.bold, color: COLORS.successDeep, includeFontPadding: false },

  // Done
  recapHeadline: {
    fontSize: 32,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.6,
    transform: [{ rotate: '-1.5deg' }],
    includeFontPadding: false,
  },
  recapMeta: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },
  madeItText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.textSecondary, marginLeft: 8, includeFontPadding: false },
  addPicsArea: {
    borderWidth: 1.5,
    borderColor: COLORS.textFaint,
    borderStyle: 'dashed',
    borderRadius: RADIUS.card,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  addPicsText: { fontSize: 13.5, fontFamily: FONTS.semibold, color: COLORS.textSecondary, includeFontPadding: false },
});
