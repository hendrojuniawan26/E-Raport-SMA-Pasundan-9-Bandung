import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildInitialGrades,
  buildInitialHomeroomRecords,
  INITIAL_CLASSES,
  INITIAL_SCHOOL_SETTINGS,
  INITIAL_STUDENTS,
  INITIAL_SUBJECTS,
  INITIAL_USERS,
} from '../data/seedData';
import {
  clearServerSupabaseConfigRemote,
  getSupabaseClient,
  getSupabaseConfig,
  loadServerSupabaseConfig,
  saveRuntimeSupabaseConfig,
  saveServerSupabaseConfigRemote,
  SupabaseConfigSource,
  testSupabaseConnection,
} from '../lib/supabase';
import {
  ClassRoom,
  ConnectionMode,
  GradeSubmission,
  HomeroomRecord,
  SchoolSettings,
  Student,
  Subject,
  SubjectGrade,
  SyncStatus,
  UserProfile,
  UserRole,
} from '../types/raport';
import { recalculateSubjectGrade } from '../utils/gradeCalculator';

const STORAGE_KEY = 'pasundan9_eraport_state_v3';

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
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed.settings && Array.isArray(parsed.students) && Array.isArray(parsed.subjects)) {
          return {
            ...parsed,
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
    users: INITIAL_USERS,
    classes: INITIAL_CLASSES,
    subjects: INITIAL_SUBJECTS,
    students: INITIAL_STUDENTS,
    grades: buildInitialGrades(),
    homeroomRecords: buildInitialHomeroomRecords(),
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
export type WaliSubTab = 'absensi' | 'ekskul_p5' | 'leger' | 'kiriman_guru';
export type ReportPaperSize = 'A4' | 'F4';

export interface AuthUserSummary extends UserProfile {
  hasPassword?: boolean;
}

export interface AuthSystemStatus {
  adminClaimed: boolean;
  envPasscodeConfigured: boolean;
  demoEnabled: boolean;
  usersCount: number;
  demoAccounts: AuthUserSummary[];
}

interface AppContextValue {
  currentUser: UserProfile | null;
  isDemoSession: boolean;
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
  settings: SchoolSettings;
  users: AuthUserSummary[];
  classes: ClassRoom[];
  subjects: Subject[];
  students: Student[];
  grades: SubjectGrade[];
  homeroomRecords: HomeroomRecord[];
  gradeSubmissions: GradeSubmission[];
  // Auth & User Management
  loginWithRoleDemo: (role: UserRole, userId?: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithEmailPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
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
  }) => Promise<{ ok: boolean; error?: string }>;
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
  resetDemoData: () => void;
  configureSupabase: (url: string, anonKey: string) => Promise<{ ok: boolean; message: string }>;
  disconnectSupabase: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(() => loadInitialState(), []);

  const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isDemoSession, setIsDemoSession] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<AuthSystemStatus>({
    adminClaimed: false,
    envPasscodeConfigured: false,
    demoEnabled: true,
    usersCount: INITIAL_USERS.length,
    demoAccounts: INITIAL_USERS,
  });
  const [activeTab, setActiveTabState] = useState<ActiveTab>('dashboard');
  const [guruSubTab, setGuruSubTab] = useState<GuruSubTab>('olah_nilai');
  const [waliSubTab, setWaliSubTab] = useState<WaliSubTab>('absensi');
  const [reportPaperSize, setReportPaperSize] = useState<ReportPaperSize>('A4');
  const [focusedClassId, setFocusedClassId] = useState<string>('kelas-xi-ipas');
  const [focusedSubjectId, setFocusedSubjectId] = useState<string>('mapel-informatika');

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved_local');
  const [supabaseMessage, setSupabaseMessage] = useState<string>(
    'Mode Offline-Fallback aktif — auto-save lokal berjalan otomatis.'
  );
  const [lastSavedAt, setLastSavedAt] = useState<string>(
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  );

  const saveTimerRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);

  const applyAuthenticatedFocus = (user: AuthUserSummary) => {
    if (user.role === 'guru') {
      const assignedSub = subjects.find((s) => s.teacherId === user.id);
      if (assignedSub) setFocusedSubjectId(assignedSub.id);
      setActiveTabState('input_nilai');
    } else if (user.role === 'wali_kelas') {
      const assignedCls =
        classes.find((c) => c.id === user.assignedClassId) ||
        classes.find((c) => c.homeroomTeacherId === user.id);
      if (assignedCls) setFocusedClassId(assignedCls.id);
      setActiveTabState('wali_kelas');
    } else {
      setActiveTabState('dashboard');
    }
  };

  const refreshAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = (await res.json()) as AuthSystemStatus;
        setAuthStatus(data);
        if (data.demoAccounts && data.demoAccounts.length > 0) {
          setUsers(data.demoAccounts);
        }
      }
    } catch {
      // ignore if backend status endpoint unreachable during static preview
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

  // Check Auth Status & load shared cross-browser Supabase connectivity on mount
  useEffect(() => {
    refreshAuthStatus();

    const initSupabase = async () => {
      const cfg = await loadServerSupabaseConfig();
      setSupabaseConfigSource(cfg.source);

      if (cfg.url && cfg.anonKey) {
        const res = await testSupabaseConnection();
        if (res.ok) {
          setConnectionMode('supabase');
          setSyncStatus('connected');
          setSupabaseMessage(res.message);
        } else {
          setConnectionMode('offline');
          setSyncStatus('saved_local');
          setSupabaseMessage(res.message);
        }

        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getSession();
          const authUser = data.session?.user;
          if (authUser) {
            const { data: profile } = await client
              .from('profiles')
              .select('*')
              .eq('id', authUser.id)
              .single();
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
              setIsDemoSession(false);
              applyAuthenticatedFocus(mapped);
            }
          }
        }
      }
    };

    initSupabase();
  }, []);

  // Debounced Auto-Save to LocalStorage + Supabase Sync if connected
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
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

        const client = getSupabaseClient();
        if (client && connectionMode === 'supabase') {
          // Best-effort sync of school settings to Supabase
          await client.from('school_settings').upsert({
            id: settings.id,
            yayasan: settings.yayasan,
            school_name: settings.schoolName,
            npsn: settings.npsn,
            address: settings.address,
            academic_year: settings.academicYear,
            semester: settings.semester,
            principal_name: settings.principalName,
            principal_nip: settings.principalNip,
            report_city: settings.reportCity,
            report_date: settings.reportDate,
            default_kktp: settings.defaultKktp,
            threshold_baik: settings.thresholdBaik,
            weight_sumatif_ppk: settings.weights.sumatifPpk,
            weight_sumatif_prk: settings.weights.sumatifPrk,
            weight_sas: settings.weights.sas,
            weight_kehadiran: settings.weights.kehadiran,
            weight_proses: settings.weights.proses,
            weight_tugas: settings.weights.tugas,
            auto_prk_formula: settings.autoPrkFormula,
          });
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
    setGrades((prev) => {
      const idx = prev.findIndex(
        (g) => g.studentId === grade.studentId && g.subjectId === grade.subjectId
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = grade;
        return copy;
      }
      return [...prev, grade];
    });

    const client = getSupabaseClient();
    if (client && connectionMode === 'supabase') {
      client
        .from('student_grades')
        .upsert(
          {
            student_id: grade.studentId,
            subject_id: grade.subjectId,
            academic_year: grade.academicYear,
            semester: grade.semester,
            tp_scores: grade.tpScores,
            sas_ppk: grade.sasPpk,
            sas_prk: grade.sasPrk,
            kehadiran: grade.kehadiran,
            proses: grade.proses,
            tugas: grade.tugas,
            p3_scores: grade.p3Scores,
            nilai_akhir: grade.nilaiAkhir,
            predikat: grade.predikat,
            deskripsi_auto: grade.deskripsiAuto,
            deskripsi_manual: grade.deskripsiManual || null,
          },
          { onConflict: 'student_id,subject_id,academic_year,semester' }
        )
        .then(() => {});
    }
  };

  const bulkUpsertGrades = (incoming: SubjectGrade[]) => {
    setGrades((prev) => {
      const map = new Map<string, SubjectGrade>();
      prev.forEach((g) => map.set(`${g.studentId}__${g.subjectId}`, g));
      incoming.forEach((g) => map.set(`${g.studentId}__${g.subjectId}`, g));
      return Array.from(map.values());
    });
  };

  const upsertHomeroomRecord = (record: HomeroomRecord) => {
    setHomeroomRecords((prev) => {
      const idx = prev.findIndex((r) => r.studentId === record.studentId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = record;
        return copy;
      }
      return [...prev, record];
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
    const id = `${classId}__${subjectId}__${settings.academicYear}__${settings.semester}`;
    const existing = getGradeSubmission(classId, subjectId);
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
    const id = `${classId}__${subjectId}__${settings.academicYear}__${settings.semester}`;
    const existing = getGradeSubmission(classId, subjectId);
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
    const id = `${classId}__${subjectId}__${settings.academicYear}__${settings.semester}`;
    const existing = getGradeSubmission(classId, subjectId);
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
  };

  const loginWithRoleDemo = async (
    role: UserRole,
    userId?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, userId }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: AuthUserSummary;
        isDemo?: boolean;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        return {
          ok: false,
          error: data.error || 'Mode simulasi peran tidak tersedia.',
        };
      }
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setIsDemoSession(true);
      applyAuthenticatedFocus(data.user);
      await fetchAuthorizedUsers(data.token);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Gagal menghubungi server autentikasi.',
      };
    }
  };

  const loginWithEmailPassword = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (!error && data.user) {
        const { data: profile } = await client
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();
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
          setIsDemoSession(false);
          setConnectionMode('supabase');
          setSyncStatus('connected');
          applyAuthenticatedFocus(mapped);
          return { ok: true };
        }
      }
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: AuthUserSummary;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        return {
          ok: false,
          error: data.error || 'Email atau kata sandi tidak sesuai.',
        };
      }
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setIsDemoSession(false);
      applyAuthenticatedFocus(data.user);
      await fetchAuthorizedUsers(data.token);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Gagal menghubungi server login. Pastikan server berjalan.',
      };
    }
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
      const data = (await res.json()) as {
        token?: string;
        user?: AuthUserSummary;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        return { ok: false, error: data.error || 'Gagal mengklaim akun Admin.' };
      }
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setIsDemoSession(false);
      applyAuthenticatedFocus(data.user);
      await refreshAuthStatus();
      await fetchAuthorizedUsers(data.token);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal menghubungi server aktivasi Admin.' };
    }
  };

  const changeOwnPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!authToken) {
      return { ok: false, error: 'Sesi login tidak ditemukan.' };
    }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        return { ok: false, error: data.error || 'Gagal memperbarui kata sandi.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal menghubungi server.' };
    }
  };

  const createUserAccount = async (payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    nrks?: string;
    role: UserRole;
    password: string;
    assignedClassId?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!authToken) {
      return { ok: false, error: 'Sesi Admin tidak valid.' };
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { user?: AuthUserSummary; error?: string };
      if (!res.ok || !data.user) {
        return { ok: false, error: data.error || 'Gagal menambah akun pengguna.' };
      }
      const createdUser = data.user;
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
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal menghubungi server.' };
    }
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
    if (!authToken) {
      return { ok: false, error: 'Sesi Admin tidak valid.' };
    }
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { user?: AuthUserSummary; error?: string };
      if (!res.ok || !data.user) {
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
    } catch {
      return { ok: false, error: 'Gagal menghubungi server.' };
    }
  };

  const deleteUserAccount = async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!authToken) {
      return { ok: false, error: 'Sesi Admin tidak valid.' };
    }
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        return { ok: false, error: data.error || 'Gagal menghapus akun.' };
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      await refreshAuthStatus();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal menghubungi server.' };
    }
  };

  const logout = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut().catch(() => {});
    }
    setAuthToken(null);
    setIsDemoSession(false);
    setCurrentUser(null);
  };

  const resetDemoData = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setSettings(INITIAL_SCHOOL_SETTINGS);
    setUsers(INITIAL_USERS);
    setClasses(INITIAL_CLASSES);
    setSubjects(INITIAL_SUBJECTS);
    setStudents(INITIAL_STUDENTS);
    setGrades(buildInitialGrades());
    setHomeroomRecords(buildInitialHomeroomRecords());
    setGradeSubmissions([]);
  };

  const configureSupabase = async (url: string, anonKey: string) => {
    saveRuntimeSupabaseConfig(url, anonKey);
    const remoteSave = await saveServerSupabaseConfigRemote(url, anonKey, authToken);
    const activeCfg = getSupabaseConfig();
    setSupabaseConfigSource(activeCfg.source);

    const res = await testSupabaseConnection();
    let finalMsg = res.message;
    if (res.ok && remoteSave.ok) {
      finalMsg = `${res.message} Tersimpan permanen di server — otomatis aktif saat dibuka di browser atau perangkat lain.`;
    } else if (!remoteSave.ok && remoteSave.error) {
      finalMsg = `${res.message} (Catatan server: ${remoteSave.error})`;
    }

    if (res.ok) {
      setConnectionMode('supabase');
      setSyncStatus('connected');
    } else {
      setConnectionMode('offline');
      setSyncStatus('saved_local');
    }
    setSupabaseMessage(finalMsg);
    return { ok: res.ok, message: finalMsg };
  };

  const disconnectSupabase = async () => {
    await clearServerSupabaseConfigRemote(authToken);
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

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isDemoSession,
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
        settings,
        users,
        classes,
        subjects,
        students,
        grades,
        homeroomRecords,
        gradeSubmissions,
        loginWithRoleDemo,
        loginWithEmailPassword,
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
        resetDemoData,
        configureSupabase,
        disconnectSupabase,
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
