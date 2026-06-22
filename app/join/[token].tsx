import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS, SHADOWS } from '@/constants';
import { HButton } from '@/components/ui';

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus]   = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => { redeemToken(token); }, [token]);

  async function redeemToken(tok: string | undefined) {
    if (!tok) { setErrorMsg('Invalid invite link.'); setStatus('error'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      await SecureStore.setItemAsync('pending_join_token', tok);
      router.replace('/(auth)/login');
      return;
    }
    const { data: invite } = await supabase.from('plan_invites').select('*').eq('token', tok).eq('status', 'pending').maybeSingle();
    if (!invite) { setErrorMsg('This invite link is invalid or has already been used.'); setStatus('error'); return; }
    if (new Date(invite.expires_at) < new Date()) { setErrorMsg('This invite link has expired. Ask the host to send a new one.'); setStatus('error'); return; }
    const { data: existing } = await supabase.from('plan_members').select('id').eq('plan_id', invite.plan_id).eq('user_id', user.id).maybeSingle();
    if (!existing) {
      const { error: memberError } = await supabase.from('plan_members').insert({ plan_id: invite.plan_id, user_id: user.id, role: 'member', rsvp_status: 'going' });
      if (memberError) { setErrorMsg('Could not join the plan. Try again.'); setStatus('error'); return; }
    }
    await supabase.from('plan_invites').update({ status: 'accepted' }).eq('id', invite.id);
    await SecureStore.deleteItemAsync('pending_join_token');
    const { data: userRow } = await supabase.from('users').select('display_name').eq('id', user.id).single();
    const { data: planRow } = await supabase.from('plans').select('title').eq('id', invite.plan_id).single();
    supabase.functions.invoke('notify', {
      body: { event: 'member_joined', plan_id: invite.plan_id, actor_user_id: user.id, extra: { actor_name: userRow?.display_name ?? 'Someone', plan_title: planRow?.title ?? 'a plan' } },
    });
    router.replace(`/plan/${invite.plan_id}`);
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>Joining plan…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.errorTitle}>Couldn't join</Text>
      <Text style={styles.errorMsg}>{errorMsg}</Text>
      <HButton label="Go home" variant="primary" size="md" onPress={() => router.replace('/(tabs)')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, padding: SPACING.xl },
  loadingText: { fontSize: FONT_SIZE.md, fontFamily: FONTS.regular, color: COLORS.textSecondary, marginTop: SPACING.sm, includeFontPadding: false },
  errorTitle: { fontSize: FONT_SIZE.xl, fontFamily: FONTS.bold, color: COLORS.text, includeFontPadding: false },
  errorMsg:   { fontSize: FONT_SIZE.md, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, includeFontPadding: false },
});
