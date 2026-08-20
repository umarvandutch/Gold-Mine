export type Impact = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'rates' | 'inflation' | 'labour' | 'growth' | 'activity' | 'other';
export type Polarity = 'higher-usd-positive' | 'higher-usd-negative' | 'tone';

export type MacroRelease = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  impact: Impact;
  category: Category;
  actual: string;
  consensus: string;
  previous: string;
  actualValue?: number;
  consensusValue?: number;
  previousValue?: number;
  polarity: Polarity;
  tone?: number;
  toneLabel?: string;
  summary: string;
  economy: string;
  usdImpact: string;
  sourceLabel: string;
  isDemo?: boolean;
};

export const releases: MacroRelease[] = [
  {
    id: 'fomc-rate-decision',
    title: 'FOMC Rate Decision',
    dateLabel: 'Latest release',
    timeLabel: '2:00 PM ET',
    impact: 'critical',
    category: 'rates',
    actual: '5.50%',
    consensus: '5.50%',
    previous: '5.50%',
    actualValue: 5.5,
    consensusValue: 5.5,
    previousValue: 5.5,
    polarity: 'tone',
    tone: 0.75,
    toneLabel: 'Hawkish',
    summary: 'The headline rate was unchanged, but the statement and policy guidance were more hawkish than markets had expected.',
    economy: 'Higher-for-longer policy keeps borrowing conditions tighter and reduces the probability of near-term rate cuts.',
    usdImpact: 'Hawkish policy guidance normally supports Treasury yields and the USD. That combination is typically a headwind for gold.',
    sourceLabel: 'Demo macro feed',
    isDemo: true,
  },
  {
    id: 'us-cpi-yoy',
    title: 'US CPI y/y',
    dateLabel: 'Latest release',
    timeLabel: '8:30 AM ET',
    impact: 'high',
    category: 'inflation',
    actual: '3.6%',
    consensus: '3.4%',
    previous: '3.3%',
    actualValue: 3.6,
    consensusValue: 3.4,
    previousValue: 3.3,
    polarity: 'higher-usd-positive',
    summary: 'Headline inflation printed above consensus, showing that price pressures were firmer than expected.',
    economy: 'Sticky inflation can delay rate cuts and keep financial conditions tighter for longer.',
    usdImpact: 'A hotter-than-expected inflation print is usually USD-positive through higher rate and yield expectations, which can weigh on XAUUSD.',
    sourceLabel: 'Demo macro feed',
    isDemo: true,
  },
  {
    id: 'non-farm-payrolls',
    title: 'Non-Farm Payrolls',
    dateLabel: 'Latest release',
    timeLabel: '8:30 AM ET',
    impact: 'high',
    category: 'labour',
    actual: '175K',
    consensus: '238K',
    previous: '303K',
    actualValue: 175,
    consensusValue: 238,
    previousValue: 303,
    polarity: 'higher-usd-positive',
    summary: 'Payroll growth missed consensus, signalling softer hiring momentum than markets expected.',
    economy: 'A cooling labour market can reduce wage and inflation pressure and increase the case for easier monetary policy.',
    usdImpact: 'A material payroll miss is normally USD-negative and can be supportive for gold if yields also fall.',
    sourceLabel: 'Demo macro feed',
    isDemo: true,
  },
  {
    id: 'initial-jobless-claims',
    title: 'Initial Jobless Claims',
    dateLabel: 'Latest release',
    timeLabel: '8:30 AM ET',
    impact: 'medium',
    category: 'labour',
    actual: '222K',
    consensus: '230K',
    previous: '231K',
    actualValue: 222,
    consensusValue: 230,
    previousValue: 231,
    polarity: 'higher-usd-negative',
    summary: 'Claims were lower than expected, pointing to a still-resilient labour market.',
    economy: 'Fewer unemployment claims suggest labour demand remains relatively healthy.',
    usdImpact: 'Lower-than-expected claims can modestly support the USD and yields, which can be a mild negative for gold.',
    sourceLabel: 'Demo macro feed',
    isDemo: true,
  },
];

export const upcoming = [
  { title: 'Fed Chair Speech', time: 'Today · 6:00 PM ET', impact: 'critical' as Impact, category: 'Rates' },
  { title: 'US Core PCE Price Index', time: 'Fri · 8:30 AM ET', impact: 'high' as Impact, category: 'Inflation' },
  { title: 'US GDP q/q', time: 'Thu · 8:30 AM ET', impact: 'high' as Impact, category: 'Growth' },
  { title: 'Initial Jobless Claims', time: 'Thu · 8:30 AM ET', impact: 'medium' as Impact, category: 'Labour' },
];
