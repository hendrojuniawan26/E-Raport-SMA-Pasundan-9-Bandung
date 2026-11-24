import {
  ClassRoom,
  HomeroomRecord,
  SchoolSettings,
  Student,
  Subject,
  SubjectGrade,
  UserProfile,
} from '../types/raport';

export const INITIAL_SCHOOL_SETTINGS: SchoolSettings = {
  id: '00000000-0000-4000-8000-000000000001',
  yayasan: 'YAYASAN PENDIDIKAN DASAR DAN MENENGAH PASUNDAN',
  schoolName: 'SMA PASUNDAN 9 BANDUNG',
  npsn: '20219784',
  address: 'Jl. Babakan Ciparay - Gg. Atakiria I No. 28 Telp. 022-6038372 Bandung 40233',
  academicYear: '2025/2026',
  semester: 'Ganjil',
  principalName: 'Ahmad Mukhlis Sadid, S.Pd.I., SIP.',
  principalNip: '19023L0550260241079529',
  reportCity: 'Bandung',
  reportDate: '20 Desember 2025',
  logoUrl: '/assets/aistudio/Desain_tanpa_judul_20261117_173454_0000_0a0b5e52.png',
  defaultKktp: 70,
  thresholdBaik: 90,
  autoPrkFormula: true,
  weights: {
    sumatifPpk: 20,
    sumatifPrk: 30,
    sas: 10,
    kehadiran: 10,
    proses: 10,
    tugas: 20,
  },
};

// Tidak ada data dummy bawaan — seluruh data dimuat langsung dari Supabase / input sekolah.
export const INITIAL_USERS: UserProfile[] = [];
export const INITIAL_CLASSES: ClassRoom[] = [];
export const INITIAL_SUBJECTS: Subject[] = [];
export const INITIAL_STUDENTS: Student[] = [];

export function buildInitialGrades(): SubjectGrade[] {
  return [];
}

export function buildInitialHomeroomRecords(): HomeroomRecord[] {
  return [];
}
