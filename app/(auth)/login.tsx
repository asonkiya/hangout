import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Linking,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS, SHADOWS } from '@/constants';

export default function LoginScreen() {
  const [mode, setMode]       = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]     = useState('dev@pullup.app');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);

  async function submit() {
    const e = email.trim().toLowerCase();
    if (!e || !password) { Alert.alert('Enter your email and password'); return; }
    setLoading(true);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) Alert.alert('Sign in failed', error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email: e, password });
      if (error) Alert.alert('Sign up failed', error.message);
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}>
          <Text style={styles.wordmark}>pull up</Text>
          <Text style={styles.tagline}>Pick a place. Share your ETA. See who's almost there.</Text>
        </View>

        {/* Mode tabs */}
        <View style={styles.tabs}>
          {(['signin', 'signup'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.tab, mode === m && styles.tabActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={COLORS.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={COLORS.textFaint}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>
              {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          </TouchableOpacity>
          {mode === 'signup' && (
            <Text style={styles.consent}>
              By creating an account you agree to our{' '}
              <Text style={styles.consentLink} onPress={() => Linking.openURL('https://asonkiya.github.io/pullup/privacy-policy')}>
                privacy policy
              </Text>.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  inner: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  top: { gap: SPACING.sm },
  wordmark: {
    fontSize: 26,
    fontFamily: FONTS.extrabold,
    color: COLORS.primary,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  tagline: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 22,
    includeFontPadding: false,
  },
  tabs: { flexDirection: 'row', gap: SPACING.sm },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.input,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  tabActive: { backgroundColor: COLORS.primaryLight },
  tabText: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.semibold, color: COLORS.textSecondary, includeFontPadding: false },
  tabTextActive: { color: COLORS.primary },
  form: { gap: SPACING.sm },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    includeFontPadding: false,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.xs,
    ...SHADOWS.button,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontFamily: FONTS.semibold, includeFontPadding: false },
  consent: { fontSize: FONT_SIZE.xs, fontFamily: FONTS.regular, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, includeFontPadding: false, lineHeight: 16 },
  consentLink: { color: COLORS.primary, fontFamily: FONTS.semibold },
});
