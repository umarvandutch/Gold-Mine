import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Metric, Pill, SectionTitle } from '@/components/ui';
import { MacroRelease } from '@/data/releases';
import { getLatestUSReleases } from '@/lib/fxstreet';
import { colors } from '@/lib/theme';

function impactTone(impact: MacroRelease['impact']) {
  if (impact === 'critical') return 'red' as const;
  if (impact === 'high') return 'amber' as const;
  return 'blue' as const;
}

function usdDirection(release: MacroRelease) {
  if (release.category === 'rates') return release.tone && release.tone > 0 ? 'USD supportive' : 'USD softer';
  if (release.actualValue == null || release.consensusValue == null) return 'Mixed';
  const higher = release.actualValue > release.consensusValue;
  const usdPositive = release.polarity === 'higher-usd-positive' ? higher : !higher;
  return usdPositive ? 'USD supportive' : 'USD negative';
}

export default function AlertsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'high'>('all');
  const [items, setItems] = useState<MacroRelease[]>([]);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const response = await getLatestUSReleases();
    setItems(response.data);
    setMode(response.mode);
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => filter === 'high' ? items.filter((i) => i.impact === 'critical' || i.impact === 'high') : items, [items, filter]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>GM</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>Gold Mine</Text>
            <Text style={styles.subtitle}>US macro intelligence for XAUUSD</Text>
          </View>
          <View style={styles.bell}><Ionicons name="notifications-outline" size={22} color={colors.text} /></View>
        </View>

        <View style={styles.statusRow}>
          <Pill label={mode === 'live' ? 'LIVE FEED' : 'DEMO DATA'} tone={mode === 'live' ? 'green' : 'grey'} />
          <Text style={styles.statusText}>US only · rates prioritised</Text>
        </View>

        <SectionTitle eyebrow="Macro feed" title="What moved the dollar?" />

        <View style={styles.segment}>
          <Pressable onPress={() => setFilter('all')} style={[styles.segmentButton, filter === 'all' && styles.segmentSelected]}><Text style={[styles.segmentText, filter === 'all' && styles.segmentSelectedText]}>All US news</Text></Pressable>
          <Pressable onPress={() => setFilter('high')} style={[styles.segmentButton, filter === 'high' && styles.segmentSelected]}><Text style={[styles.segmentText, filter === 'high' && styles.segmentSelectedText]}>High impact</Text></Pressable>
        </View>

        {visible.map((release, index) => (
          <Pressable key={release.id} onPress={() => router.push({ pathname: '/release/[id]', params: { id: release.id } })}>
            <Card style={[styles.releaseCard, release.category === 'rates' && styles.rateCard]}>
              <View style={styles.releaseHeader}>
                <View style={styles.flag}><Text style={{ fontSize: 21 }}>🇺🇸</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleInline}>
                    <Text style={styles.releaseTitle}>{release.title}</Text>
                    {index === 0 && release.category === 'rates' ? <Ionicons name="pin" size={14} color={colors.red} /> : null}
                  </View>
                  <Text style={styles.releaseTime}>{release.dateLabel} · {release.timeLabel}</Text>
                </View>
                <Pill label={release.impact.toUpperCase()} tone={impactTone(release.impact)} />
              </View>

              {release.category === 'rates' ? <View style={styles.importantStrip}><Ionicons name="flash" size={15} color={colors.red} /><Text style={styles.importantText}>Interest-rate news receives the highest XAUUSD model weight</Text></View> : null}

              <View style={styles.metricsRow}>
                <Metric label="Actual" value={release.actual} accent={release.category === 'rates' ? colors.red : undefined} />
                <Metric label="Consensus" value={release.consensus} />
                <Metric label="Previous" value={release.previous} />
              </View>

              {release.toneLabel ? <View style={styles.toneRow}><Text style={styles.toneLabel}>Policy tone</Text><Pill label={release.toneLabel.toUpperCase()} tone="red" /></View> : null}
              <Text style={styles.summary}>{release.summary}</Text>
              <View style={styles.impactFooter}>
                <Text style={styles.impactCaption}>{usdDirection(release)}</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 32, gap: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F0D998' },
  logoText: { color: colors.gold, fontWeight: '900', letterSpacing: -1, fontSize: 18 },
  brand: { fontSize: 23, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  bell: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  statusText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  segment: { backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: 4, flexDirection: 'row', marginBottom: 2 },
  segmentButton: { flex: 1, borderRadius: 13, paddingVertical: 11, alignItems: 'center' },
  segmentSelected: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segmentSelectedText: { color: colors.text },
  releaseCard: { gap: 13 },
  rateCard: { borderColor: '#F0B9B9', borderWidth: 1.4 },
  releaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  titleInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  releaseTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  releaseTime: { color: colors.muted, fontSize: 11, marginTop: 3 },
  importantStrip: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: colors.redSoft, borderRadius: 12, padding: 10 },
  importantText: { color: colors.red, fontSize: 11, fontWeight: '800', flex: 1 },
  metricsRow: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 12 },
  toneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toneLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  summary: { color: colors.text, fontSize: 13, lineHeight: 19 },
  impactFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  impactCaption: { color: colors.blue, fontWeight: '800', fontSize: 12 },
});
