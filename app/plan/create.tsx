import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS } from '@/constants';
import { NavHead, VibeChip } from '@/components/ui';
import { PlacePicker, type PickedPlace } from '@/components/PlacePicker';

const VIBES = ['Food', 'Drinks', 'Party', 'Movie', 'Coffee', 'Gaming', 'Active'];

type WhenChip = 'tonight' | 'tomorrow' | 'weekend' | 'exact' | null;

function computeScheduled(when: WhenChip, exactDate: Date | null): string | null {
  if (when === 'exact') return exactDate?.toISOString() ?? null;
  const d = new Date();
  if (when === 'tonight')   { d.setHours(20, 0, 0, 0); return d.toISOString(); }
  if (when === 'tomorrow')  { d.setDate(d.getDate() + 1); d.setHours(19, 0, 0, 0); return d.toISOString(); }
  if (when === 'weekend') {
    const day = d.getDay();
    const daysUntilSat = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(14, 0, 0, 0);
    return d.toISOString();
  }
  return null;
}

export default function CreatePlanScreen() {
  const [title, setTitle]       = useState('');
  const [vibe, setVibe]         = useState('');
  const [when, setWhen]         = useState<WhenChip>(null);
  const [exactDate, setExactDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [place, setPlace]       = useState<PickedPlace | null>(null);
  const [votingEnabled, setVotingEnabled] = useState(true);
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function createPlan() {
    if (!title.trim()) { Alert.alert('Give your plan a name'); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const scheduledFor = computeScheduled(when, exactDate);

    const { data: plan, error } = await supabase
      .from('plans')
      .insert({
        creator_user_id: user.id,
        title: title.trim(),
        state: place ? 'venue_locked' : 'open',
        scheduled_for: scheduledFor,
        travel_mode_default: 'drive',
        vibe: vibe || null,
        selected_place_id: place?.google_place_id ?? null,
        selected_place_name: place?.name ?? null,
        anchor_lat: place?.lat ?? null,
        anchor_lng: place?.lng ?? null,
        voting_enabled: votingEnabled,
      })
      .select()
      .single();

    if (error || !plan) {
      setLoading(false);
      Alert.alert('Error', error?.message ?? 'Could not create plan');
      return;
    }

    await supabase.from('plan_members').insert({
      plan_id: plan.id,
      user_id: user.id,
      role: 'host',
      rsvp_status: 'going',
    });

    if (place) {
      const { data: candidate } = await supabase
        .from('venue_candidates')
        .insert({
          plan_id: plan.id,
          google_place_id: place.google_place_id,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          address: place.address,
          maps_url: place.maps_url,
          source: 'host_picked',
        })
        .select()
        .single();
      if (candidate) {
        await supabase.from('venue_selection_events').insert({
          plan_id: plan.id,
          venue_candidate_id: candidate.id,
          selected_by_user_id: user.id,
          selection_type: 'host',
        });
      }
    }

    setLoading(false);
    router.replace(`/plan/${plan.id}/invite`);
  }

  function whenLabel(): string {
    if (when === 'tonight')  return 'Tonight · 8:00 PM';
    if (when === 'tomorrow') return 'Tomorrow · 7:00 PM';
    if (when === 'weekend')  return 'This weekend · 2:00 PM';
    if (when === 'exact')    return exactDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return '';
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <NavHead
            onClose={() => router.back()}
            right={<Text style={styles.counter}>1 of 2</Text>}
          />

          {/* Hero copy */}
          <View style={styles.heroText}>
            <Text style={styles.display}>What's the move?</Text>
            <Text style={styles.sub}>Name it anything — you can vote on the spot later.</Text>
          </View>

          {/* Title input */}
          <View style={styles.titleWrap}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Dinner at that new spot…"
              placeholderTextColor={COLORS.textFaint}
              maxLength={80}
              autoFocus
            />
          </View>

          {/* Vibe chips */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>VIBE</Text>
            <View style={styles.chips}>
              {VIBES.map((v) => (
                <VibeChip
                  key={v}
                  vibe={v}
                  selected={vibe === v}
                  onPress={() => setVibe(vibe === v ? '' : v)}
                />
              ))}
            </View>
          </View>

          {/* When-ish chips */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>WHEN-ISH?</Text>
            <View style={styles.chips}>
              {(['tonight', 'tomorrow', 'weekend'] as const).map((w) => (
                <TouchableOpacity
                  key={w}
                  style={[styles.whenChip, when === w && styles.whenChipOn]}
                  onPress={() => { setWhen(when === w ? null : w); setShowDatePicker(false); }}
                >
                  <Text style={[styles.whenChipText, when === w && styles.whenChipTextOn]}>
                    {w === 'tonight' ? 'Tonight' : w === 'tomorrow' ? 'Tomorrow' : 'This weekend'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.whenChip, when === 'exact' && styles.whenChipOn]}
                onPress={() => { setWhen('exact'); setShowDatePicker(true); }}
              >
                <Feather name="calendar" size={15} color={when === 'exact' ? COLORS.primary : COLORS.textSecondary} strokeWidth={2} />
                <Text style={[styles.whenChipText, when === 'exact' && styles.whenChipTextOn]}>Pick exact</Text>
              </TouchableOpacity>
            </View>

            {when && (
              <Text style={styles.whenSummary}>{whenLabel()}</Text>
            )}

            {showDatePicker && (
              <DateTimePicker
                value={exactDate}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, date) => {
                  if (date) setExactDate(date);
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                }}
                minimumDate={new Date()}
                style={{ marginTop: SPACING.sm }}
              />
            )}
          </View>

          {/* Pre-pick venue (optional) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>PLACE (OPTIONAL)</Text>
            <PlacePicker
              placeholder="Lock in a spot now, or skip…"
              value={place}
              onChange={setPlace}
            />
            {place && (
              <Text style={styles.whenSummary}>Plan starts already locked in. You can re-open voting later.</Text>
            )}
          </View>

          {/* Mode Option */}
          <View style={styles.fieldGroup}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>GROUP VOTING</Text>
                <Text style={styles.toggleSub}>
                  {votingEnabled 
                    ? 'Crew swipes to vote, auto-locks at 60% agreement.' 
                    : 'Host Mode: No voting. Only the host can select the destination.'}
                </Text>
              </View>
              <Switch
                value={votingEnabled}
                onValueChange={setVotingEnabled}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={Platform.OS === 'android' ? COLORS.surface : undefined}
              />
            </View>
          </View>

          {/* Create button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.createBtn, (!title.trim() || loading) && styles.createBtnDisabled]}
              onPress={createPlan}
              disabled={!title.trim() || loading}
              activeOpacity={0.85}
            >
              <Text style={styles.createBtnText}>{loading ? 'Creating…' : 'Create plan'}</Text>
            </TouchableOpacity>
            <Text style={styles.footerHint}>Next: invite the crew</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  inner: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },

  counter: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.semibold,
    color: COLORS.textFaint,
    includeFontPadding: false,
  },

  heroText: { gap: 6 },
  display: {
    fontSize: 30,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  sub: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },

  titleWrap: {
    borderBottomWidth: 2.5,
    borderBottomColor: COLORS.primary,
    paddingBottom: 10,
  },
  titleInput: {
    fontSize: 26,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    includeFontPadding: false,
  },

  fieldGroup: { gap: SPACING.sm },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.textFaint,
    letterSpacing: 1.1,
    includeFontPadding: false,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },

  whenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.chip,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  whenChipOn: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#D6D1FA',
  },
  whenChipText: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },
  whenChipTextOn: { color: COLORS.primary },

  whenSummary: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textFaint,
    marginTop: -SPACING.xs,
    includeFontPadding: false,
  },

  footer: { gap: SPACING.sm, marginTop: SPACING.md },
  createBtn: {
    height: 56,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONTS.bold,
    color: '#fff',
    includeFontPadding: false,
  },
  footerHint: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textFaint,
    textAlign: 'center',
    includeFontPadding: false,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleLabel: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    letterSpacing: 1.1,
    includeFontPadding: false,
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 4,
    includeFontPadding: false,
    paddingRight: SPACING.md,
  },
});
