import * as XLSX from 'xlsx';
import {
  ClassRoom,
  Gender,
  HomeroomRecord,
  SchoolSettings,
  Student,
  Subject,
  SubjectGrade,
  TpScore,
  TujuanPembelajaran,
} from '../types/raport';
import { computeColumnStats, recalculateSubjectGrade } from './gradeCalculator';

export interface ParsedGradeImport {
  detectedSubjectName?: string;
  detectedClassName?: string;
  detectedKktp?: number;
  detectedTpTitles: string[];
  detectedSasTitle?: string;
  students: {
    nis: string;
    fullName: string;
    gender: Gender;
    tpScores: { ppk: number | null; prk: number | null }[];
    sasPpk: number | null;
    sasPrk: number | null;
    kehadiran: number | null;
    proses: number | null;
    tugas: number | null;
    p3Scores: number[];
  }[];
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(String(val).trim());
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Parses either the multi-row SMA Pasundan 9 Bandung Excel/CSV template
 * (Olah_Nilai_Kurmer_SMA_Pasundan_9_Bandung / Template Resmi / Export Excel)
 * OR a simplified 1-row-header tabular import sheet.
 */
export async function parseGradeExcelFile(
  file: File
): Promise<ParsedGradeImport> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: '',
  });

  // Check if this matches the official SMA Pasundan 9 Bandung multi-row template
  const isOfficialTemplate = rows.some(
    (r) =>
      String(r[0] || '').toUpperCase().includes('DAFTAR NILAI') ||
      String(r[2] || '').toUpperCase().includes('SMA PASUNDAN') ||
      String(r[0] || '').toUpperCase().includes('MATA PELAJARAN')
  );

  // Locate the PPK / PRK sub-header row (contains 'Urt.' or 'PPK')
  const ppkHeaderIdx = rows.findIndex(
    (r) =>
      String(r[0] || '').trim().toLowerCase().startsWith('urt') ||
      (String(r[4] || '').trim().toUpperCase() === 'PPK' &&
        String(r[5] || '').trim().toUpperCase() === 'PRK')
  );

  if (isOfficialTemplate && ppkHeaderIdx >= 2) {
    const subjectRow = rows.find((r) =>
      String(r[0] || '').toLowerCase().includes('mata pelajaran')
    );
    const classRow = rows.find((r) =>
      String(r[0] || '').toLowerCase().startsWith('kelas')
    );

    const detectedSubjectName =
      String(subjectRow?.[2] || subjectRow?.[1] || '').trim() || undefined;
    const rawKelas = String(classRow?.[0] || '').trim();
    const detectedClassName = rawKelas.includes(':')
      ? rawKelas.split(':').slice(1).join(':').trim()
      : undefined;

    let detectedKktp: number | undefined;
    if (classRow) {
      const kktpCandidate = toNum(classRow[24]);
      if (kktpCandidate !== null) {
        detectedKktp = kktpCandidate;
      } else {
        for (let c = classRow.length - 1; c >= 4; c--) {
          const val = toNum(classRow[c]);
          if (val !== null && val >= 50 && val <= 100) {
            detectedKktp = val;
            break;
          }
        }
      }
    }

    const ppkRow = rows[ppkHeaderIdx] || [];
    // Find where SAS / Kehadiran start dynamically
    const sumHeaderRow =
      rows.find(
        (r, idx) =>
          idx < ppkHeaderIdx &&
          r.some((c) => String(c || '').toLowerCase().includes('sumatif 1'))
      ) || rows[ppkHeaderIdx - 2] || [];

    const tpTitleRowCandidate = rows[ppkHeaderIdx - 1] || [];
    const tpTitleRow = tpTitleRowCandidate.some(
      (c, idx) => idx >= 4 && idx < 12 && String(c || '').trim() !== '' && String(c || '').trim().toUpperCase() !== 'KOGNITIF'
    )
      ? tpTitleRowCandidate
      : rows[ppkHeaderIdx - 2] || [];

    // Identify PPK/PRK pairs from col 4 onwards until Kehadiran / SAS
    const sasColIdxFromHeader = sumHeaderRow.findIndex((c) => {
      const s = String(c || '').toLowerCase();
      return s.includes('akhir semester') || s === 'sas';
    });
    const kehColIdxFromHeader = sumHeaderRow.findIndex((c) =>
      String(c || '').toLowerCase().includes('kehadiran')
    );

    const sasCol = sasColIdxFromHeader >= 4 ? sasColIdxFromHeader : 12;
    const kehCol = kehColIdxFromHeader >= 6 ? kehColIdxFromHeader : sasCol + 2;
    const proCol = kehCol + 1;
    const tgsCol = kehCol + 2;
    const p3StartCol = kehCol + 5;

    const tpColIndices: number[] = [];
    for (let c = 4; c < sasCol; c += 2) {
      if (
        String(ppkRow[c] || '').toUpperCase().includes('PPK') ||
        c < 12
      ) {
        tpColIndices.push(c);
      }
    }
    if (tpColIndices.length === 0) {
      tpColIndices.push(4, 6, 8, 10);
    }

    const detectedTpTitles = tpColIndices.map(
      (colIdx, idx) =>
        String(tpTitleRow[colIdx] || '').trim() || `Tujuan Pembelajaran ${idx + 1}`
    );
    const detectedSasTitle =
      String(tpTitleRow[sasCol] || '').trim() || 'Sumatif Akhir Semester';

    const students: ParsedGradeImport['students'] = [];

    for (let i = ppkHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const firstCell = String(r[0] || '').trim().toUpperCase();
      if (firstCell.startsWith('REKAPITULASI') || firstCell.startsWith('MENGETAHUI')) {
        break;
      }

      const nis = String(r[1] || '').trim();
      const fullName = String(r[2] || '').trim();
      if (!fullName || !nis) continue;

      const genderRaw = String(r[3] || 'L').trim().toUpperCase();
      const gender: Gender = genderRaw === 'P' ? 'P' : 'L';

      const tpScores = tpColIndices.map((colIdx) => ({
        ppk: toNum(r[colIdx]),
        prk: toNum(r[colIdx + 1]),
      }));

      const sasPpk = toNum(r[sasCol]);
      const sasPrk = toNum(r[sasCol + 1]);
      const kehadiran = toNum(r[kehCol]);
      const proses = toNum(r[proCol]);
      const tugas = toNum(r[tgsCol]);

      const p3Scores = [0, 1, 2, 3, 4, 5].map(
        (offset) => toNum(r[p3StartCol + offset]) ?? 85
      );

      students.push({
        nis,
        fullName,
        gender,
        tpScores,
        sasPpk,
        sasPrk,
        kehadiran,
        proses,
        tugas,
        p3Scores,
      });
    }

    return {
      detectedSubjectName,
      detectedClassName,
      detectedKktp,
      detectedTpTitles,
      detectedSasTitle,
      students,
    };
  }

  // Fallback / Simplified 1-row-header tabular format
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => {
      const s = String(c).toLowerCase();
      return s.includes('nama') || s === 'nis';
    })
  );

  // Extract metadata if present above the simplified table
  let detectedSubjectName: string | undefined;
  let detectedClassName: string | undefined;
  let detectedKktp: number | undefined;
  for (let i = 0; i < Math.max(0, headerIdx); i++) {
    const label = String(rows[i]?.[0] || '').toLowerCase();
    const val = String(rows[i]?.[1] || rows[i]?.[2] || '').trim();
    if (label.includes('mata pelajaran') && val) detectedSubjectName = val;
    if (label.includes('kelas') && val) detectedClassName = val;
    if ((label.includes('kktp') || label.includes('kkm')) && toNum(val) !== null) {
      detectedKktp = toNum(val) ?? undefined;
    }
  }

  const headerRow = (headerIdx >= 0 ? rows[headerIdx] : rows[0] || []).map((c) =>
    String(c || '').trim().toLowerCase()
  );
  const startRow = headerIdx >= 0 ? headerIdx + 1 : 1;

  const findCol = (matcher: (h: string) => boolean, fallbackIdx = -1) => {
    const idx = headerRow.findIndex(matcher);
    return idx >= 0 ? idx : fallbackIdx;
  };

  const nisCol = findCol((h) => h === 'nis' || h.includes('induk'), 0);
  const nameCol = findCol((h) => h.includes('nama'), 1);
  const genderCol = findCol((h) => h === 'l/p' || h.includes('gender') || h === 'jk', 2);

  // Detect TP pairs dynamically from headers like "tp 1 ppk", "sumatif 1 ppk", "s1_ppk", etc.
  const tpPairs: { ppk: number; prk: number; title: string }[] = [];
  for (let idx = 1; idx <= 8; idx++) {
    const ppkIdx = headerRow.findIndex(
      (h) =>
        (h.includes(`tp${idx}`) ||
          h.includes(`tp ${idx}`) ||
          h.includes(`s${idx}`) ||
          h.includes(`sumatif ${idx}`)) &&
        (h.includes('ppk') || !h.includes('prk'))
    );
    const prkIdx = headerRow.findIndex(
      (h) =>
        (h.includes(`tp${idx}`) ||
          h.includes(`tp ${idx}`) ||
          h.includes(`s${idx}`) ||
          h.includes(`sumatif ${idx}`)) &&
        h.includes('prk')
    );
    if (ppkIdx >= 0) {
      tpPairs.push({
        ppk: ppkIdx,
        prk: prkIdx >= 0 ? prkIdx : -1,
        title: `Tujuan Pembelajaran ${idx}`,
      });
    }
  }

  const hasDynamicHeaders = tpPairs.length > 0;
  const sasPpkCol = findCol((h) => h.includes('sas') && (h.includes('ppk') || !h.includes('prk')));
  const sasPrkCol = findCol((h) => h.includes('sas') && h.includes('prk'));
  const kehCol = findCol((h) => h.includes('kehadiran') || h.includes('hadir'));
  const proCol = findCol((h) => h.includes('proses'));
  const tgsCol = findCol((h) => h.includes('tugas'));
  const dCols = [1, 2, 3, 4, 5, 6].map((d) =>
    headerRow.findIndex((h) => h === `d.${d}` || h === `d${d}` || h.includes(`p3 d${d}`))
  );

  const students: ParsedGradeImport['students'] = [];

  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const nis = String(r[nisCol] || '').trim();
    const fullName = String(r[nameCol] || '').trim();
    if (!nis || !fullName) continue;
    const gender: Gender =
      String(r[genderCol] || 'L').trim().toUpperCase() === 'P' ? 'P' : 'L';

    if (hasDynamicHeaders) {
      const tpScores = tpPairs.map((pair) => ({
        ppk: toNum(r[pair.ppk]),
        prk: pair.prk >= 0 ? toNum(r[pair.prk]) : null,
      }));
      students.push({
        nis,
        fullName,
        gender,
        tpScores,
        sasPpk: sasPpkCol >= 0 ? toNum(r[sasPpkCol]) : null,
        sasPrk: sasPrkCol >= 0 ? toNum(r[sasPrkCol]) : null,
        kehadiran: kehCol >= 0 ? toNum(r[kehCol]) : null,
        proses: proCol >= 0 ? toNum(r[proCol]) : null,
        tugas: tgsCol >= 0 ? toNum(r[tgsCol]) : null,
        p3Scores: dCols.map((cIdx) => (cIdx >= 0 ? toNum(r[cIdx]) ?? 85 : 85)),
      });
    } else {
      // Positional fallback [NIS, Nama, L/P, S1_PPK, S1_PRK, ..., SAS_PPK, SAS_PRK, Kehadiran, Proses, Tugas]
      const offset = nisCol === 1 ? 1 : 0;
      const tpScores = [
        { ppk: toNum(r[3 + offset]), prk: toNum(r[4 + offset]) },
        { ppk: toNum(r[5 + offset]), prk: toNum(r[6 + offset]) },
        { ppk: toNum(r[7 + offset]), prk: toNum(r[8 + offset]) },
        { ppk: toNum(r[9 + offset]), prk: toNum(r[10 + offset]) },
      ];
      students.push({
        nis,
        fullName,
        gender,
        tpScores,
        sasPpk: toNum(r[11 + offset]),
        sasPrk: toNum(r[12 + offset]),
        kehadiran: toNum(r[13 + offset]),
        proses: toNum(r[14 + offset]),
        tugas: toNum(r[15 + offset]),
        p3Scores: [85, 85, 85, 85, 85, 85],
      });
    }
  }

  return {
    detectedSubjectName,
    detectedClassName,
    detectedKktp,
    detectedTpTitles: hasDynamicHeaders
      ? tpPairs.map((p) => p.title)
      : ['TP 1', 'TP 2', 'TP 3', 'TP 4'],
    students,
  };
}

export async function parseMasterStudentsExcel(file: File): Promise<
  {
    nis: string;
    nisn: string;
    fullName: string;
    gender: Gender;
    className: string;
    birthPlace: string;
    birthDate: string;
    religion: string;
    parentName: string;
    address: string;
  }[]
> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
  });

  return rows
    .map((row) => {
      const get = (keys: string[]) => {
        for (const k of Object.keys(row)) {
          if (keys.some((target) => k.toLowerCase().includes(target))) {
            return String(row[k] ?? '').trim();
          }
        }
        return '';
      };

      const nis = get(['nis', 'induk']);
      const fullName = get(['nama', 'name']);
      if (!nis || !fullName) return null;

      return {
        nis,
        nisn: get(['nisn']),
        fullName,
        gender: (get(['l/p', 'jk', 'gender', 'kelamin']).toUpperCase() === 'P'
          ? 'P'
          : 'L') as Gender,
        className: get(['kelas', 'class']) || 'XI IPAS',
        birthPlace: get(['tempat']) || 'Bandung',
        birthDate: get(['tanggal', 'lahir']) || '2008-05-14',
        religion: get(['agama']) || 'Islam',
        parentName: get(['ortu', 'wali', 'orang tua']) || '-',
        address: get(['alamat']) || 'Bandung',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Exports Subject Grades in exact SMA Pasundan 9 Bandung Excel layout
 */
export function exportSubjectGradeExcel(
  subject: Subject,
  classRoom: ClassRoom,
  students: Student[],
  grades: SubjectGrade[],
  settings: SchoolSettings
): void {
  const aoa: (string | number)[][] = [];

  aoa.push(['', '', settings.yayasan]);
  aoa.push(['', '', settings.schoolName]);
  aoa.push(['', '', settings.address]);
  aoa.push([]);
  aoa.push(['DAFTAR NILAI', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '>> FORMAT RESMI E-RAPORT <<']);
  aoa.push(['Mata Pelajaran:', '', subject.name, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'KKM']);
  aoa.push([`Kelas              :  ${classRoom.name}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', subject.kktp]);
  aoa.push([]);
  aoa.push(['Nomor', '', 'NAMA/KODE PESERTA', 'L/P', 'NILAI']);
  aoa.push(['', '', '', '', 'Sumatif 1', '', 'Sumatif 2', '', 'Sumatif 3', '', 'Sumatif 4', '', 'Sum. Akhir Semester', '', 'Kehadiran', 'Proses', 'Tugas', 'RAPOR', 'NILAI', 'SIKAP P3', '', '', '', '', '', 'Deskripsi Capaian Kompetensi']);
  aoa.push(['', '', '', '', subject.tpList[0]?.title || 'TP 1', '', subject.tpList[1]?.title || 'TP 2', '', subject.tpList[2]?.title || 'TP 3', '', subject.tpList[3]?.title || 'TP 4', '', subject.sasTitle || 'SAS', '', '', '', '', 'KOGNITIF', 'AKHIR', 'D.1', 'D.2', 'D.3', 'D.4', 'D.5', 'D.6', '']);
  aoa.push(['Urt.', 'Induk', '', '', 'PPK', 'PRK', 'PPK', 'PRK', 'PPK', 'PRK', 'PPK', 'PRK', 'PPK', 'PRK', '', '', '', '', '', '', '', '', '', '', '', '']);

  const raporVals: number[] = [];

  students.forEach((student, idx) => {
    const rawGrade = grades.find(
      (g) => g.studentId === student.id && g.subjectId === subject.id
    );
    const g = rawGrade
      ? recalculateSubjectGrade(rawGrade, subject, settings)
      : undefined;

    const getTp = (tpIdx: number) => {
      const tp = subject.tpList[tpIdx];
      const sc = tp ? g?.tpScores.find((s) => s.tpId === tp.id) : undefined;
      return [sc?.ppk ?? '', sc?.prk ?? ''];
    };

    const s1 = getTp(0);
    const s2 = getTp(1);
    const s3 = getTp(2);
    const s4 = getTp(3);
    const finalScore = g?.nilaiAkhir ?? 0;
    if (finalScore > 0) raporVals.push(finalScore);

    aoa.push([
      idx + 1,
      student.nis,
      student.fullName,
      student.gender,
      s1[0],
      s1[1],
      s2[0],
      s2[1],
      s3[0],
      s3[1],
      s4[0],
      s4[1],
      g?.sasPpk ?? '',
      g?.sasPrk ?? '',
      g?.kehadiran ?? '',
      g?.proses ?? '',
      g?.tugas ?? '',
      finalScore || '',
      finalScore || '',
      g?.p3Scores[0] ?? 85,
      g?.p3Scores[1] ?? 85,
      g?.p3Scores[2] ?? 85,
      g?.p3Scores[3] ?? 85,
      g?.p3Scores[4] ?? 85,
      g?.p3Scores[5] ?? 85,
      g?.deskripsiManual || g?.deskripsiAuto || '',
    ]);
  });

  const stats = computeColumnStats(raporVals, subject.kktp);
  aoa.push([]);
  aoa.push(['REKAPITULASI', 'Peserta', `${students.length} orang`, 'JML :', '', '', '', '', '', '', '', '', '', '', '', '', '', '', stats.jml]);
  aoa.push(['', 'Tercapai', `${stats.tercapai} orang`, 'MIN :', '', '', '', '', '', '', '', '', '', '', '', '', '', '', stats.min]);
  aoa.push(['', 'B. Tercapai', `${stats.belumTercapai} orang`, 'MAX :', '', '', '', '', '', '', '', '', '', '', '', '', '', '', stats.max]);
  aoa.push(['', 'Rata-rata', '', 'RT :', '', '', '', '', '', '', '', '', '', '', '', '', '', '', Number(stats.avg.toFixed(2))]);
  aoa.push(['', 'Simp. Baku', '', 'SB :', '', '', '', '', '', '', '', '', '', '', '', '', '', '', Number(stats.stdDev.toFixed(2))]);
  aoa.push([]);
  aoa.push(['', '', 'Mengetahui :', '', '', '', '', '', '', '', `${settings.reportCity}, ${settings.reportDate}`]);
  aoa.push(['', '', 'Kepala Sekolah,', '', '', '', '', '', '', '', 'Guru Mata Pelajaran,']);
  aoa.push([]);
  aoa.push([]);
  aoa.push(['', '', settings.principalName, '', '', '', '', '', '', '', subject.teacherName || '-']);
  aoa.push(['', '', `NIP/NUPTK : ${settings.principalNip}`, '', '', '', '', '', '', '', `NRKS/NIP : ${subject.teacherNip || '-'}`]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 28 },
    { wch: 5 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 9 },
    { wch: 8 },
    { wch: 5 },
    { wch: 5 },
    { wch: 5 },
    { wch: 5 },
    { wch: 5 },
    { wch: 5 },
    { wch: 65 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Nilai');
  const safeName = `${subject.name}_${classRoom.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Olah_Nilai_${safeName}.xlsx`);
}

/**
 * Exports full Class Leger (All Students x All Subjects + Attendance + Average + Rank)
 */
export function exportClassLegerExcel(
  classRoom: ClassRoom,
  students: Student[],
  subjects: Subject[],
  grades: SubjectGrade[],
  homeroomRecords: HomeroomRecord[],
  settings: SchoolSettings
): void {
  const headers = [
    'No',
    'NIS',
    'NISN',
    'Nama Peserta Didik',
    'L/P',
    ...subjects.map((s) => s.name),
    'Jumlah',
    'Rata-rata',
    'Sakit',
    'Izin',
    'Alpha',
    'Catatan Wali Kelas',
  ];

  const rows = students.map((student, idx) => {
    const scores = subjects.map((sub) => {
      const found = grades.find(
        (g) => g.studentId === student.id && g.subjectId === sub.id
      );
      return found ? recalculateSubjectGrade(found, sub, settings).nilaiAkhir : 0;
    });
    const validScores = scores.filter((s) => s > 0);
    const total = validScores.reduce((a, b) => a + b, 0);
    const avg = validScores.length > 0 ? Number((total / validScores.length).toFixed(2)) : 0;
    const hr = homeroomRecords.find((h) => h.studentId === student.id);

    return [
      idx + 1,
      student.nis,
      student.nisn,
      student.fullName,
      student.gender,
      ...scores,
      total,
      avg,
      hr?.sakit ?? 0,
      hr?.izin ?? 0,
      hr?.alpha ?? 0,
      hr?.waliNote ?? '',
    ];
  });

  const aoa = [
    [settings.yayasan],
    [settings.schoolName],
    [`LEGER NILAI RAPORT KURIKULUM MERDEKA — KELAS ${classRoom.name} (FASE ${classRoom.fase})`],
    [`Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}`],
    [],
    headers,
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Leger ${classRoom.name}`);
  XLSX.writeFile(wb, `Leger_Nilai_${classRoom.name.replace(/\s+/g, '_')}.xlsx`);
}

export function downloadStudentTemplateExcel(): void {
  const aoa = [
    ['NIS', 'NISN', 'Nama Peserta Didik', 'L/P', 'Kelas', 'Tempat Lahir', 'Tanggal Lahir', 'Agama', 'Nama Orang Tua', 'Alamat'],
    ['242510001', '0081234567', 'Contoh Nama Siswa', 'L', 'XI IPAS', 'Bandung', '2008-03-15', 'Islam', 'Budi Santoso', 'Jl. Babakan Ciparay No. 10'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
  XLSX.writeFile(wb, 'Template_Import_Siswa_Pasundan9.xlsx');
}

function buildPanduanSheet(
  subject: Subject,
  classRoom: ClassRoom,
  settings: SchoolSettings
): XLSX.WorkSheet {
  const panduanAoa: (string | number)[][] = [
    ['PANDUAN PENGISIAN TEMPLATE INPUT NILAI KURIKULUM MERDEKA'],
    [`Sekolah : ${settings.schoolName}`, '', `Tahun Ajaran : ${settings.academicYear} (${settings.semester})`],
    [`Kelas   : ${classRoom.name} (Fase ${classRoom.fase})`, '', `Mata Pelajaran : ${subject.name} (KKTP ${subject.kktp})`],
    [],
    ['NO', 'KOLOM / BAGIAN', 'KETERANGAN & ATURAN PENGISIAN'],
    [1, 'NIS & Nama Peserta Didik', 'Sudah terisi otomatis sesuai daftar siswa kelas terpilih. Jangan ubah urutan kolom atau hapus baris header.'],
    [2, 'Nilai Sumatif TP (PPK)', 'Isi angka 0 - 100 untuk nilai pengetahuan/sumatif murni tiap Tujuan Pembelajaran (TP).'],
    [3, 'Nilai Perbaikan / Praktik (PRK)', `Opsional jika Auto-PRK aktif. Jika dikosongkan, sistem menghitung otomatis PRK = ROUND((PPK + 100) / 2, 0).`],
    [4, 'Sumatif Akhir Semester (SAS)', 'Isi nilai SAS (PPK). Kolom SAS PRK boleh dikosongkan apabila menggunakan Auto-PRK.'],
    [5, 'Kehadiran, Proses, Tugas', 'Isi angka 0 - 100 sesuai penilaian keaktifan kehadiran, proses belajar, dan tugas terstruktur.'],
    [6, 'Sikap P3 (D.1 - D.6)', 'Opsional (default 85). Mengacu pada 6 dimensi Profil Pelajar Pancasila.'],
    [7, 'Bobot Nilai Akhir Aktif', `Sumatif PPK (${settings.weights.sumatifPpk}%) + Sumatif PRK (${settings.weights.sumatifPrk}%) + SAS (${settings.weights.sas}%) + Kehadiran (${settings.weights.kehadiran}%) + Proses (${settings.weights.proses}%) + Tugas (${settings.weights.tugas}%)`],
    [8, 'Cara Upload ke Aplikasi', 'Simpan file .xlsx ini -> Buka menu Input Nilai -> Klik tombol "Import Excel/CSV" -> Pilih file ini. Deskripsi Capaian Kompetensi ter-generate otomatis.'],
    [],
    ['DAFTAR TUJUAN PEMBELAJARAN (TP) AKTIF PADA MAPEL INI:'],
    ...subject.tpList.map((tp, idx) => [`Sumatif ${idx + 1}`, tp.code, tp.title]),
    ['SAS', 'Sum. Akhir Semester', subject.sasTitle || '-'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(panduanAoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 85 }];
  return ws;
}

/**
 * Downloads an official blank SMA Pasundan 9 Bandung gradebook template (.xlsx)
 * pre-populated with class, subject, TP titles, KKTP, and active student roster.
 */
export function downloadGradeTemplateExcel(
  subject: Subject,
  classRoom: ClassRoom,
  students: Student[],
  settings: SchoolSettings
): void {
  const tpCount = Math.max(1, subject.tpList.length);
  const sumatifHeaderRow: (string | number)[] = ['', '', '', ''];
  const tpTitleRow: (string | number)[] = ['', '', '', ''];
  const ppkPrkRow: (string | number)[] = ['Urt.', 'Induk', '', ''];

  const merges: XLSX.Range[] = [
    { s: { r: 8, c: 0 }, e: { r: 10, c: 1 } }, // Nomor
    { s: { r: 8, c: 2 }, e: { r: 11, c: 2 } }, // NAMA/KODE PESERTA
    { s: { r: 8, c: 3 }, e: { r: 11, c: 3 } }, // L/P
  ];

  subject.tpList.forEach((tp, idx) => {
    const startCol = 4 + idx * 2;
    sumatifHeaderRow.push(`Sumatif ${idx + 1}`, '');
    tpTitleRow.push(tp.title, '');
    ppkPrkRow.push('PPK', 'PRK');
    merges.push({ s: { r: 9, c: startCol }, e: { r: 9, c: startCol + 1 } });
    merges.push({ s: { r: 10, c: startCol }, e: { r: 10, c: startCol + 1 } });
  });

  const sasCol = 4 + tpCount * 2;
  const kehCol = sasCol + 2;
  const proCol = sasCol + 3;
  const tgsCol = sasCol + 4;
  const kogCol = sasCol + 5;
  const akhirCol = sasCol + 6;
  const p3Col = sasCol + 7;
  const descCol = sasCol + 13;

  sumatifHeaderRow.push(
    'Sum. Akhir Semester',
    '',
    'Kehadiran',
    'Proses',
    'Tugas',
    'RAPOR',
    'NILAI',
    'SIKAP P3',
    '',
    '',
    '',
    '',
    '',
    'Deskripsi Capaian Kompetensi'
  );
  tpTitleRow.push(
    subject.sasTitle || 'Sumatif Akhir Semester',
    '',
    '',
    '',
    '',
    'KOGNITIF',
    'AKHIR',
    'D.1',
    'D.2',
    'D.3',
    'D.4',
    'D.5',
    'D.6',
    ''
  );
  ppkPrkRow.push('PPK', 'PRK', '', '', '', '(Otomatis)', '(Otomatis)', '', '', '', '', '', '', '(Otomatis saat Upload)');

  merges.push(
    { s: { r: 8, c: 4 }, e: { r: 8, c: descCol } }, // NILAI
    { s: { r: 9, c: sasCol }, e: { r: 9, c: sasCol + 1 } },
    { s: { r: 10, c: sasCol }, e: { r: 10, c: sasCol + 1 } },
    { s: { r: 9, c: p3Col }, e: { r: 9, c: p3Col + 5 } },
    { s: { r: 9, c: descCol }, e: { r: 10, c: descCol } }
  );

  const kkmCol = p3Col + 5;

  const kelasRow: (string | number)[] = Array(descCol + 1).fill('');
  kelasRow[0] = `Kelas              :  ${classRoom.name}`;
  kelasRow[kkmCol] = subject.kktp;

  const mapelRow: (string | number)[] = Array(descCol + 1).fill('');
  mapelRow[0] = 'Mata Pelajaran:';
  mapelRow[2] = subject.name;
  mapelRow[kkmCol] = 'KKM';

  const headerDaftarRow: (string | number)[] = Array(descCol + 1).fill('');
  headerDaftarRow[0] = 'DAFTAR NILAI';
  headerDaftarRow[kkmCol] = '>> TEMPLATE RESMI UPLOAD E-RAPORT <<';

  const aoa: (string | number)[][] = [
    ['', '', settings.yayasan],
    ['', '', settings.schoolName],
    ['', '', settings.address],
    [],
    headerDaftarRow,
    mapelRow,
    kelasRow,
    [],
    ['Nomor', '', 'NAMA/KODE PESERTA', 'L/P', 'NILAI'],
    sumatifHeaderRow,
    tpTitleRow,
    ppkPrkRow,
  ];

  const studentRows =
    students.length > 0
      ? students
      : [
          {
            id: 'sample-1',
            nis: '252610001',
            nisn: '',
            fullName: 'Contoh Nama Siswa',
            gender: 'L' as Gender,
            classId: classRoom.id,
            birthPlace: 'Bandung',
            birthDate: '2009-01-01',
            religion: 'Islam',
            address: 'Bandung',
            parentName: '-',
            isActive: true,
          },
        ];

  studentRows.forEach((student, idx) => {
    const row: (string | number)[] = Array(descCol + 1).fill('');
    row[0] = idx + 1;
    row[1] = student.nis;
    row[2] = student.fullName;
    row[3] = student.gender;
    // Pre-fill default Sikap P3 = 85 and Kehadiran = 90 as convenient starting defaults, leave scores blank for teacher input
    row[kehCol] = '';
    row[proCol] = '';
    row[tgsCol] = '';
    row[kogCol] = '';
    row[akhirCol] = '';
    for (let d = 0; d < 6; d++) {
      row[p3Col + d] = 85;
    }
    aoa.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;

  const cols: XLSX.ColInfo[] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 30 },
    { wch: 5 },
  ];
  for (let c = 4; c < sasCol + 2; c++) cols.push({ wch: 7 });
  cols.push({ wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 11 }, { wch: 11 });
  for (let d = 0; d < 6; d++) cols.push({ wch: 5 });
  cols.push({ wch: 32 });
  ws['!cols'] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Nilai');
  XLSX.utils.book_append_sheet(wb, buildPanduanSheet(subject, classRoom, settings), 'Panduan Pengisian');

  const safeName = `${subject.code}_${classRoom.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Template_Input_Nilai_${safeName}.xlsx`);
}

/**
 * Downloads a simplified 1-row-header tabular grade upload template (.xlsx)
 * ideal for quick bulk grade entry in Excel / Google Sheets.
 */
export function downloadSimpleGradeTemplateExcel(
  subject: Subject,
  classRoom: ClassRoom,
  students: Student[],
  settings: SchoolSettings
): void {
  const tpHeaders: string[] = [];
  subject.tpList.forEach((_, idx) => {
    tpHeaders.push(`TP${idx + 1} PPK`, `TP${idx + 1} PRK`);
  });

  const headers = [
    'No',
    'NIS',
    'Nama Peserta Didik',
    'L/P',
    ...tpHeaders,
    'SAS PPK',
    'SAS PRK',
    'Kehadiran',
    'Proses',
    'Tugas',
    'D.1',
    'D.2',
    'D.3',
    'D.4',
    'D.5',
    'D.6',
  ];

  const studentRows =
    students.length > 0
      ? students
      : [
          {
            id: 'sample-1',
            nis: '252610001',
            nisn: '',
            fullName: 'Contoh Nama Siswa',
            gender: 'L' as Gender,
            classId: classRoom.id,
            birthPlace: 'Bandung',
            birthDate: '2009-01-01',
            religion: 'Islam',
            address: 'Bandung',
            parentName: '-',
            isActive: true,
          },
        ];

  const rows = studentRows.map((stu, idx) => [
    idx + 1,
    stu.nis,
    stu.fullName,
    stu.gender,
    ...Array(subject.tpList.length * 2).fill(''),
    '',
    '',
    '',
    '',
    '',
    85,
    85,
    85,
    85,
    85,
    85,
  ]);

  const aoa: (string | number)[][] = [
    ['Mata Pelajaran', subject.name, 'KKTP', subject.kktp],
    ['Kelas', classRoom.name, 'Tahun Ajaran', `${settings.academicYear} (${settings.semester})`],
    [],
    headers,
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 13 },
    { wch: 30 },
    { wch: 5 },
    ...Array(subject.tpList.length * 2 + 5).fill({ wch: 10 }),
    ...Array(6).fill({ wch: 5 }),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Input Nilai Ringkas');
  XLSX.utils.book_append_sheet(wb, buildPanduanSheet(subject, classRoom, settings), 'Panduan Pengisian');

  const safeName = `${subject.code}_${classRoom.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Template_Ringkas_Nilai_${safeName}.xlsx`);
}

export function buildEmptyTpScores(tpList: TujuanPembelajaran[]): TpScore[] {
  return tpList.map((tp) => ({ tpId: tp.id, ppk: null, prk: null }));
}
