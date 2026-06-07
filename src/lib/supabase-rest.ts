const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const persistenceMode = process.env.KYC_PERSISTENCE?.toLowerCase();

export function hasSupabaseConfig() {
  if (persistenceMode === "memory") return false;
  return Boolean(supabaseUrl && supabaseKey);
}

export async function supabaseRequest(path: string, init?: RequestInit) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Supabase network request failed. Check your internet/Supabase project, or set KYC_PERSISTENCE=memory in .env.local for offline local UAT. ${String(error)}`
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${message}`);
  }

  if (response.status === 204) return null;
  return response.json();
}
