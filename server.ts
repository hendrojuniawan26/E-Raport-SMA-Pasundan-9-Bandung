import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';

type UserRole = 'admin' | 'guru' | 'wali_kelas';

interface StoredAuthUser {
  id: string;
  email: string;
  fullName: string;
  nipNuptk: string;
  nrks: string;
  role: UserRole;
  isActive: boolean;
  assignedClassId?: string;
  passwordSalt: string | null;
  passwordHash: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionPayload {
  sub: string;
  role: UserRole;
  isDemo: boolean;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  auth?: SessionPayload;
  authUser?: StoredAuthUser;
}

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_DIR = path.resolve(process.cwd(), '.data');
const USERS_FILE = path.join(DATA_DIR, 'auth-users.json');
const SUPABASE_CONFIG_FILE = path.join(DATA_DIR, 'supabase-config.json');
const SCHOOL_STATE_FILE = path.join(DATA_DIR, 'school-state.json');

interface StoredSupabaseConfig {
  url: string;
  anonKey: string;
  updatedAt?: string;
}

interface StoredSchoolState {
  settings?: Record<string, unknown>;
  classes?: unknown[];
  subjects?: unknown[];
  students?: unknown[];
  grades?: unknown[];
  homeroomRecords?: unknown[];
  gradeSubmissions?: unknown[];
  updatedAt: string;
  updatedBy?: string;
}

const SEED_USERS: Omit<StoredAuthUser, 'passwordSalt' | 'passwordHash' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'user-admin-1',
    email: 'operator@smapasundan9bdg.sch.id',
    fullName: 'Raden Budi Santoso, S.Kom.',
    nipNuptk: '198604122010011008',
    nrks: 'ADM-001',
    role: 'admin',
    isActive: true,
  },
  {
    id: 'user-guru-1',
    email: 'hendro.informatika@smapasundan9bdg.sch.id',
    fullName: 'Hendro Kartika J., M.Hum',
    nipNuptk: '198907152014021003',
    nrks: 'GR-INF-01',
    role: 'guru',
    isActive: true,
  },
  {
    id: 'user-wali-1',
    email: 'siti.rahmawati@smapasundan9bdg.sch.id',
    fullName: 'Dra. Siti Rahmawati, M.Pd.',
    nipNuptk: '197811032006042014',
    nrks: 'WK-11IPAS',
    role: 'wali_kelas',
    isActive: true,
    assignedClassId: 'kelas-xi-ipas',
  },
  {
    id: 'user-guru-2',
    email: 'asep.matematika@smapasundan9bdg.sch.id',
    fullName: 'Asep Saepudin, S.Pd.',
    nipNuptk: '198403222009021005',
    nrks: 'GR-MAT-02',
    role: 'guru',
    isActive: true,
  },
  {
    id: 'user-guru-3',
    email: 'ratna.bindo@smapasundan9bdg.sch.id',
    fullName: 'Ratna Komalasari, S.Pd., M.Pd.',
    nipNuptk: '198209182008012011',
    nrks: 'GR-IND-03',
    role: 'guru',
    isActive: true,
  },
];

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers(): StoredAuthUser[] {
  ensureDataDir();
  if (fs.existsSync(USERS_FILE)) {
    try {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw) as StoredAuthUser[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Fall through to re-seed cleanly if corrupted
    }
  }

  const now = new Date().toISOString();
  const initial: StoredAuthUser[] = SEED_USERS.map((u) => ({
    ...u,
    passwordSalt: null,
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
  }));
  saveUsers(initial);
  return initial;
}

function saveUsers(users: StoredAuthUser[]): void {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function isValidSupabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !rawUrl.includes('your-project-id')
    );
  } catch {
    return false;
  }
}

function getEnvSupabaseConfig(): StoredSupabaseConfig {
  const url = (
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (
    !url ||
    !anonKey ||
    url.includes('your-project-id') ||
    anonKey.includes('your-supabase-anon-key')
  ) {
    return { url: '', anonKey: '' };
  }
  return { url, anonKey };
}

function loadSavedSupabaseConfig(): StoredSupabaseConfig {
  ensureDataDir();
  if (!fs.existsSync(SUPABASE_CONFIG_FILE)) {
    return { url: '', anonKey: '' };
  }
  try {
    const raw = fs.readFileSync(SUPABASE_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredSupabaseConfig>;
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : '';
    const anonKey = typeof parsed.anonKey === 'string' ? parsed.anonKey.trim() : '';
    if (!url || !anonKey || !isValidSupabaseUrl(url)) {
      return { url: '', anonKey: '' };
    }
    return { url, anonKey, updatedAt: parsed.updatedAt };
  } catch {
    return { url: '', anonKey: '' };
  }
}

function saveServerSupabaseConfig(url: string, anonKey: string): StoredSupabaseConfig {
  ensureDataDir();
  const payload: StoredSupabaseConfig = {
    url: url.trim(),
    anonKey: anonKey.trim(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SUPABASE_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function loadSchoolState(): StoredSchoolState | null {
  ensureDataDir();
  if (!fs.existsSync(SCHOOL_STATE_FILE)) return null;
  try {
    const raw = fs.readFileSync(SCHOOL_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredSchoolState;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveSchoolState(state: StoredSchoolState): StoredSchoolState {
  ensureDataDir();
  fs.writeFileSync(SCHOOL_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function hashPassword(password: string, existingSalt?: string): { salt: string; hash: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyScryptPassword(password: string, salt: string, expectedHex: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifyEnvPasscode(candidate: string): boolean {
  const configured = (process.env.ADMIN_PASSCODE || '').trim();
  if (!configured) return false;
  const candidateDigest = crypto.createHash('sha256').update(candidate).digest();
  const configuredDigest = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(candidateDigest, configuredDigest);
}

function signSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (!payload.sub || !payload.role || typeof payload.exp !== 'number') {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function sanitizeUser(user: StoredAuthUser, includeSensitiveMeta = false) {
  return {
    id: user.id,
    email: includeSensitiveMeta ? user.email : '',
    fullName: user.fullName,
    nipNuptk: user.nipNuptk,
    nrks: user.nrks,
    role: user.role,
    isActive: user.isActive,
    assignedClassId: user.assignedClassId,
    hasPassword: includeSensitiveMeta ? Boolean(user.passwordHash) : undefined,
  };
}

function isValidRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'guru' || value === 'wali_kelas';
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
    value.trim().length <= 160
  );
}

function isAdminClaimed(users: StoredAuthUser[]): boolean {
  const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPasscode.length > 0) return true;
  return users.some((u) => u.role === 'admin' && u.isActive && Boolean(u.passwordHash));
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: 'Sesi autentikasi tidak ditemukan. Silakan masuk terlebih dahulu.' });
    return;
  }

  const payload = verifySessionToken(match[1]);
  if (!payload) {
    res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir.' });
    return;
  }

  const users = loadUsers();
  const user = users.find((u) => u.id === payload.sub);
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan.' });
    return;
  }

  req.auth = payload;
  req.authUser = user;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.auth || !req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Hanya Admin yang dapat mengelola akun.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Shared Supabase public client config (automatically loaded by every browser)
  app.get('/api/config/supabase', (_req, res) => {
    const envCfg = getEnvSupabaseConfig();
    if (envCfg.url && envCfg.anonKey) {
      res.json({
        configured: true,
        source: 'env',
        url: envCfg.url,
        anonKey: envCfg.anonKey,
      });
      return;
    }

    const savedCfg = loadSavedSupabaseConfig();
    if (savedCfg.url && savedCfg.anonKey) {
      res.json({
        configured: true,
        source: 'server',
        url: savedCfg.url,
        anonKey: savedCfg.anonKey,
        updatedAt: savedCfg.updatedAt,
      });
      return;
    }

    res.json({
      configured: false,
      source: 'none',
      url: '',
      anonKey: '',
    });
  });

  app.post('/api/config/supabase', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { url, anonKey } = req.body as { url?: string; anonKey?: string };
    if (typeof url !== 'string' || !isValidSupabaseUrl(url)) {
      res.status(400).json({ error: 'Format Supabase Project URL tidak valid.' });
      return;
    }
    if (
      typeof anonKey !== 'string' ||
      anonKey.trim().length < 20 ||
      anonKey.includes('your-supabase-anon-key')
    ) {
      res.status(400).json({ error: 'Supabase Anon Public Key tidak valid.' });
      return;
    }

    const saved = saveServerSupabaseConfig(url, anonKey);
    res.json({
      ok: true,
      configured: true,
      source: 'server',
      url: saved.url,
      anonKey: saved.anonKey,
      updatedAt: saved.updatedAt,
    });
  });

  app.delete('/api/config/supabase', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res) => {
    if (fs.existsSync(SUPABASE_CONFIG_FILE)) {
      fs.unlinkSync(SUPABASE_CONFIG_FILE);
    }
    res.json({ ok: true });
  });

  // Auth status
  app.get('/api/auth/status', (_req, res) => {
    const users = loadUsers();
    const envPasscodeConfigured = Boolean((process.env.ADMIN_PASSCODE || '').trim());
    const adminClaimed = isAdminClaimed(users);

    res.json({
      adminClaimed,
      envPasscodeConfigured,
      usersCount: users.length,
    });
  });

  // First-run atomic Admin claim route
  app.post('/api/auth/claim-admin', (req, res) => {
    const users = loadUsers();
    if (isAdminClaimed(users)) {
      res.status(403).json({
        error: 'Akun Admin sudah diklaim atau dikonfigurasi. Silakan masuk dengan email & kata sandi Admin.',
      });
      return;
    }

    const { email, fullName, nipNuptk, password } = req.body as {
      email?: string;
      fullName?: string;
      nipNuptk?: string;
      password?: string;
    };

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Format email Admin tidak valid.' });
      return;
    }
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Nama lengkap Admin minimal 2 karakter.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Kata sandi Admin minimal 6 karakter.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const { salt, hash } = hashPassword(password);

    const existingIdx = users.findIndex(
      (u) => u.email.toLowerCase() === normalizedEmail || u.id === 'user-admin-1'
    );

    let adminUser: StoredAuthUser;
    if (existingIdx >= 0) {
      adminUser = {
        ...users[existingIdx],
        email: normalizedEmail,
        fullName: fullName.trim(),
        nipNuptk: typeof nipNuptk === 'string' ? nipNuptk.trim() : users[existingIdx].nipNuptk,
        role: 'admin',
        isActive: true,
        passwordSalt: salt,
        passwordHash: hash,
        updatedAt: now,
      };
      users[existingIdx] = adminUser;
    } else {
      adminUser = {
        id: `user-admin-${Date.now()}`,
        email: normalizedEmail,
        fullName: fullName.trim(),
        nipNuptk: typeof nipNuptk === 'string' ? nipNuptk.trim() : '',
        nrks: 'ADM-001',
        role: 'admin',
        isActive: true,
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: now,
        updatedAt: now,
      };
      users.unshift(adminUser);
    }

    saveUsers(users);
    const token = signSessionToken({ sub: adminUser.id, role: 'admin', isDemo: false });
    res.json({ token, user: sanitizeUser(adminUser, true) });
  });

  // Self-service registration for Guru Mata Pelajaran & Wali Kelas
  app.post('/api/auth/register', (req, res) => {
    const { email, fullName, nipNuptk, role, assignedClassId, password } = req.body as {
      email?: string;
      fullName?: string;
      nipNuptk?: string;
      role?: unknown;
      assignedClassId?: string;
      password?: string;
    };

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Format email sekolah tidak valid.' });
      return;
    }
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Nama lengkap & gelar minimal 2 karakter.' });
      return;
    }
    if (role !== 'guru' && role !== 'wali_kelas') {
      res.status(403).json({
        error: 'Pendaftaran mandiri hanya tersedia untuk peran Guru Mata Pelajaran atau Wali Kelas.',
      });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const existingIdx = users.findIndex((u) => u.email.toLowerCase() === normalizedEmail);
    const now = new Date().toISOString();
    const { salt, hash } = hashPassword(password);

    let registeredUser: StoredAuthUser;
    if (existingIdx >= 0) {
      const existing = users[existingIdx];
      if (existing.role === 'admin' || existing.passwordHash) {
        res.status(409).json({
          error: 'Email tersebut sudah terdaftar dan aktif. Silakan masuk menggunakan kata sandi Anda.',
        });
        return;
      }
      if (!existing.isActive) {
        res.status(403).json({ error: 'Akun ini sedang dinonaktifkan oleh Admin Sekolah.' });
        return;
      }
      registeredUser = {
        ...existing,
        fullName: fullName.trim(),
        nipNuptk: typeof nipNuptk === 'string' && nipNuptk.trim() ? nipNuptk.trim() : existing.nipNuptk,
        role,
        assignedClassId:
          role === 'wali_kelas' && typeof assignedClassId === 'string' && assignedClassId.trim()
            ? assignedClassId.trim()
            : existing.assignedClassId,
        passwordSalt: salt,
        passwordHash: hash,
        updatedAt: now,
      };
      users[existingIdx] = registeredUser;
    } else {
      registeredUser = {
        id: `user-${role}-${Date.now()}`,
        email: normalizedEmail,
        fullName: fullName.trim(),
        nipNuptk: typeof nipNuptk === 'string' ? nipNuptk.trim() : '',
        nrks: role === 'wali_kelas' ? 'WK' : 'GR',
        role,
        isActive: true,
        assignedClassId:
          role === 'wali_kelas' && typeof assignedClassId === 'string' && assignedClassId.trim()
            ? assignedClassId.trim()
            : undefined,
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: now,
        updatedAt: now,
      };
      users.push(registeredUser);
    }

    saveUsers(users);
    const token = signSessionToken({
      sub: registeredUser.id,
      role: registeredUser.role,
      isDemo: false,
    });
    res.status(201).json({ token, user: sanitizeUser(registeredUser, true) });
  });

  // Email + Password Login
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }

    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) {
      res.status(401).json({ error: 'Email atau kata sandi tidak sesuai.' });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: 'Akun ini sedang dinonaktifkan oleh Admin Sekolah.' });
      return;
    }

    const envAdminMatch = user.role === 'admin' && verifyEnvPasscode(password);
    const hashMatch =
      user.passwordHash && user.passwordSalt
        ? verifyScryptPassword(password, user.passwordSalt, user.passwordHash)
        : false;

    if (!envAdminMatch && !hashMatch) {
      if (!user.passwordHash && user.role === 'admin' && !isAdminClaimed(users)) {
        res.status(401).json({
          error: 'Akun Admin belum diaktifkan. Gunakan tab "Aktivasi Admin" untuk membuat kata sandi Admin.',
        });
        return;
      }
      res.status(401).json({
        error: user.passwordHash
          ? 'Email atau kata sandi tidak sesuai.'
          : 'Akun belum memiliki kata sandi. Silakan aktifkan melalui tab "Daftar Guru / Wali" atau hubungi Admin Sekolah.',
      });
      return;
    }

    const token = signSessionToken({ sub: user.id, role: user.role, isDemo: false });
    res.json({ token, user: sanitizeUser(user, true) });
  });

  // Validate active session
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({
      user: sanitizeUser(req.authUser!, true),
    });
  });

  // Change own password (for authenticated users)
  app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }

    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === req.authUser!.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Akun tidak ditemukan.' });
      return;
    }

    const currentUser = users[idx];
    const verifiedCurrent =
      (currentUser.role === 'admin' &&
        typeof currentPassword === 'string' &&
        verifyEnvPasscode(currentPassword)) ||
      (currentUser.passwordHash &&
        currentUser.passwordSalt &&
        typeof currentPassword === 'string' &&
        verifyScryptPassword(currentPassword, currentUser.passwordSalt, currentUser.passwordHash));

    if (!verifiedCurrent) {
      res.status(401).json({ error: 'Kata sandi saat ini tidak sesuai.' });
      return;
    }

    const { salt, hash } = hashPassword(newPassword);
    users[idx] = {
      ...currentUser,
      passwordSalt: salt,
      passwordHash: hash,
      updatedAt: new Date().toISOString(),
    };
    saveUsers(users);

    res.json({ ok: true, message: 'Kata sandi berhasil diperbarui.' });
  });

  // Staff directory (authenticated)
  app.get('/api/users', requireAuth, (req: AuthenticatedRequest, res) => {
    const users = loadUsers();
    const isAdmin = req.authUser?.role === 'admin';
    res.json({
      users: users.map((u) => sanitizeUser(u, isAdmin || u.id === req.authUser?.id)),
    });
  });

  // Admin: Create new user account with role & initial password
  app.post('/api/users', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const { email, fullName, nipNuptk, nrks, role, password, assignedClassId } = req.body as {
      email?: string;
      fullName?: string;
      nipNuptk?: string;
      nrks?: string;
      role?: unknown;
      password?: string;
      assignedClassId?: string;
    };

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Format email tidak valid.' });
      return;
    }
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Nama lengkap wajib diisi (minimal 2 karakter).' });
      return;
    }
    if (!isValidRole(role)) {
      res.status(400).json({ error: 'Role harus admin, guru, atau wali_kelas.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Kata sandi awal minimal 6 karakter.' });
      return;
    }

    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();
    if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'Email tersebut sudah terdaftar pada akun lain.' });
      return;
    }

    const now = new Date().toISOString();
    const { salt, hash } = hashPassword(password);
    const created: StoredAuthUser = {
      id: `user-${role}-${Date.now()}`,
      email: normalizedEmail,
      fullName: fullName.trim(),
      nipNuptk: typeof nipNuptk === 'string' ? nipNuptk.trim() : '',
      nrks: typeof nrks === 'string' ? nrks.trim() : '',
      role,
      isActive: true,
      assignedClassId:
        role === 'wali_kelas' && typeof assignedClassId === 'string' && assignedClassId.trim()
          ? assignedClassId.trim()
          : undefined,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: now,
      updatedAt: now,
    };

    users.push(created);
    saveUsers(users);
    res.status(201).json({ user: sanitizeUser(created, true) });
  });

  // Admin: Update user profile, role, active state, or reset password
  app.patch('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const targetId = req.params.id;
    const { fullName, nipNuptk, nrks, role, isActive, assignedClassId, newPassword } = req.body as {
      fullName?: string;
      nipNuptk?: string;
      nrks?: string;
      role?: unknown;
      isActive?: boolean;
      assignedClassId?: string | null;
      newPassword?: string;
    };

    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === targetId);
    if (idx < 0) {
      res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      return;
    }

    const current = users[idx];
    const nextRole = role !== undefined ? (isValidRole(role) ? role : null) : current.role;
    if (!nextRole) {
      res.status(400).json({ error: 'Role tidak valid.' });
      return;
    }

    const nextIsActive = typeof isActive === 'boolean' ? isActive : current.isActive;
    const activeAdminsAfter = users.filter((u) =>
      u.id === current.id ? nextRole === 'admin' && nextIsActive : u.role === 'admin' && u.isActive
    ).length;

    if (activeAdminsAfter === 0) {
      res.status(400).json({
        error: 'Sistem harus menyisakan minimal 1 akun Admin yang aktif.',
      });
      return;
    }

    let nextSalt = current.passwordSalt;
    let nextHash = current.passwordHash;
    if (typeof newPassword === 'string' && newPassword.length > 0) {
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      const hashed = hashPassword(newPassword);
      nextSalt = hashed.salt;
      nextHash = hashed.hash;
    }

    const updated: StoredAuthUser = {
      ...current,
      fullName:
        typeof fullName === 'string' && fullName.trim().length >= 2
          ? fullName.trim()
          : current.fullName,
      nipNuptk: typeof nipNuptk === 'string' ? nipNuptk.trim() : current.nipNuptk,
      nrks: typeof nrks === 'string' ? nrks.trim() : current.nrks,
      role: nextRole,
      isActive: nextIsActive,
      assignedClassId:
        nextRole === 'wali_kelas'
          ? assignedClassId === null
            ? undefined
            : typeof assignedClassId === 'string'
              ? assignedClassId.trim() || undefined
              : current.assignedClassId
          : undefined,
      passwordSalt: nextSalt,
      passwordHash: nextHash,
      updatedAt: new Date().toISOString(),
    };

    users[idx] = updated;
    saveUsers(users);
    res.json({ user: sanitizeUser(updated, true) });
  });

  // Admin: Delete user account
  app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const targetId = req.params.id;
    if (req.authUser!.id === targetId) {
      res.status(400).json({ error: 'Tidak dapat menghapus akun yang sedang digunakan.' });
      return;
    }

    const users = loadUsers();
    const target = users.find((u) => u.id === targetId);
    if (!target) {
      res.status(404).json({ error: 'Akun tidak ditemukan.' });
      return;
    }

    const remaining = users.filter((u) => u.id !== targetId);
    const activeAdminsLeft = remaining.filter((u) => u.role === 'admin' && u.isActive).length;
    if (activeAdminsLeft === 0) {
      res.status(400).json({ error: 'Sistem harus menyisakan minimal 1 akun Admin aktif.' });
      return;
    }

    saveUsers(remaining);
    res.json({ ok: true });
  });

  // Shared Multi-Teacher Academic State Sync (Protected by Bearer Auth & Role Boundaries)
  app.get('/api/school-state', requireAuth, (_req: AuthenticatedRequest, res) => {
    const state = loadSchoolState();
    if (!state) {
      res.json({ initialized: false });
      return;
    }
    res.json({ initialized: true, state });
  });

  app.put('/api/school-state', requireAuth, (req: AuthenticatedRequest, res) => {
    const role = req.authUser!.role;
    const incoming = req.body as Partial<StoredSchoolState>;
    const existing: StoredSchoolState = loadSchoolState() || {
      updatedAt: new Date().toISOString(),
    };

    const next: StoredSchoolState = {
      ...existing,
      updatedAt: new Date().toISOString(),
      updatedBy: req.authUser!.fullName,
    };

    if (role === 'admin') {
      if (incoming.settings && typeof incoming.settings === 'object') {
        next.settings = incoming.settings;
      }
      if (Array.isArray(incoming.classes)) next.classes = incoming.classes;
      if (Array.isArray(incoming.subjects)) next.subjects = incoming.subjects;
      if (Array.isArray(incoming.students)) next.students = incoming.students;
      if (Array.isArray(incoming.grades)) next.grades = incoming.grades;
      if (Array.isArray(incoming.homeroomRecords)) {
        next.homeroomRecords = incoming.homeroomRecords;
      }
      if (Array.isArray(incoming.gradeSubmissions)) {
        next.gradeSubmissions = incoming.gradeSubmissions;
      }
    } else if (role === 'guru') {
      if (Array.isArray(incoming.grades)) next.grades = incoming.grades;
      if (Array.isArray(incoming.gradeSubmissions)) {
        next.gradeSubmissions = incoming.gradeSubmissions;
      }
      if (Array.isArray(incoming.subjects) && Array.isArray(existing.subjects)) {
        // Guru can update TP list & SAS title on existing subjects
        const incomingMap = new Map(
          incoming.subjects
            .filter((s): s is { id: string; tpList?: unknown; sasTitle?: unknown } =>
              Boolean(s && typeof s === 'object' && 'id' in s)
            )
            .map((s) => [s.id, s])
        );
        next.subjects = existing.subjects.map((sub) => {
          if (!sub || typeof sub !== 'object' || !('id' in sub)) return sub;
          const patch = incomingMap.get(String((sub as { id: string }).id));
          if (!patch) return sub;
          return {
            ...sub,
            tpList: patch.tpList ?? (sub as { tpList?: unknown }).tpList,
            sasTitle: patch.sasTitle ?? (sub as { sasTitle?: unknown }).sasTitle,
          };
        });
      }
    } else if (role === 'wali_kelas') {
      if (Array.isArray(incoming.grades)) next.grades = incoming.grades;
      if (Array.isArray(incoming.homeroomRecords)) {
        next.homeroomRecords = incoming.homeroomRecords;
      }
      if (Array.isArray(incoming.gradeSubmissions)) {
        next.gradeSubmissions = incoming.gradeSubmissions;
      }
      if (Array.isArray(incoming.subjects) && Array.isArray(existing.subjects)) {
        const incomingMap = new Map(
          incoming.subjects
            .filter((s): s is { id: string; tpList?: unknown; sasTitle?: unknown } =>
              Boolean(s && typeof s === 'object' && 'id' in s)
            )
            .map((s) => [s.id, s])
        );
        next.subjects = existing.subjects.map((sub) => {
          if (!sub || typeof sub !== 'object' || !('id' in sub)) return sub;
          const patch = incomingMap.get(String((sub as { id: string }).id));
          if (!patch) return sub;
          return {
            ...sub,
            tpList: patch.tpList ?? (sub as { tpList?: unknown }).tpList,
            sasTitle: patch.sasTitle ?? (sub as { sasTitle?: unknown }).sasTitle,
          };
        });
      }
    }

    const saved = saveSchoolState(next);
    res.json({ ok: true, updatedAt: saved.updatedAt });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server E-Raport SMA Pasundan 9 berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
