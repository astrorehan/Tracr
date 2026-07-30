-- Contact management for the kasbon ledger (see 0037). Until now a contact was
-- only ever a by-product of writing a debt: created inline by the debt form,
-- never editable, never removable. This makes the person the record.
--
-- `note` holds the free text a warung owner actually needs (address, "anak Bu
-- Sari", which shift they come by). `is_archived` soft-hides someone who stopped
-- coming without touching their debt history — debts.contact_id is ON DELETE SET
-- NULL, so a hard delete would strip the name off past records. The kind check
-- gains 'both' because the same person is often a customer and a supplier
-- (buys retail, sells you stock).

alter table contacts add column note text;
alter table contacts add column is_archived boolean not null default false;

alter table contacts drop constraint contacts_kind_check;
alter table contacts add constraint contacts_kind_check
  check (kind in ('customer', 'supplier', 'both'));

-- Name search and the case-insensitive duplicate check the contact form runs
-- before inserting someone new.
create index contacts_book_name_idx on contacts (book_id, lower(name));

-- Active-contact listing, the common read path.
create index contacts_book_active_idx on contacts (book_id) where not is_archived;
