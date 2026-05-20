create extension if not exists "pgcrypto";

create table if not exists public.kyc_cases (
  id text primary key,
  case_reference text not null unique,
  tenant text not null,
  channel text not null default 'WhatsApp',
  status text not null,
  customer_phone_number text not null,
  staff_id text not null,
  staff_name text not null,
  staff_role text not null,
  delivery_method text not null,
  secure_session_token text,
  secure_session_expires_at timestamptz,
  risk_score integer,
  risk_band text,
  decision text,
  case_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kyc_applicants (
  id text primary key,
  case_id text not null references public.kyc_cases(id) on delete cascade,
  full_name text,
  id_number text,
  phone_number text,
  consent_given boolean not null default false,
  consent_captured_at timestamptz,
  date_of_birth date,
  citizenship text,
  gender text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kyc_documents (
  id text primary key,
  case_id text not null references public.kyc_cases(id) on delete cascade,
  document_type text not null,
  storage_url text,
  provider_reference text,
  captured_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.kyc_audit_logs (
  id text primary key,
  case_id text not null references public.kyc_cases(id) on delete cascade,
  actor_role text not null,
  actor_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kyc_otp_attempts (
  id text primary key,
  case_id text not null references public.kyc_cases(id) on delete cascade,
  provider text not null,
  phone_number text not null,
  status text not null,
  attempts integer not null default 0,
  expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kyc_affidavits (
  id text primary key,
  case_id text not null references public.kyc_cases(id) on delete cascade,
  declarant_name text not null,
  declared_address text not null,
  declaration_accepted boolean not null,
  responses jsonb not null default '[]'::jsonb,
  video_url text,
  captured_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kyc_locations (
  id text primary key,
  case_id text not null references public.kyc_cases(id) on delete cascade,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  accuracy numeric(10, 2),
  what3words text,
  captured_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kyc_risk_scores (
  id text primary key,
  case_id text not null references public.kyc_cases(id) on delete cascade,
  score integer not null,
  band text not null,
  decision text not null,
  reason_codes jsonb not null default '[]'::jsonb,
  trust_layers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_kyc_cases_status on public.kyc_cases(status);
create index if not exists idx_kyc_cases_reference on public.kyc_cases(case_reference);
create index if not exists idx_kyc_audit_logs_case_id on public.kyc_audit_logs(case_id);
create index if not exists idx_kyc_documents_case_id on public.kyc_documents(case_id);
