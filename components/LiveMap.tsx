import { useRef, useEffect, forwardRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '@/components/ui';
import { COLORS, FONTS, SHADOWS } from '@/constants';
import type { DepartureStatus } from '@/types/database';

export type LiveMember = {
  user_id: string;
  display_name: string;
  index: number;
  lat: number;
  lng: number;
  departure_status: DepartureStatus;
  eta_minutes?: number | null;
};

type Props = {
  destination: { lat: number; lng: number; name?: string } | null;
  members: LiveMember[];
  style?: object;
};

const DOT_COLOR: Record<DepartureStatus, string> = {
  not_left: COLORS.textFaint,
  leaving:  COLORS.warningDeep,
  arrived:  COLORS.successDeep,
};

export const LiveMap = forwardRef<MapView, Props>(function LiveMap({ destination, members, style }, ref) {
  const localRef = useRef<MapView | null>(null);
  const mapRef = (ref as React.MutableRefObject<MapView | null>) ?? localRef;

  const initialRegion: Region = {
    latitude:  destination?.lat ?? 37.78,
    longitude: destination?.lng ?? -122.43,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  useEffect(() => {
    const coords: { latitude: number; longitude: number }[] = [];
    if (destination) coords.push({ latitude: destination.lat, longitude: destination.lng });
    for (const m of members) coords.push({ latitude: m.lat, longitude: m.lng });
    if (coords.length > 0 && mapRef.current) {
      // Small delay to let map finish initial layout on iOS
      const t = setTimeout(() => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 60, bottom: 80, left: 60 },
          animated: true,
        });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [destination?.lat, destination?.lng, members.map(m => `${m.user_id}:${m.lat}:${m.lng}`).join('|')]);

  return (
    <MapView ref={mapRef} style={[styles.map, style]} initialRegion={initialRegion}>
      {destination && (
        <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.name} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.dest}>
            <Feather name="map-pin" size={18} color="#fff" strokeWidth={2.4} />
          </View>
        </Marker>
      )}

      {members.map((m) => (
        <Marker
          key={m.user_id}
          coordinate={{ latitude: m.lat, longitude: m.lng }}
          title={m.display_name}
          description={m.eta_minutes != null ? `${m.eta_minutes} min away` : undefined}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={Platform.OS === 'ios'}
        >
          <View style={styles.memberWrap}>
            <Avatar name={m.display_name} index={m.index} size={34} ring />
            <View style={[styles.statusDot, { backgroundColor: DOT_COLOR[m.departure_status] }]} />
            {m.eta_minutes != null && (
              <View style={styles.etaBubble}>
                <Text style={styles.etaText}>{m.eta_minutes}m</Text>
              </View>
            )}
          </View>
        </Marker>
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { width: '100%', height: 196, borderRadius: 20, overflow: 'hidden' },

  dest: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    ...SHADOWS.floating,
  },

  memberWrap: { alignItems: 'center' },
  statusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  etaBubble: {
    marginTop: 3,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    ...SHADOWS.card,
  },
  etaText: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    includeFontPadding: false,
  },
});
