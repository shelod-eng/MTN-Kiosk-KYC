const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const persistenceMode = process.env.KYC_PERSISTENCE?.toLowerCase();

export function hasSupabaseConfig() {
  if (persistenceMode === "memory") return false;
  return Boolean(supabaseUrl && supabaseKey);
}

export async function supabaseRequest(path: string, init?: RequestInit, attempts = 3) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured.");
  }

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
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

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`Supabase request failed: ${response.status} ${message}`);
      }

      if (response.status === 204) return null;
      return response.json();
    } catch (error) {
      lastErr = error;
      // if this was the last attempt, rethrow below
      if (attempt < attempts) {
        // small backoff
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
    }
  }

  throw new Error(
    `Supabase network request failed after ${attempts} attempts. Check your internet/Supabase project, or set KYC_PERSISTENCE=memory in .env.local for offline local UAT. ${String(lastErr)}`
  );
}
