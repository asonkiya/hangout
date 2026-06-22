import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS } from '@/constants';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export type PickedPlace = {
  google_place_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  maps_url: string | null;
};

type Prediction = {
  placeId: string;
  text: string;
  secondary: string | null;
};

type Props = {
  placeholder?: string;
  bias?: { lat: number; lng: number } | null;
  value?: PickedPlace | null;
  onChange: (place: PickedPlace | null) => void;
};

export function PlacePicker({ placeholder = 'Search for a place…', bias, value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string>(genId());

  useEffect(() => {
    if (value) return;
    if (!query.trim() || query.trim().length < 2) { setPreds([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runAutocomplete(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, value]);

  async function runAutocomplete(input: string) {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        input,
        sessionToken: sessionRef.current,
      };
      if (bias) {
        body.locationBias = {
          circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50000 },
        };
      }
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Prediction[] = (data.suggestions ?? [])
        .map((s: any) => s.placePrediction)
        .filter(Boolean)
        .map((p: any) => ({
          placeId: p.placeId,
          text: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondary: p.structuredFormat?.secondaryText?.text ?? null,
        }));
      setPreds(list);
    } catch (e: unknown) {
      setError('Could not search. Check your connection.');
      setPreds([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectPrediction(p: Prediction) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${p.placeId}?sessionToken=${sessionRef.current}`,
        {
          headers: {
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'id,displayName,location,shortFormattedAddress,googleMapsUri',
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const picked: PickedPlace = {
        google_place_id: d.id,
        name: d.displayName?.text ?? p.text,
        lat: d.location?.latitude ?? 0,
        lng: d.location?.longitude ?? 0,
        address: d.shortFormattedAddress ?? p.secondary,
        maps_url: d.googleMapsUri ?? null,
      };
      setQuery('');
      setPreds([]);
      sessionRef.current = genId();
      onChange(picked);
    } catch (e: unknown) {
      setError('Could not load place details.');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setQuery('');
    setPreds([]);
    onChange(null);
  }

  if (value) {
    return (
      <View style={styles.selected}>
        <Feather name="map-pin" size={16} color={COLORS.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedName} numberOfLines={1}>{value.name}</Text>
          {value.address && <Text style={styles.selectedAddr} numberOfLines={1}>{value.address}</Text>}
        </View>
        <TouchableOpacity onPress={clear} hitSlop={10}>
          <Feather name="x" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Feather name="search" size={16} color={COLORS.textSecondary} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textFaint}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {loading && <ActivityIndicator size="small" color={COLORS.primary} />}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {preds.length > 0 && (
        <View style={styles.predList}>
          {preds.map((p) => (
            <TouchableOpacity key={p.placeId} style={styles.predRow} onPress={() => selectPrediction(p)} activeOpacity={0.7}>
              <Feather name="map-pin" size={14} color={COLORS.textFaint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.predMain} numberOfLines={1}>{p.text}</Text>
                {p.secondary && <Text style={styles.predSub} numberOfLines={1}>{p.secondary}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    includeFontPadding: false,
    padding: 0,
  },
  error: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.error, includeFontPadding: false },
  predList: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  predMain: { fontSize: FONT_SIZE.md, fontFamily: FONTS.semibold, color: COLORS.text, includeFontPadding: false },
  predSub:  { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular,  color: COLORS.textSecondary, includeFontPadding: false },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedName: { fontSize: FONT_SIZE.md, fontFamily: FONTS.bold, color: COLORS.text, includeFontPadding: false },
  selectedAddr: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.regular, color: COLORS.textSecondary, includeFontPadding: false },
});
