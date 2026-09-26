export class RateLimitError extends Error {
  constructor() {
    super("Demasiadas solicitudes seguidas; espera unos segundos.");
  }
}

const LIMITS = {
  ai: { max: 30, windowMs: 60_000 }, // tutor, grading, voice
  write: { max: 120, windowMs: 60_000 }, // answers, progress
  audio: { max: 60, windowMs: 60_000 }, // shared TTS fetches
} as const;

const hits = new Map<string, number[]>();

/** Sliding-window limit per user and bucket (single instance, in memory). */
export function rateLimit(userId: string, bucket: keyof typeof LIMITS) {
  const { max, windowMs } = LIMITS[bucket];
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new RateLimitError();
  recent.push(now);
  hits.set(key, recent);
}
