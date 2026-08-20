import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, shadow } from '@/lib/theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'red' | 'amber' | 'gold' | 'grey' }) {
  const map = {
    blue: [colors.blueSoft, colors.blue],
    green: [colors.greenSoft, colors.green],
    red: [colors.redSoft, colors.red],
    amber: [colors.amberSoft, colors.amber],
    gold: [colors.goldSoft, colors.gold],
    grey: [colors.surfaceMuted, colors.muted],
  } as const;
  const [backgroundColor, color] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function ActionButton({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.buttonText, secondary && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    ...shadow,
  },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  metric: { flex: 1, minWidth: 70 },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  metricValue: { color: colors.text, fontSize: 19, fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { color: colors.blue, textTransform: 'uppercase', fontWeight: '800', fontSize: 11, letterSpacing: 1.2, marginBottom: 4 },
  sectionTitle: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  button: { backgroundColor: colors.text, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center' },
  buttonSecondary: { backgroundColor: colors.surfaceMuted },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
