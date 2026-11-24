import {
  ClassRoom,
  HomeroomRecord,
  isSubjectForClass,
  SchoolSettings,
  Student,
  Subject,
  SubjectGrade,
  UserProfile,
} from '../types/raport';
import { recalculateSubjectGrade } from '../utils/gradeCalculator';

export const INITIAL_SCHOOL_SETTINGS: SchoolSettings = {
  id: 'school-pasundan-9',
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

export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'user-admin-1',
    email: 'operator@smapasundan9bdg.sch.id',
    fullName: 'Raden Budi Santoso, S.Kom.',
    nipNuptk: '198604122010011008',
    nrks: 'ADM-001',
    role: 'admin',
  },
  {
    id: 'user-guru-1',
    email: 'hendro.informatika@smapasundan9bdg.sch.id',
    fullName: 'Hendro Kartika J., M.Hum',
    nipNuptk: '198907152014021003',
    nrks: 'GR-INF-01',
    role: 'guru',
  },
  {
    id: 'user-wali-1',
    email: 'siti.rahmawati@smapasundan9bdg.sch.id',
    fullName: 'Dra. Siti Rahmawati, M.Pd.',
    nipNuptk: '197811032006042014',
    nrks: 'WK-11IPAS',
    role: 'wali_kelas',
  },
  {
    id: 'user-guru-2',
    email: 'asep.matematika@smapasundan9bdg.sch.id',
    fullName: 'Asep Saepudin, S.Pd.',
    nipNuptk: '198403222009021005',
    nrks: 'GR-MAT-02',
    role: 'guru',
  },
  {
    id: 'user-guru-3',
    email: 'ratna.bindo@smapasundan9bdg.sch.id',
    fullName: 'Ratna Komalasari, S.Pd., M.Pd.',
    nipNuptk: '198209182008012011',
    nrks: 'GR-IND-03',
    role: 'guru',
  },
];

export const INITIAL_CLASSES: ClassRoom[] = [
  {
    id: 'kelas-x-ipas',
    name: 'X IPAS',
    gradeLevel: 10,
    fase: 'E',
    homeroomTeacherId: 'user-guru-2',
    academicYear: '2025/2026',
  },
  {
    id: 'kelas-xi-ipas',
    name: 'XI IPAS',
    gradeLevel: 11,
    fase: 'F',
    homeroomTeacherId: 'user-wali-1',
    academicYear: '2025/2026',
  },
  {
    id: 'kelas-xii-ipas',
    name: 'XII IPAS',
    gradeLevel: 12,
    fase: 'F',
    homeroomTeacherId: 'user-guru-3',
    academicYear: '2025/2026',
  },
];

/**
 * Struktur Mata Pelajaran Resmi SMA Kurikulum Merdeka (Permendikbudristek No. 12 Tahun 2024):
 * - A. Kelompok Mata Pelajaran Umum (Fase E & F)
 * - B. Kelompok Mata Pelajaran Pilihan (Khusus Fase F: Kelas XI & XII)
 * - C. Muatan Lokal Jawa Barat (Bahasa dan Sastra Sunda)
 */
export const INITIAL_SUBJECTS: Subject[] = [
  // A. KELOMPOK MATA PELAJARAN UMUM (FASE E & F)
  {
    id: 'mapel-pai',
    code: 'PAI',
    name: 'Pendidikan Agama Islam dan Budi Pekerti',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 75,
    teacherId: 'user-guru-1',
    teacherName: 'Ust. Cecep Nurjaman, S.Ag.',
    teacherNip: '197905122007011009',
    sortOrder: 1,
    sasTitle: 'Etika Pergaulan Islami',
    tpList: [
      { id: 'pai-tp-1', code: 'Sumatif 1', title: 'menganalisis makna Q.S. Ali Imran ayat 190-191 tentang berpikir kritis' },
      { id: 'pai-tp-2', code: 'Sumatif 2', title: 'memahami cabang-cabang iman dan menjaga kehormatan diri' },
      { id: 'pai-tp-3', code: 'Sumatif 3', title: 'menerapkan ketentuan muamalah dan ekonomi syariah' },
      { id: 'pai-tp-4', code: 'Sumatif 4', title: 'meneladani peradaban Islam masa kejayaan dan ulama Nusantara' },
    ],
  },
  {
    id: 'mapel-ppkn',
    code: 'PP',
    name: 'Pendidikan Pancasila',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 75,
    teacherId: 'user-wali-1',
    teacherName: 'Dra. Siti Rahmawati, M.Pd.',
    teacherNip: '197811032006042014',
    sortOrder: 2,
    sasTitle: 'Harmoni dalam Keberagaman',
    tpList: [
      { id: 'ppkn-tp-1', code: 'Sumatif 1', title: 'menganalisis keterkaitan sila-sila Pancasila sebagai ideologi terbuka' },
      { id: 'ppkn-tp-2', code: 'Sumatif 2', title: 'mengevaluasi perilaku taat hukum dan demokrasi konstitusional' },
      { id: 'ppkn-tp-3', code: 'Sumatif 3', title: 'mengidentifikasi upaya penyelesaian konflik berlandaskan Bhinneka Tunggal Ika' },
      { id: 'ppkn-tp-4', code: 'Sumatif 4', title: 'merumuskan peran warga negara menjaga keutuhan NKRI' },
    ],
  },
  {
    id: 'mapel-bindo',
    code: 'IND',
    name: 'Bahasa Indonesia',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 72,
    teacherId: 'user-guru-3',
    teacherName: 'Ratna Komalasari, S.Pd., M.Pd.',
    teacherNip: '198209182008012011',
    sortOrder: 3,
    sasTitle: 'Apresiasi Karya Drama dan Puisi',
    tpList: [
      { id: 'ind-tp-1', code: 'Sumatif 1', title: 'mengevaluasi gagasan dan struktur teks argumentasi' },
      { id: 'ind-tp-2', code: 'Sumatif 2', title: 'menyajikan informasi faktual melalui teks berita dan vlog edukatif' },
      { id: 'ind-tp-3', code: 'Sumatif 3', title: 'menganalisis nilai kehidupan dalam karya sastra cerpen sejarah' },
      { id: 'ind-tp-4', code: 'Sumatif 4', title: 'menyusun karya ilmiah sederhana sesuai kaidah kebahasaan' },
    ],
  },
  {
    id: 'mapel-mat',
    code: 'MAT',
    name: 'Matematika',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 70,
    teacherId: 'user-guru-2',
    teacherName: 'Asep Saepudin, S.Pd.',
    teacherNip: '198403222009021005',
    sortOrder: 4,
    sasTitle: 'Pemodelan Statistika Bivariat',
    tpList: [
      { id: 'mat-tp-1', code: 'Sumatif 1', title: 'memodelkan fungsi komposisi dan fungsi invers dalam masalah kontekstual' },
      { id: 'mat-tp-2', code: 'Sumatif 2', title: 'menerapkan teorema lingkaran dan garis singgung' },
      { id: 'mat-tp-3', code: 'Sumatif 3', title: 'menganalisis diagram pencar dan regresi linear sederhana' },
      { id: 'mat-tp-4', code: 'Sumatif 4', title: 'menghitung peluang kejadian majemuk dalam kehidupan sehari-hari' },
    ],
  },
  {
    id: 'mapel-bing',
    code: 'ING',
    name: 'Bahasa Inggris',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 72,
    teacherId: 'user-guru-3',
    teacherName: 'Dian Permata Sari, S.Pd.',
    teacherNip: '199002142015032004',
    sortOrder: 5,
    sasTitle: 'Hortatory Exposition Text',
    tpList: [
      { id: 'ing-tp-1', code: 'Sumatif 1', title: 'analyzing social function and structure of descriptive & digital literacy texts' },
      { id: 'ing-tp-2', code: 'Sumatif 2', title: 'composing analytical exposition essays with cohesive devices' },
      { id: 'ing-tp-3', code: 'Sumatif 3', title: 'delivering spoken arguments in structured academic discussions' },
      { id: 'ing-tp-4', code: 'Sumatif 4', title: 'evaluating environmental issues through narrative and persuasive texts' },
    ],
  },
  {
    id: 'mapel-pjok',
    code: 'PJOK',
    name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 75,
    teacherId: 'user-guru-2',
    teacherName: 'Deden Kurniawan, S.Pd.',
    teacherNip: '198801102014021002',
    sortOrder: 6,
    sasTitle: 'Kebugaran Jasmani dan Pola Hidup Sehat',
    tpList: [
      { id: 'pjok-tp-1', code: 'Sumatif 1', title: 'mempraktikkan variasi keterampilan gerak permainan bola besar' },
      { id: 'pjok-tp-2', code: 'Sumatif 2', title: 'menganalisis strategi permainan bola kecil dan atletik' },
      { id: 'pjok-tp-3', code: 'Sumatif 3', title: 'merancang program latihan kebugaran jasmani terukur' },
      { id: 'pjok-tp-4', code: 'Sumatif 4', title: 'mengevaluasi perilaku pencegahan pergaulan bebas dan bahaya NAPZA' },
    ],
  },
  {
    id: 'mapel-sejarah',
    code: 'SEJ',
    name: 'Sejarah',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 72,
    teacherId: 'user-wali-1',
    teacherName: 'Yudi Permana, S.Pd.',
    teacherNip: '198506152011011006',
    sortOrder: 7,
    sasTitle: 'Perjuangan Mempertahankan Kemerdekaan',
    tpList: [
      { id: 'sej-tp-1', code: 'Sumatif 1', title: 'menganalisis keterkaitan kolonialisme Barat dengan perubahan sosial di Nusantara' },
      { id: 'sej-tp-2', code: 'Sumatif 2', title: 'mengevaluasi strategi pergerakan nasional Indonesia' },
      { id: 'sej-tp-3', code: 'Sumatif 3', title: 'menganalisis dampak pendudukan Jepang terhadap kemerdekaan Indonesia' },
      { id: 'sej-tp-4', code: 'Sumatif 4', title: 'merekonstruksi peristiwa Proklamasi 17 Agustus 1945 secara diakronis' },
    ],
  },
  {
    id: 'mapel-seni',
    code: 'SBD',
    name: 'Seni Budaya (Seni Rupa)',
    category: 'Umum',
    faseScope: 'ALL',
    kktp: 75,
    teacherId: 'user-guru-3',
    teacherName: 'Nenden Sri Wahyuni, S.Sn.',
    teacherNip: '199104202019032007',
    sortOrder: 8,
    sasTitle: 'Apresiasi dan Pameran Karya Seni',
    tpList: [
      { id: 'sbd-tp-1', code: 'Sumatif 1', title: 'mengidentifikasi unsur dan prinsip desain seni rupa dua dimensi' },
      { id: 'sbd-tp-2', code: 'Sumatif 2', title: 'bereksperimen teknik berkarya seni rupa terapan Nusantara' },
      { id: 'sbd-tp-3', code: 'Sumatif 3', title: 'menciptakan karya seni rupa bernilai fungsional dan estetis' },
      { id: 'sbd-tp-4', code: 'Sumatif 4', title: 'mengevaluasi karya seni rupa melalui kritik dan pameran kelas' },
    ],
  },

  // KHUSUS FASE E (KELAS X): IPA & IPS TERPADU
  {
    id: 'mapel-ipa-e',
    code: 'IPA',
    name: 'Ilmu Pengetahuan Alam (Fisika, Kimia, Biologi)',
    category: 'Umum',
    faseScope: 'E',
    kktp: 70,
    teacherId: 'user-guru-2',
    teacherName: 'Rina Marlina, S.Pd., M.Si.',
    teacherNip: '198308112009022004',
    sortOrder: 9,
    sasTitle: 'Pemanasan Global dan Energi Terbarukan',
    tpList: [
      { id: 'ipa-tp-1', code: 'Sumatif 1', title: 'menerapkan pengukuran besaran fisis dan metode ilmiah' },
      { id: 'ipa-tp-2', code: 'Sumatif 2', title: 'menganalisis struktur atom, sistem periodik, dan reaksi kimia hijau' },
      { id: 'ipa-tp-3', code: 'Sumatif 3', title: 'mengidentifikasi keanekaragaman hayati dan peranan virus' },
      { id: 'ipa-tp-4', code: 'Sumatif 4', title: 'merancang solusi pelestarian ekosistem dan transisi energi' },
    ],
  },
  {
    id: 'mapel-ips-e',
    code: 'IPS',
    name: 'Ilmu Pengetahuan Sosial (Sosiologi, Ekonomi, Geografi)',
    category: 'Umum',
    faseScope: 'E',
    kktp: 70,
    teacherId: 'user-wali-1',
    teacherName: 'Dra. Siti Rahmawati, M.Pd.',
    teacherNip: '197811032006042014',
    sortOrder: 10,
    sasTitle: 'Literasi Keuangan dan Geosfer',
    tpList: [
      { id: 'ips-tp-1', code: 'Sumatif 1', title: 'menganalisis interaksi sosial dan lembaga kemasyarakatan' },
      { id: 'ips-tp-2', code: 'Sumatif 2', title: 'memahami konsep kelangkaan, kebutuhan, dan sistem ekonomi' },
      { id: 'ips-tp-3', code: 'Sumatif 3', title: 'menggunakan konsep dasar geografi dalam membaca fenomena wilayah' },
      { id: 'ips-tp-4', code: 'Sumatif 4', title: 'mengevaluasi mekanisme pasar dan lembaga jasa keuangan' },
    ],
  },

  // B. KELOMPOK MATA PELAJARAN PILIHAN (FASE F) & INFORMATIKA (WAJIB DI FASE E, PILIHAN DI FASE F)
  {
    id: 'mapel-informatika',
    code: 'INF',
    name: 'Informatika',
    category: 'Pilihan',
    faseScope: 'ALL', // Wajib di Fase E, Pilihan di Fase F
    kktp: 70,
    teacherId: 'user-guru-1',
    teacherName: 'Hendro Kartika J., M.Hum',
    teacherNip: '',
    sortOrder: 11,
    sasTitle: 'Dampak Sosial Informatika',
    tpList: [
      { id: 'inf-tp-1', code: 'Sumatif 1', title: 'Menjelaskan Manfaat dan Cara Berpikir Komputasional' },
      { id: 'inf-tp-2', code: 'Sumatif 2', title: 'memahami Algoritma Pemrograman' },
      { id: 'inf-tp-3', code: 'Sumatif 3', title: 'mempraktikkan Program Rancangan Arduino' },
      { id: 'inf-tp-4', code: 'Sumatif 4', title: 'mengidentifikasi Jaringan Komputer dan Internet' },
    ],
  },
  {
    id: 'mapel-ekonomi',
    code: 'EKO',
    name: 'Ekonomi',
    category: 'Pilihan',
    faseScope: 'F',
    classIds: ['kelas-xi-ipas', 'kelas-xii-ipas'],
    kktp: 72,
    teacherId: 'user-wali-1',
    teacherName: 'Dra. Siti Rahmawati, M.Pd.',
    teacherNip: '197811032006042014',
    sortOrder: 12,
    sasTitle: 'Kebijakan Moneter dan Fiskal',
    tpList: [
      { id: 'eko-tp-1', code: 'Sumatif 1', title: 'menganalisis konsep badan usaha dan koperasi dalam perekonomian Indonesia' },
      { id: 'eko-tp-2', code: 'Sumatif 2', title: 'menghitung pendapatan nasional dan kesenjangan ekonomi' },
      { id: 'eko-tp-3', code: 'Sumatif 3', title: 'menganalisis ketenagakerjaan dan upaya peningkatan kualitas SDM' },
      { id: 'eko-tp-4', code: 'Sumatif 4', title: 'mengevaluasi indeks harga dan inflasi serta dampaknya' },
    ],
  },
  {
    id: 'mapel-sosiologi',
    code: 'SOS',
    name: 'Sosiologi',
    category: 'Pilihan',
    faseScope: 'F',
    classIds: ['kelas-xi-ipas', 'kelas-xii-ipas'],
    kktp: 72,
    teacherId: 'user-wali-1',
    teacherName: 'Lilis Suryani, S.Sos.',
    teacherNip: '198702102012122003',
    sortOrder: 13,
    sasTitle: 'Membangun Harmoni Sosial',
    tpList: [
      { id: 'sos-tp-1', code: 'Sumatif 1', title: 'menganalisis dinamika kelompok sosial dalam masyarakat multikultural' },
      { id: 'sos-tp-2', code: 'Sumatif 2', title: 'mengidentifikasi permasalahan sosial akibat pengelompokan sosial' },
      { id: 'sos-tp-3', code: 'Sumatif 3', title: 'menganalisis konflik sosial dan metode resolusi damai' },
      { id: 'sos-tp-4', code: 'Sumatif 4', title: 'merancang aksi pemberdayaan menuju harmoni sosial' },
    ],
  },
  {
    id: 'mapel-geografi',
    code: 'GEO',
    name: 'Geografi',
    category: 'Pilihan',
    faseScope: 'F',
    classIds: ['kelas-xi-ipas', 'kelas-xii-ipas'],
    kktp: 72,
    teacherId: 'user-guru-2',
    teacherName: 'Taufik Hidayat, S.Pd.',
    teacherNip: '198611242011011004',
    sortOrder: 14,
    sasTitle: 'Mitigasi Bencana dan Ketahanan Wilayah',
    tpList: [
      { id: 'geo-tp-1', code: 'Sumatif 1', title: 'menganalisis posisi strategis Indonesia sebagai poros maritim dunia' },
      { id: 'geo-tp-2', code: 'Sumatif 2', title: 'mengevaluasi persebaran flora, fauna, dan konservasi hayati' },
      { id: 'geo-tp-3', code: 'Sumatif 3', title: 'menganalisis pengelolaan sumber daya alam berkelanjutan' },
      { id: 'geo-tp-4', code: 'Sumatif 4', title: 'merancang langkah mitigasi bencana alam berbasis wilayah' },
    ],
  },
  {
    id: 'mapel-fisika',
    code: 'FIS',
    name: 'Fisika',
    category: 'Pilihan',
    faseScope: 'F',
    classIds: ['kelas-xi-ipas', 'kelas-xii-ipas'],
    kktp: 72,
    teacherId: 'user-guru-2',
    teacherName: 'Rina Marlina, S.Pd., M.Si.',
    teacherNip: '198308112009022004',
    sortOrder: 15,
    sasTitle: 'Induksi Elektromagnetik & Fisika Modern',
    tpList: [
      { id: 'fis-tp-1', code: 'Sumatif 1', title: 'menerapkan konsep listrik statis dan rangkaian arus searah' },
      { id: 'fis-tp-2', code: 'Sumatif 2', title: 'menganalisis medan magnetik dan gaya Lorentz' },
      { id: 'fis-tp-3', code: 'Sumatif 3', title: 'mengevaluasi prinsip kerja generator dan transformator' },
      { id: 'fis-tp-4', code: 'Sumatif 4', title: 'memahami konsep teknologi digital dan transmisi data' },
    ],
  },
  {
    id: 'mapel-kimia',
    code: 'KIM',
    name: 'Kimia',
    category: 'Pilihan',
    faseScope: 'F',
    classIds: ['kelas-xi-ipas', 'kelas-xii-ipas'],
    kktp: 72,
    teacherId: 'user-guru-2',
    teacherName: 'Drs. Wahyu Sudrajat',
    teacherNip: '196904151995121002',
    sortOrder: 16,
    sasTitle: 'Kimia Unsur dan Makromolekul',
    tpList: [
      { id: 'kim-tp-1', code: 'Sumatif 1', title: 'menganalisis sifat koligatif larutan dalam kehidupan sehari-hari' },
      { id: 'kim-tp-2', code: 'Sumatif 2', title: 'menyetarakan reaksi redoks dan sel elektrokimia' },
      { id: 'kim-tp-3', code: 'Sumatif 3', title: 'mengidentifikasi gugus fungsi senyawa karbon dan kegunaannya' },
      { id: 'kim-tp-4', code: 'Sumatif 4', title: 'mengevaluasi struktur dan manfaat polimer serta biomolekul' },
    ],
  },
  {
    id: 'mapel-biologi',
    code: 'BIO',
    name: 'Biologi',
    category: 'Pilihan',
    faseScope: 'F',
    classIds: ['kelas-xi-ipas', 'kelas-xii-ipas'],
    kktp: 72,
    teacherId: 'user-guru-3',
    teacherName: 'Sri Mulyani, S.Pd.',
    teacherNip: '198103192008012008',
    sortOrder: 17,
    sasTitle: 'Hereditas dan Bioteknologi Modern',
    tpList: [
      { id: 'bio-tp-1', code: 'Sumatif 1', title: 'menganalisis peran enzim dalam metabolisme katabolisme dan anabolisme' },
      { id: 'bio-tp-2', code: 'Sumatif 2', title: 'memahami materi genetik DNA, RNA, dan sintesis protein' },
      { id: 'bio-tp-3', code: 'Sumatif 3', title: 'menerapkan pola-pola pewarisan sifat hukum Mendel' },
      { id: 'bio-tp-4', code: 'Sumatif 4', title: 'mengevaluasi inovasi bioteknologi konvensional dan modern' },
    ],
  },

  // C. MUATAN LOKAL JAWA BARAT
  {
    id: 'mapel-sunda',
    code: 'SUN',
    name: 'Bahasa dan Sastra Sunda',
    category: 'Muatan Lokal',
    faseScope: 'ALL',
    kktp: 75,
    teacherId: 'user-guru-3',
    teacherName: 'Elis Suryati, S.Pd.',
    teacherNip: '198412052010012009',
    sortOrder: 18,
    sasTitle: 'Wawacan jeung Budaya Sunda',
    tpList: [
      { id: 'sun-tp-1', code: 'Sumatif 1', title: 'nganalisis struktur jeung kaidah biantara basa Sunda anu merenah' },
      { id: 'sun-tp-2', code: 'Sumatif 2', title: 'ngaguar ajén budaya dina carita pondok jeung sisindiran' },
      { id: 'sun-tp-3', code: 'Sumatif 3', title: 'ngalarapkeun tatakrama basa Sunda dina paguneman sapopoé' },
      { id: 'sun-tp-4', code: 'Sumatif 4', title: 'nyusun warta jeung resénsi karya sastra Sunda modéren' },
    ],
  },
];

// 12 Siswa asli dari CSV Olah_Nilai_Kurmer_SMA_Pasundan_9_Bandung.csv (Kelas XI IPAS) + siswa X IPAS & XII IPAS
export const INITIAL_STUDENTS: Student[] = [
  { id: 'stu-1', nis: '232410001', nisn: '0074512001', fullName: 'Aditya Dwi Pratama', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-08-12', religion: 'Islam', address: 'Jl. Babakan Ciparay No. 14 Bandung', parentName: 'Dedi Pratama', isActive: true },
  { id: 'stu-2', nis: '232410003', nisn: '0074512003', fullName: 'Akbar Fadillah', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-09-21', religion: 'Islam', address: 'Jl. Kopo Cirangrang No. 45 Bandung', parentName: 'Hendra Fadillah', isActive: true },
  { id: 'stu-3', nis: '232410004', nisn: '0074512004', fullName: 'Amelia Rosidah', gender: 'P', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-11-04', religion: 'Islam', address: 'Gg. Atakiria II No. 9 Bandung', parentName: 'Ujang Rosidin', isActive: true },
  { id: 'stu-4', nis: '232410005', nisn: '0074512005', fullName: 'Bayu Nurdiansyah', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Cimahi', birthDate: '2007-06-18', religion: 'Islam', address: 'Jl. Soekarno Hatta No. 112 Bandung', parentName: 'Ahmad Nurdin', isActive: true },
  { id: 'stu-5', nis: '232410006', nisn: '0074512006', fullName: 'Fajar Permana Putra', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-12-03', religion: 'Islam', address: 'Jl. Caringin No. 32 Bandung', parentName: 'Yayan Permana', isActive: true },
  { id: 'stu-6', nis: '232410009', nisn: '0074512009', fullName: 'Meilany Dewi Silvia', gender: 'P', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-05-19', religion: 'Islam', address: 'Jl. Cibuntu Barat No. 21 Bandung', parentName: 'Surya Wijaya', isActive: true },
  { id: 'stu-7', nis: '232410010', nisn: '0074512010', fullName: 'Muhamad Ilyyas Fatur Rohim', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-10-11', religion: 'Islam', address: 'Jl. Holis No. 78 Bandung', parentName: 'Abdul Rohim', isActive: true },
  { id: 'stu-8', nis: '232410011', nisn: '0074512011', fullName: 'Nindia Amelia', gender: 'P', classId: 'kelas-xi-ipas', birthPlace: 'Garut', birthDate: '2007-07-29', religion: 'Islam', address: 'Jl. Jamika No. 19 Bandung', parentName: 'Tata Supriatna', isActive: true },
  { id: 'stu-9', nis: '232410012', nisn: '0074512012', fullName: 'Nuryani', gender: 'P', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-04-15', religion: 'Islam', address: 'Jl. Pagarsih Barat No. 54 Bandung', parentName: 'Maman Suryaman', isActive: true },
  { id: 'stu-10', nis: '232410013', nisn: '0074512013', fullName: 'Rifa Ghifari Al Muqoddas', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-03-27', religion: 'Islam', address: 'Jl. Pasirkoja No. 63 Bandung', parentName: 'Irfan Muqoddas', isActive: true },
  { id: 'stu-11', nis: '232410014', nisn: '0074512014', fullName: 'Rizki', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-09-09', religion: 'Islam', address: 'Jl. Babakan Ciparay Gg. I No. 5 Bandung', parentName: 'Komarudin', isActive: true },
  { id: 'stu-12', nis: '232410017', nisn: '0074512017', fullName: 'Wisnu Arya Hardinata', gender: 'L', classId: 'kelas-xi-ipas', birthPlace: 'Bandung', birthDate: '2007-08-30', religion: 'Islam', address: 'Jl. Sumber Sari No. 88 Bandung', parentName: 'Agus Hardinata', isActive: true },
  // Siswa Fase E (Kelas X IPAS)
  { id: 'stu-13', nis: '252610001', nisn: '0099123001', fullName: 'Alifah Zahra Salsabila', gender: 'P', classId: 'kelas-x-ipas', birthPlace: 'Bandung', birthDate: '2010-02-14', religion: 'Islam', address: 'Jl. Terusan Pasirkoja No. 12 Bandung', parentName: 'Heri Gunawan', isActive: true },
  { id: 'stu-14', nis: '252610002', nisn: '0099123002', fullName: 'Bagas Maulana Hakim', gender: 'L', classId: 'kelas-x-ipas', birthPlace: 'Bandung', birthDate: '2010-04-20', religion: 'Islam', address: 'Jl. Soekarno Hatta No. 201 Bandung', parentName: 'Taufik Hakim', isActive: true },
  { id: 'stu-15', nis: '252610003', nisn: '0099123003', fullName: 'Citra Ayu Lestari', gender: 'P', classId: 'kelas-x-ipas', birthPlace: 'Sumedang', birthDate: '2010-01-08', religion: 'Islam', address: 'Jl. Cibolerang No. 41 Bandung', parentName: 'Wawan Hermawan', isActive: true },
  // Siswa Fase F (Kelas XII IPAS)
  { id: 'stu-16', nis: '222310001', nisn: '0068112001', fullName: 'Galang Ramadhan Nugraha', gender: 'L', classId: 'kelas-xii-ipas', birthPlace: 'Bandung', birthDate: '2007-01-19', religion: 'Islam', address: 'Jl. Kopo Permai No. 15 Bandung', parentName: 'Yusuf Nugraha', isActive: true },
  { id: 'stu-17', nis: '222310002', nisn: '0068112002', fullName: 'Keysha Aurelia Putri', gender: 'P', classId: 'kelas-xii-ipas', birthPlace: 'Bandung', birthDate: '2007-03-11', religion: 'Islam', address: 'Jl. Peta No. 82 Bandung', parentName: 'Andi Wijaya', isActive: true },
];

// Data nilai persis dari CSV untuk Informatika XI IPAS
const CSV_INFORMATIKA_RAW: {
  studentId: string;
  s1: [number, number];
  s2: [number, number];
  s3: [number, number];
  s4: [number, number];
  sas: [number, number];
  keh: number;
  pro: number;
  tgs: number;
  p3: number[];
}[] = [
  { studentId: 'stu-1', s1: [85, 85], s2: [88, 94], s3: [81, 91], s4: [80, 80], sas: [78, 89], keh: 83, pro: 80, tgs: 80, p3: [85, 85, 85, 80, 80, 85] },
  { studentId: 'stu-2', s1: [100, 100], s2: [98, 99], s3: [98, 99], s4: [95, 95], sas: [100, 100], keh: 94, pro: 92, tgs: 94, p3: [90, 90, 90, 90, 95, 95] },
  { studentId: 'stu-3', s1: [85, 85], s2: [98, 99], s3: [85, 93], s4: [80, 80], sas: [93, 97], keh: 100, pro: 90, tgs: 94, p3: [88, 88, 88, 90, 90, 90] },
  { studentId: 'stu-4', s1: [88, 88], s2: [98, 99], s3: [88, 94], s4: [83, 83], sas: [95, 98], keh: 94, pro: 80, tgs: 85, p3: [85, 85, 85, 88, 88, 88] },
  { studentId: 'stu-5', s1: [85, 85], s2: [87, 94], s3: [88, 94], s4: [80, 80], sas: [95, 98], keh: 100, pro: 80, tgs: 86, p3: [88, 88, 85, 85, 85, 85] },
  { studentId: 'stu-6', s1: [95, 95], s2: [93, 97], s3: [97, 99], s4: [90, 90], sas: [98, 99], keh: 94, pro: 88, tgs: 89, p3: [88, 88, 88, 90, 90, 90] },
  { studentId: 'stu-7', s1: [88, 88], s2: [87, 94], s3: [95, 98], s4: [83, 83], sas: [98, 99], keh: 89, pro: 82, tgs: 92, p3: [88, 88, 85, 85, 85, 85] },
  { studentId: 'stu-8', s1: [85, 85], s2: [98, 99], s3: [86, 93], s4: [80, 80], sas: [94, 97], keh: 94, pro: 80, tgs: 85, p3: [85, 85, 85, 88, 88, 88] },
  { studentId: 'stu-9', s1: [85, 85], s2: [78, 89], s3: [88, 94], s4: [80, 80], sas: [95, 98], keh: 100, pro: 81, tgs: 87, p3: [85, 85, 85, 88, 88, 88] },
  { studentId: 'stu-10', s1: [88, 88], s2: [98, 99], s3: [95, 98], s4: [83, 83], sas: [98, 99], keh: 100, pro: 81, tgs: 85, p3: [88, 88, 88, 90, 90, 90] },
  { studentId: 'stu-11', s1: [80, 80], s2: [78, 89], s3: [78, 89], s4: [75, 75], sas: [75, 88], keh: 83, pro: 80, tgs: 82, p3: [85, 85, 85, 80, 80, 85] },
  { studentId: 'stu-12', s1: [88, 88], s2: [85, 93], s3: [97, 99], s4: [83, 83], sas: [98, 99], keh: 100, pro: 85, tgs: 88, p3: [88, 88, 88, 90, 90, 90] },
];

export function buildInitialGrades(): SubjectGrade[] {
  const grades: SubjectGrade[] = [];
  const now = new Date().toISOString();
  const infSubject = INITIAL_SUBJECTS.find((s) => s.id === 'mapel-informatika')!;

  // 1. Exact CSV Informatika Grades for XI IPAS
  CSV_INFORMATIKA_RAW.forEach((row) => {
    const base: SubjectGrade = {
      id: `grade-${row.studentId}-${infSubject.id}`,
      studentId: row.studentId,
      subjectId: infSubject.id,
      academicYear: INITIAL_SCHOOL_SETTINGS.academicYear,
      semester: INITIAL_SCHOOL_SETTINGS.semester,
      tpScores: [
        { tpId: infSubject.tpList[0].id, ppk: row.s1[0], prk: row.s1[1] },
        { tpId: infSubject.tpList[1].id, ppk: row.s2[0], prk: row.s2[1] },
        { tpId: infSubject.tpList[2].id, ppk: row.s3[0], prk: row.s3[1] },
        { tpId: infSubject.tpList[3].id, ppk: row.s4[0], prk: row.s4[1] },
      ],
      sasPpk: row.sas[0],
      sasPrk: row.sas[1],
      kehadiran: row.keh,
      proses: row.pro,
      tugas: row.tgs,
      p3Scores: row.p3,
      nilaiAkhir: 0,
      predikat: 'B',
      deskripsiAuto: '',
      updatedAt: now,
    };
    grades.push(recalculateSubjectGrade(base, infSubject, INITIAL_SCHOOL_SETTINGS));
  });

  // 2. Deterministic sample grades for all applicable subjects across Kelas X IPAS, XI IPAS, and XII IPAS
  INITIAL_CLASSES.forEach((cls) => {
    const clsStudents = INITIAL_STUDENTS.filter((s) => s.classId === cls.id);
    const clsSubjects = INITIAL_SUBJECTS.filter((sub) =>
      isSubjectForClass(sub, cls)
    );

    clsSubjects.forEach((sub, sIdx) => {
      if (cls.id === 'kelas-xi-ipas' && sub.id === 'mapel-informatika') {
        return; // already seeded from exact CSV
      }

      clsStudents.forEach((stu, idx) => {
        const seedOffset = ((idx * 7 + sIdx * 11) % 14) - 4;
        const baseAbility =
          idx === 1 ? 93 : idx === 5 ? 91 : idx === 10 ? 79 : 84 + (seedOffset % 7);
        const clamp = (n: number) => Math.max(68, Math.min(98, n));

        const tpScores = sub.tpList.map((tp, tIdx) => {
          const ppk = clamp(baseAbility + ((tIdx * 3 + idx) % 7) - 3);
          const prk = ppk >= 92 ? ppk : Math.round((ppk + 100) / 2);
          return { tpId: tp.id, ppk, prk };
        });

        const sasPpk = clamp(baseAbility + ((sIdx + idx) % 5) - 2);
        const sasPrk = Math.round((sasPpk + 100) / 2);

        const base: SubjectGrade = {
          id: `grade-${stu.id}-${sub.id}`,
          studentId: stu.id,
          subjectId: sub.id,
          academicYear: INITIAL_SCHOOL_SETTINGS.academicYear,
          semester: INITIAL_SCHOOL_SETTINGS.semester,
          tpScores,
          sasPpk,
          sasPrk,
          kehadiran: clamp(92 + (idx % 6)),
          proses: clamp(baseAbility),
          tugas: clamp(baseAbility + 2),
          p3Scores: [86, 86, 88, 86, 88, 86],
          nilaiAkhir: 0,
          predikat: 'B',
          deskripsiAuto: '',
          updatedAt: now,
        };
        grades.push(recalculateSubjectGrade(base, sub, INITIAL_SCHOOL_SETTINGS));
      });
    });
  });

  return grades;
}

export function buildInitialHomeroomRecords(): HomeroomRecord[] {
  const now = new Date().toISOString();
  return INITIAL_STUDENTS.map((stu, idx) => ({
    id: `hr-${stu.id}`,
    studentId: stu.id,
    academicYear: INITIAL_SCHOOL_SETTINGS.academicYear,
    semester: INITIAL_SCHOOL_SETTINGS.semester,
    sakit: idx % 4 === 0 ? 1 : 0,
    izin: idx % 3 === 0 ? 1 : 0,
    alpha: idx === 10 ? 1 : 0,
    waliNote:
      idx === 1 || idx === 5
        ? 'Pertahankan prestasi akademik dan keaktifan dalam kegiatan diskusi kelas. Terus menjadi teladan bagi teman sebaya.'
        : idx === 10
          ? 'Tingkatkan kedisiplinan kehadiran dan manfaatkan waktu belajar mandiri dengan lebih teratur agar capaian semakin optimal.'
          : 'Perkembangan belajar dan sikap selama semester ini sudah baik. Terus tingkatkan ketekunan dan partisipasi aktif di kelas.',
    promotionStatus:
      stu.classId === 'kelas-x-ipas'
        ? 'Naik ke kelas XI'
        : stu.classId === 'kelas-xi-ipas'
          ? 'Naik ke kelas XII'
          : 'Lulus dari Satuan Pendidikan',
    extracurriculars: [
      {
        id: `eks-1-${stu.id}`,
        nama: 'Pendidikan Kepramukaan',
        predikat: idx % 2 === 0 ? 'Sangat Baik' : 'Baik',
        keterangan: 'Aktif mengikuti latihan rutin dan kegiatan kepemimpinan regu.',
      },
      {
        id: `eks-2-${stu.id}`,
        nama: idx % 2 === 0 ? 'Pasundan IT Club (Robotik & Coding)' : 'Paskibra SMA Pasundan 9',
        predikat: 'Baik',
        keterangan: 'Menunjukkan minat dan kerja sama tim yang konsisten dalam praktik lapangan.',
      },
    ],
    p5Projects: [
      {
        id: `p5-1-${stu.id}`,
        projek: 'Suara Demokrasi: Pemilihan Ketua OSIS Berbasis Digital',
        dimensi: 'Bernalar Kritis, Berkebinekaan Global, Bergotong Royong',
        capaian: idx === 1 || idx === 5 ? 'Sangat Berkembang' : 'Berkembang Sesuai Harapan',
        catatan: 'Mampu menyuarakan aspirasi secara santun dan berkolaborasi menyusun sistem pemungutan suara sekolah.',
      },
      {
        id: `p5-2-${stu.id}`,
        projek: 'Kearifan Lokal: Pelestarian Budaya Sunda di Era Teknologi',
        dimensi: 'Kreatif, Beriman & Bertakwa kepada Tuhan YME',
        capaian: 'Berkembang Sesuai Harapan',
        catatan: 'Berpartisipasi aktif mendokumentasikan seni budaya Sunda melalui media digital.',
      },
    ],
    updatedAt: now,
  }));
}
