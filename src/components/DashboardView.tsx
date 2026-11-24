import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Printer,
  Send,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getRaportSubjectGroup, isSubjectForClass } from '../types/raport';
import { recalculateSubjectGrade } from '../utils/gradeCalculator';
import { WaliKelasDashboard } from './WaliKelasDashboard';

export function DashboardView() {
  const [adminViewMode, setAdminViewMode] = useState<'school' | 'wali'>('school');
  const {
    currentUser,
    students,
    classes,
    subjects,
    grades,
    settings,
    setActiveTab,
    focusedClassId,
    setFocusedClassId,
    openGradeInput,
    openGuruSection,
    getGradeSubmission,
  } = useApp();

  const selectedClass = classes.find((c) => c.id === focusedClassId) || classes[0];

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

  const subjectAnalytics = useMemo(() => {
    return classSubjects.map((sub) => {
      const subGrades = classStudents
        .map((stu) => {
          const found = grades.find(
            (g) => g.studentId === stu.id && g.subjectId === sub.id
          );
          return found ? recalculateSubjectGrade(found, sub, settings) : null;
        })
        .filter((g): g is NonNullable<typeof g> => g !== null && g.nilaiAkhir > 0);

      const filledCount = subGrades.length;
      const totalCount = classStudents.length;
      const completionPct =
        totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
      const avg =
        filledCount > 0
          ? subGrades.reduce((a, b) => a + b.nilaiAkhir, 0) / filledCount
          : 0;
      const passedCount = subGrades.filter(
        (g) => g.nilaiAkhir >= sub.kktp
      ).length;

      return {
        subject: sub,
        subGrades,
        filledCount,
        totalCount,
        completionPct,
        avg: Number(avg.toFixed(2)),
        passedCount,
      };
    });
  }, [classSubjects, classStudents, grades, settings]);

  const summary = useMemo(() => {
    const totalExpected = classStudents.length * classSubjects.length;
    const totalFilled = subjectAnalytics.reduce((a, b) => a + b.filledCount, 0);
    const completionPct =
      totalExpected > 0 ? Math.round((totalFilled / totalExpected) * 100) : 0;

    const validAvgs = subjectAnalytics.filter((a) => a.filledCount > 0);
    const overallAvg =
      validAvgs.length > 0
        ? validAvgs.reduce((a, b) => a + b.avg, 0) / validAvgs.length
        : 0;

    const totalPassed = subjectAnalytics.reduce((a, b) => a + b.passedCount, 0);
    const kktpRate =
      totalFilled > 0 ? Math.round((totalPassed / totalFilled) * 100) : 0;

    const predikatCounts = { A: 0, B: 0, C: 0, D: 0 };
    subjectAnalytics.forEach((item) => {
      item.subGrades.forEach((g) => {
        predikatCounts[g.predikat] += 1;
      });
    });

    return {
      totalStudentsAll: students.filter((s) => s.isActive).length,
      classStudentsCount: classStudents.length,
      completionPct,
      totalFilled,
      totalExpected,
      overallAvg: Number(overallAvg.toFixed(2)),
      kktpRate,
      predikatCounts,
    };
  }, [students, classStudents, classSubjects, subjectAnalytics]);

  const totalPredikat =
    summary.predikatCounts.A +
    summary.predikatCounts.B +
    summary.predikatCounts.C +
    summary.predikatCounts.D;

  if (currentUser?.role === 'wali_kelas') {
    return <WaliKelasDashboard />;
  }

  if (currentUser?.role === 'admin' && adminViewMode === 'wali') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
            <button
              type="button"
              onClick={() => setAdminViewMode('school')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              Pusat Kendali Sekolah
            </button>
            <button
              type="button"
              onClick={() => setAdminViewMode('wali')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white text-emerald-800 shadow-xs whitespace-nowrap"
            >
              Dashboard Performa Wali Kelas
            </button>
          </div>
        </div>
        <WaliKelasDashboard />
      </div>
    );
  }

  if (!selectedClass) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-3">
        <Users className="w-9 h-9 text-slate-400 mx-auto" />
        <h3 className="text-base font-semibold text-slate-900">
          Belum Ada Data Kelas di Supabase
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Data contoh bawaan telah dinonaktifkan. Tambahkan kelas, mata pelajaran, dan peserta didik pada menu Master Data agar analitik akademik aktif.
        </p>
        {currentUser?.role === 'admin' && (
          <button
            type="button"
            onClick={() => setActiveTab('master_data')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
          >
            <span>Buka Master Data &amp; Akun</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {currentUser?.role === 'admin' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
            <button
              type="button"
              onClick={() => setAdminViewMode('school')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-900 shadow-xs whitespace-nowrap"
            >
              Pusat Kendali Sekolah
            </button>
            <button
              type="button"
              onClick={() => setAdminViewMode('wali')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              Dashboard Performa Wali Kelas
            </button>
          </div>
        </div>
      )}

      {/* Smart-School Command Banner + Class Segmented Filter */}
      <div className="bg-obsidian-grid text-white rounded-2xl p-6 sm:p-7 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-medium text-emerald-300">
            {settings.schoolName} · Tahun Ajaran {settings.academicYear} · Semester {settings.semester}
          </div>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white text-balance">
            Pusat Kendali Akademik Kelas {selectedClass?.name}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Pantau ketercapaian KKTP seluruh mata pelajaran, kelengkapan input nilai guru, serta akses cepat olah nilai dan cetak raport Kurikulum Merdeka Fase {selectedClass?.fase}.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-white/10 border border-white/15 rounded-xl">
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => setFocusedClassId(cls.id)}
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => openGradeInput(selectedClass.id, classSubjects[0]?.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-white hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Input / Upload Nilai</span>
            </button>
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('raport')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-300" />
                <span>Cetak Raport</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3-Step Guided Workflow Strip for Easy Onboarding */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => openGuruSection('atur_tp', selectedClass.id, classSubjects[0]?.id)}
          className="text-left bg-white border border-slate-200/90 hover:border-emerald-600 rounded-xl p-4 transition-all duration-150 group flex items-start justify-between gap-3"
        >
          <div className="space-y-1">
            <div className="text-xs font-semibold text-emerald-700">
              01. Siapkan TP & Template Nilai
            </div>
            <div className="text-sm font-semibold text-slate-900 group-hover:text-emerald-800">
              Unduh Template Excel per Mapel
            </div>
            <p className="text-xs text-slate-500">
              Daftar siswa {selectedClass?.name} terisi otomatis di file Excel resmi.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </button>

        <button
          type="button"
          onClick={() => openGradeInput(selectedClass.id, classSubjects[0]?.id)}
          className="text-left bg-white border border-slate-200/90 hover:border-emerald-600 rounded-xl p-4 transition-all duration-150 group flex items-start justify-between gap-3"
        >
          <div className="space-y-1">
            <div className="text-xs font-semibold text-sky-700">
              02. Input atau Upload Nilai
            </div>
            <div className="text-sm font-semibold text-slate-900 group-hover:text-emerald-800">
              Hitung Bobot & Deskripsi Otomatis
            </div>
            <p className="text-xs text-slate-500">
              Auto-PRK dan narasi capaian kompetensi langsung tersusun instan.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </button>

        <button
          type="button"
          onClick={() =>
            currentUser?.role === 'guru'
              ? openGradeInput(selectedClass.id, classSubjects[0]?.id)
              : setActiveTab('raport')
          }
          className="text-left bg-white border border-slate-200/90 hover:border-emerald-600 rounded-xl p-4 transition-all duration-150 group flex items-start justify-between gap-3"
        >
          <div className="space-y-1">
            <div className="text-xs font-semibold text-emerald-700">
              {currentUser?.role === 'guru'
                ? '03. Kunci & Kirim Nilai'
                : '03. Lengkapi Wali Kelas & Cetak'}
            </div>
            <div className="text-sm font-semibold text-slate-900 group-hover:text-emerald-800">
              {currentUser?.role === 'guru'
                ? 'Kunci & Kirim ke Wali Kelas'
                : 'Leger Kelas & Raport A4 / F4'}
            </div>
            <p className="text-xs text-slate-500">
              {currentUser?.role === 'guru'
                ? 'Kunci nilai final agar aman lalu kirim ke Wali Kelas untuk pencetakan raport.'
                : 'Pastikan nilai guru terkirim, lalu cetak raport satu siswa atau sekelas.'}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </button>
      </div>

      {/* KPI Strip (Single-Elevation Flat Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Peserta Didik Aktif</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {summary.classStudentsCount}
            </span>
            <span className="text-xs text-slate-500">
              siswa di {selectedClass?.name} ({summary.totalStudentsAll} total)
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Kelengkapan Input Nilai</span>
            <BookOpen className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {summary.completionPct}%
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {summary.totalFilled}/{summary.totalExpected} entri nilai
            </span>
          </div>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-600 rounded-full transition-all duration-300"
              style={{ width: `${summary.completionPct}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Rata-Rata Nilai Raport</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {summary.overallAvg || '—'}
            </span>
            <span className="text-xs text-slate-500">
              KKTP standar {settings.defaultKktp}
            </span>
          </div>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, summary.overallAvg)}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Ketuntasan KKTP</span>
            {summary.kktpRate >= 85 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {summary.kktpRate}%
            </span>
            <span className="text-xs text-slate-500">
              mencapai batas minimal
            </span>
          </div>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                summary.kktpRate >= 85 ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
              style={{ width: `${summary.kktpRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Split: Chart + Subject Progress Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Grafik Rata-Rata per Mapel + Distribusi Predikat */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Distribusi Predikat Capaian ({selectedClass?.name})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              Total {totalPredikat} nilai terekam lintas {classSubjects.length} mata pelajaran
            </p>
            <div className="mt-3 h-3 rounded-full bg-slate-100 overflow-hidden flex">
              {(['A', 'B', 'C', 'D'] as const).map((p) => {
                const count = summary.predikatCounts[p];
                const pct = totalPredikat > 0 ? (count / totalPredikat) * 100 : 0;
                if (pct <= 0) return null;
                const color =
                  p === 'A'
                    ? 'bg-emerald-600'
                    : p === 'B'
                      ? 'bg-sky-600'
                      : p === 'C'
                        ? 'bg-amber-500'
                        : 'bg-red-500';
                return (
                  <div
                    key={p}
                    className={`${color} h-full transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                    title={`Predikat ${p}: ${count} nilai (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2 text-[11px] font-mono tabular-nums text-slate-600">
              <div>
                <span className="font-semibold text-emerald-700">A (≥90):</span>{' '}
                {summary.predikatCounts.A}
              </div>
              <div>
                <span className="font-semibold text-sky-700">B (80-89):</span>{' '}
                {summary.predikatCounts.B}
              </div>
              <div>
                <span className="font-semibold text-amber-700">C (KKTP):</span>{' '}
                {summary.predikatCounts.C}
              </div>
              <div>
                <span className="font-semibold text-red-700">D (&lt;KKTP):</span>{' '}
                {summary.predikatCounts.D}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Grafik Rata-Rata per Mata Pelajaran
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Garis vertikal menandai batas KKTP masing-masing mapel
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              {subjectAnalytics.map(({ subject, avg, filledCount }) => {
                const barPct = Math.min(100, Math.max(0, avg));
                const belowKktp = filledCount > 0 && avg < subject.kktp;
                return (
                  <div key={subject.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 truncate pr-3">
                        {subject.name}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                        {filledCount > 0 ? avg.toFixed(1) : '0.0'}
                      </span>
                    </div>
                    <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          belowKktp ? 'bg-amber-500' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${barPct}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-900/50"
                        style={{ left: `${Math.min(100, subject.kktp)}%` }}
                        title={`Batas KKTP: ${subject.kktp}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Clickable Status Kelengkapan Input Guru */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Status Kelengkapan Nilai Guru Mapel
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik salah satu mata pelajaran untuk langsung mengisi atau mengimpor nilai.
              </p>
            </div>
            <button
              onClick={() => openGradeInput(selectedClass.id, classSubjects[0]?.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>Buka Olah Nilai</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 tracking-wide">
                  <th className="py-2.5 px-4">Mata Pelajaran</th>
                  <th className="py-2.5 px-4">Guru Pengampu</th>
                  <th className="py-2.5 px-3 text-right">KKTP</th>
                  <th className="py-2.5 px-3 text-right">Progres</th>
                  <th className="py-2.5 px-3 text-right">Rata-rata</th>
                  <th className="py-2.5 px-3 text-center">Status Kirim</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {subjectAnalytics.map(({ subject, filledCount, totalCount, completionPct, avg }) => {
                  const subStatus = getGradeSubmission(selectedClass.id, subject.id)?.status || 'draft';
                  return (
                    <tr
                      key={subject.id}
                      onClick={() => openGradeInput(selectedClass.id, subject.id)}
                      className="transition-colors hover:bg-emerald-50/50 cursor-pointer"
                    >
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div>{subject.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {subject.code} · Kelompok {getRaportSubjectGroup(subject, selectedClass)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {subject.teacherName || 'Belum ditentukan'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                        {subject.kktp}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        <span
                          className={
                            completionPct === 100
                              ? 'text-emerald-700 font-semibold'
                              : 'text-amber-700 font-medium'
                          }
                        >
                          {filledCount}/{totalCount} ({completionPct}%)
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {filledCount > 0 ? avg.toFixed(2) : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {subStatus === 'sent' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold whitespace-nowrap">
                            <Send className="w-3 h-3" />
                            Terkirim
                          </span>
                        ) : subStatus === 'locked' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-semibold whitespace-nowrap">
                            <Lock className="w-3 h-3" />
                            Terkunci
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-medium">Draft</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          {subStatus === 'draft' ? 'Input' : 'Lihat'}{' '}
                          <ArrowUpRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
