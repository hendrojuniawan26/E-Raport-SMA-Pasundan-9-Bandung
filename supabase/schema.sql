-- ============================================================================
-- SKEMA DATABASE SUPABASE (POSTGRESQL) - IDEMPOTENT & AMAN DIJALANKAN ULANG
-- Sistem Informasi Pengolahan Nilai Raport Kurikulum Merdeka
-- SMA PASUNDAN 9 BANDUNG
-- ============================================================================

-- Ekstensi UUID opsional (Primary key menggunakan gen_random_uuid() bawaan PostgreSQL)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- 1. ENUM TIPE ROLE & JENIS KELAMIN
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'guru', 'wali_kelas');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gender_type AS ENUM ('L', 'P');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. TABEL PROFIL PENGGUNA (Terhubung ke Supabase Auth auth.users)
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

-- 3. TABEL PENGATURAN SEKOLAH & BOBOT PENILAIAN
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

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. TABEL KELAS (Fase E = Kelas X, Fase F = Kelas XI & XII)
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  grade_level INTEGER NOT NULL CHECK (grade_level IN (10, 11, 12)),
  fase TEXT NOT NULL CHECK (fase IN ('E', 'F')),
  homeroom_teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 5. TABEL MATA PELAJARAN
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

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS fase_scope TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS class_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 6. TABEL TUJUAN PEMBELAJARAN (TP / Lingkup Materi)
CREATE TABLE IF NOT EXISTS public.learning_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  is_sas BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.learning_objectives
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 7. TABEL SISWA
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

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 8. TABEL NILAI MATA PELAJARAN PER SISWA
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

ALTER TABLE public.student_grades
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 9. TABEL CATATAN WALI KELAS, ABSENSI, EKSKUL & P5
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

ALTER TABLE public.homeroom_records
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 10. TABEL STATUS KUNCI & PENGIRIMAN NILAI GURU KE WALI KELAS
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

-- 11. TABEL NOTIFIKASI REALTIME NILAI BARU UNTUK WALI KELAS
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

-- ============================================================================
-- INDEKS PERFORMA
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_subject ON public.student_grades(student_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_lo_subject ON public.learning_objectives(subject_id);
CREATE INDEX IF NOT EXISTS idx_grade_notifications_created_at ON public.grade_notifications(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) & KEBIJAKAN HAK AKSES (IDEMPOTENT)
-- ============================================================================
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

-- Helper function cek role user aktif
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Profiles
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Profiles modifiable by admin or self" ON public.profiles;
CREATE POLICY "Profiles modifiable by admin or self" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id OR public.get_my_role() = 'admin')
  WITH CHECK (auth.uid() = id OR public.get_my_role() = 'admin');

-- School Settings
DROP POLICY IF EXISTS "Settings readable by authenticated" ON public.school_settings;
CREATE POLICY "Settings readable by authenticated" ON public.school_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Settings modifiable by admin" ON public.school_settings;
CREATE POLICY "Settings modifiable by admin" ON public.school_settings
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Classes, Subjects, Learning Objectives, Students
DROP POLICY IF EXISTS "Classes readable" ON public.classes;
CREATE POLICY "Classes readable" ON public.classes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Classes admin write" ON public.classes;
CREATE POLICY "Classes admin write" ON public.classes
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Subjects readable" ON public.subjects;
CREATE POLICY "Subjects readable" ON public.subjects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Subjects admin write" ON public.subjects;
CREATE POLICY "Subjects admin write" ON public.subjects
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "LO readable" ON public.learning_objectives;
CREATE POLICY "LO readable" ON public.learning_objectives
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "LO staff write" ON public.learning_objectives;
CREATE POLICY "LO staff write" ON public.learning_objectives
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'))
  WITH CHECK (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

DROP POLICY IF EXISTS "Students readable" ON public.students;
CREATE POLICY "Students readable" ON public.students
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Students admin write" ON public.students;
CREATE POLICY "Students admin write" ON public.students
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Nilai Akademik
DROP POLICY IF EXISTS "Grades readable by staff" ON public.student_grades;
CREATE POLICY "Grades readable by staff" ON public.student_grades
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Grades writable by staff" ON public.student_grades;
CREATE POLICY "Grades writable by staff" ON public.student_grades
  FOR ALL TO authenticated
  USING (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'guru'
      AND EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = subject_id AND (s.teacher_id = auth.uid() OR s.teacher_id IS NULL)
      )
    )
    OR (
      public.get_my_role() = 'wali_kelas'
      AND EXISTS (
        SELECT 1 FROM public.students st
        JOIN public.classes c ON c.id = st.class_id
        WHERE st.id = student_id AND (c.homeroom_teacher_id = auth.uid() OR c.homeroom_teacher_id IS NULL)
      )
    )
  )
  WITH CHECK (
    public.get_my_role() IN ('admin', 'guru', 'wali_kelas')
  );

-- Homeroom Records
DROP POLICY IF EXISTS "Homeroom readable by staff" ON public.homeroom_records;
CREATE POLICY "Homeroom readable by staff" ON public.homeroom_records
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Homeroom writable by wali_kelas & admin" ON public.homeroom_records;
CREATE POLICY "Homeroom writable by wali_kelas & admin" ON public.homeroom_records
  FOR ALL TO authenticated
  USING (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'wali_kelas'
      AND EXISTS (
        SELECT 1 FROM public.students st
        JOIN public.classes c ON c.id = st.class_id
        WHERE st.id = student_id AND (c.homeroom_teacher_id = auth.uid() OR c.homeroom_teacher_id IS NULL)
      )
    )
  )
  WITH CHECK (public.get_my_role() IN ('admin', 'wali_kelas'));

-- Grade Submissions
DROP POLICY IF EXISTS "Submissions readable by staff" ON public.grade_submissions;
CREATE POLICY "Submissions readable by staff" ON public.grade_submissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Submissions writable by staff" ON public.grade_submissions;
CREATE POLICY "Submissions writable by staff" ON public.grade_submissions
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'))
  WITH CHECK (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

-- Grade Notifications
DROP POLICY IF EXISTS "Grade notifications readable by staff" ON public.grade_notifications;
CREATE POLICY "Grade notifications readable by staff" ON public.grade_notifications
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Grade notifications insertable by staff" ON public.grade_notifications;
CREATE POLICY "Grade notifications insertable by staff" ON public.grade_notifications
  FOR INSERT TO authenticated, anon WITH CHECK (true);

-- ============================================================================
-- SUPABASE STORAGE BUCKET (Foto Siswa & Logo Sekolah) - AMAN JIKA SUDAH ADA
-- ============================================================================
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('school-assets', 'school-assets', true)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read school assets" ON storage.objects;
  CREATE POLICY "Public read school assets" ON storage.objects
    FOR SELECT USING (bucket_id = 'school-assets');

  DROP POLICY IF EXISTS "Authenticated upload school assets" ON storage.objects;
  CREATE POLICY "Authenticated upload school assets" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'school-assets');

  DROP POLICY IF EXISTS "Authenticated update school assets" ON storage.objects;
  CREATE POLICY "Authenticated update school assets" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'school-assets');
EXCEPTION WHEN insufficient_privilege OR duplicate_object OR undefined_table THEN null;
END $$;

-- ============================================================================
-- DATA AWAL DEFAULT (SMA PASUNDAN 9 BANDUNG)
-- ============================================================================
INSERT INTO public.school_settings (
  yayasan, school_name, address, academic_year, semester,
  principal_name, principal_nip, default_kktp, threshold_baik
)
SELECT
  'YAYASAN PENDIDIKAN DASAR DAN MENENGAH PASUNDAN',
  'SMA PASUNDAN 9 BANDUNG',
  'Jl. Babakan Ciparay - Gg. Atakiria I No. 28 Telp. 022-6038372 Bandung 40233',
  '2025/2026',
  'Ganjil',
  'Ahmad Mukhlis Sadid, S.Pd.I., SIP.',
  '19023L0550260241079529',
  70,
  90
WHERE NOT EXISTS (SELECT 1 FROM public.school_settings);

-- ============================================================================
-- SUPABASE REALTIME (AMAN UNTUK ALL TABLES MAUPUN TABEL SPESIFIK)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = 'supabase_realtime' AND NOT puballtables
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_grades'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.student_grades;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'grade_notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.grade_notifications;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN null;
END $$;
