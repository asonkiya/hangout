import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS, SHADOWS } from '@/constants';
import { NavHead, HButton } from '@/components/ui';

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp]     = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function verifyOtp() {
    if (otp.length < 6) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone: phone ?? '', token: otp, type: 'sms' });
    setLoading(false);
    if (error) { Alert.alert('Invalid code', 'Please check the code and try again.'); return; }
    const pendingToken = await SecureStore.getItemAsync('pending_join_token');
    if (pendingToken) router.replace(`/join/${pendingToken}`);
  }

  async function resend() {
    const { error } = await supabase.auth.signInWithOtp({ phone: phone ?? '' });
    if (!error) Alert.alert('Code resent');
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <NavHead onBack={() => router.back()} />
        <View style={styles.copy}>
          <Text style={styles.title}>Enter the code</Text>
          <Text style={styles.sub}>Sent to {phone}</Text>
        </View>
        <TextInput
          style={styles.otpInput}
          value={otp}
          onChangeText={setOtp}
          placeholder="000000"
          placeholderTextColor={COLORS.textFaint}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />
        <HButton
          label={loading ? 'Verifying…' : 'Verify'}
          variant="primary"
          size="lg"
          onPress={verifyOtp}
          disabled={loading || otp.length < 6}
          fullWidth
        />
        <HButton label="Resend code" variant="text" size="sm" onPress={resend} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  inner: { flex: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.md },
  copy: { gap: SPACING.xs },
  title: { fontSize: FONT_SIZE.xxl, fontFamily: FONTS.bold, color: COLORS.text, includeFontPadding: false },
  sub:   { fontSize: FONT_SIZE.md, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },
  otpInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: SPACING.sm,
    includeFontPadding: false,
  },
});
