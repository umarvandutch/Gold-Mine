import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Card, Pill, SectionTitle } from '@/components/ui';
import { colors } from '@/lib/theme';

function Row({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSub}>{subtitle}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: '#D9DEE6', true: '#AFC7FF' }} thumbColor={value ? colors.blue : '#fff'} /></View>;
}

export default function SettingsScreen() {
  const [alerts, setAlerts] = useState(true);
  const [medium, setMedium] = useState(true);
  const [sound, setSound] = useState(true);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <SectionTitle eyebrow="Preferences" title="Settings" />
        <Card style={{ gap: 4 }}>
          <Row title="Release alerts" subtitle="Notify when a US actual figure is published." value={alerts} onChange={setAlerts} />
          <View style={styles.divider} />
          <Row title="Medium-impact news" subtitle="Include smaller US releases in the feed." value={medium} onChange={setMedium} />
          <View style={styles.divider} />
          <Row title="Alert sound" subtitle="Play sound for high/critical releases." value={sound} onChange={setSound} />
        </Card>
        <Card style={styles.connectionCard}>
          <View style={styles.connectionTop}><Text style={styles.connectionTitle}>Data connection</Text><Pill label={process.env.EXPO_PUBLIC_MACRO_API_BASE ? 'API CONFIGURED' : 'DEMO MODE'} tone={process.env.EXPO_PUBLIC_MACRO_API_BASE ? 'green' : 'grey'} /></View>
          <Text style={styles.connectionText}>The mobile app is designed to call a secure backend proxy. FXStreet private credentials must never be stored inside the app bundle.</Text>
        </Card>
        <Card style={styles.priorityCard}>
          <Text style={styles.priorityTitle}>Model priority</Text>
          <Text style={styles.priorityText}>1. FOMC / interest rates / policy guidance</Text>
          <Text style={styles.priorityText}>2. Inflation: CPI, Core CPI, PCE</Text>
          <Text style={styles.priorityText}>3. Labour: NFP, unemployment, claims</Text>
          <Text style={styles.priorityText}>4. DXY, Treasury yields and real yields confirmation</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 34, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  rowSub: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  divider: { height: 1, backgroundColor: colors.line },
  connectionCard: { gap: 10 },
  connectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  connectionTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  connectionText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  priorityCard: { gap: 8, backgroundColor: '#FFFEF8', borderColor: '#EFDEB6' },
  priorityTitle: { color: colors.gold, fontWeight: '900', fontSize: 15 },
  priorityText: { color: colors.text, fontSize: 12, lineHeight: 18 },
});
