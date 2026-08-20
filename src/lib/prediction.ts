import { MacroRelease } from '@/data/releases';

export type EvidenceDriver = {
  label: string;
  weight: number;
  goldSignal: number;
  detail: string;
};

export type GoldPrediction = {
  bias: 'BULLISH XAUUSD' | 'BEARISH XAUUSD' | 'NEUTRAL / MIXED';
  score: number;
  evidenceStrength: number;
  horizon: string;
  drivers: EvidenceDriver[];
  rationale: string[];
  guide: {
    reference: number;
    watchZone: string;
    invalidation: string;
    target1: string;
    target2: string;
    target3: string;
  };
};

const CATEGORY_WEIGHT: Record<MacroRelease['category'], number> = {
  rates: 40,
  inflation: 25,
  labour: 15,
  growth: 10,
  activity: 7,
  other: 3,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function releaseUsdSignal(release: MacroRelease): number {
  if (release.polarity === 'tone') return clamp(release.tone ?? 0, -1, 1);
  if (release.actualValue == null || release.consensusValue == null) return 0;

  const denominator = Math.max(Math.abs(release.consensusValue), 0.1);
  const rawSurprise = clamp((release.actualValue - release.consensusValue) / denominator * 8, -1, 1);
  return release.polarity === 'higher-usd-positive' ? rawSurprise : -rawSurprise;
}

export function buildGoldPrediction(
  macro: MacroRelease[],
  market = { dxyChangePct: 0.42, us10yChangeBps: 6.8, realYieldChangeBps: 4.2, referenceGold: 3340, atr: 34 },
): GoldPrediction {
  const macroDrivers: EvidenceDriver[] = macro.slice(0, 4).map((release) => {
    const usdSignal = releaseUsdSignal(release);
    const goldSignal = -usdSignal;
    return {
      label: release.title,
      weight: CATEGORY_WEIGHT[release.category],
      goldSignal,
      detail: release.category === 'rates' ? `${release.toneLabel ?? 'Policy'} guidance receives the highest macro weight.` : release.summary,
    };
  });

  const marketDrivers: EvidenceDriver[] = [
    {
      label: 'DXY reaction',
      weight: 10,
      goldSignal: clamp(-market.dxyChangePct / 0.6, -1, 1),
      detail: `${market.dxyChangePct >= 0 ? 'Stronger' : 'Weaker'} USD after the release.`,
    },
    {
      label: 'US 10Y yield reaction',
      weight: 7,
      goldSignal: clamp(-market.us10yChangeBps / 10, -1, 1),
      detail: `${market.us10yChangeBps >= 0 ? 'Rising' : 'Falling'} nominal yields after the release.`,
    },
    {
      label: 'Real-yield reaction',
      weight: 8,
      goldSignal: clamp(-market.realYieldChangeBps / 8, -1, 1),
      detail: `${market.realYieldChangeBps >= 0 ? 'Rising' : 'Falling'} real yields; real yields are a major gold driver.`,
    },
  ];

  const drivers = [...macroDrivers, ...marketDrivers];
  const totalWeight = drivers.reduce((sum, d) => sum + d.weight, 0);
  const weightedScore = drivers.reduce((sum, d) => sum + d.goldSignal * d.weight, 0) / totalWeight;
  const score = Math.round(weightedScore * 100);

  const directionalDrivers = drivers.filter((d) => Math.abs(d.goldSignal) > 0.12);
  const direction = Math.sign(weightedScore);
  const agreement = directionalDrivers.length
    ? directionalDrivers.filter((d) => Math.sign(d.goldSignal) === direction).reduce((s, d) => s + d.weight, 0) /
      directionalDrivers.reduce((s, d) => s + d.weight, 0)
    : 0;
  const coverage = Math.min(1, totalWeight / 100);
  const evidenceStrength = Math.round(clamp(35 + agreement * 45 + coverage * 20, 0, 95));

  const bias = score >= 18 ? 'BULLISH XAUUSD' : score <= -18 ? 'BEARISH XAUUSD' : 'NEUTRAL / MIXED';
  const ref = market.referenceGold;
  const atr = market.atr;
  const bearish = score < 0;
  const bullish = score > 0;
  const watchLow = ref - atr * 0.18;
  const watchHigh = ref + atr * 0.18;
  const invalidation = bearish ? ref + atr * 0.75 : bullish ? ref - atr * 0.75 : ref + atr;
  const sign = bearish ? -1 : 1;

  const strongest = [...drivers].sort((a, b) => b.weight * Math.abs(b.goldSignal) - a.weight * Math.abs(a.goldSignal)).slice(0, 3);

  return {
    bias,
    score,
    evidenceStrength,
    horizon: 'Next 1–8 hours after a major release',
    drivers,
    rationale: strongest.map((d) => d.detail),
    guide: {
      reference: ref,
      watchZone: `${watchLow.toFixed(0)} – ${watchHigh.toFixed(0)}`,
      invalidation: invalidation.toFixed(0),
      target1: (ref + sign * atr * 0.8).toFixed(0),
      target2: (ref + sign * atr * 1.35).toFixed(0),
      target3: (ref + sign * atr * 2).toFixed(0),
    },
  };
}
