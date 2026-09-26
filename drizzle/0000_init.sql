CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"audio_seconds" double precision DEFAULT 0 NOT NULL,
	"cost_usd" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"domain" text NOT NULL,
	"mode" text NOT NULL,
	"mock_id" integer,
	"selected" jsonb NOT NULL,
	"correct" boolean NOT NULL,
	"confidence" integer NOT NULL,
	"hint_level" integer DEFAULT 0 NOT NULL,
	"aided" boolean DEFAULT false NOT NULL,
	"used_spanish" boolean DEFAULT false NOT NULL,
	"time_ms" integer,
	"fresh" boolean DEFAULT false NOT NULL,
	"gap_days" double precision,
	"self_explanation" text,
	"explanation_score" integer,
	"explanation_feedback" text,
	"error_category" text,
	"transcript" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_state" (
	"concept_id" text PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'unseen' NOT NULL,
	"pretest" text DEFAULT 'none' NOT NULL,
	"initial_streak" integer DEFAULT 0 NOT NULL,
	"spaced_successes" integer DEFAULT 0 NOT NULL,
	"last_spaced_success_day" date,
	"fsrs" jsonb,
	"due" timestamp with time zone,
	"last_question_id" text,
	"introduced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disabled_questions" (
	"question_id" text PRIMARY KEY NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_progress" (
	"lab_id" text PRIMARY KEY NOT NULL,
	"done_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"cleaned_up_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"question_ids" jsonb NOT NULL,
	"duration_min" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"score_pct" double precision,
	"per_domain" jsonb,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"note" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_days" (
	"day" date PRIMARY KEY NOT NULL,
	"minutes" double precision DEFAULT 0 NOT NULL,
	"items" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" integer NOT NULL,
	"role" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "attempts_concept_idx" ON "attempts" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "attempts_question_idx" ON "attempts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "attempts_created_idx" ON "attempts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "tutor_attempt_idx" ON "tutor_messages" USING btree ("attempt_id");