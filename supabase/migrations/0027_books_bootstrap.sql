-- New-user bootstrap, updated for books: every signup now gets a 'Personal'
-- book, it's set as their active book, and the seeded default categories are
-- stamped with it. Without this, the categories insert would violate the new
-- categories.book_id NOT NULL constraint added in 0026.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_book_id uuid;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.books (owner_id, name)
  values (new.id, 'Personal')
  returning id into new_book_id;

  update public.profiles set active_book_id = new_book_id where id = new.id;

  insert into public.categories (user_id, book_id, name, kind, icon) values
    (new.id, new_book_id, 'Salary', 'income', 'briefcase'),
    (new.id, new_book_id, 'Business', 'income', 'store'),
    (new.id, new_book_id, 'Investment', 'income', 'trending-up'),
    (new.id, new_book_id, 'Other income', 'income', 'plus'),
    (new.id, new_book_id, 'Food & Drink', 'expense', 'utensils'),
    (new.id, new_book_id, 'Groceries', 'expense', 'shopping-cart'),
    (new.id, new_book_id, 'Transport', 'expense', 'car'),
    (new.id, new_book_id, 'Shopping', 'expense', 'shopping-bag'),
    (new.id, new_book_id, 'Bills & Utilities', 'expense', 'receipt'),
    (new.id, new_book_id, 'Entertainment', 'expense', 'clapperboard'),
    (new.id, new_book_id, 'Health', 'expense', 'heart-pulse'),
    (new.id, new_book_id, 'Other expense', 'expense', 'ellipsis');
  return new;
end;
$$;
