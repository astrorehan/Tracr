-- Add receivable (piutang) account type: money owed to the user (an asset, not a liability).
alter type account_type add value if not exists 'receivable';
