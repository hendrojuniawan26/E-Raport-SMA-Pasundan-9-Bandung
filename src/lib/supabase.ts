import { createClient, SupabaseClient } from '@supabase/supabase-js';

const RUNTIME_URL_KEY = 'pasundan9_supabase_url';
const RUNTIME_ANON_KEY = 'pasundan9_supabase_anon_key';

export type SupabaseConfigSource = 'env' | 'server' | 'local' | 'none';

export interface ResolvedSupabaseConfig {
  url: string;
  anonKey: string;
  source: SupabaseConfigSource;
}

let serverConfigCache: {
  url: string;
  anonKey: string;
  source: 'env' | 'server' | 'none';
} = {
  url: '',
  anonKey: '',
  source: 'none',
};

let cachedClient: SupabaseClient | null = null;
let cachedClientSignature = '';

function isPlaceholderConfig(url: string, anonKey: string): boolean {
  return (
    !url ||
    !anonKey ||
    url.includes('your-project-id') ||
    anonKey.includes('your-supabase-anon-key')
  );
}

function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function getSupabaseConfig(): ResolvedSupabaseConfig {
  const envUrl = normalizeSupabaseUrl(
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
      (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ||
      ''
  );
  const envAnon = (
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
    ''
  ).trim();

  if (!isPlaceholderConfig(envUrl, envAnon)) {
    return { url: envUrl, anonKey: envAnon, source: 'env' };
  }

  if (!isPlaceholderConfig(serverConfigCache.url, serverConfigCache.anonKey)) {
    return {
      url: normalizeSupabaseUrl(serverConfigCache.url),
      anonKey: serverConfigCache.anonKey,
      source: serverConfigCache.source === 'env' ? 'env' : 'server',
    };
  }

  const localUrl =
    typeof window !== 'undefined'
      ? normalizeSupabaseUrl(window.localStorage.getItem(RUNTIME_URL_KEY) || '')
      : '';
  const localAnon =
    typeof window !== 'undefined' ? (window.localStorage.getItem(RUNTIME_ANON_KEY) || '').trim() : '';

  if (!isPlaceholderConfig(localUrl, localAnon)) {
    return { url: localUrl, anonKey: localAnon, source: 'local' };
  }

  return { url: '', anonKey: '', source: 'none' };
}

export async function loadServerSupabaseConfig(): Promise<ResolvedSupabaseConfig> {
  try {
    const res = await fetch('/api/config/supabase');
    if (res.ok) {
      const data = (await res.json()) as {
        configured?: boolean;
        source?: 'env' | 'server' | 'none';
        url?: string;
        anonKey?: string;
      };
      if (data.configured && data.url && data.anonKey) {
        const cleanUrl = normalizeSupabaseUrl(data.url);
        serverConfigCache = {
          url: cleanUrl,
          anonKey: data.anonKey.trim(),
          source: data.source || 'server',
        };
        saveRuntimeSupabaseConfig(cleanUrl, data.anonKey);
      } else {
        serverConfigCache = { url: '', anonKey: '', source: 'none' };
      }
    }
  } catch {
    // ignore if offline / static build without server
  }
  return getSupabaseConfig();
}

export async function saveServerSupabaseConfigRemote(
  url: string,
  anonKey: string,
  authToken: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/config/supabase', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || 'Gagal menyimpan konfigurasi Supabase ke server.' };
    }
    serverConfigCache = {
      url: url.trim(),
      anonKey: anonKey.trim(),
      source: 'server',
    };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Server tidak merespons saat menyimpan konfigurasi.' };
  }
}

export async function clearServerSupabaseConfigRemote(
  authToken: string | null
): Promise<{ ok: boolean; error?: string }> {
  saveRuntimeSupabaseConfig('', '');
  serverConfigCache = { url: '', anonKey: '', source: 'none' };
  cachedClient = null;
  cachedClientSignature = '';
  try {
    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/config/supabase', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers,
    });
    if (res.status === 401) {
      return { ok: true };
    }
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      return { ok: false, error: data.error || 'Gagal menghapus konfigurasi server.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Gagal menghubungi server.' };
  }
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window === 'undefined') return;
  const cleanUrl = normalizeSupabaseUrl(url);
  if (cleanUrl && anonKey.trim()) {
    window.localStorage.setItem(RUNTIME_URL_KEY, cleanUrl);
    window.localStorage.setItem(RUNTIME_ANON_KEY, anonKey.trim());
  } else {
    window.localStorage.removeItem(RUNTIME_URL_KEY);
    window.localStorage.removeItem(RUNTIME_ANON_KEY);
  }
  cachedClient = null;
  cachedClientSignature = '';
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  const signature = `${url}::${anonKey}`;
  if (cachedClient && cachedClientSignature === signature) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    cachedClientSignature = signature;
    return cachedClient;
  } catch {
    return null;
  }
}

export function createEphemeralSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  try {
    return createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `ephemeral-sb-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    });
  } catch {
    return null;
  }
}

export async function testSupabaseConnection(): Promise<{
  ok: boolean;
  message: string;
  tablesReady?: boolean;
  hasSession?: boolean;
  emailProviderDisabled?: boolean;
}> {
  const cfg = getSupabaseConfig();
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      tablesReady: false,
      hasSession: false,
      message:
        'Konfigurasi VITE_SUPABASE_URL / ANON_KEY belum diisi. Berjalan di Mode Offline-Fallback.',
    };
  }

  try {
    const cleanUrl = normalizeSupabaseUrl(cfg.url);
    const authHeaders = {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
    };
    const healthRes = await fetch(`${cleanUrl}/auth/v1/health`, {
      headers: authHeaders,
    });
    if (!healthRes.ok) {
      return {
        ok: false,
        tablesReady: false,
        hasSession: false,
        message: `Supabase URL atau Anon Public Key ditolak server (HTTP ${healthRes.status}). Periksa kembali kunci proyek Supabase Anda.`,
      };
    }

    const sourceText =
      cfg.source === 'env'
        ? 'konfigurasi permanen environment (.env / Secrets)'
        : cfg.source === 'server'
          ? 'konfigurasi server permanen (aktif di semua browser)'
          : 'konfigurasi browser lokal';

    let emailProviderDisabled = false;
    try {
      const settingsRes = await fetch(`${cleanUrl}/auth/v1/settings`, {
        headers: authHeaders,
      });
      if (settingsRes.ok) {
        const settingsJson = (await settingsRes.json()) as {
          external?: { email?: boolean };
        };
        if (settingsJson?.external && settingsJson.external.email === false) {
          emailProviderDisabled = true;
        }
      }
    } catch {
      // ignore if auth settings endpoint is blocked
    }

    const { data: sessionData } = await client.auth.getSession();
    const hasSession = Boolean(sessionData.session);

    if (emailProviderDisabled) {
      return {
        ok: true,
        tablesReady: false,
        hasSession,
        emailProviderDisabled: true,
        message: `Terhubung ke Supabase (${sourceText}), tetapi provider login Email sedang NONAKTIF ("Email logins are disabled"). Aktifkan "Enable Email provider" di Supabase Dashboard → Authentication → Providers → Email agar akun bisa masuk.`,
      };
    }

    if (!hasSession) {
      return {
        ok: true,
        tablesReady: false,
        hasSession: false,
        emailProviderDisabled: false,
        message: `URL & Anon Key Supabase terhubung (${sourceText}). Masuk menggunakan akun yang terdaftar untuk menyinkronkan database sekolah.`,
      };
    }

    const { error } = await client.from('school_settings').select('id').limit(1);
    if (error) {
      const msgLower = error.message.toLowerCase();
      if (
        error.code === '42501' ||
        msgLower.includes('permission denied') ||
        msgLower.includes('row-level security')
      ) {
        return {
          ok: true,
          tablesReady: false,
          hasSession,
          message: `Terhubung ke Supabase (${sourceText}), tetapi izin baca tabel ditolak (${error.message}). Pastikan skrip SQL terbaru (termasuk GRANT & RLS Policy) sudah dijalankan di Supabase SQL Editor.`,
        };
      }
      return {
        ok: false,
        tablesReady: false,
        hasSession,
        message: `Terkoneksi ke proyek Supabase (${sourceText}), tetapi tabel belum siap: ${error.message}. Salin dan jalankan skrip SQL di Supabase SQL Editor.`,
      };
    }
    return {
      ok: true,
      tablesReady: true,
      hasSession,
      emailProviderDisabled: false,
      message: `Terhubung penuh ke Supabase (${sourceText}) dan tabel siap disinkronkan.`,
    };
  } catch (err) {
    return {
      ok: false,
      tablesReady: false,
      hasSession: false,
      message: err instanceof Error ? err.message : 'Gagal menghubungi server Supabase.',
    };
  }
}

export async function uploadAssetToSupabaseOrLocal(
  file: File,
  folder: 'students' | 'school'
): Promise<string> {
  const client = getSupabaseClient();
  if (client) {
    const ext = file.name.split('.').pop() || 'png';
    const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await client.storage
      .from('school-assets')
      .upload(filePath, file, { upsert: true });

    if (!error) {
      const { data } = client.storage.from('school-assets').getPublicUrl(filePath);
      if (data?.publicUrl) return data.publicUrl;
    }
  }

  // Fallback to compressed data URL for immediate preview & local persistence
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}
