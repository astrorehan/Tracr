-- The new-user bootstrap runs only via the on_auth_user_created trigger (as the
-- function owner). It should not be callable through the public REST API, so
-- revoke EXECUTE from the API-exposed roles. The trigger keeps working.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
