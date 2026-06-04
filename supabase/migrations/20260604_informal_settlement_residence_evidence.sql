alter table public.kyc_cases
  add column if not exists gps_coordinates jsonb,
  add column if not exists what3words_id text,
  add column if not exists tower_id text,
  add column if not exists location_evidence text,
  add column if not exists affidavit_video_url text,
  add column if not exists residence_evidence_captured_at timestamptz;

alter table public.kyc_bulk_rows
  add column if not exists tower_id text,
  add column if not exists location_evidence text;

create index if not exists idx_kyc_cases_tower_id on public.kyc_cases(tower_id);
create index if not exists idx_kyc_bulk_rows_tower_id on public.kyc_bulk_rows(tower_id);
