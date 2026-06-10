import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  SafeAreaView,
  AppState,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import {
  COLORS,
  SPACING,
  FONT_SIZE,
  LOCATION_UPDATE_INTERVAL_MS,
  LOCATION_DISTANCE_THRESHOLD_M,
  DEFAULT_SHARE_SESSION_HOURS,
} from '@/constants';
import type { EtaSnapshotRow, UserRow } from '@/types/database';

const CONSENT_VERSION = '1.0';

type EtaEntry = EtaSnapshotRow & { users: UserRow };

export default function EtaDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isSharing, setIsSharing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<EtaEntry[]>([]);
  const [planName, setPlanName] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const locSub = useRef<Location.LocationSubscription | null>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id ?? null));
    supabase
      .from('plans')
      .select('title')
      .eq('id', id!)
      .single()
      .then(({ data }) => {
        if (data) setPlanName(data.title);
      });
    fetchEta();

    const channel = supabase
      .channel(`eta-${id}`)
      .on('broadcast', { event: 'eta_updated' }, () => fetchEta())
      .subscribe();

    const appListener = AppState.addEventListener('change', (next) => {
      if (next === 'active' && sessionId) uploadCurrentLocation(sessionId);
    });

    return () => {
      supabase.removeChannel(channel);
      appListener.remove();
      locSub.current?.remove();
    };
  }, [id]);

  async function fetchEta() {
    const { data } = await supabase
      .from('eta_snapshots')
      .select('*, users(*)')
      .eq('plan_id', id!)
      .order('duration_seconds', { ascending: true, nullsFirst: false });
    setEntries((data ?? []) as unknown as EtaEntry[]);
  }

  async function startSharing() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location required',
        'Hangout needs location access while you use the app to share your ETA. This is only active while the app is open.'
      );
      return;
    }
    const expiresAt = new Date(
      Date.now() + DEFAULT_SHARE_SESSION_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: session, error } = await supabase
      .from('location_share_sessions')
      .insert({
        plan_id: id!,
        user_id: uid!,
        status: 'active',
        expires_at: expiresAt,
        consent_version: CONSENT_VERSION,
        share_mode: 'foreground',
      })
      .select()
      .single();

    if (error || !session) {
      Alert.alert('Error', 'Could not start sharing. Try again.');
      return;
    }
    setSessionId(session.id);
    setIsSharing(true);
    startLocationWatch(session.id);
  }

  async function stopSharing() {
    locSub.current?.remove();
    locSub.current = null;
    if (sessionId) {
      await supabase
        .from('location_share_sessions')
        .update({ status: 'stopped' as const, stopped_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    setIsSharing(false);
    setSessionId(null);
  }

  function startLocationWatch(sid: string) {
    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: LOCATION_DISTANCE_THRESHOLD_M,
        timeInterval: LOCATION_UPDATE_INTERVAL_MS,
      },
      (loc) => uploadPoint(sid, loc)
    ).then((sub) => {
      locSub.current = sub;
    });
  }

  async function uploadCurrentLocation(sid: string) {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    uploadPoint(sid, loc);
  }

  async function uploadPoint(sid: string, loc: Location.LocationObject) {
    const { error } = await supabase.from('location_points').insert({
      session_id: sid,
      user_id: uid!,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy_m: loc.coords.accuracy,
      captured_at: new Date(loc.timestamp).toISOString(),
    });

    if (!error) {
      // Fire-and-forget ETA computation — silent on failure, next update will retry
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        supabase.functions.invoke('compute-eta', {
          body: { plan_id: id! },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      });
    }
  }

  function fmtDuration(s: number | null) {
    if (s == null) return '--';
    const m = Math.round(s / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  function fmtDist(m: number | null) {
    if (m == null) return '';
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>{'<-'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Who's close</Text>
          <Text style={styles.headerSub}>{planName}</Text>
        </View>
      </View>

      {!isSharing ? (
        <View style={styles.consent}>
          <Text style={styles.consentTitle}>Share your ETA</Text>
          <Text style={styles.consentBody}>
            Only for this plan. Only while you choose. Automatically ends{' '}
            {DEFAULT_SHARE_SESSION_HOURS}h after you start.
          </Text>
          <TouchableOpacity style={styles.shareBtn} onPress={startSharing}>
            <Text style={styles.shareBtnText}>Share ETA for this plan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.sharingBanner}>
          <View style={styles.dot} />
          <Text style={styles.sharingText}>Sharing your location for this plan only</Text>
          <TouchableOpacity onPress={stopSharing}>
            <Text style={styles.stopText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No ETAs yet</Text>
            <Text style={styles.emptySub}>
              Once members tap "Share ETA", you'll see who's on the way here.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.etaRow}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.users?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.etaName}>{item.users?.display_name ?? 'Unknown'}</Text>
              <Text style={styles.etaMode}>{item.mode} · {fmtDist(item.distance_meters)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.etaDuration}>{fmtDuration(item.duration_seconds)}</Text>
              <Text style={styles.etaTime}>
                {new Date(item.computed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { fontSize: FONT_SIZE.xl, color: COLORS.primary },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  consent: {
    margin: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
  },
  consentTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  consentBody: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, lineHeight: 20 },
  shareBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.xs },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.md },
  sharingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#DCFCE7',
    borderBottomWidth: 1,
    borderBottomColor: '#BBF7D0',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  sharingText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.success, fontWeight: '500' },
  stopText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.error },
  list: { padding: SPACING.lg, gap: SPACING.sm },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  rank: { width: 24, textAlign: 'center', fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.textSecondary },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
  etaName: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text },
  etaMode: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  etaDuration: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.primary },
  etaTime: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
