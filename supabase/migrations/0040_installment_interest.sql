-- Migration 0040: Add interest rate and interest type support to installments table

alter table public.installments
  add column if not exists interest_rate numeric(5,2) default 0 check (interest_rate >= 0 and interest_rate <= 100),
  add column if not exists interest_type text default 'zero' check (interest_type in ('zero', 'flat', 'annuity'));
