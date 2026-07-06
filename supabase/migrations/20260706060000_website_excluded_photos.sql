-- The website builder's photo picker pulls from ALL of the company's job
-- photos (not scoped to a particular job or "for the website" purpose) so
-- owners can reuse any site photo without a separate upload step. That means
-- an unrelated photo (e.g. from an unrelated job) can show up in the picker
-- with no way to hide it — this column lets an owner exclude specific photos
-- from that pool without deleting the underlying job photo.
alter table company_websites add column if not exists excluded_photo_urls text[] not null default '{}';
