import { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';

const VIBES = ['Food', 'Drinks', 'Party', 'Movie', 'Coffee', 'Gaming', 'Active'];

export default function CreatePlanScreen() {
  const [title, setTitle] = useState('');
  const [vibe, setVibe] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function createPlan() {
    if (!title.trim()) {
      Alert.alert('Give your plan a name');
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let scheduledFor: string | null = null;
    if (date && time) {
      scheduledFor = new Date(`${date}T${time}`).toISOString();
    }

    const { data: plan, error } = await supabase
      .from('plans')
      .insert({
        creator_user_id: user.id,
        title: title.trim(),
        state: 'open',
        scheduled_for: scheduledFor,
        travel_mode_default: 'drive',
        vibe: vibe || null,
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

    setLoading(false);
    router.replace(`/plan/${plan.id}`);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New plan</Text>
          <TouchableOpacity onPress={createPlan} disabled={loading || !title.trim()}>
            <Text style={[styles.create, (!title.trim() || loading) && styles.createDisabled]}>
              {loading ? 'Creating...' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>What are you doing?</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Dinner, pre-game, coffee run..."
            placeholderTextColor={COLORS.textSecondary}
            maxLength={80}
            autoFocus
          />
          <Text style={styles.fieldLabel}>Vibe</Text>
          <View style={styles.vibes}>
            {VIBES.map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.chip, vibe === v && styles.chipSelected]}
                onPress={() => setVibe(vibe === v ? '' : v)}
              >
                <Text style={[styles.chipText, vibe === v && styles.chipTextSelected]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.fieldLabel}>When? (optional)</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={time}
              onChangeText={setTime}
              placeholder="HH:MM"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <Text style={styles.hint}>
            You'll add venues and invite friends after creating the plan.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cancel: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  headerTitle: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text },
  create: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
  createDisabled: { opacity: 0.4 },
  form: { padding: SPACING.lg, gap: SPACING.sm },
  fieldLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.text, marginTop: SPACING.md },
  titleInput: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: COLORS.text,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  row: { flexDirection: 'row', gap: SPACING.sm },
  vibes: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipSelected: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  chipText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextSelected: { color: COLORS.primary, fontWeight: '600' },
  hint: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xl,
    textAlign: 'center',
    lineHeight: 20,
  },
});
