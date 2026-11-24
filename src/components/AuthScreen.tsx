import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calculator,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Layers,
  Lock,
  Printer,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getSupabaseConfig } from '../lib/supabase';
import { UserRole } from '../types/raport';
import { SchoolCrest } from './SchoolCrest';

export function AuthScreen() {
  const {
    authStatus,
    refreshAuthStatus,
    loginWithEmailPassword,
    claimFirstAdmin,
    settings,
    connectionMode,
  } = useApp();

  const [authTab, setAuthTab] = useState<'login' | 'claim_admin'>('login');
  const [loginRole, setLoginRole] = useState<UserRole>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // First-run Admin claim state
  const [claimEmail, setClaimEmail] = useState('');
  const [claimName, setClaimName] = useState('');
  const [claimNip, setClaimNip] = useState('');
  const [claimPassword, setClaimPassword] = useState('');
  const [claimConfirm, setClaimConfirm] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabaseCfg = getSupabaseConfig();
  const isSupabaseConnected =
    connectionMode === 'supabase' || Boolean(supabaseCfg.url && supabaseCfg.anonKey);

  const canClaimAdmin =
    Boolean(authStatus.statusChecked) &&
    authStatus.serverReachable !== false &&
    !authStatus.adminClaimed &&
    !authStatus.envPasscodeConfigured;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await loginWithEmailPassword(email, password, loginRole);
    setLoading(false);
    if (!res.ok && res.error) {
      setError(res.error);
    }
  };

  const handleClaimAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (claimPassword.length < 6) {
      setError('Kata sandi Admin minimal 6 karakter.');
      return;
    }
    if (claimPassword !== claimConfirm) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setLoading(true);
    const res = await claimFirstAdmin({
      email: claimEmail,
      fullName: claimName,
      nipNuptk: claimNip,
      password: claimPassword,
    });
    setLoading(false);
    if (!res.ok && res.error) {
      setError(res.error);
    }
  };

  const capabilities = [
    {
      icon: <Calculator className="w-4 h-4 text-emerald-400" />,
      title: 'Kalkulasi Bobot & Auto-PRK',
      desc: 'Hitung nilai akhir & capaian kompetensi otomatis sesuai rumus sekolah.',
    },
    {
      icon: <FileSpreadsheet className="w-4 h-4 text-sky-400" />,
      title: 'Template & Impor Massal',
      desc: 'Unduh template Excel per kelas & unggah nilai satu kelas sekaligus.',
    },
    {
      icon: <Layers className="w-4 h-4 text-emerald-400" />,
      title: 'Leger, Ekskul & Projek P5',
      desc: 'Rekapitulasi nilai lintas mapel, absensi, dan capaian P5 terpadu.',
    },
    {
      icon: <Printer className="w-4 h-4 text-sky-400" />,
      title: 'Cetak Raport A4 / F4',
      desc: 'Tata letak raport Kurikulum Merdeka SMA siap cetak A4 atau F4 satuan & sekelas.',
    },
  ];

  const roleOptions: {
    id: UserRole;
    title: string;
    shortDesc: string;
    desc: string;
    placeholderEmail: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'admin',
      title: 'Admin / Operator',
      shortDesc: 'Master data & sistem',
      desc: 'Data master siswa, akun guru, kelas IPAS Fase E/F, bobot & Supabase',
      placeholderEmail: 'admin@guru.sma.belajar.id',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />,
    },
    {
      id: 'guru',
      title: 'Guru Mapel',
      shortDesc: 'TP, sikap & nilai mapel',
      desc: 'Atur TP, sikap P3, olah/impor nilai, kunci & kirim ke Wali Kelas',
      placeholderEmail: 'guru@smapasundan9bdg.sch.id',
      icon: <BookOpen className="w-4 h-4 text-emerald-700 shrink-0" />,
    },
    {
      id: 'wali_kelas',
      title: 'Wali Kelas',
      shortDesc: 'Absensi, P5 & raport',
      desc: 'Input nilai mapel, absensi, ekskul, P5, leger & cetak raport A4/F4',
      placeholderEmail: 'walikelas@smapasundan9bdg.sch.id',
      icon: <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />,
    },
  ];
  const selectedRoleOption = roleOptions.find((r) => r.id === loginRole) || roleOptions[0];

  return (
    <div className="min-h-screen bg-smart-grid flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left Smart-Campus Obsidian Panel */}
        <div className="lg:col-span-5 bg-obsidian-grid text-white p-8 sm:p-9 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
          <div className="space-y-6">
            <div className="flex items-center gap-3.5">
              <div className="p-1.5 rounded-xl bg-white shadow-xs shrink-0">
                <SchoolCrest src={settings.logoUrl} className="w-11 h-11" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-emerald-300/90 font-medium tracking-wide truncate">
                  {settings.yayasan}
                </p>
                <h1 className="text-lg font-bold tracking-tight text-white truncate">
                  {settings.schoolName}
                </h1>
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-medium text-emerald-300 tracking-wide">
                Digitalisasi Akademik · Kurikulum Merdeka
              </p>
              <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight leading-snug text-balance text-white">
                Sistem Pengolahan Nilai & Raport Digital
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Portal akademik resmi untuk Admin Sekolah, Guru Mata Pelajaran, dan Wali Kelas X–XII IPAS.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5 pt-2">
              {capabilities.map((cap) => (
                <div
                  key={cap.title}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/10"
                >
                  <div className="mt-0.5 shrink-0">{cap.icon}</div>
                  <div>
                    <div className="text-xs font-semibold text-white">{cap.title}</div>
                    <div className="text-[11px] text-slate-300/90 leading-snug mt-0.5">
                      {cap.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-white/10 text-xs text-slate-300 space-y-1">
            <p className="text-slate-400 leading-relaxed">{settings.address}</p>
            <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-[11px] text-emerald-300 pt-1">
              <span>NPSN {settings.npsn}</span>
              <span aria-hidden="true">·</span>
              <span>TA {settings.academicYear} ({settings.semester})</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {connectionMode === 'supabase'
                ? 'Sinkronisasi: Terhubung ke Server Sekolah & Supabase'
                : 'Sinkronisasi: Server Akademik Sekolah Terenkripsi'}
            </p>
          </div>
        </div>

        {/* Right Production Auth Panel */}
        <div className="lg:col-span-7 p-7 sm:p-9 flex flex-col justify-center bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">
                {authTab === 'claim_admin'
                  ? 'Aktivasi Admin Utama'
                  : 'Masuk ke Portal Akademik'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {authTab === 'claim_admin'
                  ? 'Atur kata sandi Admin sekolah untuk mengelola data master dan pengguna.'
                  : 'Gunakan email dan kata sandi akun sekolah Anda yang telah didaftarkan oleh Admin.'}
              </p>
            </div>
          </div>

          {authStatus.statusChecked && authStatus.serverReachable === false && (
            isSupabaseConnected ? (
              <div className="mb-4 p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Database className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Mode Autentikasi Langsung Supabase Aktif</div>
                    <p className="text-sky-800/90 mt-0.5 leading-relaxed">
                      Aplikasi terhubung ke Supabase Cloud. Masuk menggunakan akun yang telah didaftarkan dan diaktifkan oleh Admin Sekolah.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => refreshAuthStatus()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-sky-900 bg-white border border-sky-300 hover:bg-sky-100 rounded-lg shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Cek Server</span>
                </button>
              </div>
            ) : (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Server autentikasi belum merespons</div>
                    <p className="text-amber-800/90 mt-0.5 leading-relaxed">
                      Pastikan Anda membuka Development/Server URL yang aktif, atau tunggu beberapa detik sementara server memulai ulang.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => refreshAuthStatus()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Coba Lagi</span>
                </button>
              </div>
            )
          )}

          {canClaimAdmin && (
            <div className="inline-flex flex-wrap p-1 bg-slate-100 rounded-xl border border-slate-200 mb-5 self-start">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  setError('');
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  authTab === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Masuk Akun
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('claim_admin');
                  setError('');
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  authTab === 'claim_admin'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                Aktivasi Admin
              </button>
            </div>
          )}

          {authTab === 'claim_admin' && canClaimAdmin ? (
            <form onSubmit={handleClaimAdminSubmit} className="space-y-3.5">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                <KeyRound className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Aktivasi Akun Admin Utama (Pertama Kali)</div>
                  <p className="text-emerald-800/90 mt-0.5 leading-relaxed">
                    Atur kata sandi untuk akun Admin Sekolah. Setelah aktif, Admin dapat mengelola akun Guru Mata Pelajaran dan Wali Kelas di menu Master Data.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap Admin
                  </label>
                  <input
                    type="text"
                    required
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NIP / NUPTK
                  </label>
                  <input
                    type="text"
                    value={claimNip}
                    onChange={(e) => setClaimNip(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Admin Sekolah
                </label>
                <input
                  type="email"
                  required
                  value={claimEmail}
                  onChange={(e) => setClaimEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi Baru (Min. 6 Karakter)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    placeholder="Masukkan sandi baru"
                    className="w-full px-3 py-2 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Konfirmasi Kata Sandi
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={claimConfirm}
                    onChange={(e) => setClaimConfirm(e.target.value)}
                    placeholder="Ulangi kata sandi"
                    className="w-full px-3 py-2 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors disabled:opacity-60"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'Mengaktifkan...' : 'Aktifkan & Masuk sebagai Admin'}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Pilih Role Akun
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {roleOptions.map((item) => {
                      const active = loginRole === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setLoginRole(item.id);
                            setError('');
                          }}
                          className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                            active
                              ? 'bg-emerald-50 border-emerald-700 text-emerald-950 ring-1 ring-emerald-700/20'
                              : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="mt-0.5">{item.icon}</div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{item.title}</div>
                            <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                              {item.shortDesc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email {selectedRoleOption.title}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 transition-colors"
                    placeholder={selectedRoleOption.placeholderEmail}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 transition-colors"
                      placeholder="Masukkan kata sandi akun"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <span>
                    {loading ? 'Memverifikasi...' : `Masuk sebagai ${selectedRoleOption.title}`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="pt-4 border-t border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700">
                    Akses {selectedRoleOption.title}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    Pendaftaran akun hanya melalui Admin Sekolah
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {selectedRoleOption.desc}. Belum memiliki akun atau lupa sandi? Hubungi Admin Sekolah untuk dibuatkan akun aktif.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
