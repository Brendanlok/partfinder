// Optional cross-device sync for saved listings. The app works fully signed-out
// (everything in localStorage); signing in just mirrors the `saved` map to a single
// per-user JSONB row in Supabase (last-write-wins, no per-listing merge) so the same
// saved cars show up on another device. Only `saved` syncs - lastSearch/recentSearches/
// lang stay device-local on purpose (a cache and two device preferences).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Env-based, so it's identical on the server-rendered static export and the client's
// first render - gating the Sync button on `client !== null` instead would only be true
// after hydration and would trip a hydration mismatch.
export const accountEnabled = !!(url && key);

// Created lazily on first real use (always from a browser-only effect/handler), so the
// build/SSR pass never touches createClient. Every function below no-ops without it.
let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (client) return client;
  if (typeof window === "undefined" || !url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export type SavedMap = Record<string, unknown>;

// Fires on sign-in / sign-out / token refresh, plus once on subscribe with the
// existing session (INITIAL_SESSION). Returns an unsubscribe fn.
export function onAuthChange(cb: (email: string | null) => void): () => void {
  const c = getClient();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_event, session) => {
    cb(session?.user.email ?? null);
  });
  return () => data.subscription.unsubscribe();
}

// Step 1 of sign-in: email a 6-digit code (also creates the account on first use).
export async function sendCode(email: string): Promise<{ error?: string }> {
  const c = getClient();
  if (!c) return { error: "sync-unavailable" };
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? { error: error.message } : {};
}

// Step 2: verify the code -> onAuthChange fires with the new session.
export async function verifyCode(email: string, code: string): Promise<{ error?: string }> {
  const c = getClient();
  if (!c) return { error: "sync-unavailable" };
  const { error } = await c.auth.verifyOtp({ email, token: code.trim(), type: "email" });
  return error ? { error: error.message } : {};
}

export async function signOut(): Promise<void> {
  await getClient()?.auth.signOut();
}

// Whole saved map for this user, or null if signed out / not saved yet / on error.
export async function pullSaved(): Promise<SavedMap | null> {
  const c = getClient();
  if (!c) return null;
  const { data, error } = await c.from("user_saved").select("data").maybeSingle();
  if (error || !data) return null;
  return (data.data ?? null) as SavedMap | null;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: SavedMap | null = null;

// Debounced: a burst of save/unsave toggles collapses into one upsert.
export function pushSaved(saved: SavedMap): void {
  if (!accountEnabled) return;
  pending = saved;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 800);
}

async function flushPush(): Promise<void> {
  pushTimer = null;
  const c = getClient();
  if (!c || pending === null) return;
  const payload = pending;
  pending = null;
  const { data: sess } = await c.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return;
  await c
    .from("user_saved")
    .upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() });
}
