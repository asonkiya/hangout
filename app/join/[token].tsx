import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    redeemToken(token);
  }, [token]);

  async function redeemToken(tok: string | undefined) {
    if (!tok) {
      setErrorMsg('Invalid invite link.');
      setStatus('error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Shouldn't happen — root layout protects this route — but save token defensively
      await SecureStore.setItemAsync('pending_join_token', tok);
      router.replace('/(auth)/login');
      return;
    }

    // Validate invite
    const { data: invite } = await supabase
      .from('plan_invites')
      .select('*')
      .eq('token', tok)
      .eq('status', 'pending')
      .maybeSingle();

    if (!invite) {
      setErrorMsg('This invite link is invalid or has already been used.');
      setStatus('error');
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      setErrorMsg('This invite link has expired. Ask the host to send a new one.');
      setStatus('error');
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('plan_members')
      .select('id')
      .eq('plan_id', invite.plan_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) {
      const { error: memberError } = await supabase.from('plan_members').insert({
        plan_id: invite.plan_id,
        user_id: user.id,
        role: 'member',
        rsvp_status: 'going',
      });

      if (memberError) {
        setErrorMsg('Could not join the plan. Try again.');
        setStatus('error');
        return;
      }
    }

    // Mark invite accepted
    await supabase
      .from('plan_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    await SecureStore.deleteItemAsync('pending_join_token');

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
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.btnText}>Go home</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, padding: SPACING.xl },
  loadingText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, marginTop: SPACING.sm },
  errorTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.text },
  errorMsg: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  btn: { marginTop: SPACING.md, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: SPACING.xl },
  btnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.md },
});
