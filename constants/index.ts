export const COLORS = {
  primary: '#5B4FE9',
  primaryLight: '#EAE8FD',
  surface: '#FFFFFF',
  background: '#F5F5F7',
  text: '#1A1A1A',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  arriving: '#10B981',
  enRoute: '#5B4FE9',
  notSharing: '#9CA3AF',
  onTheWay: '#F59E0B',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  display: 36,
} as const;

export const LOCATION_UPDATE_INTERVAL_MS = 90_000;
export const LOCATION_DISTANCE_THRESHOLD_M = 150;
export const DEFAULT_SHARE_SESSION_HOURS = 6;
export const AUTO_SELECT_THRESHOLD = 0.6;
