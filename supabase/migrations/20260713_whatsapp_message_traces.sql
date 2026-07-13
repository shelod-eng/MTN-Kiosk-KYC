CREATE TABLE IF NOT EXISTS public.kyc_whatsapp_message_traces (
  id text PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel text NOT NULL DEFAULT 'whatsapp',
  provider text NOT NULL,
  message_sid text,
  case_id text,
  case_reference text,
  from_number text,
  to_number text,
  transport_sender text,
  logical_sender text,
  body_preview text,
  status text NOT NULL,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_whatsapp_message_traces_occurred_at
ON public.kyc_whatsapp_message_traces(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_whatsapp_message_traces_case_reference
ON public.kyc_whatsapp_message_traces(case_reference);

CREATE INDEX IF NOT EXISTS idx_kyc_whatsapp_message_traces_direction
ON public.kyc_whatsapp_message_traces(direction);
