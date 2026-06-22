import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
  AppState,
  Dimensions,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
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
const MAP_HEIGHT = Dimensions.get('window').height * 0.38;

type EtaEntry = EtaSnapshotRow & { users: UserRow };
type MemberLocation = {
  user_id: string;
  display_name: string;
  lat: number;
  lng: number;
};

const MEMBER_COLORS = ['#5B4FE9', '#F59E0B', '#EF4444', '#10B981', '#EC4899', '#8B5CF6', '#06B6D4'];

export default function EtaDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isSharing, setIsSharing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<EtaEntry[]>([]);
  const [planName, setPlanName] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [venueLat, setVenueLat] = useState<number | null>(null);
  const [venueLng, setVenueLng] = useState<number | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [memberLocations, setMemberLocations] = useState<MemberLocation[]>([]);
  const locSub = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id ?? null));
    loadPlanData();
    fetchEta();
    fetchMemberLocations();

    const channel = supabase
      .channel(`eta-${id}`)
      .on('broadcast', { event: 'eta_updated' }, () => {
        fetchEta();
        fetchMemberLocations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_points' }, () => {
        fetchMemberLocations();
      })
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

  async function loadPlanData() {
    const { data: plan } = await supabase
      .from('plans')
      .select('title, selected_place_id, selected_place_name')
      .eq('id', id!)
      .single();
    if (!plan) return;
    setPlanName(plan.title);
    setVenueName(plan.selected_place_name);

    if (plan.selected_place_id) {
      const { data: venue } = await supabase
        .from('venue_candidates')
        .select('lat, lng')
        .eq('plan_id', id!)
        .eq('google_place_id', plan.selected_place_id)
        .single();
      if (venue) {
        setVenueLat(venue.lat);
        setVenueLng(venue.lng);
      }
    }
  }

  async function fetchEta() {
    const { data } = await supabase
      .from('eta_snapshots')
      .select('*, users(*)')
      .eq('plan_id', id!)
      .order('duration_seconds', { ascending: true, nullsFirst: false });
    setEntries((data ?? []) as unknown as EtaEntry[]);
  }

  async function fetchMemberLocations() {
    const { data: sessions } = await supabase
      .from('location_share_sessions')
      .select('id, user_id, users(display_name)')
      .eq('plan_id', id!)
      .eq('status', 'active');

    if (!sessions || sessions.length === 0) {
      setMemberLocations([]);
      return;
    }

    const locations: MemberLocation[] = [];
    for (const session of sessions) {
      const { data: point } = await supabase
        .from('location_points')
        .select('lat, lng')
        .eq('session_id', session.id)
        .order('captured_at', { ascending: false })
        .limit(1)
        .single();
      if (point) {
        const user = session.users as unknown as { display_name: string } | null;
        locations.push({
          user_id: session.user_id,
          display_name: user?.display_name ?? 'Unknown',
          lat: point.lat,
          lng: point.lng,
        });
      }
    }
    setMemberLocations(locations);
  }

  function fitMapToMarkers() {
    const coords: { latitude: number; longitude: number }[] = [];
    if (venueLat != null && venueLng != null) {
      coords.push({ latitude: venueLat, longitude: venueLng });
    }
    for (const m of memberLocations) {
      coords.push({ latitude: m.lat, longitude: m.lng });
    }
    if (coords.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }

  useEffect(() => {
    fitMapToMarkers();
  }, [venueLat, venueLng, memberLocations]);

  const defaultRegion: Region = {
    latitude: venueLat ?? 37.78,
    longitude: venueLng ?? -122.43,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

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

  const hasMapContent = (venueLat != null && venueLng != null) || memberLocations.length > 0;

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
        {hasMapContent && (
          <TouchableOpacity onPress={fitMapToMarkers}>
            <Text style={styles.recenterText}>Re-center</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        {/* Map */}
        {hasMapContent && (
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={defaultRegion}
              showsUserLocation
              showsMyLocationButton={false}
            >
              {venueLat != null && venueLng != null && (
                <Marker
                  coordinate={{ latitude: venueLat, longitude: venueLng }}
                  title={venueName ?? 'Destination'}
                  pinColor={COLORS.error}
                />
              )}
              {memberLocations.map((m, i) => (
                <Marker
                  key={m.user_id}
                  coordinate={{ latitude: m.lat, longitude: m.lng }}
                  title={m.display_name}
                  pinColor={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                />
              ))}
            </MapView>
            {memberLocations.length > 0 && (
              <View style={styles.legend}>
                {memberLocations.map((m, i) => (
                  <View key={m.user_id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }]} />
                    <Text style={styles.legendText} numberOfLines={1}>{m.display_name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Share / Stop banner */}
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

        {/* ETA list */}
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No ETAs yet</Text>
            <Text style={styles.emptySub}>
              Once members tap "Share ETA", you'll see who's on the way here.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {entries.map((item, index) => (
              <View key={item.id} style={styles.etaRow}>
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
            ))}
          </View>
        )}
      </ScrollView>
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
  recenterText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.primary },

  scrollContent: { paddingBottom: SPACING.xl },

  mapContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  map: { width: '100%', height: MAP_HEIGHT },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, maxWidth: 100 },

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
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  sharingText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.success, fontWeight: '500' },
  stopText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.error },

  list: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.sm },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.md,
    gap: SPACING.sm,
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
