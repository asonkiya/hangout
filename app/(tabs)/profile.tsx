import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';
import type { UserRow } from '@/types/database';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setPhone(user.phone ?? null);
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (data) {
      setProfile(data);
      setDisplayName(data.display_name);
    }
    setLoading(false);
  }

  async function saveName() {
    if (!profile || !displayName.trim()) return;
    setSaving(true);
    await supabase.from('users').update({ display_name: displayName.trim() }).eq('id', profile.id);
    setProfile((p) => p ? { ...p, display_name: displayName.trim() } : p);
    setSaving(false);
    setEditing(false);
  }

  function signOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const initial = (profile?.display_name?.[0] ?? '?').toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          </View>

          {/* Display name */}
          <View style={styles.section}>
            <Text style={styles.label}>Display name</Text>
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoFocus
                  maxLength={50}
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveName} disabled={saving}>
                  <Text style={styles.saveBtnText}>{saving ? '…' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setDisplayName(profile?.display_name ?? ''); setEditing(false); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.fieldRow} onPress={() => setEditing(true)}>
                <Text style={styles.fieldValue}>{profile?.display_name ?? '—'}</Text>
                <Text style={styles.editHint}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Phone */}
          <View style={styles.section}>
            <Text style={styles.label}>Phone</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldValue}>{phone ?? '—'}</Text>
            </View>
          </View>

          {/* Member since */}
          {profile?.created_at && (
            <View style={styles.section}>
              <Text style={styles.label}>Member since</Text>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldValue}>
                  {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          <TouchableOpacity style={styles.signOut} onPress={signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg, gap: SPACING.md },
  avatarWrap: { alignItems: 'center', paddingVertical: SPACING.lg },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: COLORS.primary },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  label: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm },
  fieldValue: { flex: 1, fontSize: FONT_SIZE.md, color: COLORS.text },
  editHint: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    paddingVertical: 4,
  },
  saveBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6, backgroundColor: COLORS.primary, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.sm },
  cancelBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6 },
  cancelBtnText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.sm },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  signOut: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.error,
    borderRadius: 12,
  },
  signOutText: { color: COLORS.error, fontSize: FONT_SIZE.md, fontWeight: '600' },
});
