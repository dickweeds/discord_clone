CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_message_reactions_message_user_emoji" ON "message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "idx_message_reactions_message_id" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "message_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_reactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  REVOKE ALL ON "message_reactions" FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN
  -- Roles don't exist outside Supabase — skip safely
END; $$;
