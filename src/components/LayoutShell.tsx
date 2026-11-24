import React, { useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Database,
  FileSpreadsheet,
  HeartHandshake,
  Inbox,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Table2,
  Users,
  X,
} from 'lucide-react';
import { ActiveTab, GuruSubTab, useApp, WaliSubTab } from '../context/AppContext';
import { UserRole } from '../types/raport';
import { SchoolCrest } from './SchoolCrest';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin / Operator',
  guru: 'Guru Mapel',
  wali_kelas: 'Wali Kelas',
};

const GURU_SUBMENU_LABELS: Record<GuruSubTab, string> = {
  olah_nilai: 'Olah Nilai',
  atur_tp: 'Atur TP',
  sikap: 'Sikap (P3)',
};

const WALI_SUBMENU_LABELS: Record<WaliSubTab, string> = {
  absensi: 'Absensi & Catatan',
  ekskul_p5: 'Ekskul & P5',
  leger: 'Leger Nilai Kelas',
  kiriman_guru: 'Nilai Masuk Guru',
};

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    isDemoSession,
    activeTab,
    setActiveTab,
    guruSubTab,
    setGuruSubTab,
    waliSubTab,
    setWaliSubTab,
    classes,
    subjects,
    settings,
    connectionMode,
    syncStatus,
    lastSavedAt,
    loginWithRoleDemo,
    changeOwnPassword,
    logout,
  } = useApp();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currPw, setCurrPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  if (!currentUser) return null;

  const assignedClass =
    currentUser.role === 'wali_kelas'
      ? classes.find((c) => c.id === currentUser.assignedClassId) ||
        classes.find((c) => c.homeroomTeacherId === currentUser.id)
      : undefined;
  const assignedSubjects =
    currentUser.role === 'guru'
      ? subjects.filter((s) => s.teacherId === currentUser.id)
      : [];

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 6) {
      setPwMsg({ type: 'err', text: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    setPwSaving(true);
    const res = await changeOwnPassword(currPw, newPw);
    setPwSaving(false);
    if (res.ok) {
      setPwMsg({ type: 'ok', text: 'Kata sandi berhasil diperbarui.' });
      setCurrPw('');
      setNewPw('');
    } else {
      setPwMsg({ type: 'err', text: res.error || 'Gagal mengganti kata sandi.' });
    }
  };

  const navItems: {
    id: ActiveTab;
    label: string;
    hint: string;
    icon: React.ReactNode;
    roles: UserRole[];
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard Analitik',
      hint: 'Ringkasan & progres kelas',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      roles: ['admin', 'guru', 'wali_kelas'],
    },
    {
      id: 'input_nilai',
      label: currentUser.role === 'wali_kelas' ? 'Input Nilai Mapel' : 'Menu Guru Mapel',
      hint: 'Atur TP, Sikap & Olah Nilai',
      icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
      roles: ['admin', 'guru', 'wali_kelas'],
    },
    {
      id: 'wali_kelas',
      label: 'Menu Wali Kelas',
      hint: 'Absensi, Ekskul, Leger & Kiriman',
      icon: <Users className="w-4 h-4 shrink-0" />,
      roles: ['admin', 'wali_kelas'],
    },
    {
      id: 'raport',
      label: 'Cetak Raport A4 / F4',
      hint: 'Pratinjau & cetak PDF resmi',
      icon: <Printer className="w-4 h-4 shrink-0" />,
      roles: ['admin', 'wali_kelas'],
    },
    {
      id: 'master_data',
      label: 'Master Data & Akun',
      hint: 'Siswa, akun role, bobot & SQL',
      icon: <Database className="w-4 h-4 shrink-0" />,
      roles: ['admin'],
    },
  ];

  const allowedNav = navItems.filter((item) =>
    item.roles.includes(currentUser.role)
  );

  const activeNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  const renderSyncIndicator = () => {
    if (syncStatus === 'syncing') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium whitespace-nowrap shrink-0">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Menyimpan perubahan...</span>
        </div>
      );
    }
    if (connectionMode === 'supabase' && syncStatus === 'connected') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium whitespace-nowrap shrink-0">
          <Cloud className="w-3.5 h-3.5" />
          <span className="font-mono tabular-nums">Supabase Tersinkron · {lastSavedAt}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium whitespace-nowrap shrink-0">
        <CloudOff className="w-3.5 h-3.5 text-slate-500" />
        <span className="font-mono tabular-nums">Tersimpan Lokal · {lastSavedAt}</span>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-obsidian-grid text-slate-200 border-r border-slate-800/90">
      {/* Brand Lockup */}
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
        <div className="p-1 rounded-xl bg-white shadow-xs shrink-0">
          <SchoolCrest src={settings.logoUrl} className="w-8 h-8" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate tracking-tight">
            SMA Pasundan 9
          </div>
          <div className="text-[11px] text-emerald-300/90 truncate">
            E-Raport Kurikulum Merdeka
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {allowedNav.map((item) => {
          const isActive = activeTab === item.id;
          const isGuruMenu = item.id === 'input_nilai';
          const isWaliMenu = item.id === 'wali_kelas';
          const guruSubItems: {
            id: GuruSubTab;
            label: string;
            hint: string;
            icon: React.ReactNode;
          }[] = [
            {
              id: 'atur_tp',
              label: 'Atur TP',
              hint: 'Tujuan Pembelajaran & SAS',
              icon: <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />,
            },
            {
              id: 'sikap',
              label: 'Sikap (P3)',
              hint: 'Dimensi Profil Pelajar Pancasila',
              icon: <HeartHandshake className="w-3.5 h-3.5 shrink-0" />,
            },
            {
              id: 'olah_nilai',
              label: 'Olah Nilai',
              hint: 'Nilai, kunci & kirim ke wali',
              icon: <ListChecks className="w-3.5 h-3.5 shrink-0" />,
            },
          ];

          const waliSubItems: {
            id: WaliSubTab;
            label: string;
            hint: string;
            icon: React.ReactNode;
          }[] = [
            {
              id: 'absensi',
              label: 'Absensi & Catatan',
              hint: 'Sakit, izin, alpha & catatan',
              icon: <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />,
            },
            {
              id: 'ekskul_p5',
              label: 'Ekskul & P5',
              hint: 'Ekstrakurikuler & projek P5',
              icon: <Award className="w-3.5 h-3.5 shrink-0" />,
            },
            {
              id: 'leger',
              label: 'Leger Nilai Kelas',
              hint: 'Rekap nilai & peringkat kelas',
              icon: <Table2 className="w-3.5 h-3.5 shrink-0" />,
            },
            {
              id: 'kiriman_guru',
              label: 'Nilai Masuk Guru',
              hint: 'Pantau kiriman nilai mapel',
              icon: <Inbox className="w-3.5 h-3.5 shrink-0" />,
            },
          ];

          return (
            <div key={item.id} className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left rounded-xl transition-all duration-150 border ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30 shadow-xs'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate whitespace-nowrap">
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {item.hint}
                    </div>
                  </div>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </button>

              {isGuruMenu && (
                <div className="ml-4 pl-3 border-l border-white/15 space-y-1 py-0.5">
                  {guruSubItems.map((sub) => {
                    const isSubActive = isActive && guruSubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          setGuruSubTab(sub.id);
                          setActiveTab('input_nilai');
                          setMobileOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left rounded-lg transition-all duration-150 border ${
                          isSubActive
                            ? 'bg-emerald-500/20 text-white border-emerald-400/40'
                            : 'text-slate-300/90 hover:bg-white/[0.06] hover:text-white border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={
                              isSubActive ? 'text-emerald-300' : 'text-slate-400'
                            }
                          >
                            {sub.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate whitespace-nowrap">
                              {sub.label}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {sub.hint}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {isWaliMenu && (
                <div className="ml-4 pl-3 border-l border-white/15 space-y-1 py-0.5">
                  {waliSubItems.map((sub) => {
                    const isSubActive = isActive && waliSubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          setWaliSubTab(sub.id);
                          setActiveTab('wali_kelas');
                          setMobileOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left rounded-lg transition-all duration-150 border ${
                          isSubActive
                            ? 'bg-emerald-500/20 text-white border-emerald-400/40'
                            : 'text-slate-300/90 hover:bg-white/[0.06] hover:text-white border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={
                              isSubActive ? 'text-emerald-300' : 'text-slate-400'
                            }
                          >
                            {sub.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate whitespace-nowrap">
                              {sub.label}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {sub.hint}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Role Switcher (Demo Mode Only) & Active User Footer */}
      <div className="p-4 border-t border-white/10 space-y-3 bg-black/20">
        {isDemoSession ? (
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Ganti Peran Simulasi
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-white/5 border border-white/10 rounded-lg">
              {(['admin', 'guru', 'wali_kelas'] as UserRole[]).map((role) => (
                <button
                  key={role}
                  onClick={() => loginWithRoleDemo(role)}
                  className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    currentUser.role === role
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {role === 'admin' ? 'Admin' : role === 'guru' ? 'Guru' : 'Wali'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-400/20 text-[11px] text-emerald-200">
            <span className="truncate font-medium">
              Sesi Terverifikasi · {ROLE_LABELS[currentUser.role]}
            </span>
            <button
              type="button"
              onClick={() => {
                setPwMsg(null);
                setPwModalOpen(true);
              }}
              title="Ubah kata sandi akun"
              className="p-1 text-emerald-300 hover:text-white rounded"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {currentUser.fullName}
            </div>
            <div className="text-[11px] text-emerald-300/85 truncate">
              {ROLE_LABELS[currentUser.role]}
              {assignedClass ? ` · ${assignedClass.name}` : ''}
              {assignedSubjects.length > 0
                ? ` · ${assignedSubjects.map((s) => s.code).join(', ')}`
                : ''}
            </div>
          </div>
          <button
            onClick={logout}
            title="Keluar dari akun"
            className="p-2 text-slate-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-smart-grid">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 no-print">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"
              aria-label="Tutup menu"
            >
              <X className="w-4 h-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract (3 zones) */}
        <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                {settings.schoolName}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate whitespace-nowrap">
                {activeTab === 'input_nilai'
                  ? `${activeNav.label} · ${GURU_SUBMENU_LABELS[guruSubTab]}`
                  : activeTab === 'wali_kelas'
                    ? `${activeNav.label} · ${WALI_SUBMENU_LABELS[waliSubTab]}`
                    : activeNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              <span className="font-mono tabular-nums">TA {settings.academicYear}</span>
              <span aria-hidden="true">·</span>
              <span>Semester {settings.semester}</span>
            </div>
            {renderSyncIndicator()}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto print-only-container">
          {children}
        </main>
      </div>

      {/* Change Password Modal */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ubah Kata Sandi Akun</h3>
                <p className="text-xs text-slate-500 mt-0.5">{currentUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kata Sandi Saat Ini
                </label>
                <input
                  type="password"
                  required
                  value={currPw}
                  onChange={(e) => setCurrPw(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kata Sandi Baru (Min. 6 Karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              {pwMsg && (
                <div
                  className={`p-2.5 rounded-lg border ${
                    pwMsg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {pwMsg.text}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPwModalOpen(false)}
                  className="px-3.5 py-2 font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-4 py-2 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-60"
                >
                  {pwSaving ? 'Menyimpan...' : 'Simpan Sandi Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
