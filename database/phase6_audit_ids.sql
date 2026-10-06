-- The shared audit trigger records new.id even when the business key is composite.
alter table public.session_checkin_codes add column id uuid not null default gen_random_uuid() unique;
alter table public.whatsapp_consents add column id uuid not null default gen_random_uuid() unique;
alter table public.mp_connections add column id uuid not null default gen_random_uuid() unique;
