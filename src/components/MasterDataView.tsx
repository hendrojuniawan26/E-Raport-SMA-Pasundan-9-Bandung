import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  Image as ImageIcon,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getSupabaseConfig,
  uploadAssetToSupabaseOrLocal,
} from '../lib/supabase';
import {
  ClassRoom,
  FaseType,
  Gender,
  Student,
  Subject,
  SubjectFaseScope,
  UserRole,
} from '../types/raport';
import {
  downloadStudentTemplateExcel,
  parseMasterStudentsExcel,
} from '../utils/excelProcessor';
import { DEFAULT_SCHOOL_LOGO, SchoolCrest } from './SchoolCrest';

type MasterTab = 'siswa' | 'kelas_mapel' | 'akun_role' | 'bobot_sekolah' | 'supabase_setup';

const SQL_SNIPPET = `-- Jalankan di Supabase SQL Editor (Project -> SQL Editor -> New Query)
-- Aman dijalankan ulang (idempotent). File lengkap ada di /supabase/schema.sql.

DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.user_role AS ENUM ('admin', 'guru', 'wali_kelas'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.gender_type AS ENUM ('L', 'P'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  nip_nuptk TEXT DEFAULT '',
  nrks TEXT DEFAULT '',
  role public.user_role NOT NULL DEFAULT 'guru',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yayasan TEXT NOT NULL DEFAULT 'YAYASAN PENDIDIKAN DASAR DAN MENENGAH PASUNDAN',
  school_name TEXT NOT NULL DEFAULT 'SMA PASUNDAN 9 BANDUNG',
  npsn TEXT NOT NULL DEFAULT '20219784',
  address TEXT NOT NULL DEFAULT 'Jl. Babakan Ciparay - Gg. Atakiria I No. 28 Telp. 022-6038372 Bandung 40233',
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  principal_name TEXT NOT NULL DEFAULT 'Ahmad Mukhlis Sadid, S.Pd.I., SIP.',
  principal_nip TEXT NOT NULL DEFAULT '19023L0550260241079529',
  report_city TEXT NOT NULL DEFAULT 'Bandung',
  report_date TEXT NOT NULL DEFAULT '20 Desember 2025',
  logo_url TEXT,
  default_kktp INTEGER NOT NULL DEFAULT 70,
  threshold_baik INTEGER NOT NULL DEFAULT 90,
  weight_sumatif_ppk INTEGER NOT NULL DEFAULT 20,
  weight_sumatif_prk INTEGER NOT NULL DEFAULT 30,
  weight_sas INTEGER NOT NULL DEFAULT 10,
  weight_kehadiran INTEGER NOT NULL DEFAULT 10,
  weight_proses INTEGER NOT NULL DEFAULT 10,
  weight_tugas INTEGER NOT NULL DEFAULT 20,
  auto_prk_formula BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  grade_level INTEGER NOT NULL CHECK (grade_level IN (10, 11, 12)),
  fase TEXT NOT NULL CHECK (fase IN ('E', 'F')),
  homeroom_teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Umum',
  fase_scope TEXT NOT NULL DEFAULT 'ALL',
  class_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  kktp INTEGER NOT NULL DEFAULT 70,
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.learning_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  is_sas BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nis TEXT UNIQUE NOT NULL,
  nisn TEXT DEFAULT '',
  full_name TEXT NOT NULL,
  gender public.gender_type NOT NULL DEFAULT 'L',
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  birth_place TEXT DEFAULT 'Bandung',
  birth_date DATE,
  religion TEXT DEFAULT 'Islam',
  address TEXT DEFAULT '',
  parent_name TEXT DEFAULT '',
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  tp_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  sas_ppk NUMERIC(5,2),
  sas_prk NUMERIC(5,2),
  kehadiran NUMERIC(5,2),
  proses NUMERIC(5,2),
  tugas NUMERIC(5,2),
  p3_scores JSONB NOT NULL DEFAULT '[85,85,85,85,85,85]'::jsonb,
  nilai_akhir NUMERIC(5,2) NOT NULL DEFAULT 0,
  predikat TEXT NOT NULL DEFAULT 'B',
  deskripsi_auto TEXT NOT NULL DEFAULT '',
  deskripsi_manual TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subject_id, academic_year, semester)
);

CREATE TABLE IF NOT EXISTS public.homeroom_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  sakit INTEGER NOT NULL DEFAULT 0,
  izin INTEGER NOT NULL DEFAULT 0,
  alpha INTEGER NOT NULL DEFAULT 0,
  wali_note TEXT DEFAULT '',
  promotion_status TEXT DEFAULT 'Naik ke kelas berikutnya',
  extracurriculars JSONB NOT NULL DEFAULT '[]'::jsonb,
  p5_projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, academic_year, semester)
);

CREATE TABLE IF NOT EXISTS public.grade_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'single_grade',
  class_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  subject_code TEXT DEFAULT '',
  student_id TEXT,
  student_name TEXT,
  student_count INTEGER,
  nilai_akhir NUMERIC(5,2),
  predikat TEXT,
  teacher_id TEXT,
  teacher_name TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'guru',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.grade_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Grade notifications readable by staff" ON public.grade_notifications;
DROP POLICY IF EXISTS "Grade notifications readable" ON public.grade_notifications;
CREATE POLICY "Grade notifications readable by staff" ON public.grade_notifications FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Grade notifications insertable by staff" ON public.grade_notifications;
DROP POLICY IF EXISTS "Grade notifications insertable" ON public.grade_notifications;
CREATE POLICY "Grade notifications insertable by staff" ON public.grade_notifications FOR INSERT TO authenticated, anon WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND NOT puballtables) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_grades') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.student_grades;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'grade_notifications') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.grade_notifications;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN null;
END $$;`;

export function MasterDataView() {
  const {
    students,
    setStudents,
    classes,
    setClasses,
    subjects,
    setSubjects,
    users,
    currentUser,
    createUserAccount,
    updateUserAccount,
    deleteUserAccount,
    settings,
    updateSettings,
    resetDemoData,
    configureSupabase,
    disconnectSupabase,
    supabaseMessage,
    supabaseConfigSource,
    connectionMode,
  } = useApp();

  const [tab, setTab] = useState<MasterTab>('siswa');
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    nipNuptk: '',
    nrks: '',
    role: 'guru' as UserRole,
    assignedClassId: classes[0]?.id || 'kelas-xi-ipas',
    password: '',
  });
  const [accountFeedback, setAccountFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [resetPwUserId, setResetPwUserId] = useState<string | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [newStudent, setNewStudent] = useState({
    nis: '',
    nisn: '',
    fullName: '',
    gender: 'L' as Gender,
    classId: classes[0]?.id || 'kelas-xi-ipas',
    parentName: '',
  });
  const [newClass, setNewClass] = useState({
    name: '',
    gradeLevel: 10 as 10 | 11 | 12,
    fase: 'E' as FaseType,
  });
  const [newSubject, setNewSubject] = useState({
    code: '',
    name: '',
    category: 'Umum' as Subject['category'],
    faseScope: 'ALL' as SubjectFaseScope,
    kktp: 70,
    teacherName: '',
  });

  const existingCfg = getSupabaseConfig();
  const [sbUrl, setSbUrl] = useState(existingCfg.url);
  const [sbAnon, setSbAnon] = useState(existingCfg.anonKey);
  const [sbTesting, setSbTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    const latest = getSupabaseConfig();
    if (latest.url && !sbUrl) setSbUrl(latest.url);
    if (latest.anonKey && !sbAnon) setSbAnon(latest.anonKey);
  }, [supabaseConfigSource]);

  const stuImportRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const visibleStudents = students.filter(
    (s) => filterClassId === 'all' || s.classId === filterClassId
  );

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.nis.trim() || !newStudent.fullName.trim()) return;
    const item: Student = {
      id: `stu-${Date.now()}`,
      nis: newStudent.nis.trim(),
      nisn: newStudent.nisn.trim(),
      fullName: newStudent.fullName.trim(),
      gender: newStudent.gender,
      classId: newStudent.classId,
      birthPlace: 'Bandung',
      birthDate: '2008-01-01',
      religion: 'Islam',
      address: 'Bandung',
      parentName: newStudent.parentName.trim() || '-',
      isActive: true,
    };
    setStudents((prev) => [...prev, item]);
    setNewStudent({ ...newStudent, nis: '', nisn: '', fullName: '', parentName: '' });
  };

  const handleStudentPhotoUpload = async (studentId: string, file?: File) => {
    if (!file) return;
    const url = await uploadAssetToSupabaseOrLocal(file, 'students');
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, photoUrl: url } : s))
    );
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;
    const url = await uploadAssetToSupabaseOrLocal(file, 'school');
    updateSettings({ ...settings, logoUrl: url });
  };

  const handleImportStudentsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseMasterStudentsExcel(file);
      const next: Student[] = rows.map((r, i) => {
        const matchedClass =
          classes.find((c) => c.name.toLowerCase() === r.className.toLowerCase()) ||
          classes[0];
        return {
          id: `stu-imp-${Date.now()}-${i}`,
          nis: r.nis,
          nisn: r.nisn,
          fullName: r.fullName,
          gender: r.gender,
          classId: matchedClass.id,
          birthPlace: r.birthPlace,
          birthDate: r.birthDate,
          religion: r.religion,
          parentName: r.parentName,
          address: r.address,
          isActive: true,
        };
      });
      setStudents((prev) => [...prev, ...next]);
      setImportStatus(`Berhasil menambahkan ${next.length} data siswa dari Excel.`);
    } catch {
      setImportStatus('Gagal membaca berkas Excel siswa.');
    } finally {
      if (stuImportRef.current) stuImportRef.current.value = '';
    }
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.name.trim()) return;
    const item: ClassRoom = {
      id: `kelas-${Date.now()}`,
      name: newClass.name.trim(),
      gradeLevel: newClass.gradeLevel,
      fase: newClass.gradeLevel === 10 ? 'E' : 'F',
      academicYear: settings.academicYear,
    };
    setClasses((prev) => [...prev, item]);
    setNewClass({ name: '', gradeLevel: 10, fase: 'E' });
  };

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.code.trim() || !newSubject.name.trim()) return;
    const id = `mapel-${Date.now()}`;
    const item: Subject = {
      id,
      code: newSubject.code.trim().toUpperCase(),
      name: newSubject.name.trim(),
      category: newSubject.category,
      faseScope: newSubject.faseScope,
      kktp: newSubject.kktp,
      teacherName: newSubject.teacherName.trim() || 'Guru Mapel',
      sortOrder: subjects.length + 1,
      sasTitle: `Evaluasi Akhir ${newSubject.name.trim()}`,
      tpList: [
        { id: `${id}-tp-1`, code: 'Sumatif 1', title: 'memahami konsep dasar materi' },
        { id: `${id}-tp-2`, code: 'Sumatif 2', title: 'menganalisis penerapan materi' },
        { id: `${id}-tp-3`, code: 'Sumatif 3', title: 'mempraktikkan proyek pembelajaran' },
        { id: `${id}-tp-4`, code: 'Sumatif 4', title: 'mengevaluasi studi kasus' },
      ],
    };
    setSubjects((prev) => [...prev, item]);
    setNewSubject({
      code: '',
      name: '',
      category: 'Umum',
      faseScope: 'ALL',
      kktp: 70,
      teacherName: '',
    });
  };

  const totalWeights =
    settings.weights.sumatifPpk +
    settings.weights.sumatifPrk +
    settings.weights.sas +
    settings.weights.kehadiran +
    settings.weights.proses +
    settings.weights.tugas;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_SNIPPET);
    setCopiedSql(true);
    window.setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleTestAndSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSbTesting(true);
    await configureSupabase(sbUrl, sbAnon);
    setSbTesting(false);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFeedback(null);
    const res = await createUserAccount({
      email: newUser.email,
      fullName: newUser.fullName,
      nipNuptk: newUser.nipNuptk,
      nrks: newUser.nrks,
      role: newUser.role,
      password: newUser.password,
      assignedClassId: newUser.role === 'wali_kelas' ? newUser.assignedClassId : undefined,
    });
    if (res.ok) {
      setAccountFeedback({
        type: 'ok',
        text: `Akun ${newUser.fullName} (${newUser.role === 'admin' ? 'Admin' : newUser.role === 'guru' ? 'Guru Mapel' : 'Wali Kelas'}) berhasil dibuat dan siap dipakai login.`,
      });
      setNewUser({
        fullName: '',
        email: '',
        nipNuptk: '',
        nrks: '',
        role: 'guru',
        assignedClassId: classes[0]?.id || 'kelas-xi-ipas',
        password: '',
      });
    } else {
      setAccountFeedback({ type: 'err', text: res.error || 'Gagal membuat akun.' });
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    setAccountFeedback(null);
    const res = await updateUserAccount(userId, { newPassword: resetPwValue });
    if (res.ok) {
      setAccountFeedback({
        type: 'ok',
        text: 'Kata sandi akun berhasil diatur ulang.',
      });
      setResetPwUserId(null);
      setResetPwValue('');
    } else {
      setAccountFeedback({ type: 'err', text: res.error || 'Gagal mereset kata sandi.' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-Tabs */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {(
            [
              { id: 'siswa', label: `Data Siswa (${students.length})` },
              { id: 'kelas_mapel', label: `Kelas & Mapel (${subjects.length})` },
              { id: 'akun_role', label: `Akun & Role (${users.length})` },
              { id: 'bobot_sekolah', label: 'Identitas & Bobot Nilai' },
              { id: 'supabase_setup', label: 'Database Supabase & SQL' },
            ] as { id: MasterTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={resetDemoData}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Data Awal CSV</span>
        </button>
      </div>

      {/* TAB 1: DATA SISWA */}
      {tab === 'siswa' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Tambah atau Impor Peserta Didik
                </h3>
                <p className="text-xs text-slate-500">
                  Kelola NIS, NISN, penempatan kelas Fase E/F, dan foto profil siswa.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadStudentTemplateExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template Excel</span>
                </button>
                <input
                  ref={stuImportRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportStudentsExcel}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => stuImportRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Excel Siswa</span>
                </button>
              </div>
            </div>

            {importStatus && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                {importStatus}
              </p>
            )}

            <form
              onSubmit={handleAddStudent}
              className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100"
            >
              <input
                type="text"
                placeholder="NIS *"
                required
                value={newStudent.nis}
                onChange={(e) => setNewStudent({ ...newStudent, nis: e.target.value })}
                className="sm:col-span-2 px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
              />
              <input
                type="text"
                placeholder="NISN"
                value={newStudent.nisn}
                onChange={(e) => setNewStudent({ ...newStudent, nisn: e.target.value })}
                className="sm:col-span-2 px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
              />
              <input
                type="text"
                placeholder="Nama Lengkap Siswa *"
                required
                value={newStudent.fullName}
                onChange={(e) =>
                  setNewStudent({ ...newStudent, fullName: e.target.value })
                }
                className="sm:col-span-3 px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
              <select
                value={newStudent.gender}
                onChange={(e) =>
                  setNewStudent({ ...newStudent, gender: e.target.value as Gender })
                }
                className="sm:col-span-1 px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="L">L</option>
                <option value="P">P</option>
              </select>
              <select
                value={newStudent.classId}
                onChange={(e) =>
                  setNewStudent({ ...newStudent, classId: e.target.value })
                }
                className="sm:col-span-2 px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Siswa</span>
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">
                Daftar Peserta Didik ({visibleStudents.length})
              </span>
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70"
              >
                <option value="all">Semua Kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-100 font-semibold">
                    <th className="py-3 px-3 w-12 text-center">Foto</th>
                    <th className="py-3 px-3">NIS / NISN</th>
                    <th className="py-3 px-3">Nama Lengkap</th>
                    <th className="py-3 px-3 text-center">L/P</th>
                    <th className="py-3 px-3">Kelas</th>
                    <th className="py-3 px-3">Orang Tua / Wali</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleStudents.map((stu) => {
                    const cls = classes.find((c) => c.id === stu.classId);
                    return (
                      <tr key={stu.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 text-center">
                          <label className="cursor-pointer inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden hover:border-emerald-600">
                            {stu.photoUrl ? (
                              <img
                                src={stu.photoUrl}
                                alt={stu.fullName}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleStudentPhotoUpload(stu.id, e.target.files?.[0])
                              }
                            />
                          </label>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums">
                          <div className="font-semibold text-slate-900">{stu.nis}</div>
                          <div className="text-[10px] text-slate-500">
                            {stu.nisn || '-'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {stu.fullName}
                        </td>
                        <td className="py-2.5 px-3 text-center">{stu.gender}</td>
                        <td className="py-2.5 px-3">
                          {cls?.name} · Fase {cls?.fase}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{stu.parentName}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setStudents((prev) => prev.filter((s) => s.id !== stu.id))
                            }
                            className="p-1.5 text-slate-400 hover:text-red-600"
                            title="Hapus siswa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KELAS & MATA PELAJARAN */}
      {tab === 'kelas_mapel' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Kelas */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Manajemen Kelas (Fase E & F)
            </h3>
            <form onSubmit={handleAddClass} className="flex gap-2">
              <input
                type="text"
                placeholder="Nama Kelas (cth: X IPAS 2)"
                value={newClass.name}
                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
              <select
                value={newClass.gradeLevel}
                onChange={(e) => {
                  const lvl = Number(e.target.value) as 10 | 11 | 12;
                  setNewClass({
                    ...newClass,
                    gradeLevel: lvl,
                    fase: lvl === 10 ? 'E' : 'F',
                  });
                }}
                className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value={10}>Kelas X (Fase E)</option>
                <option value={11}>Kelas XI (Fase F)</option>
                <option value={12}>Kelas XII (Fase F)</option>
              </select>
              <button
                type="submit"
                className="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                Tambah
              </button>
            </form>

            <div className="divide-y divide-slate-100">
              {classes.map((cls) => {
                const wali = users.find((u) => u.id === cls.homeroomTeacherId);
                return (
                  <div
                    key={cls.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {cls.name} · Fase {cls.fase}
                      </div>
                      <div className="text-slate-500">
                        Wali: {wali?.fullName || 'Belum ditentukan'}
                      </div>
                    </div>
                    <select
                      value={cls.homeroomTeacherId || ''}
                      onChange={(e) =>
                        setClasses((prev) =>
                          prev.map((c) =>
                            c.id === cls.id
                              ? { ...c, homeroomTeacherId: e.target.value }
                              : c
                          )
                        )
                      }
                      className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-white max-w-[160px]"
                    >
                      <option value="">Pilih Wali Kelas</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mata Pelajaran */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Struktur Mata Pelajaran SMA Kurikulum Merdeka & KKTP
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Fase E (Kelas X): Umum + IPA/IPS Terpadu + Informatika. Fase F (Kelas XI & XII): Umum + Mapel Pilihan + Mulok.
              </p>
            </div>
            <form
              onSubmit={handleAddSubject}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2"
            >
              <input
                type="text"
                placeholder="Kode"
                value={newSubject.code}
                onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                className="sm:col-span-2 px-2.5 py-2 text-xs border border-slate-200 rounded-lg font-mono uppercase"
              />
              <input
                type="text"
                placeholder="Nama Mata Pelajaran"
                value={newSubject.name}
                onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                className="sm:col-span-4 px-2.5 py-2 text-xs border border-slate-200 rounded-lg"
              />
              <select
                value={newSubject.category}
                onChange={(e) =>
                  setNewSubject({
                    ...newSubject,
                    category: e.target.value as Subject['category'],
                  })
                }
                className="sm:col-span-2 px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="Umum">Kel. Umum</option>
                <option value="Pilihan">Kel. Pilihan</option>
                <option value="Muatan Lokal">Mulok</option>
              </select>
              <select
                value={newSubject.faseScope}
                onChange={(e) =>
                  setNewSubject({
                    ...newSubject,
                    faseScope: e.target.value as SubjectFaseScope,
                  })
                }
                className="sm:col-span-2 px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="ALL">Fase E & F</option>
                <option value="E">Khusus Fase E (X)</option>
                <option value="F">Khusus Fase F (XI/XII)</option>
              </select>
              <input
                type="number"
                placeholder="KKTP"
                value={newSubject.kktp}
                onChange={(e) =>
                  setNewSubject({ ...newSubject, kktp: Number(e.target.value) || 70 })
                }
                className="sm:col-span-1 px-2 py-2 text-xs border border-slate-200 rounded-lg font-mono text-center"
              />
              <button
                type="submit"
                className="sm:col-span-1 px-2 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                +
              </button>
            </form>

            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto pr-1">
              {subjects.map((sub) => (
                <div
                  key={sub.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {sub.name} ({sub.code})
                    </div>
                    <div className="text-slate-500">
                      Kelompok {sub.category} ·{' '}
                      {sub.faseScope === 'ALL'
                        ? 'Fase E & F'
                        : sub.faseScope === 'E'
                          ? 'Khusus Fase E (Kelas X)'
                          : 'Khusus Fase F (Kelas XI/XII)'}{' '}
                      · Guru: {sub.teacherName || '-'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500">KKTP</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={sub.kktp}
                      onChange={(e) =>
                        setSubjects((prev) =>
                          prev.map((s) =>
                            s.id === sub.id
                              ? { ...s, kktp: Number(e.target.value) || 70 }
                              : s
                          )
                        )
                      }
                      className="w-14 px-2 py-1 text-center font-mono border border-slate-200 rounded-md"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2B: MANAJEMEN AKUN & ROLE (ADMIN / GURU MAPEL / WALI KELAS) */}
      {tab === 'akun_role' && (
        <div className="space-y-5">
          {/* Role Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Admin / Operator</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {users.filter((u) => u.role === 'admin').length}
                </div>
              </div>
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Guru Mata Pelajaran</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {users.filter((u) => u.role === 'guru').length}
                </div>
              </div>
              <UserPlus className="w-5 h-5 text-sky-700" />
            </div>
            <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Wali Kelas</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {users.filter((u) => u.role === 'wali_kelas').length}
                </div>
              </div>
              <KeyRound className="w-5 h-5 text-amber-700" />
            </div>
          </div>

          {/* Create Account Form */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Tambah Akun Pengguna & Penetapan Role
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Buat akun login resmi untuk Admin, Guru Mata Pelajaran, atau Wali Kelas beserta kata sandi awalnya.
              </p>
            </div>

            {accountFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  accountFeedback.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {accountFeedback.text}
              </div>
            )}

            <form onSubmit={handleCreateAccount} className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
              <input
                type="text"
                required
                placeholder="Nama Lengkap & Gelar *"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                className="sm:col-span-3 px-3 py-2 border border-slate-200 rounded-lg"
              />
              <input
                type="email"
                required
                placeholder="Email Sekolah *"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="sm:col-span-3 px-3 py-2 border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                placeholder="NIP / NUPTK"
                value={newUser.nipNuptk}
                onChange={(e) => setNewUser({ ...newUser, nipNuptk: e.target.value })}
                className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                className="sm:col-span-2 px-2.5 py-2 border border-slate-200 rounded-lg bg-white font-medium"
              >
                <option value="guru">Guru Mapel</option>
                <option value="wali_kelas">Wali Kelas</option>
                <option value="admin">Admin</option>
              </select>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Kata Sandi (min. 6) *"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-lg"
              />

              {newUser.role === 'wali_kelas' && (
                <div className="sm:col-span-4 flex items-center gap-2">
                  <span className="text-slate-600 font-medium whitespace-nowrap">Kelas Binaan:</span>
                  <select
                    value={newUser.assignedClassId}
                    onChange={(e) => setNewUser({ ...newUser, assignedClassId: e.target.value })}
                    className="flex-1 px-2.5 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} (Fase {cls.fase})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={newUser.role === 'wali_kelas' ? 'sm:col-span-8 flex justify-end' : 'sm:col-span-12 flex justify-end'}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Simpan Akun Baru</span>
                </button>
              </div>
            </form>
          </div>

          {/* Account List Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">
                Daftar Pengguna & Hak Akses
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                {(
                  [
                    { id: 'all', label: 'Semua' },
                    { id: 'admin', label: 'Admin' },
                    { id: 'guru', label: 'Guru Mapel' },
                    { id: 'wali_kelas', label: 'Wali Kelas' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRoleFilter(item.id)}
                    className={`px-2.5 py-1 font-semibold rounded-md transition-colors ${
                      roleFilter === item.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Nama & Email</th>
                    <th className="py-2.5 px-3">NIP / NUPTK</th>
                    <th className="py-2.5 px-3">Role / Hak Akses</th>
                    <th className="py-2.5 px-3">Penugasan Wali Kelas</th>
                    <th className="py-2.5 px-3 text-center">Kata Sandi</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users
                    .filter((u) => roleFilter === 'all' || u.role === roleFilter)
                    .map((u) => {
                      const isSelf = currentUser?.id === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {u.fullName}{' '}
                              {isSelf && (
                                <span className="text-[10px] font-medium text-emerald-700">
                                  (Anda)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {u.email}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {u.nipNuptk || '-'}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={u.role}
                              disabled={isSelf}
                              onChange={async (e) => {
                                const res = await updateUserAccount(u.id, {
                                  role: e.target.value as UserRole,
                                });
                                if (!res.ok && res.error) {
                                  setAccountFeedback({ type: 'err', text: res.error });
                                }
                              }}
                              className="px-2 py-1 border border-slate-200 rounded-md bg-white font-medium disabled:opacity-60"
                            >
                              <option value="admin">Admin / Operator</option>
                              <option value="guru">Guru Mapel</option>
                              <option value="wali_kelas">Wali Kelas</option>
                            </select>
                          </td>
                          <td className="py-3 px-3">
                            {u.role === 'wali_kelas' ? (
                              <select
                                value={u.assignedClassId || ''}
                                onChange={async (e) => {
                                  const res = await updateUserAccount(u.id, {
                                    assignedClassId: e.target.value || null,
                                  });
                                  if (!res.ok && res.error) {
                                    setAccountFeedback({ type: 'err', text: res.error });
                                  }
                                }}
                                className="px-2 py-1 border border-slate-200 rounded-md bg-white"
                              >
                                <option value="">Belum ditetapkan</option>
                                {classes.map((cls) => (
                                  <option key={cls.id} value={cls.id}>
                                    {cls.name} (Fase {cls.fase})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {resetPwUserId === u.id ? (
                              <form
                                onSubmit={(e) => handleResetUserPassword(e, u.id)}
                                className="inline-flex items-center gap-1"
                              >
                                <input
                                  type="password"
                                  required
                                  minLength={6}
                                  placeholder="Sandi baru"
                                  value={resetPwValue}
                                  onChange={(e) => setResetPwValue(e.target.value)}
                                  className="w-24 px-2 py-1 border border-slate-300 rounded text-[11px]"
                                />
                                <button
                                  type="submit"
                                  className="px-2 py-1 bg-emerald-700 text-white rounded text-[11px] font-semibold"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetPwUserId(null);
                                    setResetPwValue('');
                                  }}
                                  className="px-1.5 py-1 text-slate-500 text-[11px]"
                                >
                                  Batal
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setResetPwUserId(u.id);
                                  setResetPwValue('');
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
                                  u.hasPassword
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-amber-50 border-amber-200 text-amber-800'
                                }`}
                              >
                                <KeyRound className="w-3 h-3" />
                                <span>{u.hasPassword ? 'Atur Ulang' : 'Buat Sandi'}</span>
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={async () => {
                                const res = await updateUserAccount(u.id, {
                                  isActive: u.isActive === false,
                                });
                                if (!res.ok && res.error) {
                                  setAccountFeedback({ type: 'err', text: res.error });
                                }
                              }}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold border disabled:opacity-50 ${
                                u.isActive !== false
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-slate-100 border-slate-200 text-slate-500'
                              }`}
                            >
                              {u.isActive !== false ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={async () => {
                                const res = await deleteUserAccount(u.id);
                                if (!res.ok && res.error) {
                                  setAccountFeedback({ type: 'err', text: res.error });
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"
                              title="Hapus akun"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IDENTITAS SEKOLAH & BOBOT PENILAIAN */}
      {tab === 'bobot_sekolah' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-xl border border-slate-200 bg-white shrink-0">
                  <SchoolCrest src={settings.logoUrl} className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Identitas Sekolah & Tahun Ajaran
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Logo tampil di header aplikasi dan kop surat raport A4 / F4.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                  className="hidden"
                />
                {settings.logoUrl !== DEFAULT_SCHOOL_LOGO && (
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({ ...settings, logoUrl: DEFAULT_SCHOOL_LOGO })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Logo Default</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Ganti Logo Sekolah</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">Yayasan</label>
                <input
                  type="text"
                  value={settings.yayasan}
                  onChange={(e) =>
                    updateSettings({ ...settings, yayasan: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Nama Sekolah
                </label>
                <input
                  type="text"
                  value={settings.schoolName}
                  onChange={(e) =>
                    updateSettings({ ...settings, schoolName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">NPSN</label>
                <input
                  type="text"
                  value={settings.npsn}
                  onChange={(e) =>
                    updateSettings({ ...settings, npsn: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">Alamat</label>
                <input
                  type="text"
                  value={settings.address}
                  onChange={(e) =>
                    updateSettings({ ...settings, address: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Tahun Ajaran
                </label>
                <input
                  type="text"
                  value={settings.academicYear}
                  onChange={(e) =>
                    updateSettings({ ...settings, academicYear: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Semester</label>
                <select
                  value={settings.semester}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      semester: e.target.value as 'Ganjil' | 'Genap',
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={settings.principalName}
                  onChange={(e) =>
                    updateSettings({ ...settings, principalName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  NIP / NUPTK Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={settings.principalNip}
                  onChange={(e) =>
                    updateSettings({ ...settings, principalNip: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Kota Tanda Tangan
                </label>
                <input
                  type="text"
                  value={settings.reportCity}
                  onChange={(e) =>
                    updateSettings({ ...settings, reportCity: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Tanggal Raport
                </label>
                <input
                  type="text"
                  value={settings.reportDate}
                  onChange={(e) =>
                    updateSettings({ ...settings, reportDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Bobot Penilaian & KKTP
              </h3>
              <span
                className={`text-xs font-mono tabular-nums font-semibold ${
                  totalWeights === 100 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                Total Bobot: {totalWeights}%
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {(
                [
                  { key: 'sumatifPpk', label: 'Sumatif Lingkup Materi (PPK)' },
                  { key: 'sumatifPrk', label: 'Sumatif Perbaikan / Praktik (PRK)' },
                  { key: 'sas', label: 'Sumatif Akhir Semester (SAS)' },
                  { key: 'kehadiran', label: 'Kehadiran' },
                  { key: 'proses', label: 'Proses Pembelajaran' },
                  { key: 'tugas', label: 'Tugas Terstruktur' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <label className="text-slate-700">{label}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settings.weights[key]}
                      onChange={(e) =>
                        updateSettings({
                          ...settings,
                          weights: {
                            ...settings.weights,
                            [key]: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-16 px-2 py-1.5 text-right font-mono tabular-nums border border-slate-200 rounded-md"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-slate-700">Ambang Predikat BAIK (Deskripsi)</label>
                  <input
                    type="number"
                    min={70}
                    max={100}
                    value={settings.thresholdBaik}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        thresholdBaik: Number(e.target.value) || 90,
                      })
                    }
                    className="w-16 px-2 py-1.5 text-right font-mono tabular-nums border border-slate-200 rounded-md"
                  />
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-700">
                    Hitung PRK otomatis: (PPK + 100) / 2
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.autoPrkFormula}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        autoPrkFormula: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-emerald-700"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUPABASE & SQL SETUP */}
      {tab === 'supabase_setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Koneksi Permanen Supabase
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                  supabaseConfigSource === 'env' || supabaseConfigSource === 'server'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : supabaseConfigSource === 'local'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                {supabaseConfigSource === 'env'
                  ? 'Aktif via Secrets / .env'
                  : supabaseConfigSource === 'server'
                    ? 'Permanen di Server (Semua Browser)'
                    : supabaseConfigSource === 'local'
                      ? 'Lokal Browser'
                      : 'Belum Terkonfigurasi'}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Sekali disimpan oleh Admin, URL & Anon Public Key otomatis tersinkron ke server aplikasi sehingga langsung terhubung saat dibuka di browser atau perangkat lain. Untuk deploy permanen jangka panjang, Anda juga dapat mengisi <code className="font-mono text-slate-700">VITE_SUPABASE_URL</code> dan{' '}
              <code className="font-mono text-slate-700">VITE_SUPABASE_ANON_KEY</code> di panel Secrets / <code className="font-mono text-slate-700">.env</code>.
            </p>

            <form onSubmit={handleTestAndSaveSupabase} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  required
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Supabase Anon Public Key
                </label>
                <input
                  type="password"
                  required
                  value={sbAnon}
                  onChange={(e) => setSbAnon(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={sbTesting}
                  className="flex-1 py-2 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  {sbTesting ? 'Menyimpan & Menguji...' : 'Simpan Permanen & Uji Koneksi'}
                </button>
                {supabaseConfigSource === 'server' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await disconnectSupabase();
                      setSbUrl('');
                      setSbAnon('');
                    }}
                    className="py-2 px-3 text-xs font-medium text-slate-600 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg"
                  >
                    Putuskan
                  </button>
                )}
              </div>
            </form>

            <div
              className={`p-3 rounded-lg border text-xs ${
                connectionMode === 'supabase'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {supabaseMessage}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Skema SQL Database Supabase
                </h3>
                <p className="text-xs text-slate-500">
                  File lengkap beserta RLS & Storage tersedia di{' '}
                  <code className="font-mono">/supabase/schema.sql</code>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Tersalin' : 'Salin SQL'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-[380px] leading-relaxed">
              {SQL_SNIPPET}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
