import {
  GradeWeights,
  SchoolSettings,
  Subject,
  SubjectGrade,
  TpScore,
} from '../types/raport';

/**
 * Replicates the PRK (Perbaikan / Praktik) formula observed in the SMA Pasundan 9 Bandung Excel sheet:
 * When remedial/pengayaan is applied to PPK, PRK averages toward 100: ROUND((PPK + 100) / 2, 0).
 */
export function computeAutoPrk(ppk: number | null): number | null {
  if (ppk === null || Number.isNaN(ppk)) return null;
  if (ppk >= 100) return 100;
  return Math.round((ppk + 100) / 2);
}

export function getPredikat(
  score: number,
  kktp: number
): 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= kktp) return 'C';
  return 'D';
}

export function getPredikatLabel(predikat: 'A' | 'B' | 'C' | 'D'): string {
  switch (predikat) {
    case 'A':
      return 'Sangat Baik';
    case 'B':
      return 'Baik';
    case 'C':
      return 'Cukup';
    case 'D':
      return 'Perlu Bimbingan';
  }
}

/**
 * Calculates final Raport score based on configured weights.
 * Default weights (20% Sumatif PPK, 30% Sumatif PRK, 10% SAS, 10% Kehadiran, 10% Proses, 20% Tugas)
 * match the exact 12-student dataset in Olah_Nilai_Kurmer_SMA_Pasundan_9_Bandung.csv.
 */
export function calculateFinalScore(
  tpScores: TpScore[],
  sasPpk: number | null,
  sasPrk: number | null,
  kehadiran: number | null,
  proses: number | null,
  tugas: number | null,
  weights: GradeWeights
): number {
  const validPpk = tpScores
    .map((t) => t.ppk)
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  const validPrk = tpScores
    .map((t) => t.prk ?? t.ppk)
    .filter((v): v is number => v !== null && !Number.isNaN(v));

  const avgPpk =
    validPpk.length > 0
      ? validPpk.reduce((sum, n) => sum + n, 0) / validPpk.length
      : 0;
  const avgPrk =
    validPrk.length > 0
      ? validPrk.reduce((sum, n) => sum + n, 0) / validPrk.length
      : avgPpk;

  const sasEff = sasPpk ?? sasPrk ?? 0;
  const kehVal = kehadiran ?? 0;
  const proVal = proses ?? 0;
  const tgsVal = tugas ?? 0;

  const totalWeight =
    weights.sumatifPpk +
    weights.sumatifPrk +
    weights.sas +
    weights.kehadiran +
    weights.proses +
    weights.tugas;

  if (totalWeight <= 0) return 0;

  const weighted =
    (avgPpk * weights.sumatifPpk +
      avgPrk * weights.sumatifPrk +
      sasEff * weights.sas +
      kehVal * weights.kehadiran +
      proVal * weights.proses +
      tgsVal * weights.tugas) /
    totalWeight;

  return Math.round(weighted);
}

/**
 * Generates Kurikulum Merdeka narrative competency description replicating SMA Pasundan 9 Bandung's
 * template prose without Excel #VALUE!/BG14 concatenation bugs.
 */
export function generateCapaianKompetensi(
  subject: Subject,
  tpScores: TpScore[],
  sasPpk: number | null,
  sasPrk: number | null,
  thresholdBaik: number
): string {
  const kktp = subject.kktp || 70;

  const items: { title: string; score: number }[] = subject.tpList.map((tp) => {
    const found = tpScores.find((s) => s.tpId === tp.id);
    const eff = found?.prk ?? found?.ppk ?? 0;
    return { title: tp.title, score: eff };
  });

  if (subject.sasTitle && (sasPpk !== null || sasPrk !== null)) {
    const sasEff = sasPrk ?? sasPpk ?? 0;
    items.push({
      title: `menganalisis ${subject.sasTitle}`,
      score: sasEff,
    });
  }

  const scoredItems = items.filter((item) => item.score > 0);
  if (scoredItems.length === 0) {
    return `Belum terdapat data capaian kompetensi pada mata pelajaran ${subject.name}.`;
  }

  const baikList = scoredItems
    .filter((i) => i.score >= thresholdBaik)
    .map((i) => i.title);

  const cukupList = scoredItems
    .filter((i) => i.score >= kktp && i.score < thresholdBaik)
    .map((i) => i.title);

  const perluBimbinganList = scoredItems
    .filter((i) => i.score < kktp)
    .map((i) => i.title);

  const parts: string[] = [];

  if (baikList.length > 0) {
    parts.push(
      `Telah menunjukkan penguasaan dan pemahaman materi ${subject.name} dengan kemampuan yang BAIK dalam ${baikList.join(', ')}.`
    );
  }

  if (cukupList.length > 0) {
    parts.push(
      `CUKUP mampu memahami materi ${subject.name} dalam ${cukupList.join(', ')}, namun masih perlu pendalaman.`
    );
  }

  if (perluBimbinganList.length > 0) {
    parts.push(
      `Meski MULAI menunjukkan pemahaman, namun masih HARUS DIBANGUN kemampuan ${perluBimbinganList.join(', ')}.`
    );
  }

  return parts.join(' ');
}

export function recalculateSubjectGrade(
  grade: SubjectGrade,
  subject: Subject,
  settings: SchoolSettings
): SubjectGrade {
  const nilaiAkhir = calculateFinalScore(
    grade.tpScores,
    grade.sasPpk,
    grade.sasPrk,
    grade.kehadiran,
    grade.proses,
    grade.tugas,
    settings.weights
  );
  const predikat = getPredikat(nilaiAkhir, subject.kktp || settings.defaultKktp);
  const deskripsiAuto = generateCapaianKompetensi(
    subject,
    grade.tpScores,
    grade.sasPpk,
    grade.sasPrk,
    settings.thresholdBaik
  );

  return {
    ...grade,
    nilaiAkhir,
    predikat,
    deskripsiAuto,
  };
}

export interface ColumnStats {
  jml: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  tercapai: number;
  belumTercapai: number;
}

export function computeColumnStats(values: number[], kktp = 70): ColumnStats {
  const valid = values.filter((v) => typeof v === 'number' && !Number.isNaN(v) && v > 0);
  if (valid.length === 0) {
    return { jml: 0, min: 0, max: 0, avg: 0, stdDev: 0, tercapai: 0, belumTercapai: 0 };
  }
  const jml = valid.reduce((a, b) => a + b, 0);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = jml / valid.length;
  const variance =
    valid.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  const tercapai = valid.filter((v) => v >= kktp).length;
  const belumTercapai = valid.length - tercapai;

  return { jml, min, max, avg, stdDev, tercapai, belumTercapai };
}
