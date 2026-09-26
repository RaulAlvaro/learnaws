CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"page" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"openai_key_enc" text,
	"openai_key_last4" text,
	"ai_monthly_cap_usd" double precision DEFAULT 5 NOT NULL,
	"privacy_ack_at" timestamp with time zone,
	"exam_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DROP INDEX "ai_usage_created_idx";--> statement-breakpoint
DROP INDEX "attempts_concept_idx";--> statement-breakpoint
DROP INDEX "attempts_question_idx";--> statement-breakpoint
DROP INDEX "attempts_created_idx";--> statement-breakpoint
ALTER TABLE "concept_state" DROP CONSTRAINT "concept_state_pkey";--> statement-breakpoint
ALTER TABLE "disabled_questions" DROP CONSTRAINT "disabled_questions_pkey";--> statement-breakpoint
ALTER TABLE "lab_progress" DROP CONSTRAINT "lab_progress_pkey";--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "study_days" DROP CONSTRAINT "study_days_pkey";--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_state" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "disabled_questions" ADD COLUMN "user_id" text DEFAULT '*' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_progress" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "mocks" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_reports" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_days" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD COLUMN "user_id" text DEFAULT '__owner__' NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "attempts_user_concept_idx" ON "attempts" USING btree ("user_id","concept_id");--> statement-breakpoint
CREATE INDEX "attempts_user_question_idx" ON "attempts" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "attempts_user_created_idx" ON "attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mocks_user_idx" ON "mocks" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "concept_state" ADD CONSTRAINT "concept_state_user_id_concept_id_pk" PRIMARY KEY("user_id","concept_id");--> statement-breakpoint
ALTER TABLE "disabled_questions" ADD CONSTRAINT "disabled_questions_user_id_question_id_pk" PRIMARY KEY("user_id","question_id");--> statement-breakpoint
ALTER TABLE "lab_progress" ADD CONSTRAINT "lab_progress_user_id_lab_id_pk" PRIMARY KEY("user_id","lab_id");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY("user_id","key");--> statement-breakpoint
ALTER TABLE "study_days" ADD CONSTRAINT "study_days_user_id_day_pk" PRIMARY KEY("user_id","day");
