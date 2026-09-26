/**
 * Pass-probability estimate. Only "honest" evidence counts: unaided answers to
 * held-out mock questions, or fresh questions on concepts not practised for
 * ≥ 7 days (delayed retention). Practice performance is not learning
 * (Soderstrom & Bjork 2015).
 *
 * Model: per-domain Beta posterior on accuracy, Monte Carlo over 50 scored items
 * split by the official weights. The 720/1000 cut is treated as ~72% correct,
 * which AWS does not publish — so the output is a range, not a promise.
 */
export const PASS_FRACTION = 0.72;
export const SCORED_ITEMS = 50;
export const MIN_EVIDENCE = 30;

export interface Evidence {
  domain: string;
  correct: boolean;
}

export interface DomainEstimate {
  domain: string;
  n: number;
  accuracy: number; // posterior mean
  low: number; // 10th percentile
  high: number; // 90th percentile
}

export interface Readiness {
  enoughData: boolean;
  evidence: number;
  passProbability: number;
  passLow: number;
  passHigh: number;
  expectedScorePct: number;
  domains: DomainEstimate[];
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gammaSample(k: number, rand: () => number): number {
  // Marsaglia–Tsang (k ≥ 1); boost for k < 1.
  if (k < 1) return gammaSample(k + 1, rand) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      const u1 = rand();
      const u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaSample(a: number, b: number, rand: () => number): number {
  const x = gammaSample(a, rand);
  const y = gammaSample(b, rand);
  return x / (x + y);
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function estimateReadiness(
  evidence: Evidence[],
  weights: Record<string, number>,
  sims = 4000,
): Readiness {
  const rand = mulberry32(evidence.length * 7919 + 17);
  const domains = Object.keys(weights);
  // Weak prior centred on 50% (≈ 4 pseudo-answers) so a domain with no data is not assumed ready.
  const post = Object.fromEntries(
    domains.map((d) => {
      const own = evidence.filter((e) => e.domain === d);
      const k = own.filter((e) => e.correct).length;
      return [d, { a: 2 + k, b: 2 + own.length - k, n: own.length }];
    }),
  );

  const itemsPerDomain = Object.fromEntries(
    domains.map((d) => [d, Math.round(weights[d] * SCORED_ITEMS)]),
  );
  const needed = Math.ceil(PASS_FRACTION * SCORED_ITEMS);

  const accSamples: Record<string, number[]> = Object.fromEntries(domains.map((d) => [d, []]));
  const scoreSamples: number[] = [];
  let passes = 0;
  // Pass probability conditional on the "true" accuracy, per posterior draw → gives a range.
  const passByDraw: number[] = [];

  for (let i = 0; i < sims; i++) {
    let total = 0;
    let expected = 0;
    for (const d of domains) {
      const p = betaSample(post[d].a, post[d].b, rand);
      accSamples[d].push(p);
      expected += p * itemsPerDomain[d];
      for (let j = 0; j < itemsPerDomain[d]; j++) if (rand() < p) total++;
    }
    if (total >= needed) passes++;
    scoreSamples.push(expected / SCORED_ITEMS);
    passByDraw.push(normalPass(expected, domains, itemsPerDomain, accSamples, i, needed));
  }

  passByDraw.sort((a, b) => a - b);
  scoreSamples.sort((a, b) => a - b);

  return {
    enoughData: evidence.length >= MIN_EVIDENCE,
    evidence: evidence.length,
    passProbability: passes / sims,
    passLow: quantile(passByDraw, 0.1),
    passHigh: quantile(passByDraw, 0.9),
    expectedScorePct: quantile(scoreSamples, 0.5) * 100,
    domains: domains.map((d) => {
      const s = [...accSamples[d]].sort((a, b) => a - b);
      return {
        domain: d,
        n: post[d].n,
        accuracy: post[d].a / (post[d].a + post[d].b),
        low: quantile(s, 0.1),
        high: quantile(s, 0.9),
      };
    }),
  };
}

/** Normal approximation of P(total ≥ needed) for one draw of domain accuracies. */
function normalPass(
  mean: number,
  domains: string[],
  items: Record<string, number>,
  acc: Record<string, number[]>,
  i: number,
  needed: number,
): number {
  let variance = 0;
  for (const d of domains) {
    const p = acc[d][i];
    variance += items[d] * p * (1 - p);
  }
  const z = (needed - 0.5 - mean) / Math.sqrt(Math.max(variance, 1e-9));
  return 1 - normalCdf(z);
}

function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/**
 * Booking gate: two consecutive held-out mocks ≥ 80%, no domain < 70% in them,
 * confirmed by an external mock ≥ 80%.
 */
export interface MockSummary {
  kind: "mini" | "full" | "external";
  scorePct: number;
  perDomain: Record<string, { correct: number; total: number }> | null;
  finishedAt: Date;
}

export function bookingGate(mocks: MockSummary[]) {
  const internal = mocks
    .filter((m) => m.kind === "full")
    .sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())
    .slice(0, 2);
  const external = mocks.filter((m) => m.kind === "external").sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())[0];
  const twoFullOver80 = internal.length === 2 && internal.every((m) => m.scorePct >= 80);
  const noWeakDomain =
    internal.length === 2 &&
    internal.every((m) =>
      Object.values(m.perDomain ?? {}).every((d) => d.total === 0 || d.correct / d.total >= 0.7),
    );
  const externalOk = !!external && external.scorePct >= 80;
  return { twoFullOver80, noWeakDomain, externalOk, ready: twoFullOver80 && noWeakDomain && externalOk };
}
