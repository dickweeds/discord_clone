CREATE TABLE "sounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"s3_key" text NOT NULL,
	"file_size" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sounds_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
ALTER TABLE "sounds" ADD CONSTRAINT "sounds_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sounds_uploaded_by" ON "sounds" USING btree ("uploaded_by");--> statement-breakpoint
-- RLS enabled as defense-in-depth; application connects as superuser (service role) which bypasses RLS.
-- If Supabase PostgREST is ever exposed, add appropriate policies.
ALTER TABLE sounds ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sounds FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  REVOKE ALL ON sounds FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN
  -- Roles don't exist outside Supabase — skip safely
END; $$;
