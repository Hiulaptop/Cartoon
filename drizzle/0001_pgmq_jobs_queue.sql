-- Hàng đợi job (pgmq, nền của Supabase Queues). Spec §3.
CREATE EXTENSION IF NOT EXISTS pgmq;--> statement-breakpoint
SELECT pgmq.create('jobs');
