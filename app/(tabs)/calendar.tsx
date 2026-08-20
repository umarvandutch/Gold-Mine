import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Pill, SectionTitle } from '@/components/ui';
import { upcoming } from '@/data/releases';
import { colors } from '@/lib/theme';

export default function CalendarScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <SectionTitle eyebrow="US calendar" title="Upcoming market events" right={<View style={styles.iconBox}><Ionicons name="calendar-outline" size={20} color={colors.blue} /></View>} />
        <Card style={styles.rateNotice}>
          <View style={styles.noticeTitle}><Ionicons name="radio" size={18} color={colors.red} /><Text style={styles.noticeHeading}>Rates are priority events</Text></View>
          <Text style={styles.noticeText}>Fed decisions, FOMC statements, dot plots, minutes and Chair speeches are elevated because they can quickly reprice yields, the USD and gold.</Text>
        </Card>
        {upcoming.map((event) => (
          <Card key={event.title} style={styles.eventCard}>
            <View style={styles.eventTop}>
              <View style={styles.dateBox}><Text style={styles.dateText}>US</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>{event.time} · {event.category}</Text>
              </View>
              <Pill label={event.impact.toUpperCase()} tone={event.impact === 'critical' ? 'red' : event.impact === 'high' ? 'amber' : 'blue'} />
            </View>
          </Card>
        ))}
        <Text style={styles.footnote}>When the live API is connected, this tab will read directly from the US economic calendar and update automatically.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 34, gap: 14 },
  iconBox: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  rateNotice: { backgroundColor: '#FFF9F9', borderColor: '#F2CACA', gap: 8 },
  noticeTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeHeading: { color: colors.text, fontWeight: '900', fontSize: 15 },
  noticeText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  eventCard: { padding: 14 },
  eventTop: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  dateBox: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  dateText: { color: colors.blue, fontWeight: '900' },
  eventTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  eventMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 14 },
});
