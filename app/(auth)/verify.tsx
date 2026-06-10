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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function verifyOtp() {
    if (otp.length < 6) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: phone ?? '',
      token: otp,
      type: 'sms',
    });
    setLoading(false);
    if (error) {
      Alert.alert('Invalid code', 'Please check the code and try again.');
      return;
    }
    // If the user followed an invite link before logging in, complete the join now
    const pendingToken = await SecureStore.getItemAsync('pending_join_token');
    if (pendingToken) {
      router.replace(`/join/${pendingToken}`);
    }
    // Otherwise useProtectedRoute in _layout.tsx redirects to /(tabs)
  }

  async function resend() {
    const { error } = await supabase.auth.signInWithOtp({ phone: phone ?? '' });
    if (!error) Alert.alert('Code resent');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>{'<-'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Enter the code</Text>
        <Text style={styles.subtitle}>Sent to {phone}</Text>
        <TextInput
          style={styles.input}
          value={otp}
          onChangeText={setOtp}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />
        <TouchableOpacity
          style={[styles.button, (loading || otp.length < 6) && styles.buttonDisabled]}
          onPress={verifyOtp}
          disabled={loading || otp.length < 6}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Verifying...' : 'Verify'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={resend} style={styles.resend}>
          <Text style={styles.resendText}>Resend code</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  inner: { flex: 1, paddingHorizontal: SPACING.xl, paddingTop: 60, gap: SPACING.md },
  backText: { fontSize: FONT_SIZE.md, color: COLORS.primary, marginBottom: SPACING.lg },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '600' },
  resend: { alignItems: 'center', paddingVertical: SPACING.sm },
  resendText: { color: COLORS.primary, fontSize: FONT_SIZE.sm },
});
