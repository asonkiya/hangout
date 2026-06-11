import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';
import type { PlanRow, PlanMemberRow, UserRow, DepartureStatus } from '@/types/database';

type MemberWithUser = PlanMemberRow & { users: UserRow };

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [settingArrival, setSettingArrival] = useState(false);
  const [arrivalInput, setArrivalInput] = useState('');
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
    fetchPlan();
    const channel = supabase
      .channel(`plan-${id}`)
      .on('broadcast', { event: 'plan_updated' }, () => fetchPlan())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plans', filter: `id=eq.${id}` }, () => fetchPlan())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_members', filter: `plan_id=eq.${id}` }, () => fetchPlan())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  async function fetchPlan() {
    const [planRes, membersRes] = await Promise.all([
      supabase.from('plans').select('*').eq('id', id!).single(),
      supabase.from('plan_members').select('*, users(*)').eq('plan_id', id!),
    ]);
    if (planRes.data) setPlan(planRes.data);
    if (membersRes.data) setMembers(membersRes.data as unknown as MemberWithUser[]);
    setLoading(false);
  }

  async function shareInviteLink() {
    if (!currentUserId || !plan) return;
    const token = Math.random().toString(36).slice(2, 10);
    const { data: invite } = await supabase
      .from('plan_invites')
      .insert({
        plan_id: id!,
        token,
        inviter_user_id: currentUserId,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (!invite) return;
    Share.share({ message: `Join my hangout: ${plan.title}\nhangout://join/${invite.token}` });
  }

  function notifyMembers(event: string, extra?: Record<string, string>) {
    if (!currentUserId || !plan) return;
    const myName = members.find(m => m.user_id === currentUserId)?.users?.display_name ?? 'Someone';
    supabase.functions.invoke('notify', {
      body: {
        event,
        plan_id: id,
        actor_user_id: currentUserId,
        extra: { actor_name: myName, plan_title: plan.title, ...extra },
      },
    });
  }

  async function activatePlan() {
    await supabase.from('plans').update({ state: 'active' }).eq('id', id!);
    notifyMembers('plan_activated');
  }

  async function endPlan() {
    Alert.alert('End plan?', 'This marks the hangout as done for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End it', style: 'destructive', onPress: async () => {
        await supabase.from('plans').update({ state: 'completed' }).eq('id', id!);
        notifyMembers('plan_ended');
        router.back();
      }},
    ]);
  }

  async function cancelPlan() {
    Alert.alert('Cancel plan?', 'This cancels the hangout for everyone.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel plan', style: 'destructive', onPress: async () => {
        await supabase.from('plans').update({ state: 'cancelled' }).eq('id', id!);
        notifyMembers('plan_cancelled');
        router.back();
      }},
    ]);
  }

  async function saveArrivalTime() {
    if (!arrivalInput.match(/^\d{1,2}:\d{2}$/)) {
      Alert.alert('Enter time as HH:MM');
      return;
    }
    const base = plan?.scheduled_for
      ? new Date(plan.scheduled_for).toDateString()
      : new Date().toDateString();
    const iso = new Date(`${base} ${arrivalInput}`).toISOString();
    await supabase.from('plans').update({ arrival_time: iso }).eq('id', id!);
    setSettingArrival(false);
    setArrivalInput('');
  }

  async function updateDepartureStatus(status: DepartureStatus) {
    if (!currentUserId) return;
    await supabase
      .from('plan_members')
      .update({ departure_status: status })
      .eq('plan_id', id!)
      .eq('user_id', currentUserId);
    notifyMembers(status === 'leaving' ? 'leaving' : 'arrived');
  }

  const isHost = members.find(m => m.user_id === currentUserId)?.role === 'host';
  const myMember = members.find(m => m.user_id === currentUserId);
  const isActive = plan?.state === 'active';
  const isTerminal = plan?.state === 'completed' || plan?.state === 'cancelled';
  const hasVenue = !!plan?.selected_place_id;
  const canShareEta = plan?.state === 'venue_locked' || plan?.state === 'active';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }
  if (!plan) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ textAlign: 'center', marginTop: 80, color: COLORS.textSecondary }}>Plan not found.</Text>
      </SafeAreaView>
    );
  }

  const arrived = members.filter(m => m.departure_status === 'arrived');
  const onTheWay = members.filter(m => m.departure_status === 'leaving');
  const notLeft = members.filter(m => m.departure_status === 'not_left');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>{'<-'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{plan.title}</Text>
          {plan.scheduled_for && (
            <Text style={styles.time}>
              {new Date(plan.scheduled_for).toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </Text>
          )}
        </View>
        <View style={[styles.stateBadge, stateBadgeBg(plan.state)]}>
          <Text style={[styles.stateBadgeText, stateBadgeFg(plan.state)]}>{stateLabel(plan.state)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>

        {/* Venue */}
        <View style={styles.section}>
          {hasVenue ? (
            <>
              <Text style={styles.sectionLabel}>Destination</Text>
              <Text style={styles.venueName}>{plan.selected_place_name}</Text>
            </>
          ) : !isTerminal ? (
            <TouchableOpacity style={styles.venueBtn} onPress={() => router.push(`/plan/${id}/venues`)}>
              <Text style={styles.venueBtnText}>Browse & vote on venues</Text>
            </TouchableOpacity>
          ) : null}

          {/* Arrival time */}
          {!isTerminal && (
            <View style={styles.arrivalBlock}>
              {plan.arrival_time ? (
                <View style={styles.arrivalRow}>
                  <Text style={styles.arrivalLabel}>Be there by</Text>
                  <Text style={styles.arrivalTime}>
                    {new Date(plan.arrival_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  {isHost && (
                    <TouchableOpacity onPress={() => { setSettingArrival(true); setArrivalInput(''); }}>
                      <Text style={styles.editLink}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : isHost && !settingArrival ? (
                <TouchableOpacity onPress={() => setSettingArrival(true)}>
                  <Text style={styles.setArrivalLink}>+ Set arrival time</Text>
                </TouchableOpacity>
              ) : null}
              {settingArrival && (
                <View style={styles.arrivalInputRow}>
                  <TextInput
                    style={styles.arrivalInput}
                    value={arrivalInput}
                    onChangeText={setArrivalInput}
                    placeholder="HH:MM"
                    keyboardType="numbers-and-punctuation"
                    autoFocus
                  />
                  <TouchableOpacity style={styles.arrivalSaveBtn} onPress={saveArrivalTime}>
                    <Text style={styles.arrivalSaveBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSettingArrival(false)}>
                    <Text style={styles.editLink}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Departure status panel — only when active */}
        {isActive && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Where is everyone</Text>

            {/* My action */}
            {myMember && myMember.departure_status !== 'arrived' && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => updateDepartureStatus(
                  myMember.departure_status === 'not_left' ? 'leaving' : 'arrived'
                )}
              >
                <Text style={styles.primaryBtnText}>
                  {myMember.departure_status === 'not_left' ? "I'm leaving" : "I've arrived"}
                </Text>
              </TouchableOpacity>
            )}
            {myMember?.departure_status === 'arrived' && (
              <Text style={styles.arrivedSelf}>You're here ✓</Text>
            )}

            {arrived.length > 0 && (
              <View style={styles.departureGroup}>
                <Text style={[styles.departureGroupLabel, { color: COLORS.arriving }]}>Arrived</Text>
                {arrived.map(m => <MemberStatusRow key={m.id} member={m} color={COLORS.arriving} />)}
              </View>
            )}
            {onTheWay.length > 0 && (
              <View style={styles.departureGroup}>
                <Text style={[styles.departureGroupLabel, { color: COLORS.onTheWay }]}>On the way</Text>
                {onTheWay.map(m => <MemberStatusRow key={m.id} member={m} color={COLORS.onTheWay} />)}
              </View>
            )}
            {notLeft.length > 0 && (
              <View style={styles.departureGroup}>
                <Text style={[styles.departureGroupLabel, { color: COLORS.notSharing }]}>Not left yet</Text>
                {notLeft.map(m => <MemberStatusRow key={m.id} member={m} color={COLORS.notSharing} />)}
              </View>
            )}
          </View>
        )}

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{members.length} {members.length === 1 ? 'person' : 'people'}</Text>
          {members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{m.users?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View>
                <Text style={styles.memberName}>{m.users?.display_name ?? 'Unknown'}</Text>
                <Text style={styles.memberRole}>{m.role === 'host' ? 'Host' : 'Member'}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Actions */}
        {!isTerminal && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={shareInviteLink}>
              <Text style={styles.secondaryBtnText}>Invite friends</Text>
            </TouchableOpacity>
            {!hasVenue && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/plan/${id}/venues`)}>
                <Text style={styles.secondaryBtnText}>Pick a venue</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/plan/${id}/chat`)}>
              <Text style={styles.secondaryBtnText}>Group chat</Text>
            </TouchableOpacity>
            {canShareEta && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/plan/${id}/eta`)}>
                <Text style={styles.primaryBtnText}>Share ETA & see who's close</Text>
              </TouchableOpacity>
            )}

            {/* Host state-transition buttons */}
            {isHost && plan.state === 'venue_locked' && (
              <TouchableOpacity style={styles.startBtn} onPress={activatePlan}>
                <Text style={styles.startBtnText}>Start plan — happening now</Text>
              </TouchableOpacity>
            )}
            {isHost && isActive && (
              <TouchableOpacity style={styles.dangerOutlineBtn} onPress={endPlan}>
                <Text style={styles.dangerOutlineBtnText}>End plan</Text>
              </TouchableOpacity>
            )}
            {isHost && (
              <TouchableOpacity onPress={cancelPlan} style={styles.cancelLink}>
                <Text style={styles.cancelLinkText}>Cancel plan</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isTerminal && (
          <View style={styles.terminalBanner}>
            <Text style={styles.terminalText}>
              {plan.state === 'completed' ? 'This hangout has ended.' : 'This hangout was cancelled.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberStatusRow({ member, color }: { member: MemberWithUser; color: string }) {
  return (
    <View style={styles.memberRow}>
      <View style={[styles.avatar, { backgroundColor: `${color}22` }]}>
        <Text style={[styles.avatarText, { color }]}>
          {member.users?.display_name?.[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <Text style={styles.memberName}>{member.users?.display_name ?? 'Unknown'}</Text>
    </View>
  );
}

function stateLabel(s: string) {
  return ({ open: 'Planning', venue_locked: 'Destination set', active: 'Happening now', completed: 'Done', cancelled: 'Cancelled' } as Record<string, string>)[s] ?? s;
}
function stateBadgeBg(s: string) {
  if (s === 'active') return { backgroundColor: '#DCFCE7' };
  if (s === 'venue_locked') return { backgroundColor: COLORS.primaryLight };
  if (s === 'completed') return { backgroundColor: COLORS.background };
  if (s === 'cancelled') return { backgroundColor: '#FEE2E2' };
  return { backgroundColor: COLORS.background };
}
function stateBadgeFg(s: string) {
  if (s === 'active') return { color: COLORS.arriving };
  if (s === 'venue_locked') return { color: COLORS.primary };
  if (s === 'cancelled') return { color: COLORS.error };
  return { color: COLORS.textSecondary };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { fontSize: FONT_SIZE.xl, color: COLORS.primary },
  title: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  time: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  stateBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 8 },
  stateBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: '700' },
  body: { padding: SPACING.lg, gap: SPACING.lg },
  section: { backgroundColor: COLORS.surface, borderRadius: 16, padding: SPACING.md, gap: SPACING.sm },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  venueName: { fontSize: FONT_SIZE.xl, fontWeight: '600', color: COLORS.text },
  venueBtn: { paddingVertical: SPACING.sm, alignItems: 'center' },
  venueBtnText: { fontSize: FONT_SIZE.md, color: COLORS.primary, fontWeight: '600' },

  arrivalBlock: { marginTop: SPACING.xs },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  arrivalLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  arrivalTime: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.text, flex: 1 },
  editLink: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '600' },
  setArrivalLink: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '600' },
  arrivalInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  arrivalInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  arrivalSaveBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  arrivalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.sm },

  departureGroup: { marginTop: SPACING.xs, gap: SPACING.xs },
  departureGroupLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  arrivedSelf: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.arriving, textAlign: 'center', paddingVertical: SPACING.sm },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
  memberName: { fontSize: FONT_SIZE.md, fontWeight: '500', color: COLORS.text },
  memberRole: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },

  actions: { gap: SPACING.sm },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', backgroundColor: COLORS.surface,
  },
  secondaryBtnText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text },
  startBtn: { backgroundColor: COLORS.arriving, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' },
  dangerOutlineBtn: {
    borderWidth: 1.5, borderColor: COLORS.error, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  dangerOutlineBtnText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.error },
  cancelLink: { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelLinkText: { fontSize: FONT_SIZE.sm, color: COLORS.error, fontWeight: '600' },

  terminalBanner: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: SPACING.lg, alignItems: 'center',
  },
  terminalText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, textAlign: 'center' },
});
