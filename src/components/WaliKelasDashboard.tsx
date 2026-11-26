import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  Filter,
  Printer,
  Search,
  Send,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { isSubjectForClass } from '../types/raport';
import { recalculateSubjectGrade } from '../utils/gradeCalculator';

interface DistributionBucket {
  id: string;
  label: string;
  shortLabel: string;
  categoryLabel: string;
  min: number;
  max: number;
  color: string;
  count: number;
  pct: number;
  studentNames: string[];
}

interface SubjectBarDatum {
  id: string;
  code: string;
  name: string;
  avg: number;
  kktp: number;
  filledCount: number;
  passedCount: number;
  fill: string;
}

interface PredikatPieDatum {
  key: 'A' | 'B' | 'C' | 'D';
  name: string;
  rangeLabel: string;
  value: number;
  pct: number;
  color: string;
}

type ProgressFilter = 'all' | 'attention' | 'on_track' | 'high_achiever';

interface DistributionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DistributionBucket }>;
}

function DistributionTooltip({ active, payload }: DistributionTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-slate-950 text-white px-3.5 py-2.5 rounded-xl border border-slate-800 shadow-lg text-xs max-w-[240px]">
      <div className="font-semibold text-white">
        Rentang {item.label} · {item.categoryLabel}
      </div>
      <div className="mt-1 font-mono tabular-nums text-emerald-300">
        {item.count} siswa ({item.pct.toFixed(1)}% dari kelas)
      </div>
      {item.studentNames.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[11px] text-slate-300 leading-snug">
          {item.studentNames.slice(0, 4).join(', ')}
          {item.studentNames.length > 4 ? ` +${item.studentNames.length - 4} lainnya` : ''}
        </div>
      )}
    </div>
  );
}

interface SubjectTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SubjectBarDatum }>;
}

function SubjectTooltip({ active, payload }: SubjectTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const tuntas = item.avg >= item.kktp;
  return (
    <div className="bg-slate-950 text-white px-3.5 py-2.5 rounded-xl border border-slate-800 shadow-lg text-xs max-w-[240px]">
      <div className="font-semibold text-white">{item.name}</div>
      <div className="mt-1 font-mono tabular-nums flex items-center justify-between gap-4">
        <span className="text-slate-300">Rata-rata:</span>
        <span className={tuntas ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
          {item.avg.toFixed(2)}
        </span>
      </div>
      <div className="font-mono tabular-nums flex items-center justify-between gap-4">
        <span className="text-slate-300">Batas KKTP:</span>
        <span>{item.kktp}</span>
      </div>
      <div className="font-mono tabular-nums flex items-center justify-between gap-4">
        <span className="text-slate-300">Siswa Tuntas:</span>
        <span>
          {item.passedCount}/{item.filledCount}
        </span>
      </div>
    </div>
  );
}

interface PredikatTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PredikatPieDatum }>;
}

function PredikatTooltip({ active, payload }: PredikatTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-slate-950 text-white px-3 py-2 rounded-xl border border-slate-800 shadow-lg text-xs">
      <div className="font-semibold">
        {item.name} ({item.rangeLabel})
      </div>
      <div className="mt-0.5 font-mono tabular-nums text-emerald-300">
        {item.value} entri nilai ({item.pct.toFixed(1)}%)
      </div>
    </div>
  );
}

export function WaliKelasDashboard({ embedded = false }: { embedded?: boolean }) {
  const {
    classes,
    students,
    subjects,
    grades,
    homeroomRecords,
    users,
    settings,
    focusedClassId,
    setFocusedClassId,
    setActiveTab,
    openWaliSection,
    openGradeInput,
    getGradeSubmission,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  const selectedClass = classes.find((c) => c.id === focusedClassId) || classes[0];

  const homeroomTeacher = useMemo(() => {
    if (!selectedClass) return undefined;
    return (
      users.find((u) => u.role === 'wali_kelas' && u.assignedClassId === selectedClass.id) ||
      users.find((u) => u.id === selectedClass.homeroomTeacherId)
    );
  }, [users, selectedClass]);

  const classStudents = useMemo(
    () =>
      selectedClass
        ? students.filter((s) => s.classId === selectedClass.id && s.isActive)
        : [],
    [students, selectedClass]
  );

  const classSubjects = useMemo(
    () =>
      selectedClass
        ? subjects
            .filter((sub) => isSubjectForClass(sub, selectedClass))
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [subjects, selectedClass]
  );

  const studentRows = useMemo(() => {
    const raw = classStudents.map((stu) => {
      const subjectDetails = classSubjects.map((sub) => {
        const found = grades.find(
          (g) =>
            g.studentId === stu.id &&
            g.subjectId === sub.id &&
            g.academicYear === settings.academicYear &&
            g.semester === settings.semester
        );
        const calc = found ? recalculateSubjectGrade(found, sub, settings) : null;
        return {
          subject: sub,
          grade: calc,
          score: calc && calc.nilaiAkhir > 0 ? calc.nilaiAkhir : 0,
        };
      });

      const filled = subjectDetails.filter((d) => d.score > 0);
      const avg =
        filled.length > 0
          ? filled.reduce((sum, d) => sum + d.score, 0) / filled.length
          : 0;
      const belowKktpSubjects = filled
        .filter((d) => d.score < d.subject.kktp)
        .map((d) => d.subject.name);

      const hr = homeroomRecords.find(
        (r) =>
          r.studentId === stu.id &&
          r.academicYear === settings.academicYear &&
          r.semester === settings.semester
      );
      const sakit = hr?.sakit ?? 0;
      const izin = hr?.izin ?? 0;
      const alpha = hr?.alpha ?? 0;
      const totalAbsence = sakit + izin + alpha;
      const ekskulCount = hr?.extracurriculars.length ?? 0;
      const p5Count = hr?.p5Projects.length ?? 0;
      const hasNote = Boolean(hr?.waliNote && hr.waliNote.trim().length > 0);

      let statusCategory: 'pendampingan' | 'tuntas' | 'unggul' | 'belum_lengkap' = 'tuntas';
      if (filled.length === 0) {
        statusCategory = 'belum_lengkap';
      } else if (belowKktpSubjects.length > 0 || alpha >= 2 || avg < settings.defaultKktp) {
        statusCategory = 'pendampingan';
      } else if (avg >= 88) {
        statusCategory = 'unggul';
      }

      return {
        student: stu,
        subjectDetails,
        filledCount: filled.length,
        totalSubjects: classSubjects.length,
        avg: Number(avg.toFixed(2)),
        belowKktpSubjects,
        sakit,
        izin,
        alpha,
        totalAbsence,
        ekskulCount,
        p5Count,
        hasNote,
        statusCategory,
      };
    });

    const sorted = [...raw].sort((a, b) => b.avg - a.avg);
    return raw.map((row) => ({
      ...row,
      rank:
        row.avg > 0
          ? sorted.findIndex((r) => r.student.id === row.student.id) + 1
          : 0,
    }));
  }, [classStudents, classSubjects, grades, homeroomRecords, settings]);

  const distributionData: DistributionBucket[] = useMemo(() => {
    const scoredStudents = studentRows.filter((r) => r.filledCount > 0);
    const total = scoredStudents.length;

    const defs: Omit<DistributionBucket, 'count' | 'pct' | 'studentNames'>[] = [
      {
        id: 'b_under75',
        label: '< 75',
        shortLabel: '< 75',
        categoryLabel: 'Perlu Bimbingan',
        min: 0,
        max: 74.999,
        color: '#dc2626',
      },
      {
        id: 'b_75_79',
        label: '75–79',
        shortLabel: '75–79',
        categoryLabel: 'Cukup',
        min: 75,
        max: 79.999,
        color: '#d97706',
      },
      {
        id: 'b_80_84',
        label: '80–84',
        shortLabel: '80–84',
        categoryLabel: 'Baik',
        min: 80,
        max: 84.999,
        color: '#0284c7',
      },
      {
        id: 'b_85_89',
        label: '85–89',
        shortLabel: '85–89',
        categoryLabel: 'Sangat Baik',
        min: 85,
        max: 89.999,
        color: '#059669',
      },
      {
        id: 'b_90_100',
        label: '90–100',
        shortLabel: '90–100',
        categoryLabel: 'Istimewa',
        min: 90,
        max: 100,
        color: '#047857',
      },
    ];

    return defs.map((d) => {
      const matched = scoredStudents.filter((r) => r.avg >= d.min && r.avg <= d.max);
      return {
        ...d,
        count: matched.length,
        pct: total > 0 ? (matched.length / total) * 100 : 0,
        studentNames: matched.map((m) => m.student.fullName),
      };
    });
  }, [studentRows]);

  const subjectChartData: SubjectBarDatum[] = useMemo(() => {
    return classSubjects.map((sub) => {
      const valid = classStudents
        .map((stu) => {
          const found = grades.find(
            (g) =>
              g.studentId === stu.id &&
              g.subjectId === sub.id &&
              g.academicYear === settings.academicYear &&
              g.semester === settings.semester
          );
          return found ? recalculateSubjectGrade(found, sub, settings) : null;
        })
        .filter((g): g is NonNullable<typeof g> => g !== null && g.nilaiAkhir > 0);

      const avg =
        valid.length > 0
          ? Number((valid.reduce((sum, g) => sum + g.nilaiAkhir, 0) / valid.length).toFixed(2))
          : 0;
      const passedCount = valid.filter((g) => g.nilaiAkhir >= sub.kktp).length;

      return {
        id: sub.id,
        code: sub.code,
        name: sub.name,
        avg,
        kktp: sub.kktp,
        filledCount: valid.length,
        passedCount,
        fill: valid.length === 0 ? '#cbd5e1' : avg >= sub.kktp ? '#059669' : '#d97706',
      };
    });
  }, [classSubjects, classStudents, grades, settings]);

  const predikatPieData: PredikatPieDatum[] = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    studentRows.forEach((row) => {
      row.subjectDetails.forEach((d) => {
        if (d.grade && d.grade.nilaiAkhir > 0) {
          counts[d.grade.predikat] += 1;
        }
      });
    });
    const total = counts.A + counts.B + counts.C + counts.D;

    return [
      {
        key: 'A',
        name: 'Predikat A',
        rangeLabel: '90–100',
        value: counts.A,
        pct: total > 0 ? (counts.A / total) * 100 : 0,
        color: '#047857',
      },
      {
        key: 'B',
        name: 'Predikat B',
        rangeLabel: '80–89',
        value: counts.B,
        pct: total > 0 ? (counts.B / total) * 100 : 0,
        color: '#0284c7',
      },
      {
        key: 'C',
        name: 'Predikat C',
        rangeLabel: 'KKTP–79',
        value: counts.C,
        pct: total > 0 ? (counts.C / total) * 100 : 0,
        color: '#d97706',
      },
      {
        key: 'D',
        name: 'Predikat D',
        rangeLabel: '< KKTP',
        value: counts.D,
        pct: total > 0 ? (counts.D / total) * 100 : 0,
        color: '#dc2626',
      },
    ];
  }, [studentRows]);

  const totalPredikatEntries = predikatPieData.reduce((s, item) => s + item.value, 0);

  const classKpis = useMemo(() => {
    const scored = studentRows.filter((r) => r.filledCount > 0);
    const classAvg =
      scored.length > 0
        ? Number((scored.reduce((s, r) => s + r.avg, 0) / scored.length).toFixed(2))
        : 0;
    const highestAvg = scored.length > 0 ? Math.max(...scored.map((r) => r.avg)) : 0;
    const lowestAvg = scored.length > 0 ? Math.min(...scored.map((r) => r.avg)) : 0;

    const passedAllCount = scored.filter((r) => r.belowKktpSubjects.length === 0).length;
    const attentionCount = studentRows.filter((r) => r.statusCategory === 'pendampingan').length;
    const passRatePct =
      scored.length > 0 ? Math.round((passedAllCount / scored.length) * 100) : 0;

    const sentSubjectsCount = selectedClass
      ? classSubjects.filter(
          (sub) => getGradeSubmission(selectedClass.id, sub.id)?.status === 'sent'
        ).length
      : 0;

    const homeroomCompletedCount = studentRows.filter(
      (r) => r.hasNote || r.ekskulCount > 0 || r.p5Count > 0
    ).length;

    const totalSakit = studentRows.reduce((s, r) => s + r.sakit, 0);
    const totalIzin = studentRows.reduce((s, r) => s + r.izin, 0);
    const totalAlpha = studentRows.reduce((s, r) => s + r.alpha, 0);
    const zeroAlphaCount = studentRows.filter((r) => r.alpha === 0).length;

    return {
      totalStudents: studentRows.length,
      scoredStudents: scored.length,
      classAvg,
      highestAvg,
      lowestAvg,
      passedAllCount,
      attentionCount,
      passRatePct,
      sentSubjectsCount,
      homeroomCompletedCount,
      totalSakit,
      totalIzin,
      totalAlpha,
      zeroAlphaCount,
    };
  }, [studentRows, classSubjects, selectedClass, getGradeSubmission]);

  const activeBucket = distributionData.find((b) => b.id === selectedBucketId) || null;

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return studentRows.filter((row) => {
      if (activeBucket) {
        if (row.filledCount === 0 || row.avg < activeBucket.min || row.avg > activeBucket.max) {
          return false;
        }
      }
      if (progressFilter === 'attention' && row.statusCategory !== 'pendampingan') {
        return false;
      }
      if (
        progressFilter === 'on_track' &&
        row.statusCategory !== 'tuntas' &&
        row.statusCategory !== 'unggul'
      ) {
        return false;
      }
      if (progressFilter === 'high_achiever' && row.avg < 88) {
        return false;
      }
      if (q) {
        const matchName = row.student.fullName.toLowerCase().includes(q);
        const matchNis = row.student.nis.toLowerCase().includes(q);
        if (!matchName && !matchNis) return false;
      }
      return true;
    });
  }, [studentRows, activeBucket, progressFilter, searchQuery]);

  const hasAnyScores = classKpis.scoredStudents > 0;

  if (!selectedClass) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2.5">
        <Users className="w-8 h-8 text-slate-400 mx-auto" />
        <div className="text-sm font-semibold text-slate-900">
          Belum Ada Data Kelas di Supabase
        </div>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Tambahkan kelas dan peserta didik melalui akun Admin pada menu Master Data agar ringkasan performa wali kelas dapat ditampilkan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner (Hidden when embedded inside HomeroomView to avoid duplicate headers) */}
      {!embedded && (
        <div className="bg-obsidian-grid text-white rounded-2xl p-6 sm:p-7 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-medium text-emerald-300">
              Dashboard Wali Kelas · {settings.schoolName} · TA {settings.academicYear} ({settings.semester})
            </div>
            <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white text-balance">
              Ringkasan Performa Kelas {selectedClass.name}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Fase {selectedClass.fase} · Wali Kelas: {homeroomTeacher?.fullName || 'Belum ditetapkan'} · Pantau distribusi nilai siswa, ketuntasan tiap mata pelajaran, dan kesiapan raport.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-white/10 border border-white/15 rounded-xl">
              {classes.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => {
                    setFocusedClassId(cls.id);
                    setSelectedBucketId(null);
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                    selectedClass.id === cls.id
                      ? 'bg-emerald-500 text-slate-950 shadow-xs'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {cls.name} (Fase {cls.fase})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openWaliSection('absensi', selectedClass.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-white hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Absensi & P5</span>
              </button>
              <button
                type="button"
                onClick={() => openWaliSection('leger', selectedClass.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
                <span>Leger Kelas</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('raport')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Raport</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4-Column KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Rata-Rata Performa Kelas</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {hasAnyScores ? classKpis.classAvg.toFixed(2) : '—'}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              KKTP {settings.defaultKktp}
            </span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600">
            <span>Tertinggi: {hasAnyScores ? classKpis.highestAvg.toFixed(1) : '—'}</span>
            <span>Terendah: {hasAnyScores ? classKpis.lowestAvg.toFixed(1) : '—'}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Ketuntasan Seluruh Mapel</span>
            {classKpis.attentionCount === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {classKpis.passRatePct}%
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {classKpis.passedAllCount}/{classKpis.scoredStudents} siswa tuntas
            </span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>Perlu pendampingan:</span>
            <span
              className={`font-mono tabular-nums font-semibold ${
                classKpis.attentionCount > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {classKpis.attentionCount} siswa
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Kesiapan Data Raport</span>
            <Send className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {classKpis.sentSubjectsCount}/{classSubjects.length}
            </span>
            <span className="text-xs text-slate-500">mapel terkirim</span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>Catatan & P5 siswa:</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {classKpis.homeroomCompletedCount}/{classKpis.totalStudents} terisi
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Rekap Kehadiran ({classKpis.totalStudents} Siswa)</span>
            <CalendarCheck2 className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-3 font-mono tabular-nums">
            <span className="text-sm font-semibold text-slate-800">
              S: <strong className="text-lg text-slate-900">{classKpis.totalSakit}</strong>
            </span>
            <span className="text-sm font-semibold text-slate-800">
              I: <strong className="text-lg text-slate-900">{classKpis.totalIzin}</strong>
            </span>
            <span className="text-sm font-semibold text-slate-800">
              A:{' '}
              <strong
                className={`text-lg ${
                  classKpis.totalAlpha > 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {classKpis.totalAlpha}
              </strong>
            </span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>Tanpa Alpha (Nihil):</span>
            <span className="font-mono tabular-nums font-semibold text-emerald-700">
              {classKpis.zeroAlphaCount}/{classKpis.totalStudents} siswa
            </span>
          </div>
        </div>
      </div>

      {/* Recharts Row 1: Student Score Distribution Histogram + Predikat Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Distribusi Nilai Rata-Rata Siswa ({selectedClass.name})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik batang grafik untuk menyaring daftar siswa pada rentang nilai tertentu.
              </p>
            </div>
            {activeBucket && (
              <button
                type="button"
                onClick={() => setSelectedBucketId(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg whitespace-nowrap shrink-0"
              >
                <span>Filter: {activeBucket.label}</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!hasAnyScores ? (
            <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <BookOpen className="w-8 h-8 text-slate-400 mb-2" />
              <div className="text-sm font-semibold text-slate-800">
                Belum Ada Nilai Siswa di Kelas {selectedClass.name}
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Grafik distribusi akan muncul otomatis setelah guru mata pelajaran atau wali kelas menginput nilai.
              </p>
              <button
                type="button"
                onClick={() => openGradeInput(selectedClass.id, classSubjects[0]?.id)}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Mulai Input Nilai</span>
              </button>
            </div>
          ) : (
            <>
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={0}
                  initialDimension={{ width: 480, height: 260 }}
                >
                  <BarChart
                    data={distributionData}
                    margin={{ top: 12, right: 12, left: -16, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 12, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<DistributionTooltip />} cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} />
                    <Bar
                      dataKey="count"
                      name="Jumlah Siswa"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={56}
                      onClick={(entry) => {
                        const bucket =
                          entry && typeof entry === 'object'
                            ? ((entry as { payload?: DistributionBucket }).payload ??
                              (entry as unknown as DistributionBucket))
                            : undefined;
                        if (bucket?.id) {
                          setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id));
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {distributionData.map((entry) => {
                        const dimmed = selectedBucketId !== null && selectedBucketId !== entry.id;
                        return (
                          <Cell
                            key={entry.id}
                            fill={entry.color}
                            fillOpacity={dimmed ? 0.3 : 1}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                {distributionData.map((b) => {
                  const active = selectedBucketId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBucketId((prev) => (prev === b.id ? null : b.id))}
                      className={`text-left p-2 rounded-lg border transition-colors ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="font-semibold flex items-center justify-between gap-1">
                        <span>{b.label}</span>
                        <span className="font-mono tabular-nums">{b.count}</span>
                      </div>
                      <div className={`text-[10px] truncate mt-0.5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                        {b.categoryLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: Predikat Donut Chart */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 flex flex-col">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Proporsi Predikat Nilai Lintas Mapel
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              {totalPredikatEntries} entri nilai terekam di {classSubjects.length} mata pelajaran
            </p>
          </div>

          {totalPredikatEntries === 0 ? (
            <div className="flex-1 min-h-[260px] flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              Belum ada nilai mata pelajaran yang dihitung.
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between gap-4">
              <div className="relative h-[210px] w-full min-w-0">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={0}
                  initialDimension={{ width: 320, height: 210 }}
                >
                  <PieChart>
                    <Pie
                      data={predikatPieData.filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={84}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {predikatPieData
                        .filter((d) => d.value > 0)
                        .map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip content={<PredikatTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {totalPredikatEntries}
                  </span>
                  <span className="text-[11px] text-slate-500">Total Nilai</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {predikatPieData.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-slate-800">{item.name}</span>
                      <span className="text-slate-400 font-mono tabular-nums">
                        ({item.rangeLabel})
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-700 shrink-0">
                      <strong className="text-slate-900">{item.value}</strong>{' '}
                      <span className="text-slate-400">({item.pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recharts Row 2: Subject Average vs KKTP Chart */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Perbandingan Rata-Rata Capaian per Mata Pelajaran vs KKTP
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Garis putus-putus horizontal menunjukkan batas KKTP standar ({settings.defaultKktp}). Batang hijau tuntas KKTP, batang kuning di bawah KKTP.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openWaliSection('kiriman_guru', selectedClass.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg whitespace-nowrap shrink-0"
          >
            <span>Cek Kiriman Guru ({classKpis.sentSubjectsCount}/{classSubjects.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-[250px] w-full min-w-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
            initialDimension={{ width: 640, height: 250 }}
          >
            <BarChart
              data={subjectChartData}
              margin={{ top: 14, right: 16, left: -12, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="code"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<SubjectTooltip />} cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} />
              <ReferenceLine
                y={settings.defaultKktp}
                stroke="#0f172a"
                strokeDasharray="4 4"
                label={{
                  value: `KKTP ${settings.defaultKktp}`,
                  position: 'insideTopRight',
                  fill: '#0f172a',
                  fontSize: 11,
                }}
              />
              <Bar dataKey="avg" name="Rata-rata" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {subjectChartData.map((entry) => (
                  <Cell key={entry.id} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Student Progress Monitoring Table */}
      <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Pemantauan Kemajuan Belajar Siswa · {selectedClass.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identifikasi siswa berprestasi maupun siswa yang membutuhkan pendampingan akademik dan kehadiran.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama atau NIS..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700 w-48"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'attention', label: `Pendampingan (${classKpis.attentionCount})` },
                  { id: 'on_track', label: 'Tuntas' },
                  { id: 'high_achiever', label: 'Prestasi ≥88' },
                ] as { id: ProgressFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setProgressFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    progressFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4 text-center w-14">Rank</th>
                <th className="py-2.5 px-4 min-w-[200px]">Nama Siswa & NIS</th>
                <th className="py-2.5 px-3 text-right">Rata-Rata</th>
                <th className="py-2.5 px-3 text-right">Mapel Tuntas</th>
                <th className="py-2.5 px-3 text-center">Absensi (S/I/A)</th>
                <th className="py-2.5 px-4">Status Pemantauan</th>
                <th className="py-2.5 px-4 text-right">Tindak Lanjut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Filter className="w-5 h-5 text-slate-400" />
                      <span>Tidak ada siswa yang sesuai dengan filter saat ini.</span>
                      {(activeBucket || progressFilter !== 'all' || searchQuery) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBucketId(null);
                            setProgressFilter('all');
                            setSearchQuery('');
                          }}
                          className="text-emerald-700 font-semibold hover:underline"
                        >
                          Reset Semua Filter
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((row) => (
                  <tr key={row.student.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-center font-mono tabular-nums font-semibold text-slate-700">
                      {row.rank > 0 ? `#${row.rank}` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{row.student.fullName}</div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        NIS {row.student.nis} · {row.student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {row.filledCount > 0 ? row.avg.toFixed(2) : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          row.belowKktpSubjects.length > 0
                            ? 'text-amber-700 font-semibold'
                            : 'text-emerald-700 font-semibold'
                        }
                      >
                        {row.filledCount - row.belowKktpSubjects.length}/{row.filledCount}
                      </span>
                      <span className="text-slate-400"> ({row.totalSubjects})</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-700">
                      {row.sakit} / {row.izin} /{' '}
                      <span className={row.alpha > 0 ? 'text-red-700 font-semibold' : ''}>
                        {row.alpha}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {row.statusCategory === 'pendampingan' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Perlu Pendampingan</span>
                          </span>
                          <div className="text-[11px] text-slate-500 truncate max-w-[230px]">
                            {row.belowKktpSubjects.length > 0
                              ? `Di bawah KKTP: ${row.belowKktpSubjects.join(', ')}`
                              : `Ketidakhadiran Alpha: ${row.alpha} hari`}
                          </div>
                        </div>
                      ) : row.statusCategory === 'unggul' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                          <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Capaian Sangat Baik</span>
                        </span>
                      ) : row.statusCategory === 'belum_lengkap' ? (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Menunggu Nilai Mapel</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Tuntas Stabil</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openWaliSection('absensi', selectedClass.id)}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                        >
                          Catatan Wali
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('raport')}
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md whitespace-nowrap"
                        >
                          Raport
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
