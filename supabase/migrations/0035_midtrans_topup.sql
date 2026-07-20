-- Midtrans top-up write path (Milestone 2 of the credits system, migration 0034).
--
-- Only the top-up (one-off Snap purchase) RPC ships here. Pro recurring
-- subscription (subscription_start / subscription_process_renewal /
-- subscription_request_cancel) is deliberately NOT included yet — it needs
-- Midtrans account-level "recurring" approval and has an unresolved
-- field-name gap in how a saved card/GoPay token is retrieved after the
-- first tokenizing charge (see the plan file for detail). Do not guess that
-- part; verify against live Midtrans docs when picking it back up.
--
-- credit_topup_grant: credit a paid top-up. Idempotent on order_id (Midtrans
-- resends notifications) — a duplicate call for an already-'paid' order is a
-- safe no-op. Service-role only, reached from midtrans-webhook/index.ts.
create or replace function public.credit_topup_grant(
  p_order_id text, p_midtrans_transaction_id text, p_notification jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order payment_orders%rowtype;
  v_credits int;
  v_new_balance int;
begin
  select * into v_order from payment_orders where order_id = p_order_id for update;
  if not found or v_order.kind <> 'topup' then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;
  if v_order.status = 'paid' then
    select balance into v_new_balance from credits_topup where user_id = v_order.user_id;
    return jsonb_build_object('ok', true, 'credits_granted', 0, 'new_balance', coalesce(v_new_balance, 0));
  end if;

  select credits into v_credits from credit_packs where id = v_order.credit_pack_id;
  if v_credits is null then
    return jsonb_build_object('ok', false, 'reason', 'pack_not_found');
  end if;

  update payment_orders set status = 'paid', midtrans_transaction_id = p_midtrans_transaction_id,
    raw_notification = p_notification, updated_at = now() where order_id = p_order_id;

  insert into credits_topup (user_id, balance) values (v_order.user_id, v_credits)
    on conflict (user_id) do update set balance = credits_topup.balance + v_credits, updated_at = now()
    returning balance into v_new_balance;

  insert into credit_ledger (user_id, pool, delta, reason, balance_after, ref)
    values (v_order.user_id, 'topup', v_credits, 'topup_purchase', v_new_balance, p_order_id);

  return jsonb_build_object('ok', true, 'credits_granted', v_credits, 'new_balance', v_new_balance);
end;
$$;

revoke all on function public.credit_topup_grant(text, text, jsonb) from public;
revoke execute on function public.credit_topup_grant(text, text, jsonb) from anon;
revoke execute on function public.credit_topup_grant(text, text, jsonb) from authenticated;
grant execute on function public.credit_topup_grant(text, text, jsonb) to service_role;

-- payment_order_mark_failed: the non-'paid' terminal statuses (deny/cancel/
-- expire) from a Midtrans notification. No credit grant, just closes the
-- order out so it stops looking "pending" in the user's history.
create or replace function public.payment_order_mark_failed(
  p_order_id text, p_status text, p_notification jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update payment_orders set
    status = case when p_status in ('failed', 'expired', 'cancelled') then p_status else 'failed' end,
    raw_notification = p_notification,
    updated_at = now()
  where order_id = p_order_id and status = 'pending';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.payment_order_mark_failed(text, text, jsonb) from public;
revoke execute on function public.payment_order_mark_failed(text, text, jsonb) from anon;
revoke execute on function public.payment_order_mark_failed(text, text, jsonb) from authenticated;
grant execute on function public.payment_order_mark_failed(text, text, jsonb) to service_role;
