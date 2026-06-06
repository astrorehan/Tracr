-- Standard liability account types. Net-worth math already nets negative balances,
-- so a liability is just an account that runs negative; these enum values give
-- credit cards / loans first-class labels + icons in the UI. (Kept in their own
-- migration: ALTER TYPE ... ADD VALUE can't be used in the same tx it's added.)
alter type account_type add value if not exists 'credit_card';
alter type account_type add value if not exists 'loan';
