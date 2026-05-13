-- Run this in Supabase SQL Editor.

create table if not exists public.employees (
  id serial primary key,
  employee_name text not null,
  employee_email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletters (
  id serial primary key,
  title text not null,
  topic text not null,
  description text null,
  pdf_url text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.email_logs (
  id serial primary key,
  employee_email text not null,
  newsletter_id integer not null references public.newsletters(id) on delete cascade,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  sent_at timestamptz not null default now(),
  error_message text null
);

create index if not exists idx_employees_email on public.employees(employee_email);
create index if not exists idx_newsletters_uploaded_at on public.newsletters(uploaded_at desc);
create index if not exists idx_email_logs_newsletter_id on public.email_logs(newsletter_id);
create index if not exists idx_email_logs_status on public.email_logs(delivery_status);
create index if not exists idx_email_logs_sent_at on public.email_logs(sent_at desc);

-- Supabase Storage bucket for newsletter PDFs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('newsletters', 'newsletters', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
