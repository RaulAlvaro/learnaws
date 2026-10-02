/**
 * In-person events: a short timed quiz (random lightning questions) with a public leaderboard.
 * Events live in code; add one here to run it. Times carry an explicit Lima offset.
 */
export interface GameEvent {
  slug: string;
  name: string;
  shortName: string;
  venue: string;
  city: string;
  dateLabel: string;
  /** When playing opens and closes (players can still view the leaderboard afterwards). */
  startsAt: string;
  endsAt: string;
  questionCount: number;
  secondsPerQuestion: number;
}

export const EVENTS: GameEvent[] = [
  {
    slug: "aws-community-day-lima-2026",
    name: "AWS Community Day Lima 2026",
    shortName: "AWS Community Day",
    venue: "UTEC",
    city: "Lima, Perú",
    dateLabel: "Sábado 3 de octubre",
    startsAt: "2026-10-03T00:00:00-05:00",
    endsAt: "2026-10-04T06:00:00-05:00",
    questionCount: 5,
    secondsPerQuestion: 20,
  },
];

export type EventStatus = "upcoming" | "live" | "ended";

/** Local testing can pretend it is event day with EVENT_FAKE_NOW (ignored in production). */
const clock = () =>
  process.env.NODE_ENV !== "production" && process.env.EVENT_FAKE_NOW ? new Date(process.env.EVENT_FAKE_NOW) : new Date();

export function eventStatus(e: GameEvent, now = clock()): EventStatus {
  if (now < new Date(e.startsAt)) return "upcoming";
  if (now > new Date(e.endsAt)) return "ended";
  return "live";
}

export const getEvent = (slug: string) => EVENTS.find((e) => e.slug === slug) ?? null;
export const liveEvent = (now = clock()) => EVENTS.find((e) => eventStatus(e, now) === "live") ?? null;

/** Kahoot-style: a right answer is worth 500–1000 points, more the faster it comes. */
export function pointsFor(correct: boolean, elapsedMs: number, seconds: number): number {
  if (!correct) return 0;
  const t = Math.min(Math.max(elapsedMs, 0), seconds * 1000) / (seconds * 1000);
  return Math.round(1000 * (1 - t / 2));
}
