import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HeartHandshake,
  Layers,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { GuruSubTab, useApp } from '../context/AppContext';
import { generateUuid } from '../lib/supabaseSync';
import {
  getRaportSubjectGroup,
  isSubjectForClass,
  P3_DIMENSIONS,
  SubjectGrade,
} from '../types/raport';
import {
  computeAutoPrk,
  computeColumnStats,
  recalculateSubjectGrade,
} from '../utils/gradeCalculator';
import {
  buildEmptyTpScores,
  downloadGradeTemplateExcel,
  downloadSimpleGradeTemplateExcel,
  exportSubjectGradeExcel,
  parseGradeExcelFile,
} from '../utils/excelProcessor';

export function GradeInputView() {
  const {
    users,
    classes,
    subjects,
    setSubjects,
    students,
    setStudents,
    grades,
    upsertGrade,
    bulkUpsertGrades,
    settings,
    guruSubTab,
    setGuruSubTab,
    focusedClassId,
    setFocusedClassId,
    focusedSubjectId,
    setFocusedSubjectId,
    getGradeSubmission,
    lockGrades,
    unlockGrades,
    sendGradesToHomeroom,
  } = useApp();

  const [compactMode, setCompactMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [editingDescStudentId, setEditingDescStudentId] = useState<string | null>(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showBatchMenu, setShowBatchMenu] = useState(false);
  const [showSendMenu, setShowSendMenu] = useState(false);
  const [confirmRetract, setConfirmRetract] = useState(false);
  const [sendNote, setSendNote] = useState('');
  const [batchField, setBatchField] = useState<'kehadiran' | 'proses' | 'tugas'>('kehadiran');
  const [batchValue, setBatchValue] = useState<number>(95);
  const [p3BatchValue, setP3BatchValue] = useState<number>(88);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedClass = classes.find((c) => c.id === focusedClassId) || classes[0];
  const classSubjects = useMemo(
    () =>
      selectedClass
        ? subjects
            .filter((sub) => isSubjectForClass(sub, selectedClass))
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [subjects, selectedClass]
  );
  const selectedSubject =
    classSubjects.find((s) => s.id === focusedSubjectId) || classSubjects[0] || subjects[0];

  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    const q = searchQuery.trim().toLowerCase();
    return students
      .filter((s) => s.classId === selectedClass.id && s.isActive)
      .filter(
        (s) =>
          !q ||
          s.fullName.toLowerCase().includes(q) ||
          s.nis.toLowerCase().includes(q)
      );
  }, [students, selectedClass, searchQuery]);

  const getOrInitGrade = (studentId: string): SubjectGrade => {
    const subjectId = selectedSubject?.id || '';
    const existing = grades.find(
      (g) => g.studentId === studentId && g.subjectId === subjectId
    );
    if (existing && selectedSubject) {
      return recalculateSubjectGrade(existing, selectedSubject, settings);
    }
    const fresh: SubjectGrade = {
      id: generateUuid(),
      studentId,
      subjectId,
      academicYear: settings.academicYear,
      semester: settings.semester,
      tpScores: selectedSubject ? buildEmptyTpScores(selectedSubject.tpList) : [],
      sasPpk: null,
      sasPrk: null,
      kehadiran: 90,
      proses: null,
      tugas: null,
      p3Scores: [85, 85, 85, 85, 85, 85],
      nilaiAkhir: 0,
      predikat: 'C',
      deskripsiAuto: '',
      updatedAt: new Date().toISOString(),
    };
    return fresh;
  };

  const submission =
    selectedClass && selectedSubject
      ? getGradeSubmission(selectedClass.id, selectedSubject.id)
      : undefined;
  const submissionStatus = submission?.status || 'draft';
  const isLocked = submissionStatus === 'locked' || submissionStatus === 'sent';
  const homeroomTeacher = selectedClass
    ? users.find((u) => u.id === selectedClass.homeroomTeacherId) ||
      users.find((u) => u.role === 'wali_kelas')
    : undefined;

  const formatTimestamp = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const handleScoreChange = (
    studentId: string,
    field:
      | { type: 'tp'; tpId: string; subField: 'ppk' | 'prk' }
      | { type: 'sas'; subField: 'sasPpk' | 'sasPrk' }
      | { type: 'aspect'; subField: 'kehadiran' | 'proses' | 'tugas' }
      | { type: 'p3'; index: number },
    rawValue: string
  ) => {
    if (isLocked) return;
    const parsed =
      rawValue.trim() === ''
        ? null
        : Math.max(0, Math.min(100, Number(rawValue)));
    if (parsed !== null && Number.isNaN(parsed)) return;

    const current = getOrInitGrade(studentId);
    const next: SubjectGrade = { ...current, updatedAt: new Date().toISOString() };

    if (field.type === 'tp') {
      const updatedTp = selectedSubject.tpList.map((tp) => {
        const prev = current.tpScores.find((t) => t.tpId === tp.id) || {
          tpId: tp.id,
          ppk: null,
          prk: null,
        };
        if (tp.id !== field.tpId) return prev;
        if (field.subField === 'ppk') {
          const autoPrk = settings.autoPrkFormula
            ? computeAutoPrk(parsed)
            : prev.prk ?? parsed;
          return { ...prev, ppk: parsed, prk: autoPrk };
        }
        return { ...prev, prk: parsed };
      });
      next.tpScores = updatedTp;
    } else if (field.type === 'sas') {
      if (field.subField === 'sasPpk') {
        next.sasPpk = parsed;
        if (settings.autoPrkFormula) {
          next.sasPrk = computeAutoPrk(parsed);
        }
      } else {
        next.sasPrk = parsed;
      }
    } else if (field.type === 'aspect') {
      next[field.subField] = parsed;
    } else if (field.type === 'p3') {
      const copy = [...current.p3Scores];
      copy[field.index] = parsed ?? 85;
      next.p3Scores = copy;
    }

    upsertGrade(recalculateSubjectGrade(next, selectedSubject, settings));
  };

  const handleApplyBatchField = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    const clamped = Math.max(0, Math.min(100, Number(batchValue) || 0));
    const updated = classStudents.map((stu) => {
      const current = getOrInitGrade(stu.id);
      const next: SubjectGrade = {
        ...current,
        [batchField]: clamped,
        updatedAt: new Date().toISOString(),
      };
      return recalculateSubjectGrade(next, selectedSubject, settings);
    });
    bulkUpsertGrades(updated);
    setShowBatchMenu(false);
    setImportFeedback({
      type: 'success',
      text: `Nilai ${batchField.toUpperCase()} (${clamped}) berhasil diterapkan ke ${updated.length} siswa kelas ${selectedClass.name}.`,
    });
  };

  const handleApplyBatchP3 = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    const clamped = Math.max(0, Math.min(100, Number(p3BatchValue) || 85));
    const updated = classStudents.map((stu) => {
      const current = getOrInitGrade(stu.id);
      const next: SubjectGrade = {
        ...current,
        p3Scores: [clamped, clamped, clamped, clamped, clamped, clamped],
        updatedAt: new Date().toISOString(),
      };
      return recalculateSubjectGrade(next, selectedSubject, settings);
    });
    bulkUpsertGrades(updated);
    setImportFeedback({
      type: 'success',
      text: `Nilai Sikap P3 (D.1–D.6 = ${clamped}) berhasil diterapkan ke ${updated.length} siswa kelas ${selectedClass.name}.`,
    });
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colKey: string
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const target = document.querySelector<HTMLInputElement>(
        `input[data-nav-row="${rowIdx + 1}"][data-nav-col="${colKey}"]`
      );
      target?.focus();
      target?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const target = document.querySelector<HTMLInputElement>(
        `input[data-nav-row="${rowIdx - 1}"][data-nav-col="${colKey}"]`
      );
      target?.focus();
      target?.select();
    }
  };

  const handleManualDescChange = (studentId: string, text: string) => {
    if (isLocked) return;
    const current = getOrInitGrade(studentId);
    upsertGrade({
      ...current,
      deskripsiManual: text,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleResetDescToAuto = (studentId: string) => {
    if (isLocked) return;
    const current = getOrInitGrade(studentId);
    const recalculated = recalculateSubjectGrade(
      { ...current, deskripsiManual: undefined },
      selectedSubject,
      settings
    );
    upsertGrade(recalculated);
  };

  const handleRegenerateAllDescriptions = () => {
    if (isLocked) return;
    const updated = classStudents.map((stu) => {
      const current = getOrInitGrade(stu.id);
      return recalculateSubjectGrade(
        { ...current, deskripsiManual: undefined },
        selectedSubject,
        settings
      );
    });
    bulkUpsertGrades(updated);
  };

  const handleTpTitleChange = (tpId: string, title: string) => {
    if (isLocked) return;
    setSubjects((prev) =>
      prev.map((s) =>
        s.id !== selectedSubject.id
          ? s
          : {
              ...s,
              tpList: s.tpList.map((tp) =>
                tp.id === tpId ? { ...tp, title } : tp
              ),
            }
      )
    );
  };

  const handleAddTp = () => {
    if (isLocked || !selectedSubject) return;
    const nextIdx = selectedSubject.tpList.length + 1;
    const newTp = {
      id: generateUuid(),
      code: `Sumatif ${nextIdx}`,
      title: `Tujuan Pembelajaran ${nextIdx}`,
    };
    setSubjects((prev) =>
      prev.map((s) =>
        s.id !== selectedSubject.id
          ? s
          : { ...s, tpList: [...s.tpList, newTp] }
      )
    );
  };

  const handleRemoveTp = (tpId: string) => {
    if (isLocked || selectedSubject.tpList.length <= 1) return;
    setSubjects((prev) =>
      prev.map((s) =>
        s.id !== selectedSubject.id
          ? s
          : { ...s, tpList: s.tpList.filter((tp) => tp.id !== tpId) }
      )
    );
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseGradeExcelFile(file);
      if (parsed.students.length === 0) {
        setImportFeedback({
          type: 'error',
          text: 'Tidak ada baris nilai siswa yang terbaca dari berkas Excel/CSV tersebut.',
        });
        return;
      }

      let updatedSubject = selectedSubject;
      const hasCustomTpTitles = parsed.detectedTpTitles.some(
        (t) =>
          t.trim() !== '' &&
          !/^(Tujuan Pembelajaran|TP)\s*\d+$/i.test(t.trim())
      );
      if (parsed.detectedTpTitles.length > 0 && hasCustomTpTitles) {
        const nextTpList = parsed.detectedTpTitles.map((title, idx) => ({
          id: selectedSubject.tpList[idx]?.id || generateUuid(),
          code: `Sumatif ${idx + 1}`,
          title,
        }));
        updatedSubject = {
          ...selectedSubject,
          tpList: nextTpList,
          sasTitle: parsed.detectedSasTitle || selectedSubject.sasTitle,
          kktp: parsed.detectedKktp ?? selectedSubject.kktp,
        };
        setSubjects((prev) =>
          prev.map((s) => (s.id === updatedSubject.id ? updatedSubject : s))
        );
      }

      const nextStudents = [...students];
      const incomingGrades: SubjectGrade[] = [];

      parsed.students.forEach((row) => {
        let stu = nextStudents.find(
          (s) =>
            s.nis === row.nis ||
            s.fullName.toLowerCase() === row.fullName.toLowerCase()
        );
        if (!stu) {
          stu = {
            id: generateUuid(),
            nis: row.nis,
            nisn: '',
            fullName: row.fullName,
            gender: row.gender,
            classId: selectedClass.id,
            birthPlace: 'Bandung',
            birthDate: '2007-01-01',
            religion: 'Islam',
            address: '',
            parentName: '-',
            isActive: true,
          };
          nextStudents.push(stu);
        }

        const tpScores = updatedSubject.tpList.map((tp, idx) => {
          const ppk = row.tpScores[idx]?.ppk ?? null;
          const rawPrk = row.tpScores[idx]?.prk ?? null;
          const prk =
            rawPrk !== null
              ? rawPrk
              : ppk !== null && settings.autoPrkFormula
                ? computeAutoPrk(ppk)
                : null;
          return { tpId: tp.id, ppk, prk };
        });

        const sasPpk = row.sasPpk;
        const sasPrk =
          row.sasPrk !== null
            ? row.sasPrk
            : sasPpk !== null && settings.autoPrkFormula
              ? computeAutoPrk(sasPpk)
              : null;

        const gradeObj: SubjectGrade = {
          id: generateUuid(),
          studentId: stu.id,
          subjectId: updatedSubject.id,
          academicYear: settings.academicYear,
          semester: settings.semester,
          tpScores,
          sasPpk,
          sasPrk,
          kehadiran: row.kehadiran,
          proses: row.proses,
          tugas: row.tugas,
          p3Scores: row.p3Scores,
          nilaiAkhir: 0,
          predikat: 'C',
          deskripsiAuto: '',
          updatedAt: new Date().toISOString(),
        };

        incomingGrades.push(
          recalculateSubjectGrade(gradeObj, updatedSubject, settings)
        );
      });

      setStudents(nextStudents);
      bulkUpsertGrades(incomingGrades);
      setImportFeedback({
        type: 'success',
        text: `Berhasil mengimpor ${incomingGrades.length} nilai siswa (${parsed.detectedSubjectName || updatedSubject.name}) dan menghitung ulang Nilai Rapor & Deskripsi.`,
      });
    } catch (err) {
      setImportFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membaca file Excel/CSV.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const classRaporScores = classStudents.map(
    (s) => getOrInitGrade(s.id).nilaiAkhir
  );
  const raporStats = computeColumnStats(classRaporScores, selectedSubject?.kktp ?? 70);

  const tpColSpan = compactMode ? 1 : 2;
  const totalSummaryCols =
    (selectedSubject?.tpList.length ?? 0) * tpColSpan +
    (compactMode ? 1 : 2) +
    3;

  const firstStudent = classStudents[0];
  const sampleGrade = firstStudent ? getOrInitGrade(firstStudent.id) : null;

  const getP3Category = (avg: number) => {
    if (avg >= 90) return 'Sangat Berkembang';
    if (avg >= 80) return 'Berkembang Sesuai Harapan';
    if (avg >= 70) return 'Sedang Berkembang';
    return 'Mulai Berkembang';
  };

  if (!selectedClass || !selectedSubject) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2.5">
        <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-900">
          {!selectedClass
            ? 'Belum Ada Data Kelas di Supabase'
            : 'Belum Ada Mata Pelajaran untuk Kelas Ini'}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Pastikan data kelas dan mata pelajaran sudah ditambahkan di Supabase melalui menu Master Data &amp; Akun sebelum melakukan olah nilai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Control Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Kelas & Fase
              </label>
              <select
                value={selectedClass.id}
                onChange={(e) => setFocusedClassId(e.target.value)}
                className="px-3 py-2 text-sm font-medium bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} (Fase {cls.fase})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Mata Pelajaran (Fase {selectedClass.fase})
              </label>
              <select
                value={selectedSubject.id}
                onChange={(e) => setFocusedSubjectId(e.target.value)}
                className="px-3 py-2 text-sm font-medium bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700 min-w-[260px]"
              >
                {classSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} · {getRaportSubjectGroup(sub, selectedClass)} (KKTP {sub.kktp})
                  </option>
                ))}
              </select>
            </div>

            {guruSubTab !== 'atur_tp' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Cari Peserta Didik
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ketik nama atau NIS..."
                  className="px-3 py-2 text-sm bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700 w-44"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Sub Menu Guru Mapel
              </label>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    {
                      id: 'atur_tp',
                      label: `Atur TP (${selectedSubject.tpList.length})`,
                      icon: <SlidersHorizontal className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'sikap',
                      label: 'Sikap (P3)',
                      icon: <HeartHandshake className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'olah_nilai',
                      label: 'Olah Nilai',
                      icon: <ListChecks className="w-3.5 h-3.5" />,
                    },
                  ] as { id: GuruSubTab; label: string; icon: React.ReactNode }[]
                ).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setGuruSubTab(sub.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      guruSubTab === sub.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sub.icon}
                    <span>{sub.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {guruSubTab === 'olah_nilai' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Tampilan Tabel
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCompactMode(false)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      !compactMode
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Lengkap
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompactMode(true)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      compactMode
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Input Cepat (PPK)
                  </button>
                </div>
              </div>
            )}
          </div>

          {guruSubTab === 'olah_nilai' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => setShowBatchMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Layers className="w-3.5 h-3.5 text-sky-600" />
                  <span>Isi Massal</span>
                </button>

                {showBatchMenu && !isLocked && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowBatchMenu(false)}
                    />
                    <form
                      onSubmit={handleApplyBatchField}
                      className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3.5 space-y-3"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Terapkan ke {classStudents.length} Siswa
                      </div>
                      <div className="space-y-2 text-xs">
                        <select
                          value={batchField}
                          onChange={(e) =>
                            setBatchField(
                              e.target.value as 'kehadiran' | 'proses' | 'tugas'
                            )
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white"
                        >
                          <option value="kehadiran">Kehadiran</option>
                          <option value="proses">Proses Pembelajaran</option>
                          <option value="tugas">Tugas Terstruktur</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={batchValue}
                          onChange={(e) => setBatchValue(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono tabular-nums"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                      >
                        Terapkan Nilai
                      </button>
                    </form>
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={isLocked}
                onClick={handleRegenerateAllDescriptions}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>Generate Deskripsi</span>
              </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTemplateMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Template Upload</span>
              </button>

              {showTemplateMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowTemplateMenu(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-1.5 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        downloadGradeTemplateExcel(
                          selectedSubject,
                          selectedClass,
                          classStudents,
                          settings
                        );
                        setShowTemplateMenu(false);
                        setImportFeedback({
                          type: 'success',
                          text: `Template Resmi (${selectedSubject.name} · ${selectedClass.name}) berhasil diunduh. Isi nilai pada file Excel lalu unggah melalui tombol Import Excel/CSV.`,
                        });
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 transition-colors"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Template Resmi Sekolah (.xlsx)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Format lengkap Olah Nilai Kurmer + daftar siswa {selectedClass.name} & panduan.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        downloadSimpleGradeTemplateExcel(
                          selectedSubject,
                          selectedClass,
                          classStudents,
                          settings
                        );
                        setShowTemplateMenu(false);
                        setImportFeedback({
                          type: 'success',
                          text: `Template Tabel Ringkas (${selectedSubject.name} · ${selectedClass.name}) berhasil diunduh. Isi nilai per kolom lalu unggah melalui tombol Import Excel/CSV.`,
                        });
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 transition-colors"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Template Tabel Ringkas (.xlsx)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Header 1 baris sederhana (cocok untuk input cepat di Excel/Sheets).
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelImport}
              className="hidden"
            />
            <button
              type="button"
              disabled={isLocked}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Excel/CSV</span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportSubjectGradeExcel(
                  selectedSubject,
                  selectedClass,
                  classStudents,
                  grades,
                  settings
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
            </div>
          )}
        </div>

        {/* Clean Unboxed Metadata Line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 pt-2.5 border-t border-slate-100">
          <span>
            Pengampu: <strong className="text-slate-700">{selectedSubject.teacherName || '-'}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            KKTP: <strong className="font-mono tabular-nums text-slate-700">{selectedSubject.kktp}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Bobot: PPK {settings.weights.sumatifPpk}% + PRK {settings.weights.sumatifPrk}% + SAS {settings.weights.sas}% + Hadir {settings.weights.kehadiran}% + Proses {settings.weights.proses}% + Tugas {settings.weights.tugas}%
          </span>
          <span aria-hidden="true">·</span>
          <span>Navigasi cepat: tekan Enter atau Panah Atas/Bawah untuk berpindah baris</span>
        </div>

        {/* Kunci Nilai & Kirim ke Wali Kelas Bar */}
        <div
          className={`rounded-xl border p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            submissionStatus === 'sent'
              ? 'bg-emerald-50/90 border-emerald-200'
              : submissionStatus === 'locked'
                ? 'bg-sky-50/90 border-sky-200'
                : 'bg-slate-50/80 border-slate-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                submissionStatus === 'sent'
                  ? 'bg-emerald-700 text-white'
                  : submissionStatus === 'locked'
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-200 text-slate-700'
              }`}
            >
              {submissionStatus === 'sent' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : submissionStatus === 'locked' ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
            </div>
            <div className="text-xs space-y-0.5">
              <div className="font-semibold text-slate-900">
                {submissionStatus === 'sent'
                  ? `Nilai Terkirim ke Wali Kelas (${homeroomTeacher?.fullName || 'Wali Kelas'})`
                  : submissionStatus === 'locked'
                    ? 'Nilai Sudah Dikunci — Siap Dikirim ke Wali Kelas'
                    : 'Status Nilai: Draft (Dapat Diedit)'}
              </div>
              <p className="text-slate-600">
                {submissionStatus === 'sent'
                  ? `Dikirim oleh ${submission?.sentBy || 'Guru Mapel'} pada ${formatTimestamp(submission?.sentAt)}. Nilai bersifat baca-saja agar selaras dengan leger dan raport Wali Kelas.${submission?.note ? ` Catatan: "${submission.note}"` : ''}`
                  : submissionStatus === 'locked'
                    ? `Dikunci pada ${formatTimestamp(submission?.lockedAt)}. Seluruh kolom nilai dikunci; klik Kirim ke Wali Kelas untuk menyerahkan nilai final.`
                    : `Setelah pengisian nilai selesai, klik Kunci Nilai lalu Kirim ke Wali Kelas (${homeroomTeacher?.fullName || 'Wali Kelas'}).`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {submissionStatus === 'draft' && (
              <button
                type="button"
                onClick={() => {
                  setEditingDescStudentId(null);
                  lockGrades(selectedClass.id, selectedSubject.id);
                  setImportFeedback({
                    type: 'success',
                    text: `Nilai ${selectedSubject.name} kelas ${selectedClass.name} berhasil dikunci. Klik "Kirim ke Wali Kelas" untuk menyerahkan nilai final.`,
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Kunci Nilai</span>
              </button>
            )}

            {submissionStatus === 'locked' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    unlockGrades(selectedClass.id, selectedSubject.id);
                    setShowSendMenu(false);
                    setImportFeedback({
                      type: 'success',
                      text: `Kunci nilai ${selectedSubject.name} dibuka. Anda dapat menyunting nilai kembali.`,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Buka Kunci</span>
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSendMenu((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim ke Wali Kelas</span>
                  </button>

                  {showSendMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setShowSendMenu(false)}
                      />
                      <div className="absolute right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-4 space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            Kirim Nilai Final ke Wali Kelas
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Tujuan: <strong>{homeroomTeacher?.fullName || 'Wali Kelas'}</strong> ({selectedClass.name})
                          </p>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono tabular-nums text-slate-700 space-y-1">
                          <div>Mapel: {selectedSubject.name}</div>
                          <div>
                            Tuntas KKTP: {raporStats.tercapai}/{classStudents.length} siswa · Rata-rata: {raporStats.avg.toFixed(2)}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Catatan untuk Wali Kelas (opsional)
                          </label>
                          <textarea
                            rows={2}
                            value={sendNote}
                            onChange={(e) => setSendNote(e.target.value)}
                            placeholder="Contoh: Seluruh nilai sumatif dan SAS sudah lengkap."
                            className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowSendMenu(false)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              sendGradesToHomeroom(selectedClass.id, selectedSubject.id, sendNote);
                              setShowSendMenu(false);
                              setSendNote('');
                              setImportFeedback({
                                type: 'success',
                                text: `Nilai ${selectedSubject.name} kelas ${selectedClass.name} telah resmi dikirim ke Wali Kelas (${homeroomTeacher?.fullName || 'Wali Kelas'}).`,
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Konfirmasi Kirim</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {submissionStatus === 'sent' && (
              <div className="flex items-center gap-2">
                {!confirmRetract ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRetract(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Tarik Revisi</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs">
                    <span className="text-amber-900 font-medium">Buka untuk revisi?</span>
                    <button
                      type="button"
                      onClick={() => {
                        unlockGrades(selectedClass.id, selectedSubject.id);
                        setConfirmRetract(false);
                        setImportFeedback({
                          type: 'success',
                          text: `Pengiriman nilai ${selectedSubject.name} ditarik kembali ke Draft untuk revisi.`,
                        });
                      }}
                      className="px-2 py-0.5 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
                    >
                      Ya
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRetract(false)}
                      className="px-2 py-0.5 rounded text-slate-600 hover:bg-slate-100"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {importFeedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between gap-3 border ${
              importFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>{importFeedback.text}</span>
            </div>
            <button
              onClick={() => setImportFeedback(null)}
              className="text-xs underline shrink-0"
            >
              Tutup
            </button>
          </div>
        )}
      </div>

      {/* SUB-MENU 1: ATUR TUJUAN PEMBELAJARAN (TP) */}
      {guruSubTab === 'atur_tp' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Tujuan Pembelajaran (TP) & Lingkup Materi — {selectedSubject.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kalimat TP di bawah ini digunakan otomatis untuk merangkai deskripsi capaian kompetensi pada Raport {selectedClass.name}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleAddTp}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah TP</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuruSubTab('olah_nilai')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>Lanjut ke Olah Nilai</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedSubject.tpList.map((tp, idx) => (
                <div
                  key={tp.id}
                  className="flex items-center gap-2.5 p-3 border border-slate-200 rounded-xl bg-slate-50/50"
                >
                  <span className="text-xs font-mono font-semibold text-slate-500 w-20 shrink-0">
                    Sumatif {idx + 1}
                  </span>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={tp.title}
                    onChange={(e) => handleTpTitleChange(tp.id, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  {selectedSubject.tpList.length > 1 && !isLocked && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTp(tp.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                      title="Hapus TP"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2.5 p-3 border border-slate-200 rounded-xl bg-sky-50/40">
                <span className="text-xs font-mono font-semibold text-sky-800 w-20 shrink-0">
                  Materi SAS
                </span>
                <input
                  type="text"
                  disabled={isLocked}
                  value={selectedSubject.sasTitle}
                  onChange={(e) =>
                    setSubjects((prev) =>
                      prev.map((s) =>
                        s.id === selectedSubject.id
                          ? { ...s, sasTitle: e.target.value }
                          : s
                      )
                    )
                  }
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
            </div>

            {firstStudent && sampleGrade && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="text-xs font-semibold text-slate-800">
                  Pratinjau Narasi Deskripsi Raport ({firstStudent.fullName})
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {sampleGrade.deskripsiManual || sampleGrade.deskripsiAuto}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-MENU 2: PENILAIAN SIKAP PROFIL PELAJAR PANCASILA (P3) */}
      {guruSubTab === 'sikap' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Penilaian Sikap Profil Pelajar Pancasila (P3) — {selectedSubject.name} ({selectedClass.name})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Isi skor sikap dimensi D.1 hingga D.6 (skala 0–100) per peserta didik selama proses pembelajaran mapel ini.
                </p>
              </div>

              <form onSubmit={handleApplyBatchP3} className="flex items-center gap-2 shrink-0">
                <label className="text-xs text-slate-600 font-medium">
                  Isi Massal D.1–D.6:
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={isLocked}
                  value={p3BatchValue}
                  onChange={(e) => setP3BatchValue(Number(e.target.value))}
                  className="no-spinner w-16 px-2.5 py-1.5 text-xs text-center font-mono tabular-nums border border-slate-200 rounded-lg bg-white disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={isLocked}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Terapkan ke Kelas
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-[11px] text-slate-600">
              {P3_DIMENSIONS.map((dim) => (
                <div key={dim} className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  {dim}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-slate-100 font-semibold border-b border-slate-800">
                    <th className="py-3 px-3 text-center w-10">No</th>
                    <th className="py-3 px-3 w-24">NIS</th>
                    <th className="py-3 px-3 min-w-[200px] sticky left-0 bg-slate-900 z-10">
                      Nama Peserta Didik
                    </th>
                    <th className="py-3 px-2 text-center w-12">L/P</th>
                    {['D.1', 'D.2', 'D.3', 'D.4', 'D.5', 'D.6'].map((d) => (
                      <th key={d} className="py-3 px-2 text-center w-16 border-l border-slate-800">
                        {d}
                      </th>
                    ))}
                    <th className="py-3 px-3 text-center border-l border-slate-800 bg-emerald-950 text-emerald-200 w-24">
                      Rata-rata
                    </th>
                    <th className="py-3 px-4 border-l border-slate-800 bg-emerald-950 text-emerald-200 min-w-[190px]">
                      Capaian Sikap P3
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classStudents.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-500">
                        Belum ada siswa di kelas {selectedClass.name}.
                      </td>
                    </tr>
                  ) : (
                    classStudents.map((stu, idx) => {
                      const g = getOrInitGrade(stu.id);
                      const p3Avg =
                        g.p3Scores.reduce((acc, v) => acc + (v ?? 85), 0) /
                        (g.p3Scores.length || 6);
                      return (
                        <tr key={stu.id} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="py-2 px-3 text-center font-mono tabular-nums text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-600">
                            {stu.nis}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 sticky left-0 bg-white">
                            {stu.fullName}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-600">
                            {stu.gender}
                          </td>
                          {[0, 1, 2, 3, 4, 5].map((pIdx) => (
                            <td key={pIdx} className="p-1.5 border-l border-slate-100 text-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                disabled={isLocked}
                                data-nav-row={idx}
                                data-nav-col={`sikap-p3-${pIdx}`}
                                onKeyDown={(e) => handleCellKeyDown(e, idx, `sikap-p3-${pIdx}`)}
                                value={g.p3Scores[pIdx] ?? 85}
                                onChange={(e) =>
                                  handleScoreChange(
                                    stu.id,
                                    { type: 'p3', index: pIdx },
                                    e.target.value
                                  )
                                }
                                className="no-spinner w-14 text-center py-1 rounded border border-slate-200 bg-white font-mono tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              />
                            </td>
                          ))}
                          <td className="py-2 px-3 border-l border-slate-100 text-center font-mono tabular-nums font-bold text-emerald-800 bg-emerald-50/60">
                            {p3Avg.toFixed(1)}
                          </td>
                          <td className="py-2 px-4 border-l border-slate-100 font-medium text-slate-800 bg-emerald-50/30">
                            {getP3Category(p3Avg)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MENU 3: OLAH NILAI (SPREADSHEET) */}
      {guruSubTab === 'olah_nilai' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-100 font-semibold border-b border-slate-800">
                  <th rowSpan={2} className="py-2.5 px-2.5 border-r border-slate-800 text-center w-10">
                    No
                  </th>
                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 w-24">
                    NIS
                  </th>
                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 min-w-[190px] sticky left-0 bg-slate-900 z-10">
                    Nama Peserta Didik
                  </th>
                  <th rowSpan={2} className="py-2.5 px-2 border-r border-slate-800 text-center w-10">
                    L/P
                  </th>
                  {selectedSubject.tpList.map((tp, i) => (
                    <th
                      key={tp.id}
                      colSpan={tpColSpan}
                      className="py-2 px-2 border-r border-slate-800 text-center max-w-[140px]"
                      title={tp.title}
                    >
                      <div className="truncate text-emerald-300">Sumatif {i + 1}</div>
                      <div className="text-[10px] font-normal text-slate-300 truncate">
                        {tp.title}
                      </div>
                    </th>
                  ))}
                  <th colSpan={compactMode ? 1 : 2} className="py-2 px-2 border-r border-slate-800 text-center">
                    <div className="text-sky-300">SAS</div>
                    <div className="text-[10px] font-normal text-slate-300 truncate max-w-[110px]">
                      {selectedSubject.sasTitle}
                    </div>
                  </th>
                  <th rowSpan={2} className="py-2 px-2 border-r border-slate-800 text-center w-14">
                    Hadir
                  </th>
                  <th rowSpan={2} className="py-2 px-2 border-r border-slate-800 text-center w-14">
                    Proses
                  </th>
                  <th rowSpan={2} className="py-2 px-2 border-r border-slate-800 text-center w-14">
                    Tugas
                  </th>
                  <th rowSpan={2} className="py-2 px-2.5 border-r border-slate-800 text-center w-20 bg-emerald-950 text-emerald-200">
                    Rapor
                  </th>
                  <th rowSpan={2} className="py-2 px-2 border-r border-slate-800 text-center w-12 bg-emerald-950 text-emerald-200">
                    Pred
                  </th>
                  <th rowSpan={2} className="py-2 px-3 min-w-[300px]">
                    Deskripsi Capaian Kompetensi
                  </th>
                </tr>
              <tr className="bg-slate-800 border-b border-slate-700 text-[10px] text-slate-300 font-semibold">
                {selectedSubject.tpList.map((tp) => (
                  <React.Fragment key={`${tp.id}-sub`}>
                    <th className="py-1 px-1 border-r border-slate-700 text-center w-12">
                      PPK
                    </th>
                    {!compactMode && (
                      <th className="py-1 px-1 border-r border-slate-700 text-center w-12">
                        PRK
                      </th>
                    )}
                  </React.Fragment>
                ))}
                <th className="py-1 px-1 border-r border-slate-700 text-center w-12">
                  PPK
                </th>
                {!compactMode && (
                  <th className="py-1 px-1 border-r border-slate-700 text-center w-12">
                    PRK
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={10 + totalSummaryCols}
                    className="py-12 text-center text-slate-500"
                  >
                    Belum ada siswa di kelas {selectedClass.name}. Tambahkan siswa di menu Master Data atau impor file Excel.
                  </td>
                </tr>
              ) : (
                classStudents.map((stu, idx) => {
                  const g = getOrInitGrade(stu.id);
                  const belowKktp = g.nilaiAkhir > 0 && g.nilaiAkhir < selectedSubject.kktp;
                  const activeDesc = g.deskripsiManual ?? g.deskripsiAuto;
                  const isEditingDesc = editingDescStudentId === stu.id;

                  return (
                    <tr
                      key={stu.id}
                      className="hover:bg-emerald-50/30 transition-colors align-middle"
                    >
                      <td className="py-2 px-2 border-r border-slate-100 text-center font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-100 font-mono tabular-nums text-slate-600">
                        {stu.nis}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-100 font-semibold text-slate-900 sticky left-0 bg-white">
                        {stu.fullName}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-100 text-center text-slate-600">
                        {stu.gender}
                      </td>

                      {selectedSubject.tpList.map((tp, tIdx) => {
                        const sc = g.tpScores.find((t) => t.tpId === tp.id);
                        const ppkLow =
                          sc?.ppk !== null &&
                          sc?.ppk !== undefined &&
                          sc.ppk < selectedSubject.kktp;
                        return (
                          <React.Fragment key={`${stu.id}-${tp.id}`}>
                            <td className="p-1 border-r border-slate-100">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                disabled={isLocked}
                                data-nav-row={idx}
                                data-nav-col={`tp-${tIdx}-ppk`}
                                onKeyDown={(e) => handleCellKeyDown(e, idx, `tp-${tIdx}-ppk`)}
                                value={sc?.ppk ?? ''}
                                onChange={(e) =>
                                  handleScoreChange(
                                    stu.id,
                                    { type: 'tp', tpId: tp.id, subField: 'ppk' },
                                    e.target.value
                                  )
                                }
                                className={`no-spinner w-12 text-center py-1 rounded border font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed ${
                                  ppkLow
                                    ? 'border-red-300 bg-red-50 text-red-700 font-semibold'
                                    : 'border-slate-200 bg-white text-slate-900'
                                }`}
                              />
                            </td>
                            {!compactMode && (
                              <td className="p-1 border-r border-slate-100">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  disabled={isLocked}
                                  data-nav-row={idx}
                                  data-nav-col={`tp-${tIdx}-prk`}
                                  onKeyDown={(e) => handleCellKeyDown(e, idx, `tp-${tIdx}-prk`)}
                                  value={sc?.prk ?? ''}
                                  onChange={(e) =>
                                    handleScoreChange(
                                      stu.id,
                                      { type: 'tp', tpId: tp.id, subField: 'prk' },
                                      e.target.value
                                    )
                                  }
                                  className="no-spinner w-12 text-center py-1 rounded border border-slate-200 bg-slate-50/70 font-mono tabular-nums text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                />
                              </td>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* SAS PPK & PRK */}
                      <td className="p-1 border-r border-slate-100">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={isLocked}
                          data-nav-row={idx}
                          data-nav-col="sas-ppk"
                          onKeyDown={(e) => handleCellKeyDown(e, idx, 'sas-ppk')}
                          value={g.sasPpk ?? ''}
                          onChange={(e) =>
                            handleScoreChange(
                              stu.id,
                              { type: 'sas', subField: 'sasPpk' },
                              e.target.value
                            )
                          }
                          className="no-spinner w-12 text-center py-1 rounded border border-slate-200 bg-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                        />
                      </td>
                      {!compactMode && (
                        <td className="p-1 border-r border-slate-100">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={isLocked}
                            data-nav-row={idx}
                            data-nav-col="sas-prk"
                            onKeyDown={(e) => handleCellKeyDown(e, idx, 'sas-prk')}
                            value={g.sasPrk ?? ''}
                            onChange={(e) =>
                              handleScoreChange(
                                stu.id,
                                { type: 'sas', subField: 'sasPrk' },
                                e.target.value
                              )
                            }
                            className="no-spinner w-12 text-center py-1 rounded border border-slate-200 bg-slate-50/70 font-mono tabular-nums text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          />
                        </td>
                      )}

                      {/* Kehadiran, Proses, Tugas */}
                      {(['kehadiran', 'proses', 'tugas'] as const).map((asp) => (
                        <td key={asp} className="p-1 border-r border-slate-100">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={isLocked}
                            data-nav-row={idx}
                            data-nav-col={`asp-${asp}`}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, `asp-${asp}`)}
                            value={g[asp] ?? ''}
                            onChange={(e) =>
                              handleScoreChange(
                                stu.id,
                                { type: 'aspect', subField: asp },
                                e.target.value
                              )
                            }
                            className="no-spinner w-12 text-center py-1 rounded border border-slate-200 bg-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}

                      {/* Rapor Final (Semantic color + text/icon) */}
                      <td
                        className={`py-2 px-2 border-r border-slate-100 text-center font-mono tabular-nums font-bold ${
                          belowKktp
                            ? 'bg-red-50 text-red-700'
                            : 'bg-emerald-50/70 text-emerald-800'
                        }`}
                      >
                        <div className="inline-flex items-center justify-center gap-1">
                          {belowKktp && <AlertCircle className="w-3 h-3 shrink-0" />}
                          <span>{g.nilaiAkhir}</span>
                        </div>
                        {belowKktp && (
                          <div className="text-[9px] font-medium text-red-600">
                            &lt; KKTP
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-100 text-center font-mono font-semibold text-slate-800 bg-emerald-50/40">
                        {g.predikat}
                      </td>

                      {/* Auto / Manual Deskripsi */}
                      <td className="py-2 px-3">
                        {isEditingDesc && !isLocked ? (
                          <div className="space-y-1.5">
                            <textarea
                              rows={3}
                              value={activeDesc}
                              onChange={(e) =>
                                handleManualDescChange(stu.id, e.target.value)
                              }
                              className="w-full p-2 text-xs border border-emerald-400 rounded-md focus:outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingDescStudentId(null)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline"
                              >
                                <Check className="w-3 h-3" /> Selesai
                              </button>
                              {g.deskripsiManual && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleResetDescToAuto(stu.id);
                                    setEditingDescStudentId(null);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                                >
                                  <RotateCcw className="w-3 h-3" /> Reset Otomatis
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              if (!isLocked) setEditingDescStudentId(stu.id);
                            }}
                            title={
                              isLocked
                                ? 'Deskripsi terkunci'
                                : 'Klik untuk menyunting deskripsi secara manual'
                            }
                            className={`text-[11px] leading-relaxed line-clamp-3 ${
                              isLocked
                                ? 'text-slate-600 cursor-default'
                                : 'cursor-pointer text-slate-700 hover:text-slate-950'
                            }`}
                          >
                            {activeDesc}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Rekapitulasi Footer */}
            {classStudents.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold text-slate-800">
                  <td colSpan={4} className="py-2.5 px-3 border-r border-slate-200">
                    REKAPITULASI ({classStudents.length} Peserta · Tuntas KKTP: {raporStats.tercapai} · Belum: {raporStats.belumTercapai})
                  </td>
                  <td
                    colSpan={totalSummaryCols}
                    className="py-2.5 px-3 border-r border-slate-200 text-right font-mono tabular-nums text-xs text-slate-600"
                  >
                    JML: {raporStats.jml} · MIN: {raporStats.min} · MAX: {raporStats.max} · SB: {raporStats.stdDev.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2 border-r border-slate-200 text-center font-mono tabular-nums text-emerald-800 bg-emerald-100/70">
                    {raporStats.avg.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2 border-r border-slate-200 text-center text-[11px] text-slate-600">
                    RT
                  </td>
                  <td className="py-2.5 px-3 text-[11px] font-normal text-slate-500 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 text-emerald-700" />
                    <span>Auto-save & kalkulasi bobot aktif</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
