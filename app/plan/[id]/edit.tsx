import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS } from '@/constants';
import { NavHead, VibeChip, HButton } from '@/components/ui';

const VIBES = ['Food', 'Drinks', 'Party', 'Movie', 'Coffee', 'Gaming', 'Active'];

export default function EditPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle]   = useState('');
  const [vibe, setVibe]     = useState('');
  const [date, setDate]     = useState<Date | null>(null);
  const [votingEnabled, setVotingEnabled] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: plan } = await supabase.from('plans').select('title, vibe, scheduled_for, voting_enabled').eq('id', id!).single();
      if (plan) {
        setTitle(plan.title);
        setVibe(plan.vibe ?? '');
        if (plan.scheduled_for) setDate(new Date(plan.scheduled_for));
        setVotingEnabled(plan.voting_enabled);
      }
      setLoading(false);
    })();
  }, [id]);

  async function save() {
    if (!title.trim()) { Alert.alert('Plan needs a name'); return; }
    setSaving(true);
    const { error } = await supabase.from('plans').update({
      title: title.trim(),
      vibe: vibe || null,
      scheduled_for: date?.toISOString() ?? null,
      voting_enabled: votingEnabled,
    }).eq('id', id!);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    router.back();
  }

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <NavHead
            onClose={() => router.back()}
            title="Edit plan"
            right={
              <TouchableOpacity onPress={save} disabled={saving || !title.trim()}>
                <Text style={[styles.saveLink, (!title.trim() || saving) && { opacity: 0.4 }]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            }
          />

          {/* Title */}
          <View style={styles.titleWrap}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Dinner, pre-game, coffee run…"
              placeholderTextColor={COLORS.textFaint}
              maxLength={80}
              autoFocus
            />
          </View>

          {/* Vibe */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>VIBE</Text>
            <View style={styles.chips}>
              {VIBES.map((v) => (
                <VibeChip key={v} vibe={v} selected={vibe === v} onPress={() => setVibe(vibe === v ? '' : v)} />
              ))}
            </View>
          </View>

          {/* When */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>WHEN</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowPicker(true)}
            >
              <Feather name="calendar" size={16} color={COLORS.primary} />
              <Text style={styles.dateBtnText}>
                {date
                  ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : 'Pick a date & time'}
              </Text>
            </TouchableOpacity>
            {date && (
              <TouchableOpacity onPress={() => setDate(null)}>
                <Text style={styles.clearLink}>Clear date & time</Text>
              </TouchableOpacity>
            )}
            {showPicker && (
              <DateTimePicker
                value={date ?? new Date()}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, d) => {
                  if (d) setDate(d);
                  if (Platform.OS !== 'ios') setShowPicker(false);
                }}
                minimumDate={new Date()}
              />
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  inner: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },

  saveLink: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    includeFontPadding: false,
  },

  titleWrap: { borderBottomWidth: 2.5, borderBottomColor: COLORS.primary, paddingBottom: 10 },
  titleInput: { fontSize: 26, fontFamily: FONTS.bold, color: COLORS.text, includeFontPadding: false },

  fieldGroup: { gap: SPACING.sm },
  fieldLabel: {
    fontSize: 12, fontFamily: FONTS.bold, color: COLORS.textFaint,
    letterSpacing: 1.1, includeFontPadding: false,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },

  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
    backgroundColor: COLORS.primaryFaint,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  dateBtnText: { fontSize: FONT_SIZE.md, fontFamily: FONTS.medium, color: COLORS.primary, includeFontPadding: false },
  clearLink: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.error, includeFontPadding: false },
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
