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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';
import type { PlanRow, PlanMemberRow, UserRow } from '@/types/database';

type MemberWithUser = PlanMemberRow & { users: UserRow };

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
    fetchPlan();
    const channel = supabase
      .channel(`plan-${id}`)
      .on('broadcast', { event: 'plan_updated' }, () => fetchPlan())
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
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          {hasVenue ? (
            <>
              <Text style={styles.sectionLabel}>Destination</Text>
              <Text style={styles.venueName}>{plan.selected_place_name}</Text>
            </>
          ) : (
            <TouchableOpacity style={styles.venueBtn} onPress={() => router.push(`/plan/${id}/venues`)}>
              <Text style={styles.venueBtnText}>Browse & vote on venues</Text>
            </TouchableOpacity>
          )}
        </View>

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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  body: { padding: SPACING.lg, gap: SPACING.lg },
  section: { backgroundColor: COLORS.surface, borderRadius: 16, padding: SPACING.md },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  venueName: { fontSize: FONT_SIZE.xl, fontWeight: '600', color: COLORS.text },
  venueBtn: { paddingVertical: SPACING.sm, alignItems: 'center' },
  venueBtnText: { fontSize: FONT_SIZE.md, color: COLORS.primary, fontWeight: '600' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
  memberName: { fontSize: FONT_SIZE.md, fontWeight: '500', color: COLORS.text },
  memberRole: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  actions: { gap: SPACING.sm },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  secondaryBtnText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text },
});
