// ─── Brand ───────────────────────────────────────────────────────────────────
export const COLORS = {
  primary:       '#5B4FE9',
  primaryPressed:'#4A3ED1',
  primaryLight:  '#EAE8FD',
  primaryFaint:  '#F4F2FE',

  surface:       '#FFFFFF',
  background:    '#F6F5F8',

  text:          '#17171C',
  textSecondary: '#6E6E7A',
  textFaint:     '#A9A8B3',

  border:        '#E8E7EE',

  success:       '#10B981',
  successTint:   '#E6F7F0',
  successDeep:   '#0B8A60',

  warning:       '#F59E0B',
  warningTint:   '#FDF1DC',
  warningDeep:   '#B26E05',

  error:         '#EF4444',
  errorTint:     '#FDE8E8',

  // legacy aliases (some old screens still reference these; remove after full migration)
  arriving:      '#10B981',
  enRoute:       '#5B4FE9',
  notSharing:    '#A9A8B3',
  onTheWay:      '#F59E0B',
} as const;

// Per-vibe tinted accent colors (oklch approximations as hex)
export const VIBE_COLORS: Record<string, { bg: string; fg: string; bd: string }> = {
  Food:   { bg: '#FBEFE3', fg: '#8A5A1E', bd: '#EDD9BD' },
  Drinks: { bg: '#F0EDFC', fg: '#5347B8', bd: '#D8D2F3' },
  Party:  { bg: '#FBECF3', fg: '#94346B', bd: '#F0D3E2' },
  Movie:  { bg: '#ECF0FC', fg: '#3D55B0', bd: '#D3DCF4' },
  Coffee: { bg: '#F7F0DF', fg: '#75601B', bd: '#E6DBB8' },
  Gaming: { bg: '#E7F4E9', fg: '#2A7042', bd: '#C8E5CE' },
  Active: { bg: '#E6F2F7', fg: '#1F6680', bd: '#C5E0EB' },
};

// Avatar palette — cycle by member index
export const AVATAR_COLORS = [
  '#6A5CE8', '#1E9E7E', '#C98A2A', '#D84F8F', '#4E7FB8', '#8E5BC4',
] as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

// ─── Border radii ─────────────────────────────────────────────────────────────
export const RADIUS = {
  card:   20,
  button: 16,
  input:  14,
  chip:   999,
  photo:  24,
  pill:   999,
} as const;

// ─── Typography (Outfit) ──────────────────────────────────────────────────────
export const FONT_SIZE = {
  xs:      11,
  sm:      13,
  md:      15,
  lg:      17,
  xl:      20,
  xxl:     28,
  display: 32,
} as const;

// Font family names loaded via @expo-google-fonts/outfit
export const FONTS = {
  regular:   'Outfit_400Regular',
  medium:    'Outfit_500Medium',
  semibold:  'Outfit_600SemiBold',
  bold:      'Outfit_700Bold',
  extrabold: 'Outfit_800ExtraBold',
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────
export const SHADOWS = {
  card: {
    shadowColor: '#17171C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: '#17171C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
  button: {
    shadowColor: '#5B4FE9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

// ─── Non-UI constants (unchanged) ─────────────────────────────────────────────
export const LOCATION_UPDATE_INTERVAL_MS    = 90_000;
export const LOCATION_DISTANCE_THRESHOLD_M  = 150;
export const DEFAULT_SHARE_SESSION_HOURS    = 6;
export const AUTO_SELECT_THRESHOLD          = 0.6;
