import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Pill, SectionTitle } from '@/components/ui';
import { releases } from '@/data/releases';
import { buildGoldPrediction } from '@/lib/prediction';
import { colors } from '@/lib/theme';

const prediction = buildGoldPrediction(releases);

function signalColor(signal: number) {
  if (signal > 0.15) return colors.green;
  if (signal < -0.15) return colors.red;
  return colors.muted;
}

export default function PredictionsScreen() {
  const bearish = prediction.bias === 'BEARISH XAUUSD';
  const bullish = prediction.bias === 'BULLISH XAUUSD';
  const biasColor = bearish ? colors.red : bullish ? colors.green : colors.amber;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <SectionTitle eyebrow="Gold model" title="XAUUSD evidence guide" right={<View style={styles.goldIcon}><Text style={{ fontSize: 22 }}>◈</Text></View>} />
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Directional bias</Text>
              <Text style={[styles.bias, { color: biasColor }]}>{prediction.bias}</Text>
              <Text style={styles.heroSub}>{prediction.horizon}</Text>
            </View>
            <View style={[styles.strengthCircle, { borderColor: biasColor }]}>
              <Text style={[styles.strengthNumber, { color: biasColor }]}>{prediction.evidenceStrength}</Text>
              <Text style={styles.strengthLabel}>/ 100</Text>
            </View>
          </View>
          <View style={styles.factStrip}><Ionicons name="shield-checkmark-outline" size={17} color={colors.blue} /><Text style={styles.factText}>Evidence strength — not a win-probability claim</Text></View>
        </Card>

        <Card style={styles.guideCard}>
          <View style={styles.guideTitleRow}><Text style={styles.cardTitle}>Price framework</Text><Pill label="ROUGH GUIDE" tone="gold" /></View>
          <Text style={styles.guideNote}>Sample reference price until a live XAUUSD market feed is connected.</Text>
          <View style={styles.levelRow}><Text style={styles.levelLabel}>Reference</Text><Text style={styles.levelValue}>{prediction.guide.reference.toFixed(0)}</Text></View>
          <View style={styles.levelRow}><Text style={styles.levelLabel}>Watch zone</Text><Text style={styles.levelValue}>{prediction.guide.watchZone}</Text></View>
          <View style={styles.levelRow}><Text style={styles.levelLabel}>Invalidation</Text><Text style={styles.levelValue}>{prediction.guide.invalidation}</Text></View>
          <View style={styles.targets}>
            <View><Text style={styles.levelLabel}>T1</Text><Text style={styles.target}>{prediction.guide.target1}</Text></View>
            <View><Text style={styles.levelLabel}>T2</Text><Text style={styles.target}>{prediction.guide.target2}</Text></View>
            <View><Text style={styles.levelLabel}>T3</Text><Text style={styles.target}>{prediction.guide.target3}</Text></View>
          </View>
        </Card>

        <SectionTitle eyebrow="Transparent scoring" title="What is driving the view?" />
        <Card style={{ gap: 14 }}>
          {prediction.drivers.map((driver) => (
            <View key={driver.label} style={styles.driverRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.driverTop}><Text style={styles.driverLabel}>{driver.label}</Text><Text style={[styles.driverSignal, { color: signalColor(driver.goldSignal) }]}>{driver.goldSignal > 0.15 ? 'Gold +' : driver.goldSignal < -0.15 ? 'Gold −' : 'Neutral'}</Text></View>
                <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(driver.weight, 40) / 40 * 100}%` as `${number}%`, backgroundColor: signalColor(driver.goldSignal) }]} /></View>
                <Text style={styles.driverDetail}>{driver.detail}</Text>
              </View>
              <Text style={styles.weight}>{driver.weight}%</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.whyCard}>
          <Text style={styles.cardTitle}>Why this bias</Text>
          {prediction.rationale.map((item, i) => <View key={item} style={styles.reason}><View style={styles.reasonNumber}><Text style={styles.reasonNumberText}>{i + 1}</Text></View><Text style={styles.reasonText}>{item}</Text></View>)}
        </Card>

        <Card style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Prediction rules</Text>
          <Text style={styles.rule}>✓ Interest-rate decisions and FOMC tone have the highest macro weighting.</Text>
          <Text style={styles.rule}>✓ Uses released data versus consensus, not pre-release guessing.</Text>
          <Text style={styles.rule}>✓ Checks DXY, nominal yields and real yields before strengthening a gold bias.</Text>
          <Text style={styles.rule}>✓ Mixed evidence produces a neutral/mixed signal rather than forcing a trade.</Text>
        </Card>

        <Text style={styles.disclaimer}>This is a research and decision-support guideline, not financial advice or a guarantee. The live version should use verified calendar data plus real-time DXY/yield/XAUUSD market data.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 36, gap: 14 },
  goldIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft },
  hero: { borderColor: '#EDD7A0', backgroundColor: '#FFFEF9', gap: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  bias: { fontSize: 24, fontWeight: '900', marginTop: 5, letterSpacing: -0.5 },
  heroSub: { color: colors.muted, fontSize: 11, marginTop: 5 },
  strengthCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  strengthNumber: { fontSize: 23, fontWeight: '900' },
  strengthLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  factStrip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.blueSoft, padding: 10, borderRadius: 12 },
  factText: { color: colors.blue, fontSize: 11, fontWeight: '800' },
  guideCard: { gap: 10 },
  guideTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  guideNote: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 },
  levelLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  levelValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  targets: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surfaceMuted, padding: 12, borderRadius: 14 },
  target: { color: colors.green, fontWeight: '900', fontSize: 16, marginTop: 3 },
  driverRow: { flexDirection: 'row', gap: 12 },
  driverTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  driverLabel: { color: colors.text, fontWeight: '800', fontSize: 13, flex: 1 },
  driverSignal: { fontSize: 11, fontWeight: '900' },
  track: { height: 6, backgroundColor: colors.surfaceMuted, borderRadius: 99, marginTop: 7, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 99 },
  driverDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  weight: { color: colors.text, fontWeight: '900', width: 34, textAlign: 'right' },
  whyCard: { gap: 12 },
  reason: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reasonNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  reasonNumberText: { color: colors.gold, fontWeight: '900', fontSize: 11 },
  reasonText: { color: colors.text, fontSize: 12, lineHeight: 18, flex: 1 },
  rulesCard: { backgroundColor: colors.blueSoft, borderColor: '#C9D9FF', gap: 8 },
  rulesTitle: { color: colors.blue, fontWeight: '900', fontSize: 15 },
  rule: { color: colors.text, fontSize: 12, lineHeight: 18 },
  disclaimer: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 },
});
