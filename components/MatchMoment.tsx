import { useRef, useEffect } from 'react';
import { Modal, View, Text, Image, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADIUS, SHADOWS } from '@/constants';
import { AvatarRow } from '@/components/ui';

type Props = {
  visible: boolean;
  venueName: string;
  venuePhoto?: string | null;
  likedCount: number;
  totalCount: number;
  isHost: boolean;
  onLockIn: () => void;
  onKeepSwiping: () => void;
};

const CONFETTI = [
  { x: 30,  y: 110, s: 10, r: 20,  c: '#fff',     o: 0.9 },
  { x: 330, y: 90,  s: 8,  r: -15, c: '#C9F2E2',  o: 0.9 },
  { x: 70,  y: 190, s: 7,  r: 45,  c: '#FBD38D',  o: 0.85 },
  { x: 300, y: 200, s: 12, r: 10,  c: '#fff',     o: 0.5 },
  { x: 180, y: 80,  s: 9,  r: -30, c: '#F6AD55',  o: 0.8 },
  { x: 350, y: 300, s: 7,  r: 0,   c: '#fff',     o: 0.7 },
  { x: 24,  y: 320, s: 9,  r: 60,  c: '#C9F2E2',  o: 0.8 },
  { x: 120, y: 140, s: 6,  r: 0,   c: '#fff',     o: 0.6 },
  { x: 260, y: 130, s: 7,  r: 30,  c: '#EAE8FD',  o: 0.9 },
  { x: 48,  y: 250, s: 11, r: -20, c: '#EAE8FD',  o: 0.6 },
];

export function MatchMoment({
  visible, venueName, venuePhoto, likedCount, totalCount, isHost, onLockIn, onKeepSwiping,
}: Props) {
  const cardScale = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(cardScale, { toValue: 1, damping: 14, stiffness: 180, useNativeDriver: true }).start();
    } else {
      cardScale.setValue(0.82);
    }
  }, [visible]);

  const cardStyle = { transform: [{ scale: cardScale }] };

  const memberNames = Array.from({ length: likedCount }, (_, i) => String.fromCharCode(65 + i));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.bg}>
        {CONFETTI.map((f, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: f.x,
              top: f.y,
              width: f.s,
              height: f.s,
              backgroundColor: f.c,
              opacity: f.o,
              borderRadius: i % 3 === 0 ? f.s / 2 : 3,
              transform: [{ rotate: `${f.r}deg` }],
            }}
          />
        ))}

        <View style={styles.content}>
          <View style={styles.headline}>
            <Text style={styles.headlineText}>It's a match!</Text>
            <Text style={styles.headlineSub}>Everyone liked the same spot</Text>
          </View>

          <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
            {venuePhoto ? (
              <Image source={{ uri: venuePhoto }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Text style={styles.photoPlaceholderText}>{venueName[0]}</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.venueName}>{venueName}</Text>
              <View style={styles.likedRow}>
                <AvatarRow names={memberNames} size={26} />
                <View style={styles.likedPill}>
                  <Text style={styles.likedPillText}>{likedCount}/{totalCount} liked</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          <View style={styles.actions}>
            {isHost ? (
              <TouchableOpacity style={styles.lockBtn} onPress={onLockIn} activeOpacity={0.85}>
                <Text style={styles.lockBtnText}>Lock it in</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.waitingWrap}>
                <Text style={styles.waitingText}>Waiting for the host to lock it in…</Text>
              </View>
            )}
            <TouchableOpacity onPress={onKeepSwiping} activeOpacity={0.7}>
              <Text style={styles.keepSwiping}>Keep swiping</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  content: {
    width: '100%',
    gap: SPACING.xl,
    alignItems: 'center',
  },
  headline: { alignItems: 'center', gap: 6 },
  headlineText: {
    fontSize: 40,
    fontFamily: FONTS.extrabold,
    color: '#fff',
    letterSpacing: -0.8,
    transform: [{ rotate: '-2deg' }],
    includeFontPadding: false,
  },
  headlineSub: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.78)',
    includeFontPadding: false,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    shadowColor: 'rgba(20,16,60)',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 60,
    elevation: 12,
  },
  photo: { width: '100%', height: 160 },
  photoPlaceholder: {
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 56,
    fontFamily: FONTS.extrabold,
    color: COLORS.primary,
    opacity: 0.25,
    includeFontPadding: false,
  },
  cardBody: { padding: 16, gap: SPACING.sm },
  venueName: {
    fontSize: 22,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    includeFontPadding: false,
  },
  likedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  likedPill: {
    backgroundColor: COLORS.successTint,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  likedPillText: {
    fontSize: 12.5,
    fontFamily: FONTS.bold,
    color: COLORS.successDeep,
    includeFontPadding: false,
  },
  actions: { width: '100%', gap: SPACING.md, alignItems: 'center' },
  lockBtn: {
    width: '100%',
    height: 56,
    borderRadius: RADIUS.button,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(20,16,60)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 8,
  },
  lockBtnText: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    includeFontPadding: false,
  },
  waitingWrap: { padding: SPACING.sm },
  waitingText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.regular,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    includeFontPadding: false,
  },
  keepSwiping: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONTS.medium,
    color: 'rgba(255,255,255,0.75)',
    includeFontPadding: false,
  },
});
