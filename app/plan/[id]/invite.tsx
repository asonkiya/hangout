import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
  Alert,
  SafeAreaView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS } from '@/constants';
import { NavHead, HButton, AvatarRow, VibeChip } from '@/components/ui';
import type { PlanRow } from '@/types/database';

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const [plan, setPlan]     = useState<PlanRow | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUid(user.id);

      const { data: p } = await supabase.from('plans').select('*').eq('id', id!).single();
      if (p) setPlan(p);

      const { data: m } = await supabase
        .from('plan_members')
        .select('users(display_name)')
        .eq('plan_id', id!);
      setMembers((m ?? []).map((r: any) => r.users?.display_name ?? '?'));
    })();
  }, [id]);

  async function getOrCreateInviteLink(): Promise<string> {
    if (inviteLink) return inviteLink;
    if (!uid || !plan) return '';
    const token = Math.random().toString(36).slice(2, 10);
    const { data: invite } = await supabase
      .from('plan_invites')
      .insert({
        plan_id: id!,
        token,
        inviter_user_id: uid,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    const link = `pullup://join/${invite?.token ?? token}`;
    setInviteLink(link);
    return link;
  }

  async function copyLink() {
    const link = await getOrCreateInviteLink();
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    const link = await getOrCreateInviteLink();
    Share.share({ message: `Pull up with us: ${plan?.title ?? ''}\n${link}` });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>

        <NavHead
          title={plan?.title ?? ''}
          onBack={() => router.back()}
          right={plan?.vibe ? <VibeChip vibe={plan.vibe} selected small /> : undefined}
        />

        <Text style={styles.sub}>Anyone with the link can join & vote on venues.</Text>

        {/* Link card */}
        <View style={styles.linkCard}>
          <Text style={styles.linkText} numberOfLines={1}>
            {inviteLink ?? `pullup.app/j/…`}
          </Text>
          <TouchableOpacity onPress={copyLink} activeOpacity={0.7}>
            <Text style={styles.copyBtn}>{copied ? 'Copied!' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>

        <HButton
          label="Share link"
          variant="primary"
          size="md"
          onPress={shareLink}
          fullWidth
        />

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or add from recent plans</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Going so far footer */}
        <View style={styles.goingRow}>
          <Text style={styles.goingLabel}>Going so far</Text>
          <AvatarRow names={members} size={28} extraText={members.length === 1 ? 'just you (for now)' : undefined} />
        </View>

        <HButton
          label="Done — go to plan"
          variant="ghost"
          size="md"
          onPress={() => router.replace(`/plan/${id}`)}
          fullWidth
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  inner: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },

  sub: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },

  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.primaryFaint,
    borderWidth: 1.5,
    borderColor: '#C9C2F6',
    borderStyle: 'dashed',
    borderRadius: RADIUS.card,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  linkText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    includeFontPadding: false,
  },
  copyBtn: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    includeFontPadding: false,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginVertical: SPACING.xs,
  },
  dividerLine: { flex: 1, height: 1.5, backgroundColor: COLORS.border },
  dividerText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },

  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goingLabel: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    includeFontPadding: false,
  },
});
