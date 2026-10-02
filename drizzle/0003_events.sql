CREATE TABLE "event_entries" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"questions" jsonb NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"total_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"photo" "bytea",
	"photo_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "event_entries_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "event_entries_rank_idx" ON "event_entries" USING btree ("event_id","score","total_ms");