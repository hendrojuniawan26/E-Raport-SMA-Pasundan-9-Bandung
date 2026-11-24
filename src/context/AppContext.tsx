import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  INITIAL_SCHOOL_SETTINGS,
} from '../data/seedData';
import {
  fetchRecentSupabaseNotifications,
  PostgresStudentGradeRow,
  publishGradeRealtimeNotification,
  subscribeGradeRealtimeNotifications,
} from '../lib/realtimeNotifications';
import {
  clearServerSupabaseConfigRemote,
  createEphemeralSupabaseClient,
  getSupabaseClient,
  getSupabaseConfig,
  loadServerSupabaseConfig,
  saveRuntimeSupabaseConfig,
  saveServerSupabaseConfigRemote,
  SupabaseConfigSource,
  testSupabaseConnection,
} from '../lib/supabase';
import {
  fetchSchoolStateFromSupabase,
  generateUuid,
  isUuid,
  syncSchoolDataToSupabase,
} from '../lib/supabaseSync';
import {
  ClassRoom,
  ConnectionMode,
  GradeNotification,
  GradeSubmission,
  HomeroomRecord,
  RealtimeConnectionStatus,
  SchoolSettings,
  Student,
  Subject,
  SubjectGrade,
  SyncStatus,
  UserProfile,
  UserRole,
} from '../types/raport';
import { recalculateSubjectGrade } from '../utils/gradeCalculator';

const STORAGE_KEY = 'pasundan9_eraport_state_v4';
const LEGACY_STORAGE_KEY = 'pasundan9_eraport_state_v3';
const NOTIF_STORAGE_KEY = 'pasundan9_eraport_notifications_v1';
const READ_NOTIF_IDS_KEY = 'pasundan9_eraport_read_notif_ids_v1';
const AUTH_TOKEN_KEY = 'pasundan9_auth_token_v1';

function loadStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function loadStoredNotifications(): GradeNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GradeNotification[]).slice(0, 50) : [];
  } catch {
    return [];
  }
}

function loadReadNotificationIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(READ_NOTIF_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadNotificationIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(READ_NOTIF_IDS_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {
    // ignore storage quota
  }
}

interface PersistedState {
  settings: SchoolSettings;
  users: UserProfile[];
  classes: ClassRoom[];
  subjects: Subject[];
  students: Student[];
  grades: SubjectGrade[];
  homeroomRecords: HomeroomRecord[];
  gradeSubmissions?: GradeSubmission[];
}

function loadInitialState(): PersistedState {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed.settings && Array.isArray(parsed.students) && Array.isArray(parsed.subjects)) {
          return {
            ...parsed,
            users: Array.isArray(parsed.users) ? parsed.users : [],
            classes: Array.isArray(parsed.classes) ? parsed.classes : [],
            subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
            students: Array.isArray(parsed.students) ? parsed.students : [],
            grades: Array.isArray(parsed.grades) ? parsed.grades : [],
            homeroomRecords: Array.isArray(parsed.homeroomRecords) ? parsed.homeroomRecords : [],
            settings: {
              ...parsed.settings,
              logoUrl: parsed.settings.logoUrl || INITIAL_SCHOOL_SETTINGS.logoUrl,
            },
            gradeSubmissions: Array.isArray(parsed.gradeSubmissions)
              ? parsed.gradeSubmissions
              : [],
          };
        }
      }
    } catch {
      // ignore corrupted local storage
    }
  }
  return {
    settings: INITIAL_SCHOOL_SETTINGS,
    users: [],
    classes: [],
    subjects: [],
    students: [],
    grades: [],
    homeroomRecords: [],
    gradeSubmissions: [],
  };
}

export type ActiveTab =
  | 'dashboard'
  | 'input_nilai'
  | 'wali_kelas'
  | 'raport'
  | 'master_data';

export type GuruSubTab = 'olah_nilai' | 'atur_tp' | 'sikap';
export type WaliSubTab = 'performa' | 'absensi' | 'ekskul_p5' | 'leger' | 'kiriman_guru';
export type ReportPaperSize = 'A4' | 'F4';

export interface AuthUserSummary extends UserProfile {
  hasPassword?: boolean;
}

export interface AuthSystemStatus {
  adminClaimed: boolean;
  envPasscodeConfigured: boolean;
  usersCount: number;
  serverReachable?: boolean;
  statusChecked?: boolean;
}

interface AppContextValue {
  currentUser: UserProfile | null;
  authStatus: AuthSystemStatus;
  refreshAuthStatus: () => Promise<void>;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  guruSubTab: GuruSubTab;
  setGuruSubTab: (sub: GuruSubTab) => void;
  openGuruSection: (sub: GuruSubTab, classId?: string, subjectId?: string) => void;
  waliSubTab: WaliSubTab;
  setWaliSubTab: (sub: WaliSubTab) => void;
  openWaliSection: (sub: WaliSubTab, classId?: string) => void;
  reportPaperSize: ReportPaperSize;
  setReportPaperSize: (size: ReportPaperSize) => void;
  focusedClassId: string;
  setFocusedClassId: (classId: string) => void;
  focusedSubjectId: string;
  setFocusedSubjectId: (subjectId: string) => void;
  openGradeInput: (classId: string, subjectId?: string) => void;
  connectionMode: ConnectionMode;
  syncStatus: SyncStatus;
  lastSavedAt: string;
  supabaseMessage: string;
  supabaseConfigSource: SupabaseConfigSource;
  supabaseSessionActive: boolean;
  settings: SchoolSettings;
  users: AuthUserSummary[];
  classes: ClassRoom[];
  subjects: Subject[];
  students: Student[];
  grades: SubjectGrade[];
  homeroomRecords: HomeroomRecord[];
  gradeSubmissions: GradeSubmission[];
  // Auth & User Management
  loginWithEmailPassword: (
    email: string,
    password: string,
    expectedRole?: UserRole
  ) => Promise<{ ok: boolean; error?: string }>;
  registerTeacherAccount: (payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    role: 'guru' | 'wali_kelas';
    assignedClassId?: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  claimFirstAdmin: (payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ ok: boolean; error?: string }>;
  createUserAccount: (payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    nrks?: string;
    role: UserRole;
    password: string;
    assignedClassId?: string;
  }) => Promise<{ ok: boolean; error?: string; warning?: string }>;
  updateUserAccount: (
    userId: string,
    patch: {
      fullName?: string;
      nipNuptk?: string;
      nrks?: string;
      role?: UserRole;
      isActive?: boolean;
      assignedClassId?: string | null;
      newPassword?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteUserAccount: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  // Mutations with auto-save
  updateSettings: (next: SchoolSettings) => void;
  setClasses: React.Dispatch<React.SetStateAction<ClassRoom[]>>;
  setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  setUsers: React.Dispatch<React.SetStateAction<AuthUserSummary[]>>;
  upsertGrade: (grade: SubjectGrade) => void;
  bulkUpsertGrades: (incoming: SubjectGrade[]) => void;
  upsertHomeroomRecord: (record: HomeroomRecord) => void;
  getGradeSubmission: (classId: string, subjectId: string) => GradeSubmission | undefined;
  lockGrades: (classId: string, subjectId: string) => void;
  unlockGrades: (classId: string, subjectId: string) => void;
  sendGradesToHomeroom: (classId: string, subjectId: string, note?: string) => void;
  syncFromSupabase: () => Promise<{ ok: boolean; message: string }>;
  pushLocalDataToSupabase: () => Promise<{ ok: boolean; message: string }>;
  configureSupabase: (url: string, anonKey: string) => Promise<{ ok: boolean; message: string }>;
  disconnectSupabase: () => Promise<void>;
  // Realtime Notifications for Wali Kelas
  notifications: GradeNotification[];
  unreadNotificationCount: number;
  realtimeStatus: RealtimeConnectionStatus;
  latestToastNotification: GradeNotification | null;
  dismissToastNotification: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(() => loadInitialState(), []);

  const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
  const [authToken, setAuthTokenState] = useState<string | null>(loadStoredAuthToken);
  const setAuthToken = (token: string | null) => {
    setAuthTokenState(token);
    if (typeof window !== 'undefined') {
      try {
        if (token) {
          window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
        } else {
          window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
        }
      } catch {
        // ignore storage quota
      }
    }
  };
  const [authStatus, setAuthStatus] = useState<AuthSystemStatus>({
    adminClaimed: false,
    envPasscodeConfigured: false,
    usersCount: 0,
    serverReachable: true,
    statusChecked: false,
  });
  const [activeTab, setActiveTabState] = useState<ActiveTab>('dashboard');
  const [guruSubTab, setGuruSubTab] = useState<GuruSubTab>('olah_nilai');
  const [waliSubTab, setWaliSubTab] = useState<WaliSubTab>('absensi');
  const [reportPaperSize, setReportPaperSize] = useState<ReportPaperSize>('A4');
  const [focusedClassId, setFocusedClassId] = useState<string>(initial.classes[0]?.id || '');
  const [focusedSubjectId, setFocusedSubjectId] = useState<string>(initial.subjects[0]?.id || '');

  const setActiveTab = (tab: ActiveTab) => {
    if (
      currentUser?.role === 'guru' &&
      (tab === 'raport' || tab === 'wali_kelas' || tab === 'master_data')
    ) {
      setActiveTabState('input_nilai');
      return;
    }
    if (currentUser?.role === 'wali_kelas' && tab === 'master_data') {
      setActiveTabState('wali_kelas');
      return;
    }
    setActiveTabState(tab);
  };

  const openGradeInput = (classId: string, subjectId?: string) => {
    setFocusedClassId(classId);
    if (subjectId) setFocusedSubjectId(subjectId);
    setGuruSubTab('olah_nilai');
    setActiveTab('input_nilai');
  };

  const openGuruSection = (sub: GuruSubTab, classId?: string, subjectId?: string) => {
    if (classId) setFocusedClassId(classId);
    if (subjectId) setFocusedSubjectId(subjectId);
    setGuruSubTab(sub);
    setActiveTab('input_nilai');
  };

  const openWaliSection = (sub: WaliSubTab, classId?: string) => {
    if (classId) setFocusedClassId(classId);
    setWaliSubTab(sub);
    setActiveTab('wali_kelas');
  };

  const [settings, setSettings] = useState<SchoolSettings>(initial.settings);
  const [users, setUsers] = useState<AuthUserSummary[]>(initial.users);
  const [classes, setClasses] = useState<ClassRoom[]>(initial.classes);
  const [subjects, setSubjects] = useState<Subject[]>(initial.subjects);
  const [students, setStudents] = useState<Student[]>(initial.students);
  const [grades, setGrades] = useState<SubjectGrade[]>(initial.grades);
  const [homeroomRecords, setHomeroomRecords] = useState<HomeroomRecord[]>(
    initial.homeroomRecords
  );
  const [gradeSubmissions, setGradeSubmissions] = useState<GradeSubmission[]>(
    initial.gradeSubmissions || []
  );

  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(() => {
    const cfg = getSupabaseConfig();
    return cfg.url && cfg.anonKey ? 'supabase' : 'offline';
  });
  const [supabaseConfigSource, setSupabaseConfigSource] = useState<SupabaseConfigSource>(
    () => getSupabaseConfig().source
  );
  const [supabaseSessionActive, setSupabaseSessionActive] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved_local');
  const [supabaseMessage, setSupabaseMessage] = useState<string>(
    'Mode Offline-Fallback aktif — auto-save lokal berjalan otomatis.'
  );
  const [lastSavedAt, setLastSavedAt] = useState<string>(
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  );
  const [notifications, setNotifications] = useState<GradeNotification[]>(loadStoredNotifications);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('disconnected');
  const [latestToastNotification, setLatestToastNotification] =
    useState<GradeNotification | null>(null);

  const saveTimerRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);
  const skipNextRemoteSyncRef = useRef(false);
  const gradeNotifyTimersRef = useRef<Map<string, number>>(new Map());
  const readNotifIdsRef = useRef<Set<string>>(loadReadNotificationIds());
  const latestDataRef = useRef({
    students,
    classes,
    subjects,
    currentUser,
    authToken,
  });
  latestDataRef.current = {
    students,
    classes,
    subjects,
    currentUser,
    authToken,
  };

  const applyAuthenticatedFocus = (
    user: AuthUserSummary,
    overrideSubjects?: Subject[],
    overrideClasses?: ClassRoom[]
  ) => {
    const subjectList = overrideSubjects || subjects;
    const classList = overrideClasses || classes;
    if (user.role === 'guru') {
      const assignedSub = subjectList.find((s) => s.teacherId === user.id);
      if (assignedSub) setFocusedSubjectId(assignedSub.id);
      setActiveTabState('input_nilai');
    } else if (user.role === 'wali_kelas') {
      const assignedCls =
        classList.find((c) => c.id === user.assignedClassId) ||
        classList.find((c) => c.homeroomTeacherId === user.id);
      if (assignedCls) setFocusedClassId(assignedCls.id);
      setActiveTabState('dashboard');
    } else {
      setActiveTabState('dashboard');
    }
  };

  const safeParseAuthResponse = async <T extends object>(
    res: Response
  ): Promise<{ ok: boolean; status: number; data?: T; rawError?: string }> => {
    if (res.redirected && res.url.includes('__cookie_check')) {
      return {
        ok: false,
        status: 401,
        rawError:
          'Browser memblokir cookie sesi pratinjau. Izinkan cookie untuk situs ini atau gunakan tab "Masuk Akun" melalui Supabase.',
      };
    }

    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as T;
      return { ok: res.ok, status: res.status, data: parsed };
    } catch {
      if (res.status === 404) {
        return {
          ok: false,
          status: res.status,
          rawError:
            'Layanan backend (/api) tidak aktif di URL ini (404). Aplikasi berjalan di mode koneksi langsung Supabase.',
        };
      }
      if (res.status >= 500) {
        return {
          ok: false,
          status: res.status,
          rawError: `Server sedang memulai ulang atau sibuk (HTTP ${res.status}). Tunggu beberapa detik lalu coba lagi.`,
        };
      }
      return {
        ok: false,
        status: res.status,
        rawError: 'Respon server bukan JSON yang valid.',
      };
    }
  };

  const refreshAuthStatus = async () => {
    const attempt = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
        const parsed = await safeParseAuthResponse<AuthSystemStatus>(res);
        if (parsed.ok && parsed.data) {
          setAuthStatus({
            ...parsed.data,
            serverReachable: true,
            statusChecked: true,
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const okFirst = await attempt();
    if (okFirst) return;

    await new Promise((resolve) => setTimeout(resolve, 700));
    const okRetry = await attempt();
    if (!okRetry) {
      setAuthStatus((prev) => ({
        ...prev,
        serverReachable: false,
        statusChecked: true,
      }));
    }
  };

  const fetchAuthorizedUsers = async (token: string) => {
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { users: AuthUserSummary[] };
        if (Array.isArray(data.users)) {
          setUsers(data.users);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadSchoolStateFromServer = async (
    token: string,
    role?: UserRole
  ): Promise<{ subjects?: Subject[]; classes?: ClassRoom[] }> => {
    try {
      const res = await fetch('/api/school-state', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return {};
      const data = (await res.json()) as {
        initialized?: boolean;
        state?: Partial<PersistedState> & { updatedAt?: string };
      };

      if (data.initialized && data.state) {
        const remote = data.state;
        skipNextRemoteSyncRef.current = true;
        if (remote.settings) {
          setSettings({
            ...remote.settings,
            logoUrl: remote.settings.logoUrl || INITIAL_SCHOOL_SETTINGS.logoUrl,
          });
        }
        if (Array.isArray(remote.classes)) setClasses(remote.classes);
        if (Array.isArray(remote.subjects)) setSubjects(remote.subjects);
        if (Array.isArray(remote.students)) setStudents(remote.students);
        if (Array.isArray(remote.grades)) setGrades(remote.grades);
        if (Array.isArray(remote.homeroomRecords)) setHomeroomRecords(remote.homeroomRecords);
        if (Array.isArray(remote.gradeSubmissions)) setGradeSubmissions(remote.gradeSubmissions);
        return {
          subjects: Array.isArray(remote.subjects) ? remote.subjects : undefined,
          classes: Array.isArray(remote.classes) ? remote.classes : undefined,
        };
      }

      if (!data.initialized && role === 'admin') {
        await fetch('/api/school-state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            settings,
            classes,
            subjects,
            students,
            grades,
            homeroomRecords,
            gradeSubmissions,
          }),
        }).catch(() => {});
      }
    } catch {
      // ignore network error and keep local state
    }
    return {};
  };

  const syncFromSupabaseInternal = async (): Promise<{
    ok: boolean;
    message: string;
    subjects?: Subject[];
    classes?: ClassRoom[];
  }> => {
    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, message: 'Koneksi Supabase belum terkonfigurasi.' };
    }
    const res = await fetchSchoolStateFromSupabase(client);
    if (!res.ok || !res.data) {
      return {
        ok: false,
        message: res.error || 'Gagal mengambil data dari Supabase.',
      };
    }

    const loaded = res.data;
    skipNextRemoteSyncRef.current = true;
    if (loaded.settings) setSettings(loaded.settings);
    if (loaded.users && loaded.users.length > 0) setUsers(loaded.users);
    setClasses(loaded.classes);
    setSubjects(loaded.subjects);
    setStudents(loaded.students);
    setGrades(loaded.grades);
    setHomeroomRecords(loaded.homeroomRecords);
    setGradeSubmissions(loaded.gradeSubmissions);

    return {
      ok: true,
      message: `Data disinkronkan dari Supabase (${loaded.classes.length} kelas, ${loaded.subjects.length} mapel, ${loaded.students.length} siswa).`,
      subjects: loaded.subjects,
      classes: loaded.classes,
    };
  };

  const syncFromSupabase = async () => {
    const result = await syncFromSupabaseInternal();
    if (result.ok) {
      setConnectionMode('supabase');
      setSyncStatus('connected');
      setSupabaseMessage(result.message);
    } else {
      setSyncStatus('error');
      setSupabaseMessage(result.message);
    }
    return { ok: result.ok, message: result.message };
  };

  const pushLocalDataToSupabase = async (): Promise<{ ok: boolean; message: string }> => {
    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, message: 'Konfigurasi URL & Anon Key Supabase belum diisi.' };
    }
    if (!currentUser) {
      return { ok: false, message: 'Silakan masuk terlebih dahulu sebelum menyinkronkan data.' };
    }
    setSyncStatus('syncing');
    const res = await syncSchoolDataToSupabase(client, {
      role: currentUser.role,
      settings,
      classes,
      subjects,
      students,
      grades,
      homeroomRecords,
      gradeSubmissions,
    });
    if (res.ok) {
      setConnectionMode('supabase');
      setSyncStatus('connected');
      const msg = `Data sekolah berhasil disinkronkan ke Supabase (${classes.length} kelas, ${subjects.length} mapel, ${students.length} siswa).`;
      setSupabaseMessage(msg);
      return { ok: true, message: msg };
    }
    const errMsg = res.error || 'Gagal menyinkronkan data ke Supabase.';
    setSyncStatus('error');
    setSupabaseMessage(errMsg);
    return { ok: false, message: errMsg };
  };

  // Keep focusedClassId and focusedSubjectId valid whenever classes/subjects load from Supabase
  useEffect(() => {
    if (classes.length === 0) {
      if (focusedClassId !== '') setFocusedClassId('');
    } else if (!classes.some((c) => c.id === focusedClassId)) {
      setFocusedClassId(classes[0].id);
    }
  }, [classes, focusedClassId]);

  useEffect(() => {
    if (subjects.length === 0) {
      if (focusedSubjectId !== '') setFocusedSubjectId('');
    } else if (!subjects.some((s) => s.id === focusedSubjectId)) {
      setFocusedSubjectId(subjects[0].id);
    }
  }, [subjects, focusedSubjectId]);

  // Check Auth Status & load shared cross-browser Supabase connectivity on mount
  useEffect(() => {
    refreshAuthStatus();

    const restoreExpressSession = async () => {
      const storedToken = loadStoredAuthToken();
      if (!storedToken) return false;
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (!res.ok) {
          setAuthToken(null);
          return false;
        }
        const data = (await res.json()) as { user?: AuthUserSummary };
        if (data.user) {
          await loadSchoolStateFromServer(storedToken, data.user.role);
          await fetchAuthorizedUsers(storedToken);
          setCurrentUser((prev) => prev || data.user!);
          return true;
        }
      } catch {
        // ignore if /api is unreachable
      }
      return false;
    };

    const initSupabase = async () => {
      await restoreExpressSession();
      const cfg = await loadServerSupabaseConfig();
      setSupabaseConfigSource(cfg.source);

      if (cfg.url && cfg.anonKey) {
        const res = await testSupabaseConnection();
        setSupabaseSessionActive(Boolean(res.hasSession));
        if (res.ok) {
          setConnectionMode('supabase');
          setSyncStatus(res.tablesReady && res.hasSession ? 'connected' : res.hasSession ? 'error' : 'connected');
          setSupabaseMessage(res.message);
        } else {
          setConnectionMode(cfg.url && cfg.anonKey ? 'supabase' : 'offline');
          setSyncStatus('error');
          setSupabaseMessage(res.message);
        }

        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getSession();
          const authUser = data.session?.user;
          setSupabaseSessionActive(Boolean(authUser));
          if (authUser) {
            const { data: profile } = await client
              .from('profiles')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle();

            const sbSync = await syncFromSupabaseInternal();
            if (!sbSync.ok) {
              setSyncStatus('error');
              setSupabaseMessage(sbSync.message);
            }

            if (profile) {
              const mapped: AuthUserSummary = {
                id: profile.id,
                email: profile.email,
                fullName: profile.full_name,
                nipNuptk: profile.nip_nuptk || '',
                nrks: profile.nrks || '',
                role: profile.role,
                avatarUrl: profile.avatar_url || undefined,
                isActive: true,
              };
              setCurrentUser(mapped);
              applyAuthenticatedFocus(mapped, sbSync.subjects, sbSync.classes);
            }
          } else if (res.ok && res.tablesReady) {
            await syncFromSupabaseInternal().catch(() => {});
          }
        }
      }
    };

    initSupabase();
  }, []);

  // Auto-recover auth server reachability while on login screen if server was restarting
  useEffect(() => {
    if (currentUser || !authStatus.statusChecked || authStatus.serverReachable !== false) {
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      if (cancelled || attempts >= 5) {
        window.clearInterval(timer);
        return;
      }
      attempts += 1;
      try {
        const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
        const parsed = await safeParseAuthResponse<AuthSystemStatus>(res);
        if (!cancelled && parsed.ok && parsed.data) {
          setAuthStatus({
            ...parsed.data,
            serverReachable: true,
            statusChecked: true,
          });
          window.clearInterval(timer);
        }
      } catch {
        // keep polling silently
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser, authStatus.statusChecked, authStatus.serverReachable]);

  // Persist notifications locally whenever updated
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)));
    } catch {
      // ignore storage quota
    }
  }, [notifications]);

  const shouldAcceptNotificationForUser = (incoming: GradeNotification): boolean => {
    const { currentUser: activeUser, classes: allClasses } = latestDataRef.current;
    if (!activeUser) return false;
    if (activeUser.role === 'guru') return false;
    if (incoming.teacherId && incoming.teacherId === activeUser.id) return false;

    if (activeUser.role === 'wali_kelas') {
      const waliClassId =
        activeUser.assignedClassId ||
        allClasses.find((c) => c.homeroomTeacherId === activeUser.id)?.id;
      if (waliClassId && incoming.classId !== waliClassId) {
        return false;
      }
    }
    return true;
  };

  const pushIncomingNotification = (incoming: GradeNotification, showToast: boolean) => {
    if (!shouldAcceptNotificationForUser(incoming)) return;
    const alreadyRead = readNotifIdsRef.current.has(incoming.id);
    const normalized: GradeNotification = {
      ...incoming,
      read: alreadyRead || incoming.read,
    };

    let inserted = false;
    setNotifications((prev) => {
      if (prev.some((n) => n.id === normalized.id)) {
        return prev;
      }
      inserted = true;
      return [normalized, ...prev].slice(0, 50);
    });

    if (inserted && showToast && !normalized.read) {
      setLatestToastNotification(normalized);
    }
  };

  // Subscribe to Supabase Realtime channel for live grade notifications
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !currentUser) {
      setRealtimeStatus('disconnected');
      return;
    }

    const unsubscribe = subscribeGradeRealtimeNotifications({
      client,
      onBroadcastNotification: (notif) => {
        pushIncomingNotification(notif, true);
        const token = latestDataRef.current.authToken;
        const role = latestDataRef.current.currentUser?.role;
        if (token && role && role !== 'guru') {
          loadSchoolStateFromServer(token, role).catch(() => {});
        }
      },
      onPostgresNotificationInsert: (notif) => {
        pushIncomingNotification(notif, true);
      },
      onPostgresGradeChange: (row: PostgresStudentGradeRow) => {
        const { students: stuList, subjects: subList, classes: clsList, authToken: token, currentUser: user } =
          latestDataRef.current;
        const stu = stuList.find((s) => s.id === row.student_id);
        const sub = subList.find((s) => s.id === row.subject_id);
        if (!stu || !sub) return;
        const cls = clsList.find((c) => c.id === stu.classId);
        const score = typeof row.nilai_akhir === 'number' ? row.nilai_akhir : Number(row.nilai_akhir) || 0;
        if (score <= 0) return;

        const pred =
          row.predikat === 'A' || row.predikat === 'B' || row.predikat === 'C' || row.predikat === 'D'
            ? row.predikat
            : undefined;

        pushIncomingNotification(
          {
            id: `pg-${stu.id}-${sub.id}-${row.updated_at || Date.now()}`,
            type: 'single_grade',
            classId: stu.classId,
            className: cls?.name || stu.classId,
            subjectId: sub.id,
            subjectName: sub.name,
            subjectCode: sub.code,
            studentId: stu.id,
            studentName: stu.fullName,
            nilaiAkhir: score,
            predikat: pred,
            teacherName: sub.teacherName || 'Guru Mata Pelajaran',
            actorRole: 'guru',
            message: `${sub.teacherName || 'Guru Mapel'} menginput nilai ${sub.name} untuk ${stu.fullName} (${score.toFixed(1)})`,
            createdAt: row.updated_at || new Date().toISOString(),
            read: false,
          },
          true
        );

        if (token && user && user.role !== 'guru') {
          loadSchoolStateFromServer(token, user.role).catch(() => {});
        }
      },
      onStatusChange: (status) => {
        setRealtimeStatus(status);
      },
    });

    if (currentUser.role !== 'guru') {
      fetchRecentSupabaseNotifications(client, 25)
        .then((items) => {
          items.reverse().forEach((item) => pushIncomingNotification(item, false));
        })
        .catch(() => {});
    }

    return () => {
      unsubscribe();
    };
  }, [currentUser?.id, supabaseConfigSource, connectionMode]);

  // Debounced Auto-Save to LocalStorage + Multi-Teacher Server Sync + Supabase Sync
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const shouldSkipRemoteSync = skipNextRemoteSyncRef.current;
    if (shouldSkipRemoteSync) {
      skipNextRemoteSyncRef.current = false;
    }

    setSyncStatus('syncing');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      const payload: PersistedState = {
        settings,
        users,
        classes,
        subjects,
        students,
        grades,
        homeroomRecords,
        gradeSubmissions,
      };

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setLastSavedAt(
          new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );

        if (authToken && currentUser && !shouldSkipRemoteSync) {
          const remoteBody: Partial<PersistedState> = {
            grades,
            gradeSubmissions,
            subjects,
          };
          if (currentUser.role === 'wali_kelas' || currentUser.role === 'admin') {
            remoteBody.homeroomRecords = homeroomRecords;
          }
          if (currentUser.role === 'admin') {
            remoteBody.settings = settings;
            remoteBody.classes = classes;
            remoteBody.students = students;
          }
          await fetch('/api/school-state', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(remoteBody),
          }).catch(() => {});
        }

        const client = getSupabaseClient();
        if (client && connectionMode === 'supabase' && currentUser && !shouldSkipRemoteSync) {
          const sbPush = await syncSchoolDataToSupabase(client, {
            role: currentUser.role,
            settings,
            classes,
            subjects,
            students,
            grades,
            homeroomRecords,
            gradeSubmissions,
          });
          if (sbPush.ok) {
            setSyncStatus('connected');
          } else {
            setSyncStatus('error');
            if (sbPush.error) setSupabaseMessage(sbPush.error);
          }
        } else if (client && connectionMode === 'supabase') {
          setSyncStatus('connected');
        } else {
          setSyncStatus('saved_local');
        }
      } catch {
        setSyncStatus('saved_local');
      }
    }, 450);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [
    settings,
    users,
    classes,
    subjects,
    students,
    grades,
    homeroomRecords,
    gradeSubmissions,
    connectionMode,
    authToken,
    currentUser,
  ]);

  const updateSettings = (next: SchoolSettings) => {
    setSettings(next);
    // Recalculate all grades when weights or thresholds change
    setGrades((prev) =>
      prev.map((g) => {
        const sub = subjects.find((s) => s.id === g.subjectId);
        return sub ? recalculateSubjectGrade(g, sub, next) : g;
      })
    );
  };

  const upsertGrade = (grade: SubjectGrade) => {
    const normalizedGrade: SubjectGrade = {
      ...grade,
      id: isUuid(grade.id) ? grade.id : generateUuid(),
    };
    setGrades((prev) => {
      const idx = prev.findIndex(
        (g) => g.studentId === normalizedGrade.studentId && g.subjectId === normalizedGrade.subjectId
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = normalizedGrade;
        return copy;
      }
      return [...prev, normalizedGrade];
    });

    const client = getSupabaseClient();
    if (
      client &&
      connectionMode === 'supabase' &&
      isUuid(normalizedGrade.studentId) &&
      isUuid(normalizedGrade.subjectId)
    ) {
      client
        .from('student_grades')
        .upsert(
          {
            id: normalizedGrade.id,
            student_id: normalizedGrade.studentId,
            subject_id: normalizedGrade.subjectId,
            academic_year: normalizedGrade.academicYear,
            semester: normalizedGrade.semester,
            tp_scores: normalizedGrade.tpScores,
            sas_ppk: normalizedGrade.sasPpk,
            sas_prk: normalizedGrade.sasPrk,
            kehadiran: normalizedGrade.kehadiran,
            proses: normalizedGrade.proses,
            tugas: normalizedGrade.tugas,
            p3_scores: normalizedGrade.p3Scores,
            nilai_akhir: normalizedGrade.nilaiAkhir,
            predikat: normalizedGrade.predikat,
            deskripsi_auto: normalizedGrade.deskripsiAuto,
            deskripsi_manual: normalizedGrade.deskripsiManual || null,
          },
          { onConflict: 'student_id,subject_id,academic_year,semester' }
        )
        .then(() => {});
    }

    // Debounced Supabase Realtime notification when Guru inputs/updates a student's grade
    if (client && grade.nilaiAkhir > 0) {
      const debounceKey = `${grade.studentId}__${grade.subjectId}`;
      const existingTimer = gradeNotifyTimersRef.current.get(debounceKey);
      if (existingTimer) window.clearTimeout(existingTimer);

      const timer = window.setTimeout(() => {
        gradeNotifyTimersRef.current.delete(debounceKey);
        const {
          students: stuList,
          subjects: subList,
          classes: clsList,
          currentUser: activeUser,
        } = latestDataRef.current;
        const stu = stuList.find((s) => s.id === grade.studentId);
        const sub = subList.find((s) => s.id === grade.subjectId);
        if (!stu || !sub) return;
        const cls = clsList.find((c) => c.id === stu.classId);
        const actorName = activeUser?.fullName || sub.teacherName || 'Guru Mata Pelajaran';
        const actorRole = activeUser?.role || 'guru';

        publishGradeRealtimeNotification(client, {
          id: `rt-${stu.id}-${sub.id}-${Date.now()}`,
          type: 'single_grade',
          classId: stu.classId,
          className: cls?.name || stu.classId,
          subjectId: sub.id,
          subjectName: sub.name,
          subjectCode: sub.code,
          studentId: stu.id,
          studentName: stu.fullName,
          nilaiAkhir: grade.nilaiAkhir,
          predikat: grade.predikat,
          teacherId: activeUser?.id,
          teacherName: actorName,
          actorRole,
          message: `${actorName} menginput nilai ${sub.name} untuk ${stu.fullName} (Nilai Akhir: ${grade.nilaiAkhir.toFixed(1)} · ${grade.predikat})`,
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(() => {});
      }, 1200);

      gradeNotifyTimersRef.current.set(debounceKey, timer);
    }
  };

  const bulkUpsertGrades = (incoming: SubjectGrade[]) => {
    setGrades((prev) => {
      const map = new Map<string, SubjectGrade>();
      prev.forEach((g) => map.set(`${g.studentId}__${g.subjectId}`, g));
      incoming.forEach((g) => map.set(`${g.studentId}__${g.subjectId}`, g));
      return Array.from(map.values());
    });

    const client = getSupabaseClient();
    if (client && incoming.length > 0) {
      const {
        students: stuList,
        subjects: subList,
        classes: clsList,
        currentUser: activeUser,
      } = latestDataRef.current;
      const groups = new Map<string, { classId: string; subjectId: string; count: number }>();

      incoming.forEach((g) => {
        if (g.nilaiAkhir <= 0) return;
        const stu = stuList.find((s) => s.id === g.studentId);
        if (!stu) return;
        const key = `${stu.classId}__${g.subjectId}`;
        const prev = groups.get(key);
        groups.set(key, {
          classId: stu.classId,
          subjectId: g.subjectId,
          count: (prev?.count || 0) + 1,
        });
      });

      groups.forEach(({ classId, subjectId, count }) => {
        const cls = clsList.find((c) => c.id === classId);
        const sub = subList.find((s) => s.id === subjectId);
        if (!cls || !sub) return;
        const actorName = activeUser?.fullName || sub.teacherName || 'Guru Mata Pelajaran';
        publishGradeRealtimeNotification(client, {
          id: `rt-batch-${classId}-${subjectId}-${Date.now()}`,
          type: 'batch_grade',
          classId,
          className: cls.name,
          subjectId,
          subjectName: sub.name,
          subjectCode: sub.code,
          studentCount: count,
          teacherId: activeUser?.id,
          teacherName: actorName,
          actorRole: activeUser?.role || 'guru',
          message: `${actorName} memperbarui nilai ${sub.name} untuk ${count} siswa kelas ${cls.name}`,
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(() => {});
      });
    }
  };

  const upsertHomeroomRecord = (record: HomeroomRecord) => {
    const normalized: HomeroomRecord = {
      ...record,
      id: isUuid(record.id) ? record.id : generateUuid(),
    };
    setHomeroomRecords((prev) => {
      const idx = prev.findIndex((r) => r.studentId === normalized.studentId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = normalized;
        return copy;
      }
      return [...prev, normalized];
    });
  };

  const getGradeSubmission = (classId: string, subjectId: string) =>
    gradeSubmissions.find(
      (s) =>
        s.classId === classId &&
        s.subjectId === subjectId &&
        s.academicYear === settings.academicYear &&
        s.semester === settings.semester
    );

  const upsertSubmission = (nextSub: GradeSubmission) => {
    setGradeSubmissions((prev) => {
      const idx = prev.findIndex((s) => s.id === nextSub.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = nextSub;
        return copy;
      }
      return [...prev, nextSub];
    });
  };

  const lockGrades = (classId: string, subjectId: string) => {
    const now = new Date().toISOString();
    const existing = getGradeSubmission(classId, subjectId);
    const id = existing?.id && isUuid(existing.id) ? existing.id : generateUuid();
    upsertSubmission({
      ...(existing || {}),
      id,
      classId,
      subjectId,
      academicYear: settings.academicYear,
      semester: settings.semester,
      status: 'locked',
      lockedAt: now,
      lockedBy: currentUser?.fullName || 'Guru Mapel',
      updatedAt: now,
    });
  };

  const unlockGrades = (classId: string, subjectId: string) => {
    const now = new Date().toISOString();
    const existing = getGradeSubmission(classId, subjectId);
    const id = existing?.id && isUuid(existing.id) ? existing.id : generateUuid();
    upsertSubmission({
      ...(existing || {}),
      id,
      classId,
      subjectId,
      academicYear: settings.academicYear,
      semester: settings.semester,
      status: 'draft',
      lockedAt: undefined,
      lockedBy: undefined,
      sentAt: undefined,
      sentBy: undefined,
      updatedAt: now,
    });
  };

  const sendGradesToHomeroom = (classId: string, subjectId: string, note?: string) => {
    const now = new Date().toISOString();
    const existing = getGradeSubmission(classId, subjectId);
    const id = existing?.id && isUuid(existing.id) ? existing.id : generateUuid();
    upsertSubmission({
      ...(existing || {}),
      id,
      classId,
      subjectId,
      academicYear: settings.academicYear,
      semester: settings.semester,
      status: 'sent',
      lockedAt: existing?.lockedAt || now,
      lockedBy: existing?.lockedBy || currentUser?.fullName || 'Guru Mapel',
      sentAt: now,
      sentBy: currentUser?.fullName || 'Guru Mapel',
      note: note?.trim() || existing?.note,
      updatedAt: now,
    });

    const client = getSupabaseClient();
    if (client) {
      const cls = classes.find((c) => c.id === classId);
      const sub = subjects.find((s) => s.id === subjectId);
      const actorName = currentUser?.fullName || sub?.teacherName || 'Guru Mata Pelajaran';
      if (cls && sub) {
        publishGradeRealtimeNotification(client, {
          id: `rt-sent-${classId}-${subjectId}-${Date.now()}`,
          type: 'submission_sent',
          classId,
          className: cls.name,
          subjectId,
          subjectName: sub.name,
          subjectCode: sub.code,
          teacherId: currentUser?.id,
          teacherName: actorName,
          actorRole: currentUser?.role || 'guru',
          message: `${actorName} mengirim nilai final ${sub.name} kelas ${cls.name} ke Wali Kelas`,
          createdAt: now,
          read: false,
        }).catch(() => {});
      }
    }
  };

  const loginWithEmailPassword = async (
    email: string,
    password: string,
    expectedRole?: UserRole
  ): Promise<{ ok: boolean; error?: string }> => {
    const roleLabels: Record<UserRole, string> = {
      admin: 'Admin / Operator',
      guru: 'Guru Mata Pelajaran',
      wali_kelas: 'Wali Kelas',
    };
    const client = getSupabaseClient();
    let supabaseErrorMessage = '';

    if (client) {
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (!error && data.user) {
          const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
          const safeMetaRole: UserRole =
            meta.role === 'wali_kelas' ? 'wali_kelas' : 'guru';

          let activeProfile: Record<string, unknown> | null = null;
          let profileQueryError: string | null = null;
          try {
            const { data: profile, error: profErr } = await client
              .from('profiles')
              .select('*')
              .eq('id', data.user.id)
              .maybeSingle();
            if (profErr) {
              profileQueryError = profErr.message;
            } else {
              activeProfile = (profile as Record<string, unknown> | null) || null;
            }
          } catch (err) {
            profileQueryError = err instanceof Error ? err.message : 'Gagal membaca profil.';
          }

          let serverVerifiedAuth: { token: string; user: AuthUserSummary } | null = null;
          const profileRoleRaw = activeProfile?.role;

          try {
            const srvRes = await fetch('/api/auth/login', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            });
            const srvParsed = await safeParseAuthResponse<{
              token?: string;
              user?: AuthUserSummary;
            }>(srvRes);
            if (srvParsed.ok && srvParsed.data?.token && srvParsed.data?.user) {
              serverVerifiedAuth = {
                token: srvParsed.data.token,
                user: srvParsed.data.user,
              };
            }
          } catch {
            // ignore if backend /api is unavailable
          }

          if (profileRoleRaw && serverVerifiedAuth && profileRoleRaw === 'admin') {
            serverVerifiedAuth.user = {
              ...serverVerifiedAuth.user,
              role: 'admin',
            };
          }

          if (!serverVerifiedAuth && !activeProfile) {
            await client.auth.signOut().catch(() => {});
            if (profileQueryError && expectedRole === 'admin') {
              return {
                ok: false,
                error: `Tabel profiles di Supabase belum siap (${profileQueryError}). Jalankan skrip SQL di Supabase SQL Editor lalu pastikan role akun di tabel profiles adalah 'admin'.`,
              };
            }
            return {
              ok: false,
              error:
                'Akun ini belum didaftarkan oleh Admin Sekolah. Hanya Admin yang dapat mendaftarkan akun baru.',
            };
          }

          const finalProfileRole = activeProfile?.role;
          const resolvedRole: UserRole =
            serverVerifiedAuth?.user.role ||
            (finalProfileRole === 'admin' ||
            finalProfileRole === 'wali_kelas' ||
            finalProfileRole === 'guru'
              ? finalProfileRole
              : safeMetaRole);

          if (expectedRole && resolvedRole !== expectedRole) {
            await client.auth.signOut().catch(() => {});
            return {
              ok: false,
              error: `Akun ini terdaftar sebagai ${roleLabels[resolvedRole]}, bukan ${roleLabels[expectedRole]}. Silakan pilih role "${roleLabels[resolvedRole]}".`,
            };
          }

          const mapped: AuthUserSummary = serverVerifiedAuth
            ? {
                ...serverVerifiedAuth.user,
                id: activeProfile?.id ? String(activeProfile.id) : serverVerifiedAuth.user.id,
              }
            : {
                id: data.user.id,
                email:
                  (typeof activeProfile?.email === 'string' && activeProfile.email) ||
                  data.user.email ||
                  email.trim().toLowerCase(),
                fullName:
                  (typeof activeProfile?.full_name === 'string' && activeProfile.full_name) ||
                  (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
                  email.split('@')[0],
                nipNuptk:
                  (typeof activeProfile?.nip_nuptk === 'string' && activeProfile.nip_nuptk) ||
                  (typeof meta.nip_nuptk === 'string' ? meta.nip_nuptk : ''),
                nrks: typeof activeProfile?.nrks === 'string' ? activeProfile.nrks : '',
                role: resolvedRole,
                avatarUrl:
                  typeof activeProfile?.avatar_url === 'string'
                    ? activeProfile.avatar_url
                    : undefined,
                assignedClassId:
                  typeof meta.assigned_class_id === 'string'
                    ? meta.assigned_class_id
                    : undefined,
                isActive: true,
              };

          if (serverVerifiedAuth) {
            setAuthToken(serverVerifiedAuth.token);
            await loadSchoolStateFromServer(serverVerifiedAuth.token, mapped.role);
            await fetchAuthorizedUsers(serverVerifiedAuth.token);
          }

          setCurrentUser(mapped);
          setSupabaseSessionActive(true);
          setConnectionMode('supabase');
          const sbSync = await syncFromSupabaseInternal();
          if (sbSync.ok) {
            if (mapped.role === 'admin' && activeProfile?.role !== 'admin') {
              setSyncStatus('error');
              setSupabaseMessage(
                `Login Admin berhasil, namun profil Supabase (${mapped.email}) belum berstatus "admin". Jalankan skrip SQL di tab Database Supabase & SQL atau jalankan: UPDATE public.profiles SET role = 'admin' WHERE email = '${mapped.email}'; di Supabase SQL Editor.`
              );
            } else {
              setSyncStatus('connected');
              setSupabaseMessage(sbSync.message);
            }
          } else {
            setSyncStatus('error');
            setSupabaseMessage(sbSync.message);
          }
          applyAuthenticatedFocus(
            mapped,
            sbSync.ok && (sbSync.subjects?.length || 0) > 0 ? sbSync.subjects : undefined,
            sbSync.ok && (sbSync.classes?.length || 0) > 0 ? sbSync.classes : undefined
          );
          return { ok: true };
        }
        if (error) {
          supabaseErrorMessage = error.message;
        }
      } catch (err) {
        supabaseErrorMessage =
          err instanceof Error ? err.message : 'Gagal menghubungi server Supabase Auth.';
      }
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, expectedRole }),
      });
      const parsed = await safeParseAuthResponse<{
        token?: string;
        user?: AuthUserSummary;
        error?: string;
      }>(res);
      if (parsed.rawError) {
        if (client) {
          const lower = supabaseErrorMessage.toLowerCase();
          if (lower.includes('email not confirmed')) {
            return {
              ok: false,
              error:
                'Email belum terkonfirmasi di Supabase Auth. Jalankan skrip SQL terbaru di tab Database Supabase & SQL atau nonaktifkan "Confirm email" di Supabase Authentication agar akun langsung aktif tanpa verifikasi email.',
            };
          }
          if (lower.includes('invalid login credentials') || !supabaseErrorMessage) {
            return {
              ok: false,
              error:
                'Email atau kata sandi salah, atau akun belum didaftarkan oleh Admin Sekolah.',
            };
          }
          return {
            ok: false,
            error: `Gagal login melalui Supabase Auth: ${supabaseErrorMessage}`,
          };
        }
        return { ok: false, error: parsed.rawError };
      }
      const data = parsed.data || {};
      if (!parsed.ok || !data.token || !data.user) {
        return {
          ok: false,
          error: data.error || 'Email atau kata sandi tidak sesuai.',
        };
      }
      const synced = await loadSchoolStateFromServer(data.token, data.user.role);
      let hasSbSession = false;
      if (client) {
        const { data: existingSession } = await client.auth.getSession();
        hasSbSession = Boolean(existingSession.session);
        if (!hasSbSession && supabaseErrorMessage.toLowerCase().includes('invalid login credentials')) {
          try {
            const { data: signUpData } = await client.auth.signUp({
              email: email.trim().toLowerCase(),
              password,
              options: {
                data: {
                  full_name: data.user.fullName,
                  nip_nuptk: data.user.nipNuptk || '',
                  ...(data.user.role !== 'admin' ? { role: data.user.role } : {}),
                },
              },
            });
            hasSbSession = Boolean(signUpData.session);
            if (!hasSbSession && signUpData.user) {
              const { data: signInRetry } = await client.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
              });
              hasSbSession = Boolean(signInRetry.session);
            }
          } catch {
            // keep Express session active even if Supabase signUp fails
          }
        }
      }
      setSupabaseSessionActive(hasSbSession);

      const sbSync = hasSbSession
        ? await syncFromSupabaseInternal()
        : { ok: false, message: '', subjects: undefined, classes: undefined };

      setAuthToken(data.token);
      setCurrentUser(data.user);
      if (client && !hasSbSession) {
        setSyncStatus('error');
        setSupabaseMessage(
          'Login berhasil melalui server sekolah, namun sesi Supabase Auth belum aktif (buat/konfirmasi akun ini di Supabase Authentication → Users dan jalankan skrip SQL di tab Database Supabase & SQL agar data tersinkron ke Supabase).'
        );
      } else if (hasSbSession && !sbSync.ok) {
        setSyncStatus('error');
        setSupabaseMessage(sbSync.message);
      } else if (hasSbSession && sbSync.ok) {
        setSyncStatus('connected');
        setSupabaseMessage(sbSync.message);
      }

      applyAuthenticatedFocus(
        data.user,
        sbSync.ok && (sbSync.classes?.length || 0) > 0 ? sbSync.subjects : synced.subjects,
        sbSync.ok && (sbSync.classes?.length || 0) > 0 ? sbSync.classes : synced.classes
      );
      await fetchAuthorizedUsers(data.token);
      return { ok: true };
    } catch {
      if (client) {
        return {
          ok: false,
          error: supabaseErrorMessage
            ? `Gagal login melalui Supabase Auth: ${supabaseErrorMessage}`
            : 'Email atau kata sandi belum terdaftar di Supabase Auth (atau tidak cocok).',
        };
      }
      return {
        ok: false,
        error:
          'Tidak dapat terhubung ke server autentikasi. Pastikan server berjalan atau coba muat ulang halaman.',
      };
    }
  };

  const registerTeacherAccount = async (_payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    role: 'guru' | 'wali_kelas';
    assignedClassId?: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    return {
      ok: false,
      error:
        'Pendaftaran mandiri dinonaktifkan. Hanya Admin Sekolah yang dapat mendaftarkan akun baru.',
    };
  };

  const claimFirstAdmin = async (payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/claim-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeParseAuthResponse<{
        token?: string;
        user?: AuthUserSummary;
        error?: string;
      }>(res);
      if (parsed.rawError) {
        return { ok: false, error: parsed.rawError };
      }
      const data = parsed.data || {};
      if (!parsed.ok || !data.token || !data.user) {
        return { ok: false, error: data.error || 'Gagal mengklaim akun Admin.' };
      }
      const synced = await loadSchoolStateFromServer(data.token, data.user.role);
      const sbSync = await syncFromSupabaseInternal();
      setAuthToken(data.token);
      setCurrentUser(data.user);
      applyAuthenticatedFocus(
        data.user,
        sbSync.ok ? sbSync.subjects : synced.subjects,
        sbSync.ok ? sbSync.classes : synced.classes
      );
      await refreshAuthStatus();
      await fetchAuthorizedUsers(data.token);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Tidak dapat terhubung ke server aktivasi Admin.' };
    }
  };

  const changeOwnPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (authToken) {
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const parsed = await safeParseAuthResponse<{ ok?: boolean; error?: string }>(res);
        if (!parsed.rawError) {
          const data = parsed.data || {};
          if (!parsed.ok) {
            return { ok: false, error: data.error || 'Gagal memperbarui kata sandi.' };
          }
          return { ok: true };
        }
      } catch {
        // fall through to Supabase Auth password change if /api unreachable
      }
    }

    const client = getSupabaseClient();
    if (!client || !currentUser?.email) {
      return { ok: false, error: 'Sesi login tidak ditemukan.' };
    }
    const { error: verifyErr } = await client.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    if (verifyErr) {
      return { ok: false, error: 'Kata sandi saat ini tidak sesuai.' };
    }
    const { error: updateErr } = await client.auth.updateUser({ password: newPassword });
    if (updateErr) {
      return { ok: false, error: `Gagal memperbarui kata sandi: ${updateErr.message}` };
    }
    return { ok: true };
  };

  const createUserAccount = async (payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    nrks?: string;
    role: UserRole;
    password: string;
    assignedClassId?: string;
  }): Promise<{ ok: boolean; error?: string; warning?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Hanya Admin Sekolah yang dapat membuat akun pengguna baru.' };
    }

    const cleanEmail = payload.email.trim().toLowerCase();
    const cleanName = payload.fullName.trim();
    const cleanNip = (payload.nipNuptk || '').trim();
    const cleanNrks = (payload.nrks || '').trim();

    const syncNewUserToSupabase = async (): Promise<{
      ok: boolean;
      user?: AuthUserSummary;
      autoConfirmed?: boolean;
      error?: string;
    }> => {
      const mainClient = getSupabaseClient();
      const ephemeralClient = createEphemeralSupabaseClient();
      if (!mainClient || !ephemeralClient) {
        return { ok: false, error: 'Koneksi Supabase belum terkonfigurasi.' };
      }

      const { data: sessionCheck } = await mainClient.auth.getSession();
      if (!sessionCheck.session) {
        return {
          ok: false,
          error:
            'Sesi Supabase Auth Admin belum aktif. Keluar lalu masuk kembali menggunakan akun Admin agar pembuatan akun tersinkron ke Supabase.',
        };
      }

      // 1. Prioritaskan RPC admin_create_user (bekerja langsung aktif tanpa verifikasi email
      //    meskipun "Allow new users to sign up" dimatikan di Supabase Auth)
      try {
        const { data: rpcUserId, error: rpcErr } = await mainClient.rpc('admin_create_user', {
          p_email: cleanEmail,
          p_password: payload.password,
          p_full_name: cleanName,
          p_nip_nuptk: cleanNip,
          p_nrks: cleanNrks,
          p_role: payload.role,
          p_assigned_class_id:
            payload.role === 'wali_kelas' ? payload.assignedClassId || null : null,
        });

        if (!rpcErr && typeof rpcUserId === 'string' && rpcUserId.length > 0) {
          return {
            ok: true,
            autoConfirmed: true,
            user: {
              id: rpcUserId,
              email: cleanEmail,
              fullName: cleanName,
              nipNuptk: cleanNip,
              nrks: cleanNrks,
              role: payload.role,
              assignedClassId:
                payload.role === 'wali_kelas' ? payload.assignedClassId : undefined,
              isActive: true,
              hasPassword: true,
            },
          };
        }

        if (rpcErr) {
          const msg = rpcErr.message.toLowerCase();
          const code = rpcErr.code || '';
          const missingOrNoPriv =
            code === '42883' ||
            code === 'PGRST202' ||
            code === '42501' ||
            msg.includes('could not find the function') ||
            msg.includes('does not exist') ||
            msg.includes('permission denied');
          if (!missingOrNoPriv) {
            return { ok: false, error: rpcErr.message };
          }
        }
      } catch {
        // Fall through to ephemeralClient.auth.signUp when RPC is not yet installed
      }

      const { data: signUpData, error: signUpErr } = await ephemeralClient.auth.signUp({
        email: cleanEmail,
        password: payload.password,
        options: {
          data: {
            full_name: cleanName,
            nip_nuptk: cleanNip,
            ...(payload.role !== 'admin' ? { role: payload.role } : {}),
            assigned_class_id: payload.assignedClassId || null,
          },
        },
      });

      if (signUpErr) {
        const lower = signUpErr.message.toLowerCase();
        if (lower.includes('already registered') || lower.includes('already exists')) {
          return { ok: false, error: 'Email tersebut sudah terdaftar di Supabase Authentication.' };
        }
        if (lower.includes('signups are disabled') || lower.includes('signups not allowed')) {
          return {
            ok: false,
            error:
              'Gagal mendaftarkan ke Supabase Auth karena "Allow new users to sign up" dimatikan (Email signups are disabled). Jalankan skrip SQL terbaru dari tab Database Supabase & SQL di Supabase SQL Editor agar Admin bisa mendaftarkan akun via fungsi admin_create_user tanpa membuka pendaftaran publik, atau aktifkan "Allow new users to sign up" di Supabase Dashboard → Authentication → Providers → Email.',
          };
        }
        return { ok: false, error: `Gagal mendaftarkan ke Supabase Auth: ${signUpErr.message}` };
      }

      if (!signUpData.user) {
        return { ok: false, error: 'Gagal membuat akun di Supabase Auth.' };
      }

      const { error: profErr } = await mainClient.from('profiles').upsert(
        {
          id: signUpData.user.id,
          email: cleanEmail,
          full_name: cleanName,
          nip_nuptk: cleanNip,
          nrks: cleanNrks,
          role: payload.role,
        },
        { onConflict: 'id' }
      );
      if (profErr) {
        await ephemeralClient.auth.signOut().catch(() => {});
        return {
          ok: false,
          error: `Akun Auth dibuat, namun gagal menyimpan profil role di Supabase (${profErr.message}).`,
        };
      }

      let autoConfirmed = Boolean(signUpData.session);
      if (!autoConfirmed) {
        const { data: confirmCheck } = await ephemeralClient.auth.signInWithPassword({
          email: cleanEmail,
          password: payload.password,
        });
        autoConfirmed = Boolean(confirmCheck.session);
      }
      await ephemeralClient.auth.signOut().catch(() => {});

      return {
        ok: true,
        autoConfirmed,
        user: {
          id: signUpData.user.id,
          email: cleanEmail,
          fullName: cleanName,
          nipNuptk: cleanNip,
          nrks: cleanNrks,
          role: payload.role,
          assignedClassId: payload.role === 'wali_kelas' ? payload.assignedClassId : undefined,
          isActive: true,
          hasPassword: true,
        },
      };
    };

    if (authToken) {
      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(payload),
        });
        const parsed = await safeParseAuthResponse<{
          user?: AuthUserSummary;
          supabaseConfirmed?: boolean;
          error?: string;
        }>(res);
        if (!parsed.rawError) {
          const data = parsed.data || {};
          if (!parsed.ok || !data.user) {
            return { ok: false, error: data.error || 'Gagal menambah akun pengguna.' };
          }
          const createdUser = data.user;
          let warning: string | undefined;
          if (!data.supabaseConfirmed) {
            const sbMirror = await syncNewUserToSupabase().catch(() => null);
            if (sbMirror && !sbMirror.ok && sbMirror.error) {
              warning = `Akun aktif di Server Sekolah, namun sinkronisasi ke Supabase Auth gagal: ${sbMirror.error}`;
            } else if (sbMirror && sbMirror.ok && sbMirror.autoConfirmed === false) {
              warning =
                'Akun langsung aktif di Server Sekolah tanpa verifikasi email. Agar login Supabase di perangkat luar juga tanpa verifikasi email, jalankan SQL terbaru di tab Database Supabase & SQL atau nonaktifkan "Confirm email" di Supabase Dashboard.';
            }
          }
          setUsers((prev) => [...prev, createdUser]);
          if (createdUser.role === 'wali_kelas' && createdUser.assignedClassId) {
            setClasses((prev) =>
              prev.map((c) =>
                c.id === createdUser.assignedClassId
                  ? { ...c, homeroomTeacherId: createdUser.id }
                  : c
              )
            );
          }
          await refreshAuthStatus();
          return { ok: true, warning };
        }
      } catch {
        // fall through to direct Supabase mode if /api is unreachable
      }
    }

    const sbCreated = await syncNewUserToSupabase();
    if (!sbCreated.ok || !sbCreated.user) {
      return {
        ok: false,
        error: sbCreated.error || 'Sesi Admin tidak valid. Silakan keluar dan masuk kembali.',
      };
    }

    const createdUser = sbCreated.user;
    setUsers((prev) => {
      if (prev.some((u) => u.email.toLowerCase() === createdUser.email.toLowerCase())) {
        return prev.map((u) =>
          u.email.toLowerCase() === createdUser.email.toLowerCase() ? createdUser : u
        );
      }
      return [...prev, createdUser];
    });
    if (createdUser.role === 'wali_kelas' && createdUser.assignedClassId) {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === createdUser.assignedClassId
            ? { ...c, homeroomTeacherId: createdUser.id }
            : c
        )
      );
    }
    return {
      ok: true,
      warning:
        sbCreated.autoConfirmed === false
          ? 'Akun tersimpan di Supabase, tetapi pengaturan "Confirm email" Supabase masih aktif. Jalankan SQL terbaru di tab Database Supabase & SQL atau matikan "Confirm email" di Supabase Dashboard -> Authentication -> Providers -> Email agar langsung aktif tanpa verifikasi email.'
          : undefined,
    };
  };

  const updateUserAccount = async (
    userId: string,
    patch: {
      fullName?: string;
      nipNuptk?: string;
      nrks?: string;
      role?: UserRole;
      isActive?: boolean;
      assignedClassId?: string | null;
      newPassword?: string;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Hanya Admin Sekolah yang dapat memperbarui akun.' };
    }

    if (authToken) {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(patch),
        });
        const parsed = await safeParseAuthResponse<{ user?: AuthUserSummary; error?: string }>(res);
        if (!parsed.rawError) {
          const data = parsed.data || {};
          if (!parsed.ok || !data.user) {
            return { ok: false, error: data.error || 'Gagal memperbarui akun.' };
          }
          const updatedUser = data.user;
          setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
          if (currentUser?.id === userId) {
            setCurrentUser(updatedUser);
          }
          if (updatedUser.role === 'wali_kelas' && updatedUser.assignedClassId) {
            setClasses((prev) =>
              prev.map((c) =>
                c.id === updatedUser.assignedClassId
                  ? { ...c, homeroomTeacherId: updatedUser.id }
                  : c
              )
            );
          }
          await refreshAuthStatus();
          return { ok: true };
        }
      } catch {
        // fall through to Supabase update if /api is unreachable
      }
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, error: 'Sesi server tidak tersedia dan Supabase belum dikonfigurasi.' };
    }
    if (patch.newPassword) {
      return {
        ok: false,
        error:
          'Reset kata sandi langsung memerlukan koneksi server (/api) aktif atau dilakukan melalui Supabase Dashboard → Authentication → Users.',
      };
    }

    const target = users.find((u) => u.id === userId);
    const updatePayload: Record<string, unknown> = {};
    if (patch.fullName !== undefined) updatePayload.full_name = patch.fullName.trim();
    if (patch.nipNuptk !== undefined) updatePayload.nip_nuptk = patch.nipNuptk.trim();
    if (patch.nrks !== undefined) updatePayload.nrks = patch.nrks.trim();
    if (patch.role !== undefined) updatePayload.role = patch.role;

    const { error } = await client
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId);
    if (error) {
      return { ok: false, error: `Gagal memperbarui profil di Supabase: ${error.message}` };
    }

    const updatedUser: AuthUserSummary = {
      ...(target || {
        id: userId,
        email: '',
        fullName: patch.fullName || '',
        nipNuptk: '',
        role: patch.role || 'guru',
      }),
      ...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() } : {}),
      ...(patch.nipNuptk !== undefined ? { nipNuptk: patch.nipNuptk.trim() } : {}),
      ...(patch.nrks !== undefined ? { nrks: patch.nrks.trim() } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.assignedClassId !== undefined
        ? { assignedClassId: patch.assignedClassId || undefined }
        : {}),
    };
    setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
    if (currentUser?.id === userId) {
      setCurrentUser(updatedUser);
    }
    return { ok: true };
  };

  const deleteUserAccount = async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Hanya Admin Sekolah yang dapat menghapus akun.' };
    }

    if (authToken) {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const parsed = await safeParseAuthResponse<{ ok?: boolean; error?: string }>(res);
        if (!parsed.rawError) {
          const data = parsed.data || {};
          if (!parsed.ok) {
            return { ok: false, error: data.error || 'Gagal menghapus akun.' };
          }
          setUsers((prev) => prev.filter((u) => u.id !== userId));
          await refreshAuthStatus();
          return { ok: true };
        }
      } catch {
        // fall through to Supabase profile delete if /api is unreachable
      }
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, error: 'Sesi server tidak tersedia dan Supabase belum dikonfigurasi.' };
    }
    const { error } = await client.from('profiles').delete().eq('id', userId);
    if (error) {
      return { ok: false, error: `Gagal menghapus profil di Supabase: ${error.message}` };
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    return { ok: true };
  };

  const logout = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut().catch(() => {});
    }
    setSupabaseSessionActive(false);
    setAuthToken(null);
    setCurrentUser(null);
  };



  const configureSupabase = async (url: string, anonKey: string) => {
    saveRuntimeSupabaseConfig(url, anonKey);
    const remoteSave = await saveServerSupabaseConfigRemote(url, anonKey, authToken);
    const activeCfg = getSupabaseConfig();
    setSupabaseConfigSource(activeCfg.source);

    const res = await testSupabaseConnection();
    setSupabaseSessionActive(Boolean(res.hasSession));
    let finalMsg = res.message;
    if (res.ok && remoteSave.ok) {
      finalMsg = `${res.message} Tersimpan permanen di server — otomatis aktif saat dibuka di browser atau perangkat lain.`;
    } else if (!remoteSave.ok && remoteSave.error) {
      finalMsg = `${res.message} (Catatan server: ${remoteSave.error})`;
    }

    if (res.ok) {
      setConnectionMode('supabase');
      setSyncStatus(res.hasSession && res.tablesReady ? 'connected' : 'error');
      if (res.hasSession) {
        await syncFromSupabaseInternal().catch(() => {});
      }
    } else {
      setConnectionMode(activeCfg.url && activeCfg.anonKey ? 'supabase' : 'offline');
      setSyncStatus('error');
    }
    setSupabaseMessage(finalMsg);
    return { ok: res.ok, message: finalMsg };
  };

  const disconnectSupabase = async () => {
    await clearServerSupabaseConfigRemote(authToken);
    setSupabaseSessionActive(false);
    const activeCfg = getSupabaseConfig();
    setSupabaseConfigSource(activeCfg.source);
    if (activeCfg.url && activeCfg.anonKey) {
      const res = await testSupabaseConnection();
      setConnectionMode(res.ok ? 'supabase' : 'offline');
      setSyncStatus(res.ok ? 'connected' : 'saved_local');
      setSupabaseMessage(res.message);
    } else {
      setConnectionMode('offline');
      setSyncStatus('saved_local');
      setSupabaseMessage('Koneksi Supabase dihapus. Kembali ke Mode Offline-Fallback lokal.');
    }
  };

  const dismissToastNotification = () => {
    setLatestToastNotification(null);
  };

  const markNotificationRead = (id: string) => {
    readNotifIdsRef.current.add(id);
    saveReadNotificationIds(readNotifIdsRef.current);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (latestToastNotification?.id === id) {
      setLatestToastNotification(null);
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => {
      prev.forEach((n) => readNotifIdsRef.current.add(n.id));
      saveReadNotificationIds(readNotifIdsRef.current);
      return prev.map((n) => ({ ...n, read: true }));
    });
    setLatestToastNotification(null);
  };

  const clearNotifications = () => {
    setNotifications((prev) => {
      prev.forEach((n) => readNotifIdsRef.current.add(n.id));
      saveReadNotificationIds(readNotifIdsRef.current);
      return [];
    });
    setLatestToastNotification(null);
  };

  const visibleNotifications = useMemo(() => {
    if (!currentUser || currentUser.role === 'guru') return [];
    if (currentUser.role === 'wali_kelas') {
      const waliClassId =
        currentUser.assignedClassId ||
        classes.find((c) => c.homeroomTeacherId === currentUser.id)?.id;
      if (waliClassId) {
        return notifications.filter((n) => n.classId === waliClassId);
      }
    }
    return notifications;
  }, [notifications, currentUser, classes]);

  const unreadNotificationCount = useMemo(
    () => visibleNotifications.filter((n) => !n.read).length,
    [visibleNotifications]
  );

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authStatus,
        refreshAuthStatus,
        activeTab,
        setActiveTab,
        guruSubTab,
        setGuruSubTab,
        openGuruSection,
        waliSubTab,
        setWaliSubTab,
        openWaliSection,
        reportPaperSize,
        setReportPaperSize,
        focusedClassId,
        setFocusedClassId,
        focusedSubjectId,
        setFocusedSubjectId,
        openGradeInput,
        connectionMode,
        syncStatus,
        lastSavedAt,
        supabaseMessage,
        supabaseConfigSource,
        supabaseSessionActive,
        settings,
        users,
        classes,
        subjects,
        students,
        grades,
        homeroomRecords,
        gradeSubmissions,
        loginWithEmailPassword,
        registerTeacherAccount,
        claimFirstAdmin,
        changeOwnPassword,
        createUserAccount,
        updateUserAccount,
        deleteUserAccount,
        logout,
        updateSettings,
        setClasses,
        setSubjects,
        setStudents,
        setUsers,
        upsertGrade,
        bulkUpsertGrades,
        upsertHomeroomRecord,
        getGradeSubmission,
        lockGrades,
        unlockGrades,
        sendGradesToHomeroom,
        syncFromSupabase,
        pushLocalDataToSupabase,
        configureSupabase,
        disconnectSupabase,
        notifications: visibleNotifications,
        unreadNotificationCount,
        realtimeStatus,
        latestToastNotification,
        dismissToastNotification,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
