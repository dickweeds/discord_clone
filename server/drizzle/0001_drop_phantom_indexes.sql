-- Drop redundant standalone indexes on messages table.
-- The composite index messages_channel_created_idx(channel_id, created_at, id)
-- already covers channel_id prefix queries via Postgres leftmost-prefix optimization.
-- These phantom indexes cause unnecessary write amplification on the highest-write table.
DROP INDEX IF EXISTS "idx_messages_channel_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_messages_created_at";
