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

export interface SupabaseLoadedSchoolData {
  settings?: SchoolSettings;
  users?: UserProfile[];
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
      client.from('school_settings').select('*').limit(1),
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
      classesRes.error ||
      subjectsRes.error ||
      studentsRes.error ||
      gradesRes.error ||
      homeroomRes.error;

    if (firstError) {
      return { ok: false, error: firstError.message };
    }

    const profiles: UserProfile[] = Array.isArray(profilesRes.data)
      ? profilesRes.data.map((row) => ({
          id: String(row.id),
          email: String(row.email || ''),
          fullName: String(row.full_name || ''),
          nipNuptk: String(row.nip_nuptk || ''),
          nrks: row.nrks ? String(row.nrks) : undefined,
          role: (row.role as UserRole) || 'guru',
          avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
          isActive: true,
        }))
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
      ? submissionsRes.data.map((row) => ({
          id: String(row.id),
          classId: String(row.class_id),
          subjectId: String(row.subject_id),
          academicYear: String(row.academic_year || '2025/2026'),
          semester: row.semester === 'Genap' ? 'Genap' : 'Ganjil',
          status:
            row.status === 'locked' || row.status === 'sent' ? row.status : 'draft',
          lockedAt: row.locked_at ? String(row.locked_at) : undefined,
          lockedBy: row.locked_by ? String(row.locked_by) : undefined,
          sentAt: row.sent_at ? String(row.sent_at) : undefined,
          sentBy: row.sent_by ? String(row.sent_by) : undefined,
          note: row.note ? String(row.note) : undefined,
          updatedAt: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
        }))
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

export async function syncSchoolDataToSupabase(
  client: SupabaseClient,
  payload: {
    role: UserRole;
    settings: SchoolSettings;
    classes: ClassRoom[];
    subjects: Subject[];
    students: Student[];
    grades: SubjectGrade[];
    homeroomRecords: HomeroomRecord[];
    gradeSubmissions: GradeSubmission[];
  }
): Promise<void> {
  const { role, settings, classes, subjects, students, grades, homeroomRecords, gradeSubmissions } =
    payload;

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
      await client.from('school_settings').upsert(settingsRow, { onConflict: 'id' });
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
        await client.from('classes').upsert(classRows, { onConflict: 'id' });
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
        await client.from('subjects').upsert(subRows, { onConflict: 'id' });
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
        await client.from('students').upsert(stuRows, { onConflict: 'id' });
      }
    }
  }

  // Staff (admin, guru, wali_kelas) can sync Learning Objectives
  const loRows: {
    id: string;
    subject_id: string;
    code: string;
    title: string;
    is_sas: boolean;
    sort_order: number;
  }[] = [];
  subjects.forEach((sub) => {
    if (!isUuid(sub.id)) return;
    sub.tpList.forEach((tp, idx) => {
      if (!isUuid(tp.id)) return;
      loRows.push({
        id: tp.id,
        subject_id: sub.id,
        code: tp.code,
        title: tp.title,
        is_sas: false,
        sort_order: idx + 1,
      });
    });
  });
  if (loRows.length > 0) {
    await client.from('learning_objectives').upsert(loRows, { onConflict: 'id' });
  }

  // Staff sync grades
  const validGradeRows = grades
    .filter((g) => isUuid(g.studentId) && isUuid(g.subjectId))
    .map((g) => ({
      ...(isUuid(g.id) ? { id: g.id } : {}),
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
    }));
  if (validGradeRows.length > 0) {
    await client
      .from('student_grades')
      .upsert(validGradeRows, { onConflict: 'student_id,subject_id,academic_year,semester' });
  }

  if (role === 'admin' || role === 'wali_kelas') {
    const validHrRows = homeroomRecords
      .filter((hr) => isUuid(hr.studentId))
      .map((hr) => ({
        ...(isUuid(hr.id) ? { id: hr.id } : {}),
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
      }));
    if (validHrRows.length > 0) {
      await client
        .from('homeroom_records')
        .upsert(validHrRows, { onConflict: 'student_id,academic_year,semester' });
    }
  }

  const validSubRows = gradeSubmissions
    .filter((sub) => isUuid(sub.classId) && isUuid(sub.subjectId))
    .map((sub) => ({
      ...(isUuid(sub.id) ? { id: sub.id } : {}),
      class_id: sub.classId,
      subject_id: sub.subjectId,
      academic_year: sub.academicYear,
      semester: sub.semester,
      status: sub.status,
      locked_at: sub.lockedAt || null,
      sent_at: sub.sentAt || null,
      note: sub.note || null,
    }));
  if (validSubRows.length > 0) {
    await client
      .from('grade_submissions')
      .upsert(validSubRows, { onConflict: 'class_id,subject_id,academic_year,semester' });
  }
}
