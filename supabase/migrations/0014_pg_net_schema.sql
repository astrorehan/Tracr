-- Move pg_net out of the `public` schema (Supabase linter 0014_extension_in_public),
-- matching the project convention where extensions live in `extensions` (pgcrypto, etc.).
-- pg_net isn't relocatable via ALTER EXTENSION, so drop + recreate. Its user-facing
-- functions live in the `net` schema either way, so the cron's `net.http_post(...)`
-- call in 0013 is unaffected. There are no in-flight requests to preserve.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
