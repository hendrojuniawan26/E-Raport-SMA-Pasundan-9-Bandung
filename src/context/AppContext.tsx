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
  fetchRecentSupabaseNotifications,
  PostgresStudentGradeRow,
  publishGradeRealtimeNotification,
  subscribeGradeRealtimeNotifications,
} from '../lib/realtimeNotifications';
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

const STORAGE_KEY = 'pasundan9_eraport_state_v3';
const NOTIF_STORAGE_KEY = 'pasundan9_eraport_notifications_v1';
const READ_NOTIF_IDS_KEY = 'pasundan9_eraport_read_notif_ids_v1';

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
  settings: SchoolSettings;
  users: AuthUserSummary[];
  classes: ClassRoom[];
  subjects: Subject[];
  students: Student[];
  grades: SubjectGrade[];
  homeroomRecords: HomeroomRecord[];
  gradeSubmissions: GradeSubmission[];
  // Auth & User Management
  loginWithEmailPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
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
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthSystemStatus>({
    adminClaimed: false,
    envPasscodeConfigured: false,
    usersCount: INITIAL_USERS.length,
    serverReachable: true,
    statusChecked: false,
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
            'Layanan backend (/api) tidak ditemukan di URL ini (404). Jika Anda membuka Shared/Static URL, pastikan aplikasi dibuka melalui Development URL atau sudah dipublikasikan dengan server aktif.',
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
        rawError: 'Respon server bukan JSON yang valid. Pastikan server Express berjalan di port 3000.',
      };
    }
  };

  const refreshAuthStatus = async () => {
    const attempt = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/auth/status');
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
              applyAuthenticatedFocus(mapped);
            }
          }
        }
      }
    };

    initSupabase();
  }, []);

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
        return {
          ok: false,
          error: data.error || 'Email atau kata sandi tidak sesuai.',
        };
      }
      const synced = await loadSchoolStateFromServer(data.token, data.user.role);
      setAuthToken(data.token);
      setCurrentUser(data.user);
      applyAuthenticatedFocus(data.user, synced.subjects, synced.classes);
      await fetchAuthorizedUsers(data.token);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error:
          'Tidak dapat terhubung ke server autentikasi. Pastikan server berjalan atau coba muat ulang halaman.',
      };
    }
  };

  const registerTeacherAccount = async (payload: {
    email: string;
    fullName: string;
    nipNuptk?: string;
    role: 'guru' | 'wali_kelas';
    assignedClassId?: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/register', {
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
        return { ok: false, error: data.error || 'Gagal mendaftarkan akun guru.' };
      }
      const synced = await loadSchoolStateFromServer(data.token, data.user.role);
      const registered = data.user;
      if (registered.role === 'wali_kelas' && registered.assignedClassId) {
        setClasses((prev) =>
          prev.map((c) =>
            c.id === registered.assignedClassId
              ? { ...c, homeroomTeacherId: registered.id }
              : c
          )
        );
      }
      setAuthToken(data.token);
      setCurrentUser(registered);
      applyAuthenticatedFocus(registered, synced.subjects, synced.classes);
      await refreshAuthStatus();
      await fetchAuthorizedUsers(data.token);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Tidak dapat terhubung ke server pendaftaran.' };
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
      setAuthToken(data.token);
      setCurrentUser(data.user);
      applyAuthenticatedFocus(data.user, synced.subjects, synced.classes);
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
        resetDemoData,
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
