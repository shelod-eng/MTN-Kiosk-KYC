create table if not exists public.kyc_bulk_batches (
  id text primary key,
  batch_reference text not null unique,
  provider text not null,
  source text not null default 'upload',
  source_file_name text not null,
  status text not null,
  received_at timestamptz not null default timezone('utc', now()),
  row_count integer not null default 0,
  valid_count integer not null default 0,
  error_count integer not null default 0,
  provider_report_csv text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kyc_bulk_rows (
  id text primary key,
  batch_id text not null references public.kyc_bulk_batches(id) on delete cascade,
  row_number integer not null,
  full_name text,
  id_number text,
  phone_number text,
  campaign_id text,
  segment text,
  provider_reference text,
  case_id text references public.kyc_cases(id) on delete set null,
  status text not null,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (batch_id, row_number)
);

create index if not exists idx_kyc_bulk_batches_provider_received_at on public.kyc_bulk_batches(provider, received_at desc);
create index if not exists idx_kyc_bulk_batches_status on public.kyc_bulk_batches(status);
create index if not exists idx_kyc_bulk_rows_batch_id on public.kyc_bulk_rows(batch_id);
create index if not exists idx_kyc_bulk_rows_case_id on public.kyc_bulk_rows(case_id);
create index if not exists idx_kyc_bulk_rows_phone_number on public.kyc_bulk_rows(phone_number);
