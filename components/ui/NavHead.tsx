import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONTS, FONT_SIZE, SPACING } from '@/constants';

type Props = {
  title?: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: React.ReactNode;
};

export function NavHead({ title, onBack, onClose, right }: Props) {
  const hasLeft = onBack || onClose;

  return (
    <View style={styles.row}>
      {hasLeft ? (
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={onBack ?? onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather
            name={onClose ? 'x' : 'chevron-left'}
            size={onClose ? 18 : 20}
            color={COLORS.text}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.circlePlaceholder} />
      )}

      {title ? (
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {right ? (
        <View style={styles.rightSlot}>{right}</View>
      ) : (
        <View style={styles.circlePlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 44,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  circlePlaceholder: {
    width: 38,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZE.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  rightSlot: {
    flexShrink: 0,
  },
});
