import { SupabaseClient } from '@supabase/supabase-js';
import {
  ClassRoom,
  ExtracurricularItem,
  GradeSubmission,
  HomeroomRecord,
  P5ProjectItem,
  SchoolSettings,
  Student,
  Subject,
  SubjectGrade,
  TujuanPembelajaran,
  UserProfile,
  UserRole,
} from '../types/raport';
import { INITIAL_SCHOOL_SETTINGS } from '../data/seedData';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function deriveDeterministicUuid(seedUuid: string, tag: string): string {
  const clean = seedUuid.replace(/[^0-9a-f]/gi, '').toLowerCase().padEnd(32, '0');
  let h1 = 0x9e3779b1;
  let h2 = 0x85ebca77;
  const input = `${clean}:${tag}`;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x85ebca6b) >>> 0;
    h2 = Math.imul(h2 ^ ch, 0xc2b2ae35) >>> 0;
  }
  const suffix =
    h1.toString(16).padStart(8, '0').slice(-4) +
    h2.toString(16).padStart(8, '0');
  const head = clean.slice(0, 12);
  const clockHi = ((parseInt(clean.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, '0');
  const clockLo = clean.slice(18, 20);
  return `${head.slice(0, 8)}-${head.slice(8, 12)}-4${clean.slice(13, 16)}-${clockHi}${clockLo}-${suffix}`;
}

export interface SupabaseLoadedSchoolData {
  settings?: SchoolSettings;
  users?: (UserProfile & { hasPassword?: boolean })[];
  classes: ClassRoom[];
  subjects: Subject[];
  students: Student[];
  grades: SubjectGrade[];
  homeroomRecords: HomeroomRecord[];
  gradeSubmissions: GradeSubmission[];
}

export async function fetchSchoolStateFromSupabase(
  client: SupabaseClient
): Promise<{ ok: boolean; data?: SupabaseLoadedSchoolData; error?: string }> {
  try {
    const [
      settingsRes,
      profilesRes,
      classesRes,
      subjectsRes,
      loRes,
      studentsRes,
      gradesRes,
      homeroomRes,
      submissionsRes,
    ] = await Promise.all([
      client
        .from('school_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1),
      client.from('profiles').select('*').order('full_name', { ascending: true }),
      client
        .from('classes')
        .select('*')
        .order('grade_level', { ascending: true })
        .order('name', { ascending: true }),
      client
        .from('subjects')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      client.from('learning_objectives').select('*').order('sort_order', { ascending: true }),
      client.from('students').select('*').order('full_name', { ascending: true }),
      client.from('student_grades').select('*'),
      client.from('homeroom_records').select('*'),
      client.from('grade_submissions').select('*'),
    ]);

    const firstError =
      settingsRes.error ||
      profilesRes.error ||
      classesRes.error ||
      subjectsRes.error ||
      loRes.error ||
      studentsRes.error ||
      gradesRes.error ||
      homeroomRes.error ||
      submissionsRes.error;

    if (firstError) {
      const msgLower = firstError.message.toLowerCase();
      if (firstError.code === '42501' || msgLower.includes('permission denied')) {
        return {
          ok: false,
          error:
            'Akses baca tabel Supabase ditolak (42501 permission denied). Pastikan Anda masuk dengan akun aktif yang terdaftar di Supabase Authentication (dengan role yang sesuai di tabel profiles) dan skrip SQL RLS/GRANT terbaru sudah dijalankan di Supabase SQL Editor.',
        };
      }
      return { ok: false, error: firstError.message };
    }

    const classes: ClassRoom[] = Array.isArray(classesRes.data)
      ? classesRes.data.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          gradeLevel: (row.grade_level === 10 || row.grade_level === 12
            ? row.grade_level
            : 11) as 10 | 11 | 12,
          fase: row.fase === 'E' ? 'E' : 'F',
          homeroomTeacherId: row.homeroom_teacher_id
            ? String(row.homeroom_teacher_id)
            : undefined,
          academicYear: String(row.academic_year || '2025/2026'),
        }))
      : [];

    const profiles: (UserProfile & { hasPassword?: boolean })[] = Array.isArray(profilesRes.data)
      ? profilesRes.data.map((row) => {
          const id = String(row.id);
          const role = (row.role as UserRole) || 'guru';
          const explicitClassId = row.assigned_class_id ? String(row.assigned_class_id) : undefined;
          const inferredClassId =
            role === 'wali_kelas'
              ? explicitClassId || classes.find((c) => c.homeroomTeacherId === id)?.id
              : undefined;
          return {
            id,
            email: String(row.email || ''),
            fullName: String(row.full_name || ''),
            nipNuptk: String(row.nip_nuptk || ''),
            nrks: row.nrks ? String(row.nrks) : undefined,
            role,
            avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
            assignedClassId: inferredClassId,
            isActive: row.is_active !== false,
            hasPassword: true,
          };
        })
      : [];

    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    let settings: SchoolSettings | undefined;
    if (Array.isArray(settingsRes.data) && settingsRes.data.length > 0) {
      const s = settingsRes.data[0];
      settings = {
        id: String(s.id),
        yayasan: String(s.yayasan || INITIAL_SCHOOL_SETTINGS.yayasan),
        schoolName: String(s.school_name || INITIAL_SCHOOL_SETTINGS.schoolName),
        npsn: String(s.npsn || INITIAL_SCHOOL_SETTINGS.npsn),
        address: String(s.address || INITIAL_SCHOOL_SETTINGS.address),
        academicYear: String(s.academic_year || INITIAL_SCHOOL_SETTINGS.academicYear),
        semester: s.semester === 'Genap' ? 'Genap' : 'Ganjil',
        principalName: String(s.principal_name || INITIAL_SCHOOL_SETTINGS.principalName),
        principalNip: String(s.principal_nip || INITIAL_SCHOOL_SETTINGS.principalNip),
        reportCity: String(s.report_city || INITIAL_SCHOOL_SETTINGS.reportCity),
        reportDate: String(s.report_date || INITIAL_SCHOOL_SETTINGS.reportDate),
        logoUrl: s.logo_url ? String(s.logo_url) : INITIAL_SCHOOL_SETTINGS.logoUrl,
        defaultKktp: Number(s.default_kktp ?? 70),
        thresholdBaik: Number(s.threshold_baik ?? 90),
        autoPrkFormula: Boolean(s.auto_prk_formula ?? true),
        weights: {
          sumatifPpk: Number(s.weight_sumatif_ppk ?? 20),
          sumatifPrk: Number(s.weight_sumatif_prk ?? 30),
          sas: Number(s.weight_sas ?? 10),
          kehadiran: Number(s.weight_kehadiran ?? 10),
          proses: Number(s.weight_proses ?? 10),
          tugas: Number(s.weight_tugas ?? 20),
        },
      };
    }

    const loBySubject = new Map<string, { tpList: TujuanPembelajaran[]; sasTitle: string }>();
    if (Array.isArray(loRes.data)) {
      loRes.data.forEach((row) => {
        const subId = String(row.subject_id);
        const current = loBySubject.get(subId) || { tpList: [], sasTitle: '' };
        if (row.is_sas) {
          current.sasTitle = String(row.title || '');
        } else {
          current.tpList.push({
            id: String(row.id),
            code: String(row.code || `Sumatif ${current.tpList.length + 1}`),
            title: String(row.title || ''),
            isSas: false,
          });
        }
        loBySubject.set(subId, current);
      });
    }

    const subjects: Subject[] = Array.isArray(subjectsRes.data)
      ? subjectsRes.data.map((row) => {
          const id = String(row.id);
          const teacherId = row.teacher_id ? String(row.teacher_id) : undefined;
          const teacher = teacherId ? profileMap.get(teacherId) : undefined;
          const loInfo = loBySubject.get(id);
          return {
            id,
            code: String(row.code || ''),
            name: String(row.name || ''),
            category:
              row.category === 'Pilihan' || row.category === 'Muatan Lokal'
                ? row.category
                : 'Umum',
            faseScope:
              row.fase_scope === 'E' || row.fase_scope === 'F' ? row.fase_scope : 'ALL',
            classIds: Array.isArray(row.class_ids)
              ? row.class_ids.map(String)
              : undefined,
            kktp: Number(row.kktp ?? 70),
            teacherId,
            teacherName: teacher?.fullName,
            teacherNip: teacher?.nipNuptk,
            sortOrder: Number(row.sort_order ?? 1),
            tpList: loInfo?.tpList || [],
            sasTitle: loInfo?.sasTitle || 'Sumatif Akhir Semester',
          };
        })
      : [];

    const students: Student[] = Array.isArray(studentsRes.data)
      ? studentsRes.data.map((row) => ({
          id: String(row.id),
          nis: String(row.nis || ''),
          nisn: String(row.nisn || ''),
          fullName: String(row.full_name || ''),
          gender: row.gender === 'P' ? 'P' : 'L',
          classId: String(row.class_id || ''),
          birthPlace: String(row.birth_place || 'Bandung'),
          birthDate: row.birth_date ? String(row.birth_date) : '',
          religion: String(row.religion || 'Islam'),
          address: String(row.address || ''),
          parentName: String(row.parent_name || ''),
          photoUrl: row.photo_url ? String(row.photo_url) : undefined,
          isActive: row.is_active !== false,
        }))
      : [];

    const grades: SubjectGrade[] = Array.isArray(gradesRes.data)
      ? gradesRes.data.map((row) => ({
          id: String(row.id),
          studentId: String(row.student_id),
          subjectId: String(row.subject_id),
          academicYear: String(row.academic_year || '2025/2026'),
          semester: row.semester === 'Genap' ? 'Genap' : 'Ganjil',
          tpScores: Array.isArray(row.tp_scores) ? row.tp_scores : [],
          sasPpk: row.sas_ppk === null || row.sas_ppk === undefined ? null : Number(row.sas_ppk),
          sasPrk: row.sas_prk === null || row.sas_prk === undefined ? null : Number(row.sas_prk),
          kehadiran:
            row.kehadiran === null || row.kehadiran === undefined ? null : Number(row.kehadiran),
          proses: row.proses === null || row.proses === undefined ? null : Number(row.proses),
          tugas: row.tugas === null || row.tugas === undefined ? null : Number(row.tugas),
          p3Scores: Array.isArray(row.p3_scores) ? row.p3_scores.map(Number) : [85, 85, 85, 85, 85, 85],
          nilaiAkhir: Number(row.nilai_akhir ?? 0),
          predikat:
            row.predikat === 'A' ||
            row.predikat === 'B' ||
            row.predikat === 'C' ||
            row.predikat === 'D'
              ? row.predikat
              : 'C',
          deskripsiAuto: String(row.deskripsi_auto || ''),
          deskripsiManual: row.deskripsi_manual ? String(row.deskripsi_manual) : undefined,
          updatedAt: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
        }))
      : [];

    const homeroomRecords: HomeroomRecord[] = Array.isArray(homeroomRes.data)
      ? homeroomRes.data.map((row) => ({
          id: String(row.id),
          studentId: String(row.student_id),
          academicYear: String(row.academic_year || '2025/2026'),
          semester: row.semester === 'Genap' ? 'Genap' : 'Ganjil',
          sakit: Number(row.sakit ?? 0),
          izin: Number(row.izin ?? 0),
          alpha: Number(row.alpha ?? 0),
          waliNote: String(row.wali_note || ''),
          promotionStatus: String(row.promotion_status || 'Naik ke kelas berikutnya'),
          extracurriculars: Array.isArray(row.extracurriculars)
            ? (row.extracurriculars as ExtracurricularItem[])
            : [],
          p5Projects: Array.isArray(row.p5_projects)
            ? (row.p5_projects as P5ProjectItem[])
            : [],
          updatedAt: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
        }))
      : [];

    const gradeSubmissions: GradeSubmission[] = Array.isArray(submissionsRes.data)
      ? submissionsRes.data.map((row) => {
          const lockedById = row.locked_by ? String(row.locked_by) : '';
          const sentById = row.sent_by ? String(row.sent_by) : '';
          const lockedName = row.locked_by_name ? String(row.locked_by_name).trim() : '';
          const sentName = row.sent_by_name ? String(row.sent_by_name).trim() : '';
          return {
            id: String(row.id),
            classId: String(row.class_id),
            subjectId: String(row.subject_id),
            academicYear: String(row.academic_year || '2025/2026'),
            semester: row.semester === 'Genap' ? 'Genap' : 'Ganjil',
            status:
              row.status === 'locked' || row.status === 'sent' ? row.status : 'draft',
            lockedAt: row.locked_at ? String(row.locked_at) : undefined,
            lockedBy:
              lockedName ||
              (lockedById ? profileMap.get(lockedById)?.fullName || lockedById : undefined),
            sentAt: row.sent_at ? String(row.sent_at) : undefined,
            sentBy:
              sentName ||
              (sentById ? profileMap.get(sentById)?.fullName || sentById : undefined),
            note: row.note ? String(row.note) : undefined,
            updatedAt: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
          };
        })
      : [];

    return {
      ok: true,
      data: {
        settings,
        users: profiles.length > 0 ? profiles : undefined,
        classes,
        subjects,
        students,
        grades,
        homeroomRecords,
        gradeSubmissions,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal memuat data dari Supabase.',
    };
  }
}

function formatSupabaseSyncError(table: string, err: { code?: string; message: string }): string {
  const lower = err.message.toLowerCase();
  if (err.code === '42501' || lower.includes('permission denied') || lower.includes('row-level security')) {
    return `Izin simpan ke tabel "${table}" ditolak RLS/GRANT (${err.message}). Pastikan akun Anda login melalui Supabase Auth dan memiliki role aktif yang sesuai di tabel profiles.`;
  }
  if (err.code === '42P01' || lower.includes('does not exist')) {
    return `Tabel "${table}" belum tersedia di Supabase. Jalankan skrip SQL di tab Database Supabase & SQL.`;
  }
  return `Gagal menyinkronkan tabel "${table}": ${err.message}`;
}

export async function syncSchoolDataToSupabase(
  client: SupabaseClient,
  payload: {
    role: UserRole;
    userId?: string;
    settings: SchoolSettings;
    classes: ClassRoom[];
    subjects: Subject[];
    students: Student[];
    grades: SubjectGrade[];
    homeroomRecords: HomeroomRecord[];
    gradeSubmissions: GradeSubmission[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const { role, settings, classes, subjects, students, grades, homeroomRecords, gradeSubmissions } =
    payload;

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    return {
      ok: false,
      error:
        'Sesi login Supabase Auth belum aktif (data tersimpan di server sekolah/lokal). Masuk menggunakan akun yang terdaftar di Supabase Authentication untuk menyinkronkan ke database Supabase.',
    };
  }

  const activeUid = sessionData.session.user.id || payload.userId || '';

  // Fetch valid Supabase profile IDs to avoid FK violation on teacher_id/homeroom_teacher_id
  let validProfileIds = new Set<string>();
  try {
    const { data: profs } = await client.from('profiles').select('id');
    if (Array.isArray(profs)) {
      validProfileIds = new Set(profs.map((p) => String(p.id)));
    }
  } catch {
    // ignore
  }

  const validActorProfileId = isUuid(activeUid) && validProfileIds.has(activeUid) ? activeUid : null;

  if (role === 'admin') {
    const settingsRow = {
      ...(isUuid(settings.id) ? { id: settings.id } : {}),
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
      logo_url: settings.logoUrl || null,
      default_kktp: settings.defaultKktp,
      threshold_baik: settings.thresholdBaik,
      weight_sumatif_ppk: settings.weights.sumatifPpk,
      weight_sumatif_prk: settings.weights.sumatifPrk,
      weight_sas: settings.weights.sas,
      weight_kehadiran: settings.weights.kehadiran,
      weight_proses: settings.weights.proses,
      weight_tugas: settings.weights.tugas,
      auto_prk_formula: settings.autoPrkFormula,
    };
    if (isUuid(settings.id)) {
      const { error } = await client
        .from('school_settings')
        .upsert(settingsRow, { onConflict: 'id' });
      if (error) return { ok: false, error: formatSupabaseSyncError('school_settings', error) };
    }

    if (classes.length > 0) {
      const classRows = classes
        .filter((c) => isUuid(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          grade_level: c.gradeLevel,
          fase: c.fase,
          homeroom_teacher_id:
            c.homeroomTeacherId && validProfileIds.has(c.homeroomTeacherId)
              ? c.homeroomTeacherId
              : null,
          academic_year: c.academicYear,
        }));
      if (classRows.length > 0) {
        const { error } = await client.from('classes').upsert(classRows, { onConflict: 'id' });
        if (error) return { ok: false, error: formatSupabaseSyncError('classes', error) };
      }
    }

    if (subjects.length > 0) {
      const subRows = subjects
        .filter((s) => isUuid(s.id))
        .map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          category: s.category,
          fase_scope: s.faseScope,
          class_ids: s.classIds || [],
          kktp: s.kktp,
          teacher_id:
            s.teacherId && validProfileIds.has(s.teacherId) ? s.teacherId : null,
          sort_order: s.sortOrder,
        }));
      if (subRows.length > 0) {
        const { error } = await client.from('subjects').upsert(subRows, { onConflict: 'id' });
        if (error) return { ok: false, error: formatSupabaseSyncError('subjects', error) };
      }
    }

    if (students.length > 0) {
      const stuRows = students
        .filter((st) => isUuid(st.id) && isUuid(st.classId))
        .map((st) => ({
          id: st.id,
          nis: st.nis,
          nisn: st.nisn || '',
          full_name: st.fullName,
          gender: st.gender,
          class_id: st.classId,
          birth_place: st.birthPlace || 'Bandung',
          birth_date: st.birthDate || null,
          religion: st.religion || 'Islam',
          address: st.address || '',
          parent_name: st.parentName || '',
          photo_url: st.photoUrl || null,
          is_active: st.isActive,
        }));
      if (stuRows.length > 0) {
        const { error } = await client.from('students').upsert(stuRows, { onConflict: 'id' });
        if (error) return { ok: false, error: formatSupabaseSyncError('students', error) };
      }
    }
  }

  // Ownership scope for non-admin users so RLS checks never reject valid partial syncs
  const accessibleSubjectIds = new Set<string>(
    subjects
      .filter((s) => {
        if (!isUuid(s.id)) return false;
        if (role === 'admin') return true;
        if (role === 'guru') return !s.teacherId || s.teacherId === activeUid;
        return true;
      })
      .map((s) => s.id)
  );

  const accessibleClassIds = new Set<string>(
    classes
      .filter((c) => {
        if (!isUuid(c.id)) return false;
        if (role === 'admin') return true;
        if (role === 'wali_kelas') {
          return !c.homeroomTeacherId || c.homeroomTeacherId === activeUid;
        }
        return true;
      })
      .map((c) => c.id)
  );

  const studentClassMap = new Map<string, string>();
  students.forEach((st) => {
    studentClassMap.set(st.id, st.classId);
  });

  // Sync Learning Objectives (TPs + SAS title) and prune deleted TPs for synced subjects
  const subjectsForLo = subjects.filter(
    (sub) => isUuid(sub.id) && (role === 'admin' || role === 'wali_kelas' || accessibleSubjectIds.has(sub.id))
  );

  if (subjectsForLo.length > 0) {
    const loSubjectIds = subjectsForLo.map((s) => s.id);
    const existingSasIdBySubject = new Map<string, string>();
    const existingNonSasIdsBySubject = new Map<string, string[]>();

    try {
      const { data: existingLos } = await client
        .from('learning_objectives')
        .select('id, subject_id, is_sas')
        .in('subject_id', loSubjectIds);

      if (Array.isArray(existingLos)) {
        existingLos.forEach((row) => {
          const subId = String(row.subject_id);
          const id = String(row.id);
          if (row.is_sas) {
            if (!existingSasIdBySubject.has(subId)) {
              existingSasIdBySubject.set(subId, id);
            }
          } else {
            const list = existingNonSasIdsBySubject.get(subId) || [];
            list.push(id);
            existingNonSasIdsBySubject.set(subId, list);
          }
        });
      }
    } catch {
      // ignore read failure and proceed with upsert
    }

    const loRows: {
      id: string;
      subject_id: string;
      code: string;
      title: string;
      is_sas: boolean;
      sort_order: number;
    }[] = [];
    const staleLoIds: string[] = [];

    subjectsForLo.forEach((sub) => {
      const currentTpIds = new Set<string>();
      sub.tpList.forEach((tp, idx) => {
        if (!isUuid(tp.id)) return;
        currentTpIds.add(tp.id);
        loRows.push({
          id: tp.id,
          subject_id: sub.id,
          code: tp.code,
          title: tp.title,
          is_sas: false,
          sort_order: idx + 1,
        });
      });

      const prevIds = existingNonSasIdsBySubject.get(sub.id) || [];
      prevIds.forEach((id) => {
        if (!currentTpIds.has(id)) {
          staleLoIds.push(id);
        }
      });

      // Persist SAS title as is_sas = true row
      const sasId = existingSasIdBySubject.get(sub.id) || deriveDeterministicUuid(sub.id, 'sas');
      loRows.push({
        id: sasId,
        subject_id: sub.id,
        code: 'SAS',
        title: sub.sasTitle || 'Sumatif Akhir Semester',
        is_sas: true,
        sort_order: 999,
      });
    });

    if (staleLoIds.length > 0) {
      await client.from('learning_objectives').delete().in('id', staleLoIds);
    }

    if (loRows.length > 0) {
      const { error } = await client
        .from('learning_objectives')
        .upsert(loRows, { onConflict: 'id' });
      if (error) return { ok: false, error: formatSupabaseSyncError('learning_objectives', error) };
    }
  }

  // Staff sync grades (scoped to accessible rows; omit `id` on composite conflict)
  const validGradeRows = grades
    .filter((g) => {
      if (!isUuid(g.studentId) || !isUuid(g.subjectId)) return false;
      if (role === 'guru') return accessibleSubjectIds.has(g.subjectId);
      if (role === 'wali_kelas') {
        const stuClassId = studentClassMap.get(g.studentId) || '';
        return accessibleClassIds.has(stuClassId);
      }
      return true;
    })
    .map((g) => ({
      student_id: g.studentId,
      subject_id: g.subjectId,
      academic_year: g.academicYear,
      semester: g.semester,
      tp_scores: g.tpScores,
      sas_ppk: g.sasPpk,
      sas_prk: g.sasPrk,
      kehadiran: g.kehadiran,
      proses: g.proses,
      tugas: g.tugas,
      p3_scores: g.p3Scores,
      nilai_akhir: g.nilaiAkhir,
      predikat: g.predikat,
      deskripsi_auto: g.deskripsiAuto,
      deskripsi_manual: g.deskripsiManual || null,
      ...(validActorProfileId ? { updated_by: validActorProfileId } : {}),
    }));
  if (validGradeRows.length > 0) {
    const { error } = await client
      .from('student_grades')
      .upsert(validGradeRows, { onConflict: 'student_id,subject_id,academic_year,semester' });
    if (error) return { ok: false, error: formatSupabaseSyncError('student_grades', error) };
  }

  if (role === 'admin' || role === 'wali_kelas') {
    const validHrRows = homeroomRecords
      .filter((hr) => {
        if (!isUuid(hr.studentId)) return false;
        if (role === 'wali_kelas') {
          const stuClassId = studentClassMap.get(hr.studentId) || '';
          return accessibleClassIds.has(stuClassId);
        }
        return true;
      })
      .map((hr) => ({
        student_id: hr.studentId,
        academic_year: hr.academicYear,
        semester: hr.semester,
        sakit: hr.sakit,
        izin: hr.izin,
        alpha: hr.alpha,
        wali_note: hr.waliNote,
        promotion_status: hr.promotionStatus,
        extracurriculars: hr.extracurriculars,
        p5_projects: hr.p5Projects,
        ...(validActorProfileId ? { updated_by: validActorProfileId } : {}),
      }));
    if (validHrRows.length > 0) {
      const { error } = await client
        .from('homeroom_records')
        .upsert(validHrRows, { onConflict: 'student_id,academic_year,semester' });
      if (error) return { ok: false, error: formatSupabaseSyncError('homeroom_records', error) };
    }
  }

  const validSubRows = gradeSubmissions
    .filter((sub) => {
      if (!isUuid(sub.classId) || !isUuid(sub.subjectId)) return false;
      if (role === 'guru') return accessibleSubjectIds.has(sub.subjectId);
      if (role === 'wali_kelas') return accessibleClassIds.has(sub.classId);
      return true;
    })
    .map((sub) => ({
      class_id: sub.classId,
      subject_id: sub.subjectId,
      academic_year: sub.academicYear,
      semester: sub.semester,
      status: sub.status,
      locked_at: sub.lockedAt || null,
      locked_by:
        sub.lockedBy && validProfileIds.has(sub.lockedBy)
          ? sub.lockedBy
          : sub.status !== 'draft' && validActorProfileId
            ? validActorProfileId
            : null,
      locked_by_name: sub.lockedBy || '',
      sent_at: sub.sentAt || null,
      sent_by:
        sub.sentBy && validProfileIds.has(sub.sentBy)
          ? sub.sentBy
          : sub.status === 'sent' && validActorProfileId
            ? validActorProfileId
            : null,
      sent_by_name: sub.sentBy || '',
      note: sub.note || null,
    }));
  if (validSubRows.length > 0) {
    const { error } = await client
      .from('grade_submissions')
      .upsert(validSubRows, { onConflict: 'class_id,subject_id,academic_year,semester' });
    if (error) return { ok: false, error: formatSupabaseSyncError('grade_submissions', error) };
  }

  return { ok: true };
}
