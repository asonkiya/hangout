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
  Linking,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS, SHADOWS } from '@/constants';
import { Avatar, HButton, Label, Card } from '@/components/ui';
import type { UserRow } from '@/types/database';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setPhone(user.phone ?? null);
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (data) { setProfile(data); setDisplayName(data.display_name); }
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
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        if (profile) await supabase.from('users').update({ push_token: null }).eq('id', profile.id);
        await supabase.auth.signOut();
      }},
    ]);
  }

  function deleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account, all plans you created, your messages, and your location history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: confirmDeleteAccount },
      ],
    );
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Are you absolutely sure?',
      'Type "delete" in the next dialog to confirm.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: doDeleteAccount },
      ],
    );
  }

  async function doDeleteAccount() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { Alert.alert('Not signed in'); return; }
    const res = await supabase.functions.invoke('delete-account', {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.error) {
      Alert.alert('Could not delete account', res.error.message ?? 'Try again.');
      return;
    }
    await supabase.auth.signOut();
  }

  function openPrivacy() {
    Linking.openURL('https://asonkiya.github.io/pullup/privacy-policy');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <Avatar name={profile?.display_name ?? '?'} size={80} index={0} />
          </View>

          {/* Display name */}
          <Card>
            <Label>Display name</Label>
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.nameInput}
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
                <TouchableOpacity onPress={() => { setDisplayName(profile?.display_name ?? ''); setEditing(false); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.fieldRow} onPress={() => setEditing(true)}>
                <Text style={styles.fieldValue}>{profile?.display_name ?? '—'}</Text>
                <Text style={styles.editHint}>Edit</Text>
              </TouchableOpacity>
            )}
          </Card>

          {/* Email */}
          <Card>
            <Label>Email</Label>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldValue}>{profile?.email ?? '—'}</Text>
            </View>
          </Card>

          {/* Phone */}
          {phone && (
            <Card>
              <Label>Phone</Label>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldValue}>{phone}</Text>
              </View>
            </Card>
          )}

          {/* Member since */}
          {profile?.created_at && (
            <Card>
              <Label>Member since</Label>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldValue}>
                  {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </Card>
          )}

          <View style={styles.divider} />

          <TouchableOpacity onPress={openPrivacy} style={styles.linkRow}>
            <Text style={styles.linkText}>Privacy policy</Text>
          </TouchableOpacity>

          <HButton
            label="Sign out"
            variant="ghost"
            size="md"
            fullWidth
            onPress={signOut}
          />

          <TouchableOpacity onPress={deleteAccount} style={styles.deleteRow}>
            <Text style={styles.deleteText}>Delete account</Text>
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
  title: { fontSize: FONT_SIZE.xl, fontFamily: FONTS.bold, color: COLORS.text, includeFontPadding: false },

  body: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 60 },
  avatarSection: { alignItems: 'center', paddingVertical: SPACING.lg },

  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingTop: SPACING.xs },
  fieldValue: { flex: 1, fontSize: FONT_SIZE.md, fontFamily: FONTS.regular, color: COLORS.text, includeFontPadding: false },
  editHint: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.primary, includeFontPadding: false },

  editRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.xs },
  nameInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    paddingVertical: 4,
    includeFontPadding: false,
  },
  saveBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.input },
  saveBtnText: { color: '#fff', fontFamily: FONTS.bold, fontSize: FONT_SIZE.sm, includeFontPadding: false },
  cancelText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  linkRow: { paddingVertical: SPACING.sm, alignItems: 'center' },
  linkText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.primary, includeFontPadding: false },
  deleteRow: { paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  deleteText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.error, includeFontPadding: false },
});
