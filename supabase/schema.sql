-- ============================================================================
-- SKEMA DATABASE SUPABASE (POSTGRESQL) - IDEMPOTENT & AMAN DIJALANKAN ULANG
-- Sistem Informasi Pengolahan Nilai Raport Kurikulum Merdeka
-- SMA PASUNDAN 9 BANDUNG
-- ============================================================================

-- 1. EKSTENSI UUID & KRIPTOGRAFI
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- 2. ENUM TIPE ROLE & JENIS KELAMIN
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

-- 3. TABEL PROFIL PENGGUNA (Terhubung ke Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  nip_nuptk TEXT DEFAULT '',
  nrks TEXT DEFAULT '',
  role public.user_role NOT NULL DEFAULT 'guru',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_class_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS assigned_class_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 4. TABEL PENGATURAN SEKOLAH & BOBOT PENILAIAN
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
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 5. TABEL KELAS (Fase E = Kelas X, Fase F = Kelas XI & XII)
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

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_assigned_class_id_fkey
    FOREIGN KEY (assigned_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 6. TABEL MATA PELAJARAN
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

-- 7. TABEL TUJUAN PEMBELAJARAN (TP / Lingkup Materi)
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

-- 8. TABEL SISWA
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

-- 9. TABEL NILAI MATA PELAJARAN PER SISWA
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

-- 10. TABEL CATATAN WALI KELAS, ABSENSI, EKSKUL & P5
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

-- 11. TABEL STATUS KUNCI & PENGIRIMAN NILAI GURU KE WALI KELAS
CREATE TABLE IF NOT EXISTS public.grade_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked', 'sent')),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  locked_by_name TEXT DEFAULT '',
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_by_name TEXT DEFAULT '',
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, subject_id, academic_year, semester)
);

ALTER TABLE public.grade_submissions
  ADD COLUMN IF NOT EXISTS locked_by_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS sent_by_name TEXT DEFAULT '';

-- 12. TABEL NOTIFIKASI REALTIME NILAI BARU UNTUK WALI KELAS
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
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_class ON public.profiles(assigned_class_id);
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

GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Helper function cek role user AKTIF (user nonaktif otomatis ditolak RLS)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
$$;

-- Trigger auto-confirm email & bootstrap Admin pertama kali (akun lain hanya dibuat lewat Admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Aktifkan akun langsung tanpa perlu verifikasi email
  BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = NEW.id AND email_confirmed_at IS NULL;
  EXCEPTION WHEN OTHERS THEN null;
  END;

  -- Hanya auto-buat profil saat inisialisasi Admin pertama;
  -- akun Guru / Wali / Admin berikutnya hanya boleh didaftarkan oleh Admin via RPC admin_create_user.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    INSERT INTO public.profiles (id, email, full_name, nip_nuptk, role, is_active)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(COALESCE(NEW.email, 'User'), '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'nip_nuptk', ''),
      'admin',
      TRUE
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN null;
END $$;

-- Backfill otomatis & konfirmasi akun auth.users yang sudah ada sebelum skrip SQL ini dijalankan
DO $$ BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE email_confirmed_at IS NULL;

  INSERT INTO public.profiles (id, email, full_name, nip_nuptk, role, is_active)
  SELECT
    u.id,
    COALESCE(u.email, ''),
    COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''), split_part(COALESCE(u.email, 'User'), '@', 1)),
    COALESCE(u.raw_user_meta_data->>'nip_nuptk', ''),
    CASE
      WHEN u.raw_user_meta_data->>'role' = 'wali_kelas' THEN 'wali_kelas'::public.user_role
      ELSE 'guru'::public.user_role
    END,
    TRUE
  FROM auth.users u
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET role = 'admin', is_active = TRUE
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

-- Profiles (Hanya Admin aktif yang dapat mendaftarkan, mengubah role/status, atau menghapus akun pengguna)
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL OR auth.uid() = id);

DROP POLICY IF EXISTS "Profiles modifiable by admin or self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insertable by admin only" ON public.profiles;
DROP POLICY IF EXISTS "Profiles updatable by admin or self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles deletable by admin only" ON public.profiles;

CREATE POLICY "Profiles insertable by admin only" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Profiles updatable by admin or self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin' OR (auth.uid() = id AND is_active = TRUE))
  WITH CHECK (
    public.get_my_role() = 'admin'
    OR (auth.uid() = id AND role = public.get_my_role() AND is_active = TRUE)
  );

CREATE POLICY "Profiles deletable by admin only" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================================
-- FUNGSI RPC KHUSUS ADMIN: CREATE, UPDATE & DELETE USER (LANGSUNG AKTIF)
-- ============================================================================
-- Tetap bekerja meskipun "Allow new users to sign up" / Email signups dimatikan di Supabase Dashboard
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
  v_class_raw TEXT := trim(COALESCE(p_assigned_class_id, ''));
  v_class_id UUID := NULL;
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Hanya Admin Sekolah yang dapat mendaftarkan akun baru.';
  END IF;

  IF v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Format email tidak valid.';
  END IF;

  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Nama lengkap minimal 2 karakter.';
  END IF;

  IF length(COALESCE(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'Kata sandi minimal 6 karakter.';
  END IF;

  IF p_role NOT IN ('admin', 'guru', 'wali_kelas') THEN
    RAISE EXCEPTION 'Role harus admin, guru, atau wali_kelas.';
  END IF;
  v_role := p_role::public.user_role;

  IF v_role = 'wali_kelas'
     AND v_class_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_class_id FROM public.classes WHERE id = v_class_raw::uuid;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Email tersebut sudah terdaftar di Supabase Authentication.';
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', v_name,
      'nip_nuptk', v_nip,
      'role', p_role,
      'assigned_class_id', v_class_id::text
    ),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, nip_nuptk, nrks, role, is_active, assigned_class_id)
  VALUES (v_user_id, v_email, v_name, v_nip, v_nrks, v_role, TRUE, v_class_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    nip_nuptk = EXCLUDED.nip_nuptk,
    nrks = EXCLUDED.nrks,
    role = EXCLUDED.role,
    is_active = TRUE,
    assigned_class_id = EXCLUDED.assigned_class_id,
    updated_at = NOW();

  IF v_role = 'wali_kelas' AND v_class_id IS NOT NULL THEN
    UPDATE public.classes
    SET homeroom_teacher_id = v_user_id
    WHERE id = v_class_id;
  END IF;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_nip_nuptk TEXT DEFAULT NULL,
  p_nrks TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_assigned_class_id TEXT DEFAULT NULL,
  p_clear_assigned_class BOOLEAN DEFAULT FALSE,
  p_new_password TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_next_name TEXT;
  v_next_nip TEXT;
  v_next_nrks TEXT;
  v_next_role public.user_role;
  v_next_active BOOLEAN;
  v_class_raw TEXT := trim(COALESCE(p_assigned_class_id, ''));
  v_next_class_id UUID;
  v_other_active_admins INTEGER;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Hanya Admin Sekolah yang dapat memperbarui akun pengguna.';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun pengguna tidak ditemukan di Supabase.';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN ('admin', 'guru', 'wali_kelas') THEN
    RAISE EXCEPTION 'Role harus admin, guru, atau wali_kelas.';
  END IF;

  v_next_name := CASE WHEN p_full_name IS NOT NULL AND length(trim(p_full_name)) >= 2 THEN trim(p_full_name) ELSE v_target.full_name END;
  v_next_nip := CASE WHEN p_nip_nuptk IS NOT NULL THEN trim(p_nip_nuptk) ELSE COALESCE(v_target.nip_nuptk, '') END;
  v_next_nrks := CASE WHEN p_nrks IS NOT NULL THEN trim(p_nrks) ELSE COALESCE(v_target.nrks, '') END;
  v_next_role := CASE WHEN p_role IS NOT NULL THEN p_role::public.user_role ELSE v_target.role END;
  v_next_active := CASE WHEN p_is_active IS NOT NULL THEN p_is_active ELSE v_target.is_active END;

  IF p_user_id = auth.uid() AND (v_next_role <> 'admin' OR v_next_active = FALSE) THEN
    RAISE EXCEPTION 'Anda tidak dapat menurunkan role atau menonaktifkan akun Anda sendiri.';
  END IF;

  SELECT COUNT(*) INTO v_other_active_admins
  FROM public.profiles
  WHERE role = 'admin' AND is_active = TRUE AND id <> p_user_id;

  IF v_other_active_admins = 0 AND (v_next_role <> 'admin' OR v_next_active = FALSE) THEN
    RAISE EXCEPTION 'Sistem harus menyisakan minimal 1 akun Admin yang aktif.';
  END IF;

  IF v_next_role <> 'wali_kelas' OR p_clear_assigned_class THEN
    v_next_class_id := NULL;
  ELSIF p_assigned_class_id IS NOT NULL THEN
    IF v_class_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_next_class_id FROM public.classes WHERE id = v_class_raw::uuid;
    ELSE
      v_next_class_id := NULL;
    END IF;
  ELSE
    v_next_class_id := v_target.assigned_class_id;
  END IF;

  IF p_new_password IS NOT NULL AND length(p_new_password) > 0 THEN
    IF length(p_new_password) < 6 THEN
      RAISE EXCEPTION 'Kata sandi baru minimal 6 karakter.';
    END IF;
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = p_user_id;
  END IF;

  UPDATE auth.users
  SET banned_until = CASE WHEN v_next_active THEN NULL ELSE '2099-12-31T23:59:59Z'::timestamptz END,
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', v_next_name,
        'nip_nuptk', v_next_nip,
        'role', v_next_role::text,
        'assigned_class_id', v_next_class_id::text
      ),
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE public.profiles
  SET full_name = v_next_name,
      nip_nuptk = v_next_nip,
      nrks = v_next_nrks,
      role = v_next_role,
      is_active = v_next_active,
      assigned_class_id = v_next_class_id,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF v_next_role = 'wali_kelas' AND v_next_class_id IS NOT NULL THEN
    UPDATE public.classes
    SET homeroom_teacher_id = NULL
    WHERE homeroom_teacher_id = p_user_id AND id <> v_next_class_id;

    UPDATE public.classes
    SET homeroom_teacher_id = p_user_id
    WHERE id = v_next_class_id;
  ELSE
    UPDATE public.classes
    SET homeroom_teacher_id = NULL
    WHERE homeroom_teacher_id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_other_active_admins INTEGER;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Hanya Admin Sekolah yang dapat menghapus akun pengguna.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Tidak dapat menghapus akun yang sedang digunakan.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Akun pengguna tidak ditemukan.';
  END IF;

  SELECT COUNT(*) INTO v_other_active_admins
  FROM public.profiles
  WHERE role = 'admin' AND is_active = TRUE AND id <> p_user_id;

  IF v_other_active_admins = 0 THEN
    RAISE EXCEPTION 'Sistem harus menyisakan minimal 1 akun Admin yang aktif.';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- School Settings
DROP POLICY IF EXISTS "Settings readable by authenticated" ON public.school_settings;
CREATE POLICY "Settings readable by authenticated" ON public.school_settings
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "Settings modifiable by admin" ON public.school_settings;
CREATE POLICY "Settings modifiable by admin" ON public.school_settings
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Classes, Subjects, Learning Objectives, Students
DROP POLICY IF EXISTS "Classes readable" ON public.classes;
CREATE POLICY "Classes readable" ON public.classes
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "Classes admin write" ON public.classes;
CREATE POLICY "Classes admin write" ON public.classes
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Subjects readable" ON public.subjects;
CREATE POLICY "Subjects readable" ON public.subjects
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "Subjects admin write" ON public.subjects;
CREATE POLICY "Subjects admin write" ON public.subjects
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "LO readable" ON public.learning_objectives;
CREATE POLICY "LO readable" ON public.learning_objectives
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "LO staff write" ON public.learning_objectives;
CREATE POLICY "LO staff write" ON public.learning_objectives
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'))
  WITH CHECK (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

DROP POLICY IF EXISTS "Students readable" ON public.students;
CREATE POLICY "Students readable" ON public.students
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "Students admin write" ON public.students;
CREATE POLICY "Students admin write" ON public.students
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Nilai Akademik
DROP POLICY IF EXISTS "Grades readable by staff" ON public.student_grades;
CREATE POLICY "Grades readable by staff" ON public.student_grades
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

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
  );

-- Homeroom Records
DROP POLICY IF EXISTS "Homeroom readable by staff" ON public.homeroom_records;
CREATE POLICY "Homeroom readable by staff" ON public.homeroom_records
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

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
  WITH CHECK (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'wali_kelas'
      AND EXISTS (
        SELECT 1 FROM public.students st
        JOIN public.classes c ON c.id = st.class_id
        WHERE st.id = student_id AND (c.homeroom_teacher_id = auth.uid() OR c.homeroom_teacher_id IS NULL)
      )
    )
  );

-- Grade Submissions
DROP POLICY IF EXISTS "Submissions readable by staff" ON public.grade_submissions;
CREATE POLICY "Submissions readable by staff" ON public.grade_submissions
  FOR SELECT TO authenticated USING (public.get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "Submissions writable by staff" ON public.grade_submissions;
CREATE POLICY "Submissions writable by staff" ON public.grade_submissions
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
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND (c.homeroom_teacher_id = auth.uid() OR c.homeroom_teacher_id IS NULL)
      )
    )
  )
  WITH CHECK (
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
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND (c.homeroom_teacher_id = auth.uid() OR c.homeroom_teacher_id IS NULL)
      )
    )
  );

-- Grade Notifications (khusus pengguna terautentikasi aktif)
DROP POLICY IF EXISTS "Grade notifications readable by staff" ON public.grade_notifications;
CREATE POLICY "Grade notifications readable by staff" ON public.grade_notifications
  FOR SELECT TO authenticated USING (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

DROP POLICY IF EXISTS "Grade notifications insertable by staff" ON public.grade_notifications;
CREATE POLICY "Grade notifications insertable by staff" ON public.grade_notifications
  FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'guru', 'wali_kelas'));

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

  DROP POLICY IF EXISTS "Authenticated delete school assets" ON storage.objects;
  CREATE POLICY "Authenticated delete school assets" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'school-assets');
EXCEPTION WHEN insufficient_privilege OR duplicate_object OR undefined_table THEN null;
END $$;

-- ============================================================================
-- DATA AWAL DEFAULT (SMA PASUNDAN 9 BANDUNG) - ID DETERMINISTIK
-- ============================================================================
INSERT INTO public.school_settings (
  id, yayasan, school_name, npsn, address, academic_year, semester,
  principal_name, principal_nip, default_kktp, threshold_baik
)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  'YAYASAN PENDIDIKAN DASAR DAN MENENGAH PASUNDAN',
  'SMA PASUNDAN 9 BANDUNG',
  '20219784',
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
