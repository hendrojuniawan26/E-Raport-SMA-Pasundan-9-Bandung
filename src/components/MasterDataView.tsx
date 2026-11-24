import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getSupabaseClient,
  getSupabaseConfig,
  uploadAssetToSupabaseOrLocal,
} from '../lib/supabase';
import { generateUuid, isUuid } from '../lib/supabaseSync';
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
-- Aman dijalankan ulang (idempotent) & sinkron dengan /supabase/schema.sql

DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions; EXCEPTION WHEN OTHERS THEN null; END $$;
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
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
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
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, academic_year, semester)
);

CREATE TABLE IF NOT EXISTS public.grade_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked', 'sent')),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, subject_id, academic_year, semester)
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

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.grade_notifications TO anon, authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeroom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = NEW.id AND email_confirmed_at IS NULL;
  EXCEPTION WHEN OTHERS THEN null;
  END;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    INSERT INTO public.profiles (id, email, full_name, nip_nuptk, role)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(COALESCE(NEW.email, 'User'), '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'nip_nuptk', ''),
      'admin'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN null;
END $$;

DO $$ BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE email_confirmed_at IS NULL;

  INSERT INTO public.profiles (id, email, full_name, nip_nuptk, role)
  SELECT
    u.id,
    COALESCE(u.email, ''),
    COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''), split_part(COALESCE(u.email, 'User'), '@', 1)),
    COALESCE(u.raw_user_meta_data->>'nip_nuptk', ''),
    CASE
      WHEN u.raw_user_meta_data->>'role' = 'wali_kelas' THEN 'wali_kelas'::public.user_role
      ELSE 'guru'::public.user_role
    END
  FROM auth.users u
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET role = 'admin'
  WHERE id = (
    SELECT p.id FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE COALESCE(u.raw_user_meta_data->>'role', '') NOT IN ('guru', 'wali_kelas')
    ORDER BY p.created_at ASC
    LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin');
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN null;
END $$;

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Profiles modifiable by admin or self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insertable by admin only" ON public.profiles;
DROP POLICY IF EXISTS "Profiles updatable by admin or self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles deletable by admin only" ON public.profiles;
CREATE POLICY "Profiles insertable by admin only" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "Profiles updatable by admin or self" ON public.profiles FOR UPDATE TO authenticated USING (public.get_my_role() = 'admin' OR auth.uid() = id) WITH CHECK (public.get_my_role() = 'admin' OR (auth.uid() = id AND role = public.get_my_role()));
CREATE POLICY "Profiles deletable by admin only" ON public.profiles FOR DELETE TO authenticated USING (public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_nip_nuptk TEXT DEFAULT '',
  p_nrks TEXT DEFAULT '',
  p_role TEXT DEFAULT 'guru',
  p_assigned_class_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_name TEXT := trim(COALESCE(p_full_name, ''));
  v_nip TEXT := trim(COALESCE(p_nip_nuptk, ''));
  v_nrks TEXT := trim(COALESCE(p_nrks, ''));
  v_role public.user_role;
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Hanya Admin Sekolah yang dapat mendaftarkan akun baru.';
  END IF;
  IF v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'Format email tidak valid.'; END IF;
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'Nama lengkap minimal 2 karakter.'; END IF;
  IF length(COALESCE(p_password, '')) < 6 THEN RAISE EXCEPTION 'Kata sandi minimal 6 karakter.'; END IF;
  IF p_role NOT IN ('admin', 'guru', 'wali_kelas') THEN RAISE EXCEPTION 'Role harus admin, guru, atau wali_kelas.'; END IF;
  v_role := p_role::public.user_role;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Email tersebut sudah terdaftar di Supabase Authentication.';
  END IF;

  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name, 'nip_nuptk', v_nip, 'role', p_role, 'assigned_class_id', NULLIF(trim(COALESCE(p_assigned_class_id, '')), '')),
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', v_user_id::text, NOW(), NOW(), NOW()
  ) ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, nip_nuptk, nrks, role)
  VALUES (v_user_id, v_email, v_name, v_nip, v_nrks, v_role)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, full_name = EXCLUDED.full_name,
    nip_nuptk = EXCLUDED.nip_nuptk, nrks = EXCLUDED.nrks,
    role = EXCLUDED.role, updated_at = NOW();

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Settings readable by authenticated" ON public.school_settings;
CREATE POLICY "Settings readable by authenticated" ON public.school_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Settings modifiable by admin" ON public.school_settings;
CREATE POLICY "Settings modifiable by admin" ON public.school_settings FOR ALL TO authenticated USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Classes readable" ON public.classes;
CREATE POLICY "Classes readable" ON public.classes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Classes admin write" ON public.classes;
CREATE POLICY "Classes admin write" ON public.classes FOR ALL TO authenticated USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Subjects readable" ON public.subjects;
CREATE POLICY "Subjects readable" ON public.subjects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Subjects admin write" ON public.subjects;
CREATE POLICY "Subjects admin write" ON public.subjects FOR ALL TO authenticated USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "LO readable" ON public.learning_objectives;
CREATE POLICY "LO readable" ON public.learning_objectives FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "LO staff write" ON public.learning_objectives;
CREATE POLICY "LO staff write" ON public.learning_objectives FOR ALL TO authenticated USING (public.get_my_role() IN ('admin', 'guru', 'wali_kelas')) WITH CHECK (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

DROP POLICY IF EXISTS "Students readable" ON public.students;
CREATE POLICY "Students readable" ON public.students FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Students admin write" ON public.students;
CREATE POLICY "Students admin write" ON public.students FOR ALL TO authenticated USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Grades readable by staff" ON public.student_grades;
CREATE POLICY "Grades readable by staff" ON public.student_grades FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Grades writable by staff" ON public.student_grades;
CREATE POLICY "Grades writable by staff" ON public.student_grades FOR ALL TO authenticated USING (public.get_my_role() IN ('admin', 'guru', 'wali_kelas')) WITH CHECK (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

DROP POLICY IF EXISTS "Homeroom readable by staff" ON public.homeroom_records;
CREATE POLICY "Homeroom readable by staff" ON public.homeroom_records FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Homeroom writable by wali_kelas & admin" ON public.homeroom_records;
CREATE POLICY "Homeroom writable by wali_kelas & admin" ON public.homeroom_records FOR ALL TO authenticated USING (public.get_my_role() IN ('admin', 'wali_kelas')) WITH CHECK (public.get_my_role() IN ('admin', 'wali_kelas'));

DROP POLICY IF EXISTS "Submissions readable by staff" ON public.grade_submissions;
CREATE POLICY "Submissions readable by staff" ON public.grade_submissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Submissions writable by staff" ON public.grade_submissions;
CREATE POLICY "Submissions writable by staff" ON public.grade_submissions FOR ALL TO authenticated USING (public.get_my_role() IN ('admin', 'guru', 'wali_kelas')) WITH CHECK (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

DROP POLICY IF EXISTS "Grade notifications readable by staff" ON public.grade_notifications;
CREATE POLICY "Grade notifications readable by staff" ON public.grade_notifications FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Grade notifications insertable by staff" ON public.grade_notifications;
CREATE POLICY "Grade notifications insertable by staff" ON public.grade_notifications FOR INSERT TO authenticated, anon WITH CHECK (true);

INSERT INTO public.school_settings (school_name, npsn)
SELECT 'SMA PASUNDAN 9 BANDUNG', '20219784'
WHERE NOT EXISTS (SELECT 1 FROM public.school_settings);

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
    syncFromSupabase,
    pushLocalDataToSupabase,
    configureSupabase,
    disconnectSupabase,
    supabaseMessage,
    supabaseConfigSource,
    supabaseSessionActive,
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
    assignedClassId: classes[0]?.id || '',
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
    classId: classes[0]?.id || '',
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
  const [showSbAnon, setShowSbAnon] = useState(false);
  const [sbTesting, setSbTesting] = useState(false);
  const [sbSyncing, setSbSyncing] = useState(false);
  const [sbPushing, setSbPushing] = useState(false);
  const [sbSyncFeedback, setSbSyncFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    const latest = getSupabaseConfig();
    if (latest.url && !sbUrl) setSbUrl(latest.url);
    if (latest.anonKey && !sbAnon) setSbAnon(latest.anonKey);
  }, [supabaseConfigSource, connectionMode]);

  useEffect(() => {
    if (classes.length > 0) {
      setNewStudent((prev) => (prev.classId ? prev : { ...prev, classId: classes[0].id }));
      setNewUser((prev) =>
        prev.assignedClassId ? prev : { ...prev, assignedClassId: classes[0].id }
      );
    }
  }, [classes]);

  const stuImportRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const visibleStudents = students.filter(
    (s) => filterClassId === 'all' || s.classId === filterClassId
  );

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.nis.trim() || !newStudent.fullName.trim()) return;
    const targetClassId = newStudent.classId || classes[0]?.id || '';
    if (!targetClassId) {
      setImportStatus('Tambahkan minimal 1 kelas di tab Kelas & Mapel sebelum menambah siswa.');
      return;
    }
    const item: Student = {
      id: generateUuid(),
      nis: newStudent.nis.trim(),
      nisn: newStudent.nisn.trim(),
      fullName: newStudent.fullName.trim(),
      gender: newStudent.gender,
      classId: targetClassId,
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
    if (classes.length === 0) {
      setImportStatus('Tambahkan minimal 1 kelas di tab Kelas & Mapel sebelum mengimpor siswa.');
      if (stuImportRef.current) stuImportRef.current.value = '';
      return;
    }
    try {
      const rows = await parseMasterStudentsExcel(file);
      const next: Student[] = rows.map((r) => {
        const matchedClass =
          classes.find((c) => c.name.toLowerCase() === r.className.toLowerCase()) ||
          classes[0];
        return {
          id: generateUuid(),
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
      id: generateUuid(),
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
    const id = generateUuid();
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
        { id: generateUuid(), code: 'Sumatif 1', title: 'memahami konsep dasar materi' },
        { id: generateUuid(), code: 'Sumatif 2', title: 'menganalisis penerapan materi' },
        { id: generateUuid(), code: 'Sumatif 3', title: 'mempraktikkan proyek pembelajaran' },
        { id: generateUuid(), code: 'Sumatif 4', title: 'mengevaluasi studi kasus' },
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
      const roleLabel =
        newUser.role === 'admin'
          ? 'Admin'
          : newUser.role === 'guru'
            ? 'Guru Mapel'
            : 'Wali Kelas';
      setAccountFeedback({
        type: 'ok',
        text: res.warning
          ? `Akun ${newUser.fullName} (${roleLabel}) berhasil dibuat. Catatan: ${res.warning}`
          : `Akun ${newUser.fullName} (${roleLabel}) berhasil dibuat dan langsung aktif tanpa verifikasi email.`,
      });
      setNewUser({
        fullName: '',
        email: '',
        nipNuptk: '',
        nrks: '',
        role: 'guru',
        assignedClassId: classes[0]?.id || '',
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
          disabled={sbSyncing}
          onClick={async () => {
            setSbSyncing(true);
            const res = await syncFromSupabase();
            setSbSyncFeedback({ ok: res.ok, text: res.message });
            setSbSyncing(false);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${sbSyncing ? 'animate-spin' : ''}`} />
          <span>{sbSyncing ? 'Menyinkronkan...' : 'Muat Ulang dari Supabase'}</span>
        </button>
      </div>

      {sbSyncFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            sbSyncFeedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span>{sbSyncFeedback.text}</span>
          <button
            type="button"
            onClick={() => setSbSyncFeedback(null)}
            className="underline shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

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
                {classes.length === 0 ? (
                  <option value="">Belum ada kelas</option>
                ) : (
                  classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
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
                  {visibleStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 px-4 text-center text-xs text-slate-500">
                        Belum ada data peserta didik di Supabase. Tambahkan siswa melalui form di atas atau impor file Excel.
                      </td>
                    </tr>
                  ) : (
                    visibleStudents.map((stu) => {
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
                            {cls ? `${cls.name} · Fase ${cls.fase}` : 'Kelas belum ditetapkan'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{stu.parentName}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setStudents((prev) => prev.filter((s) => s.id !== stu.id));
                                const client = getSupabaseClient();
                                if (client && isUuid(stu.id)) {
                                  client.from('students').delete().eq('id', stu.id).then(() => {});
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-600"
                              title="Hapus siswa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
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
              {classes.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Belum ada data kelas di Supabase. Tambahkan kelas baru di atas.
                </p>
              ) : (
                classes.map((cls) => {
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
                      <div className="flex items-center gap-1.5">
                        <select
                          value={cls.homeroomTeacherId || ''}
                          onChange={(e) =>
                            setClasses((prev) =>
                              prev.map((c) =>
                                c.id === cls.id
                                  ? { ...c, homeroomTeacherId: e.target.value || undefined }
                                  : c
                              )
                            )
                          }
                          className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-white max-w-[150px]"
                        >
                          <option value="">Pilih Wali Kelas</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setClasses((prev) => prev.filter((c) => c.id !== cls.id));
                            const client = getSupabaseClient();
                            if (client && isUuid(cls.id)) {
                              client.from('classes').delete().eq('id', cls.id).then(() => {});
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600"
                          title="Hapus kelas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
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
              {subjects.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Belum ada data mata pelajaran di Supabase. Tambahkan mata pelajaran baru di atas.
                </p>
              ) : (
                subjects.map((sub) => (
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
                      <button
                        type="button"
                        onClick={() => {
                          setSubjects((prev) => prev.filter((s) => s.id !== sub.id));
                          const client = getSupabaseClient();
                          if (client && isUuid(sub.id)) {
                            client.from('subjects').delete().eq('id', sub.id).then(() => {});
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                        title="Hapus mata pelajaran"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
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
                Tambah Akun Pengguna & Penetapan Role (Khusus Admin)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hanya Admin yang dapat mendaftarkan akun baru. Akun yang dibuat akan langsung aktif dan dapat digunakan login tanpa verifikasi email.
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
                <div className="relative">
                  <input
                    type={showSbAnon ? 'text' : 'password'}
                    required
                    value={sbAnon}
                    onChange={(e) => setSbAnon(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full px-3 py-2 pr-9 border border-slate-200 rounded-lg font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSbAnon((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    aria-label={showSbAnon ? 'Sembunyikan Anon Key' : 'Lihat Anon Key'}
                  >
                    {showSbAnon ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={sbTesting}
                  className="flex-1 py-2 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
                >
                  {sbTesting ? 'Menyimpan & Menguji...' : 'Simpan Permanen & Uji Koneksi'}
                </button>
                {(supabaseConfigSource === 'server' || supabaseConfigSource === 'local') && (
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

            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
              <span className="text-slate-600">
                Sesi Login Supabase Auth:{' '}
                <strong className={supabaseSessionActive ? 'text-emerald-700' : 'text-amber-700'}>
                  {supabaseSessionActive ? 'Aktif (JWT Terautentikasi)' : 'Belum Aktif'}
                </strong>
              </span>
              <button
                type="button"
                disabled={sbPushing}
                onClick={async () => {
                  setSbPushing(true);
                  const res = await pushLocalDataToSupabase();
                  setSbSyncFeedback({ ok: res.ok, text: res.message });
                  setSbPushing(false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md disabled:opacity-60"
              >
                <Upload className="w-3 h-3" />
                <span>{sbPushing ? 'Mengirim...' : 'Kirim Data Lokal ke Supabase'}</span>
              </button>
            </div>

            <div
              className={`p-3 rounded-lg border text-xs leading-relaxed ${
                connectionMode === 'supabase' && supabaseSessionActive
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : connectionMode === 'supabase'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
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
