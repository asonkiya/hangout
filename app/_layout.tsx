import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function useProtectedRoute(session: Session | null, ready: boolean) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, segments, ready]);
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

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

  // Register for push notifications
  useEffect(() => {
    if (!session) return;
    (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Hangout',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      await supabase
        .from('users')
        .update({ push_token: token.data })
        .eq('id', session.user.id);
    })();
  }, [session?.user.id]);

  // Handle notification taps → navigate to plan
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const planId = response.notification.request.content.data?.plan_id as string | undefined;
      if (planId) router.push(`/plan/${planId}`);
    });
    return () => sub.remove();
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

  useProtectedRoute(session, ready);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="plan/create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plan/[id]" />
        <Stack.Screen name="join/[token]" />
      </Stack>
    </GestureHandlerRootView>
  );
}
