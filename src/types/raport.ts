export type UserRole = 'admin' | 'guru' | 'wali_kelas';

export type Gender = 'L' | 'P';

export type FaseType = 'E' | 'F';

export type SubjectFaseScope = 'ALL' | 'E' | 'F';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  nipNuptk: string;
  nrks?: string;
  role: UserRole;
  avatarUrl?: string;
  isActive?: boolean;
  assignedClassId?: string;
}

export interface GradeWeights {
  sumatifPpk: number;
  sumatifPrk: number;
  sas: number;
  kehadiran: number;
  proses: number;
  tugas: number;
}

export interface SchoolSettings {
  id: string;
  yayasan: string;
  schoolName: string;
  npsn: string;
  address: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  principalName: string;
  principalNip: string;
  reportCity: string;
  reportDate: string;
  logoUrl?: string;
  defaultKktp: number;
  thresholdBaik: number;
  autoPrkFormula: boolean;
  weights: GradeWeights;
}

export interface ClassRoom {
  id: string;
  name: string; // Contoh: 'X IPAS', 'XI IPAS', 'XII IPAS'
  gradeLevel: 10 | 11 | 12;
  fase: FaseType; // Kelas X = Fase E, Kelas XI & XII = Fase F
  homeroomTeacherId?: string;
  academicYear: string;
}

export interface TujuanPembelajaran {
  id: string;
  code: string; // 'TP-1', 'TP-2', ...
  title: string;
  isSas?: boolean;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: 'Umum' | 'Pilihan' | 'Muatan Lokal';
  faseScope: SubjectFaseScope; // 'ALL' = Fase E & F, 'E' = Khusus Kelas X, 'F' = Khusus Kelas XI/XII
  classIds?: string[]; // Kosong/undefined = berlaku untuk semua kelas sesuai faseScope
  kktp: number;
  teacherId?: string;
  teacherName?: string;
  teacherNip?: string;
  sortOrder: number;
  tpList: TujuanPembelajaran[];
  sasTitle: string;
}

export interface Student {
  id: string;
  nis: string;
  nisn: string;
  fullName: string;
  gender: Gender;
  classId: string;
  birthPlace: string;
  birthDate: string;
  religion: string;
  address: string;
  parentName: string;
  photoUrl?: string;
  isActive: boolean;
}

export interface TpScore {
  tpId: string;
  ppk: number | null;
  prk: number | null;
}

export interface SubjectGrade {
  id: string;
  studentId: string;
  subjectId: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  tpScores: TpScore[];
  sasPpk: number | null;
  sasPrk: number | null;
  kehadiran: number | null;
  proses: number | null;
  tugas: number | null;
  p3Scores: number[]; // D.1 s.d. D.6
  nilaiAkhir: number;
  predikat: 'A' | 'B' | 'C' | 'D';
  deskripsiAuto: string;
  deskripsiManual?: string;
  updatedAt: string;
}

export interface ExtracurricularItem {
  id: string;
  nama: string;
  predikat: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Kurang';
  keterangan: string;
}

export interface P5ProjectItem {
  id: string;
  projek: string;
  dimensi: string;
  capaian:
    | 'Sangat Berkembang'
    | 'Berkembang Sesuai Harapan'
    | 'Sedang Berkembang'
    | 'Mulai Berkembang';
  catatan: string;
}

export interface HomeroomRecord {
  id: string;
  studentId: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  sakit: number;
  izin: number;
  alpha: number;
  waliNote: string;
  promotionStatus: string;
  extracurriculars: ExtracurricularItem[];
  p5Projects: P5ProjectItem[];
  updatedAt: string;
}

export type GradeSubmissionStatus = 'draft' | 'locked' | 'sent';

export interface GradeSubmission {
  id: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  status: GradeSubmissionStatus;
  lockedAt?: string;
  lockedBy?: string;
  sentAt?: string;
  sentBy?: string;
  note?: string;
  updatedAt: string;
}

export type ConnectionMode = 'supabase' | 'offline';
export type SyncStatus = 'connected' | 'syncing' | 'saved_local' | 'error';

export const P3_DIMENSIONS = [
  'D.1 Beriman, Bertakwa & Berakhlak Mulia',
  'D.2 Berkebinekaan Global',
  'D.3 Bergotong Royong',
  'D.4 Mandiri',
  'D.5 Bernalar Kritis',
  'D.6 Kreatif',
] as const;

/**
 * Menentukan apakah suatu mata pelajaran berlaku untuk kelas tertentu berdasarkan Fase Kurikulum Merdeka SMA.
 */
export function isSubjectForClass(subject: Subject, classRoom?: ClassRoom): boolean {
  if (!classRoom) return true;
  if (subject.faseScope !== 'ALL' && subject.faseScope !== classRoom.fase) {
    return false;
  }
  if (subject.classIds && subject.classIds.length > 0) {
    return subject.classIds.includes(classRoom.id);
  }
  return true;
}

/**
 * Mengembalikan kategori tampilan raport resmi Kurikulum Merdeka SMA sesuai Fase kelas:
 * - Di Fase E (Kelas X), Informatika termasuk Kelompok Mata Pelajaran Umum (Wajib).
 * - Di Fase F (Kelas XI & XII), Informatika termasuk Kelompok Mata Pelajaran Pilihan.
 */
export function getRaportSubjectGroup(
  subject: Subject,
  classRoom?: ClassRoom
): 'Umum' | 'Pilihan' | 'Muatan Lokal' {
  if (subject.code === 'INF' && classRoom?.fase === 'E') {
    return 'Umum';
  }
  return subject.category;
}
