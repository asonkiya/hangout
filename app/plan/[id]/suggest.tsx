import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING } from '@/constants';
import { NavHead, HButton } from '@/components/ui';
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker';

export default function SuggestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [bias, setBias] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [myName, setMyName] = useState('Someone');

  useEffect(() => {
    (async () => {
      const { data: plan } = await supabase
        .from('plans')
        .select('title, anchor_lat, anchor_lng')
        .eq('id', id!)
        .single();
      if (plan) {
        setPlanTitle(plan.title);
        if (plan.anchor_lat != null && plan.anchor_lng != null) {
          setBias({ lat: plan.anchor_lat, lng: plan.anchor_lng });
        }
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: u } = await supabase.from('users').select('display_name').eq('id', user.id).single();
        if (u) setMyName(u.display_name);
      }
    })();
  }, [id]);

  async function submit() {
    if (!place) { Alert.alert('Pick a place first'); return; }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const { data: candidate, error } = await supabase
      .from('venue_candidates')
      .insert({
        plan_id: id!,
        google_place_id: place.google_place_id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        address: place.address,
        maps_url: place.maps_url,
        source: 'suggestion',
        suggested_by_user_id: user.id,
      })
      .select()
      .single();

    if (error || !candidate) {
      setSubmitting(false);
      const dup = error?.code === '23505';
      Alert.alert(dup ? 'Already in the deck' : 'Could not suggest', dup ? 'That place is already a candidate for this plan.' : (error?.message ?? 'Try again.'));
      return;
    }

    await supabase.from('venue_swipes').upsert({
      plan_id: id!,
      user_id: user.id,
      venue_candidate_id: candidate.id,
      direction: 'right',
    });

    supabase.functions.invoke('notify', {
      body: {
        event: 'venue_suggested',
        plan_id: id,
        actor_user_id: user.id,
        extra: { actor_name: myName, plan_title: planTitle, place_name: place.name },
      },
    });

    setSubmitting(false);
    router.back();
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <NavHead onClose={() => router.back()} title="Suggest a place" />
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.hero}>Drop a spot for the crew.</Text>
          <Text style={styles.sub}>Your suggestion shows up in everyone's swipe deck as a card with your name on it.</Text>

          <View style={styles.field}>
            <PlacePicker
              placeholder="Search for a place…"
              bias={bias}
              value={place}
              onChange={setPlace}
            />
          </View>

          <HButton
            label={submitting ? 'Adding…' : 'Suggest it'}
            onPress={submit}
            disabled={!place || submitting}
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  inner: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  hero: { fontSize: 26, fontFamily: FONTS.extrabold, color: COLORS.text, letterSpacing: -0.5, includeFontPadding: false },
  sub: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },
  field: { gap: SPACING.sm },
});
