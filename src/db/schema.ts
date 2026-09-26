import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

/** Rows that existed before multi-user belong to this placeholder until the admin claims them. */
export const LEGACY_OWNER = "__owner__";

/** One row per Clerk user. */
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email"),
  name: text("name"),
  /** User-provided OpenAI key, AES-256-GCM encrypted (iv:tag:ciphertext, base64). Never sent to the client. */
  openaiKeyEnc: text("openai_key_enc"),
  openaiKeyLast4: text("openai_key_last4"),
  aiMonthlyCapUsd: doublePrecision("ai_monthly_cap_usd").notNull().default(5),
  privacyAckAt: timestamp("privacy_ack_at", { withTimezone: true }),
  /** Self-reported real exam result, with the app's prediction at report time. */
  examResult: jsonb("exam_result").$type<{
    date: string;
    passed: boolean;
    score: number | null;
    predictedPassProbability: number | null;
    reportedAt: string;
  } | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per (user, concept). The concept (not the question) is the scheduled unit:
 * every review draws a different question of the same concept.
 */
export const conceptState = pgTable(
  "concept_state",
  {
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    conceptId: text("concept_id").notNull(),
    /** unseen → learning (initial session) → reviewing → graduated */
    phase: text("phase", {
      enum: ["unseen", "learning", "reviewing", "graduated"],
    })
      .notNull()
      .default("unseen"),
    /** Diagnostic / pretest result, used only for prioritisation. */
    pretest: text("pretest", { enum: ["none", "wrong", "right", "right-sure"] })
      .notNull()
      .default("none"),
    /** Unaided correct answers during the initial learning session (target 3). */
    initialStreak: integer("initial_streak").notNull().default(0),
    /** Unaided correct recalls on distinct later days (target 3 → graduated). */
    spacedSuccesses: integer("spaced_successes").notNull().default(0),
    lastSpacedSuccessDay: date("last_spaced_success_day"),
    /** Serialized ts-fsrs Card (dates as ISO strings). Null until initial learning completes. */
    fsrs: jsonb("fsrs").$type<Record<string, unknown> | null>(),
    due: timestamp("due", { withTimezone: true }),
    lastQuestionId: text("last_question_id"),
    introducedAt: timestamp("introduced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.conceptId] })],
);

export const attempts = pgTable(
  "attempts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    questionId: text("question_id").notNull(),
    conceptId: text("concept_id").notNull(),
    domain: text("domain").notNull(),
    mode: text("mode", {
      enum: ["diagnostic", "pretest", "learn", "relearn", "review", "interleave", "mock", "voice"],
    }).notNull(),
    mockId: integer("mock_id"),
    selected: jsonb("selected").$type<string[]>().notNull(),
    correct: boolean("correct").notNull(),
    /** 1 = guessing, 2 = fairly sure, 3 = certain */
    confidence: integer("confidence").notNull(),
    /** Highest tutor hint level used before submitting a retry (0 = none). */
    hintLevel: integer("hint_level").notNull().default(0),
    aided: boolean("aided").notNull().default(false),
    usedSpanish: boolean("used_spanish").notNull().default(false),
    timeMs: integer("time_ms"),
    /** First time this user ever saw the question (a "fresh" item, fair for readiness). */
    fresh: boolean("fresh").notNull().default(false),
    /** Days since the concept was last practised when this attempt happened. */
    gapDays: doublePrecision("gap_days"),
    selfExplanation: text("self_explanation"),
    explanationScore: integer("explanation_score"),
    explanationFeedback: text("explanation_feedback"),
    errorCategory: text("error_category", {
      enum: ["knowledge-gap", "misread-keyword", "service-confusion", "overconfidence"],
    }),
    transcript: text("transcript"),
    /** Game XP earned by this answer (see lib/game/xp.ts). */
    xp: integer("xp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attempts_user_concept_idx").on(t.userId, t.conceptId),
    index("attempts_user_question_idx").on(t.userId, t.questionId),
    index("attempts_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const mocks = pgTable(
  "mocks",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    kind: text("kind", { enum: ["mini", "full", "external"] }).notNull(),
    questionIds: jsonb("question_ids").$type<string[]>().notNull(),
    durationMin: integer("duration_min").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    scorePct: doublePrecision("score_pct"),
    perDomain: jsonb("per_domain").$type<Record<string, { correct: number; total: number }>>(),
    /** For external mocks (Skill Builder / Tutorials Dojo) entered by hand. */
    source: text("source"),
  },
  (t) => [index("mocks_user_idx").on(t.userId)],
);

export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    attemptId: integer("attempt_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    level: integer("level").notNull().default(0),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tutor_attempt_idx").on(t.attemptId)],
);

export const questionReports = pgTable("question_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(LEGACY_OWNER),
  questionId: text("question_id").notNull(),
  note: text("note").notNull(),
  status: text("status", { enum: ["open", "fixed", "dismissed"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Hidden questions. userId = "*" hides it for everyone (admin decision);
 * otherwise only for the user who reported it.
 */
export const disabledQuestions = pgTable(
  "disabled_questions",
  {
    userId: text("user_id").notNull().default("*"),
    questionId: text("question_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] })],
);

export const studyDays = pgTable(
  "study_days",
  {
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    day: date("day").notNull(),
    minutes: doublePrecision("minutes").notNull().default(0),
    items: integer("items").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    /** "system" = shared content paid with the server key. */
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    audioSeconds: doublePrecision("audio_seconds").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt)],
);

/** Shared across users: content audio is generated once. */
export const audioCache = pgTable("audio_cache", {
  key: text("key").primaryKey(),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_endpoint_idx").on(t.endpoint)],
);

export const labProgress = pgTable(
  "lab_progress",
  {
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    labId: text("lab_id").notNull(),
    doneSteps: jsonb("done_steps").$type<string[]>().notNull().default([]),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cleanedUpAt: timestamp("cleaned_up_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.labId] })],
);

/** Per-user key/value settings (session queue, study settings, reminder bookkeeping). */
export const settings = pgTable(
  "settings",
  {
    userId: text("user_id").notNull().default(LEGACY_OWNER),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind", { enum: ["idea", "bug", "content", "other"] }).notNull(),
  message: text("message").notNull(),
  page: text("page"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
