import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

function useProtectedRoute(session: Session | null) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, segments]);
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Handle deep links (hangout://join/:token)
  useEffect(() => {
    function handleUrl(url: string) {
      const parsed = Linking.parse(url);
      // parsed.path is "join/TOKEN" for hangout://join/TOKEN
      if (parsed.path?.startsWith('join/')) {
        const token = parsed.path.split('/')[1];
        if (!token) return;
        if (session) {
          router.push(`/join/${token}`);
        } else {
          SecureStore.setItemAsync('pending_join_token', token);
          // useProtectedRoute will redirect to login; verify.tsx picks up token post-auth
        }
      }
    }

    // Cold-start deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Foreground deep link
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [session]);

  useProtectedRoute(session);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="plan/create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plan/[id]" />
        <Stack.Screen name="join/[token]" />
      </Stack>
    </>
  );
}
