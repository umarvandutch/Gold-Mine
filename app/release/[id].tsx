import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Metric, Pill, SectionTitle } from '@/components/ui';
import { releases } from '@/data/releases';
import { colors } from '@/lib/theme';

export default function ReleaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const release = releases.find((r) => r.id === id) ?? releases[0];
  const isRates = release.category === 'rates';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerLine}>
        <View style={styles.flag}><Text style={{ fontSize: 25 }}>🇺🇸</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.title}>{release.title}</Text><Text style={styles.meta}>{release.dateLabel} · {release.timeLabel}</Text></View>
        <Pill label={release.impact.toUpperCase()} tone={release.impact === 'critical' ? 'red' : 'amber'} />
      </View>

      <Card>
        <View style={styles.metrics}>
          <Metric label="Actual" value={release.actual} accent={isRates ? colors.red : undefined} />
          <Metric label="Consensus" value={release.consensus} />
          <Metric label="Previous" value={release.previous} />
          {release.toneLabel ? <Metric label="Tone" value={release.toneLabel} accent={colors.red} /> : null}
        </View>
      </Card>

      <Card style={styles.explainCard}>
        <View style={styles.explainRow}><View style={[styles.explainIcon, { backgroundColor: colors.blueSoft }]}><Ionicons name="pulse-outline" color={colors.blue} size={20} /></View><View style={{ flex: 1 }}><Text style={[styles.explainTitle, { color: colors.blue }]}>What happened</Text><Text style={styles.explainText}>{release.summary}</Text></View></View>
        <View style={styles.divider} />
        <View style={styles.explainRow}><View style={[styles.explainIcon, { backgroundColor: colors.goldSoft }]}><Ionicons name="business-outline" color={colors.gold} size={20} /></View><View style={{ flex: 1 }}><Text style={[styles.explainTitle, { color: colors.gold }]}>Economic meaning</Text><Text style={styles.explainText}>{release.economy}</Text></View></View>
        <View style={styles.divider} />
        <View style={styles.explainRow}><View style={[styles.explainIcon, { backgroundColor: colors.greenSoft }]}><Ionicons name="cash-outline" color={colors.green} size={20} /></View><View style={{ flex: 1 }}><Text style={[styles.explainTitle, { color: colors.green }]}>USD & XAUUSD impact</Text><Text style={styles.explainText}>{release.usdImpact}</Text></View></View>
      </Card>

      {isRates ? <Card style={styles.priority}><SectionTitle eyebrow="Highest priority" title="Why rates matter most" /><Text style={styles.priorityText}>Gold is highly sensitive to the path of real interest rates. Fed decisions and guidance can move Treasury yields, real yields and the dollar at the same time, so the model does not treat a rate decision like an ordinary calendar release.</Text></Card> : null}

      <Card style={{ gap: 12 }}>
        <Text style={styles.marketTitle}>Market confirmation checklist</Text>
        <View style={styles.check}><Ionicons name="checkmark-circle" color={colors.green} size={19} /><Text style={styles.checkText}>DXY direction after the release</Text></View>
        <View style={styles.check}><Ionicons name="checkmark-circle" color={colors.green} size={19} /><Text style={styles.checkText}>US 10Y nominal yield reaction</Text></View>
        <View style={styles.check}><Ionicons name="checkmark-circle" color={colors.green} size={19} /><Text style={styles.checkText}>10Y TIPS / real-yield reaction</Text></View>
        <View style={styles.check}><Ionicons name="checkmark-circle" color={colors.green} size={19} /><Text style={styles.checkText}>Whether XAUUSD confirms or rejects the macro move</Text></View>
      </Card>

      <Text style={styles.source}>Source: {release.sourceLabel}. This screen is currently demo data until the secure live API is connected.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 40, gap: 14 },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  flag: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  metrics: { flexDirection: 'row', gap: 9 },
  explainCard: { gap: 15 },
  explainRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  explainIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  explainTitle: { fontWeight: '900', fontSize: 14, marginBottom: 5 },
  explainText: { color: colors.text, fontSize: 12, lineHeight: 19 },
  divider: { height: 1, backgroundColor: colors.line },
  priority: { backgroundColor: '#FFFEF8', borderColor: '#EFDEB6', gap: 10 },
  priorityText: { color: colors.text, fontSize: 12, lineHeight: 19 },
  marketTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkText: { color: colors.text, fontSize: 12 },
  source: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 },
});
