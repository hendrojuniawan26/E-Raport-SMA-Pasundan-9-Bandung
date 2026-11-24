import { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { useApp, WaliSubTab } from '../context/AppContext';
import {
  ExtracurricularItem,
  HomeroomRecord,
  isSubjectForClass,
  P5ProjectItem,
} from '../types/raport';
import { exportClassLegerExcel } from '../utils/excelProcessor';
import { recalculateSubjectGrade } from '../utils/gradeCalculator';
import { WaliKelasDashboard } from './WaliKelasDashboard';

export function HomeroomView() {
  const {
    classes,
    students,
    subjects,
    grades,
    homeroomRecords,
    upsertHomeroomRecord,
    settings,
    setActiveTab,
    waliSubTab: subTab,
    setWaliSubTab: setSubTab,
    focusedClassId,
    setFocusedClassId,
    openGradeInput,
    getGradeSubmission,
    unlockGrades,
  } = useApp();

  const [selectedStudentId, setSelectedStudentId] = useState<string>('stu-1');
  const [returnMsg, setReturnMsg] = useState('');

  const selectedClass = classes.find((c) => c.id === focusedClassId) || classes[0];
  const classStudents = useMemo(
    () => students.filter((s) => s.classId === selectedClass.id && s.isActive),
    [students, selectedClass.id]
  );

  const classSubjects = useMemo(
    () =>
      subjects
        .filter((sub) => isSubjectForClass(sub, selectedClass))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [subjects, selectedClass]
  );

  const activeStudent =
    classStudents.find((s) => s.id === selectedStudentId) || classStudents[0];

  const getRecord = (studentId: string): HomeroomRecord => {
    const found = homeroomRecords.find((h) => h.studentId === studentId);
    if (found) return found;
    return {
      id: `hr-${studentId}`,
      studentId,
      academicYear: settings.academicYear,
      semester: settings.semester,
      sakit: 0,
      izin: 0,
      alpha: 0,
      waliNote: '',
      promotionStatus: 'Melanjutkan ke Semester Genap',
      extracurriculars: [],
      p5Projects: [],
      updatedAt: new Date().toISOString(),
    };
  };

  const updateAttendanceOrNote = (
    studentId: string,
    patch: Partial<HomeroomRecord>
  ) => {
    const rec = getRecord(studentId);
    upsertHomeroomRecord({
      ...rec,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAddEkskul = (studentId: string) => {
    const rec = getRecord(studentId);
    const nextItem: ExtracurricularItem = {
      id: `eks-${Date.now()}`,
      nama: 'Ekstrakurikuler Baru',
      predikat: 'Baik',
      keterangan: 'Aktif mengikuti kegiatan pembinaan.',
    };
    updateAttendanceOrNote(studentId, {
      extracurriculars: [...rec.extracurriculars, nextItem],
    });
  };

  const handleAddP5 = (studentId: string) => {
    const rec = getRecord(studentId);
    const nextItem: P5ProjectItem = {
      id: `p5-${Date.now()}`,
      projek: 'Projek Penguatan Profil Pelajar Pancasila',
      dimensi: 'Bernalar Kritis, Bergotong Royong',
      capaian: 'Berkembang Sesuai Harapan',
      catatan: 'Menunjukkan kolaborasi dan inisiatif yang baik selama projek berlangsung.',
    };
    updateAttendanceOrNote(studentId, {
      p5Projects: [...rec.p5Projects, nextItem],
    });
  };

  // Leger matrix computation
  const legerRows = useMemo(() => {
    const raw = classStudents.map((stu) => {
      const subjectScores = classSubjects.map((sub) => {
        const g = grades.find(
          (gr) => gr.studentId === stu.id && gr.subjectId === sub.id
        );
        return g ? recalculateSubjectGrade(g, sub, settings).nilaiAkhir : 0;
      });
      const filled = subjectScores.filter((v) => v > 0);
      const total = filled.reduce((a, b) => a + b, 0);
      const avg = filled.length > 0 ? total / filled.length : 0;
      const hr = getRecord(stu.id);
      return { student: stu, subjectScores, total, avg, hr };
    });

    // Compute rank by avg descending
    const sortedAvgs = [...raw].sort((a, b) => b.avg - a.avg);
    return raw.map((row) => ({
      ...row,
      rank:
        row.avg > 0
          ? sortedAvgs.findIndex((r) => r.student.id === row.student.id) + 1
          : '-',
    }));
  }, [classStudents, classSubjects, grades, homeroomRecords, settings]);

  const incomingSubjects = useMemo(() => {
    return classSubjects.map((sub) => {
      const submission = getGradeSubmission(selectedClass.id, sub.id);
      const subGrades = classStudents
        .map((stu) => {
          const found = grades.find(
            (g) => g.studentId === stu.id && g.subjectId === sub.id
          );
          return found ? recalculateSubjectGrade(found, sub, settings) : null;
        })
        .filter((g): g is NonNullable<typeof g> => g !== null && g.nilaiAkhir > 0);
      const filledCount = subGrades.length;
      const avg =
        filledCount > 0
          ? subGrades.reduce((a, b) => a + b.nilaiAkhir, 0) / filledCount
          : 0;
      return {
        subject: sub,
        submission,
        status: submission?.status || 'draft',
        filledCount,
        avg,
      };
    });
  }, [classSubjects, classStudents, grades, settings, selectedClass.id, getGradeSubmission]);

  const sentCount = incomingSubjects.filter((item) => item.status === 'sent').length;

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

  return (
    <div className="space-y-5">
      {/* Header & Sub-Navigation */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kelas Binaan
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

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg mt-4 sm:mt-5">
            {(
              [
                { id: 'performa', label: 'Performa Kelas' },
                { id: 'absensi', label: 'Absensi & Catatan' },
                { id: 'ekskul_p5', label: 'Ekskul & P5' },
                { id: 'leger', label: 'Leger Nilai Kelas' },
                {
                  id: 'kiriman_guru',
                  label: `Nilai Masuk Guru (${sentCount}/${classSubjects.length})`,
                },
              ] as { id: WaliSubTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === t.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportClassLegerExcel(
                selectedClass,
                classStudents,
                classSubjects,
                grades,
                homeroomRecords,
                settings
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Leger Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('raport')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Raport Kelas</span>
          </button>
        </div>
      </div>

      {/* SubTab 0: Ringkasan Performa Kelas (Recharts) */}
      {subTab === 'performa' && <WaliKelasDashboard embedded />}

      {/* SubTab 1: Absensi & Catatan Wali */}
      {subTab === 'absensi' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-100 font-semibold">
                  <th className="py-2.5 px-3 text-center w-10">No</th>
                  <th className="py-2.5 px-3 w-24">NIS</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Nama Peserta Didik</th>
                  <th className="py-2.5 px-2 text-center w-20">Sakit</th>
                  <th className="py-2.5 px-2 text-center w-20">Izin</th>
                  <th className="py-2.5 px-2 text-center w-20">Alpha</th>
                  <th className="py-2.5 px-3 min-w-[280px]">Catatan Wali Kelas</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Keterangan Semester</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.map((stu, idx) => {
                  const rec = getRecord(stu.id);
                  return (
                    <tr key={stu.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                        {stu.nis}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {stu.fullName}
                      </td>
                      {(['sakit', 'izin', 'alpha'] as const).map((field) => (
                        <td key={field} className="p-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            value={rec[field]}
                            onChange={(e) =>
                              updateAttendanceOrNote(stu.id, {
                                [field]: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-14 text-center py-1.5 border border-slate-200 rounded-md font-mono tabular-nums focus:outline-none focus:border-emerald-700"
                          />
                        </td>
                      ))}
                      <td className="p-2">
                        <textarea
                          rows={2}
                          value={rec.waliNote}
                          onChange={(e) =>
                            updateAttendanceOrNote(stu.id, { waliNote: e.target.value })
                          }
                          placeholder="Tulis catatan perkembangan siswa..."
                          className="w-full p-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-700"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={rec.promotionStatus}
                          onChange={(e) =>
                            updateAttendanceOrNote(stu.id, {
                              promotionStatus: e.target.value,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-emerald-700"
                        >
                          <option value="Melanjutkan ke Semester Genap">
                            Melanjutkan ke Semester Genap
                          </option>
                          <option value="Naik ke kelas berikutnya">
                            Naik ke kelas berikutnya
                          </option>
                          <option value="Tinggal di kelas saat ini">
                            Tinggal di kelas saat ini
                          </option>
                          <option value="Lulus dari Satuan Pendidikan">
                            Lulus dari Satuan Pendidikan
                          </option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 2: Ekstrakurikuler & P5 */}
      {subTab === 'ekskul_p5' && activeStudent && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Student List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Pilih Siswa ({classStudents.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {classStudents.map((stu, idx) => {
                const isSelected = activeStudent.id === stu.id;
                const rec = getRecord(stu.id);
                return (
                  <button
                    key={stu.id}
                    onClick={() => setSelectedStudentId(stu.id)}
                    className={`w-full px-4 py-3 text-left flex items-center justify-between gap-2 transition-colors ${
                      isSelected ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {idx + 1}. {stu.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {stu.nis} · {rec.extracurriculars.length} Ekskul · {rec.p5Projects.length} P5
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor Panel */}
          <div className="lg:col-span-8 space-y-5">
            {(() => {
              const rec = getRecord(activeStudent.id);
              return (
                <>
                  {/* Ekstrakurikuler */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Kegiatan Ekstrakurikuler — {activeStudent.fullName}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Dicetak pada bagian B di dokumen Raport Kurikulum Merdeka
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddEkskul(activeStudent.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Ekskul</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {rec.extracurriculars.length === 0 ? (
                        <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                          Belum ada data ekstrakurikuler untuk siswa ini.
                        </p>
                      ) : (
                        rec.extracurriculars.map((eks, idx) => (
                          <div
                            key={eks.id}
                            className="p-3 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start"
                          >
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] text-slate-500 mb-1">
                                Nama Kegiatan
                              </label>
                              <input
                                type="text"
                                value={eks.nama}
                                onChange={(e) => {
                                  const next = [...rec.extracurriculars];
                                  next[idx] = { ...eks, nama: e.target.value };
                                  updateAttendanceOrNote(activeStudent.id, {
                                    extracurriculars: next,
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] text-slate-500 mb-1">
                                Predikat
                              </label>
                              <select
                                value={eks.predikat}
                                onChange={(e) => {
                                  const next = [...rec.extracurriculars];
                                  next[idx] = {
                                    ...eks,
                                    predikat: e.target.value as ExtracurricularItem['predikat'],
                                  };
                                  updateAttendanceOrNote(activeStudent.id, {
                                    extracurriculars: next,
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                              >
                                <option value="Sangat Baik">Sangat Baik</option>
                                <option value="Baik">Baik</option>
                                <option value="Cukup">Cukup</option>
                                <option value="Kurang">Kurang</option>
                              </select>
                            </div>
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] text-slate-500 mb-1">
                                Keterangan
                              </label>
                              <input
                                type="text"
                                value={eks.keterangan}
                                onChange={(e) => {
                                  const next = [...rec.extracurriculars];
                                  next[idx] = { ...eks, keterangan: e.target.value };
                                  updateAttendanceOrNote(activeStudent.id, {
                                    extracurriculars: next,
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end pt-4">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = rec.extracurriculars.filter(
                                    (i) => i.id !== eks.id
                                  );
                                  updateAttendanceOrNote(activeStudent.id, {
                                    extracurriculars: next,
                                  });
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* P5 Projects */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-emerald-700" />
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            Projek Penguatan Profil Pelajar Pancasila (P5)
                          </h3>
                          <p className="text-xs text-slate-500">
                            Capaian dimensi karakter P5 peserta didik
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddP5(activeStudent.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Projek P5</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {rec.p5Projects.map((p5, idx) => (
                        <div
                          key={p5.id}
                          className="p-3.5 border border-slate-200 rounded-lg space-y-2.5 bg-slate-50/40"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            <div className="sm:col-span-5">
                              <label className="block text-[10px] text-slate-500 mb-1">
                                Tema / Nama Projek P5
                              </label>
                              <input
                                type="text"
                                value={p5.projek}
                                onChange={(e) => {
                                  const next = [...rec.p5Projects];
                                  next[idx] = { ...p5, projek: e.target.value };
                                  updateAttendanceOrNote(activeStudent.id, {
                                    p5Projects: next,
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] text-slate-500 mb-1">
                                Dimensi Profil
                              </label>
                              <input
                                type="text"
                                value={p5.dimensi}
                                onChange={(e) => {
                                  const next = [...rec.p5Projects];
                                  next[idx] = { ...p5, dimensi: e.target.value };
                                  updateAttendanceOrNote(activeStudent.id, {
                                    p5Projects: next,
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                              />
                            </div>
                            <div className="sm:col-span-3 flex items-end gap-1.5">
                              <div className="flex-1">
                                <label className="block text-[10px] text-slate-500 mb-1">
                                  Capaian
                                </label>
                                <select
                                  value={p5.capaian}
                                  onChange={(e) => {
                                    const next = [...rec.p5Projects];
                                    next[idx] = {
                                      ...p5,
                                      capaian: e.target.value as P5ProjectItem['capaian'],
                                    };
                                    updateAttendanceOrNote(activeStudent.id, {
                                      p5Projects: next,
                                    });
                                  }}
                                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                                >
                                  <option value="Sangat Berkembang">Sangat Berkembang</option>
                                  <option value="Berkembang Sesuai Harapan">
                                    Berkembang Sesuai Harapan
                                  </option>
                                  <option value="Sedang Berkembang">Sedang Berkembang</option>
                                  <option value="Mulai Berkembang">Mulai Berkembang</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = rec.p5Projects.filter(
                                    (i) => i.id !== p5.id
                                  );
                                  updateAttendanceOrNote(activeStudent.id, {
                                    p5Projects: next,
                                  });
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">
                              Catatan Proses Projek
                            </label>
                            <input
                              type="text"
                              value={p5.catatan}
                              onChange={(e) => {
                                const next = [...rec.p5Projects];
                                next[idx] = { ...p5, catatan: e.target.value };
                                updateAttendanceOrNote(activeStudent.id, {
                                  p5Projects: next,
                                });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* SubTab 3: Leger Nilai Kelas */}
      {subTab === 'leger' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-100 font-semibold">
                  <th className="py-2.5 px-3 text-center w-10">No</th>
                  <th className="py-2.5 px-3 w-24">NIS</th>
                  <th className="py-2.5 px-3 min-w-[180px] sticky left-0 bg-slate-900 z-10">
                    Nama Peserta Didik
                  </th>
                  {classSubjects.map((sub) => {
                    const subStatus =
                      getGradeSubmission(selectedClass.id, sub.id)?.status || 'draft';
                    return (
                      <th
                        key={sub.id}
                        className="py-2.5 px-2.5 text-center border-l border-slate-800"
                        title={sub.name}
                      >
                        <div>{sub.code}</div>
                        <div className="text-[10px] font-normal text-slate-400">
                          KKTP {sub.kktp}
                        </div>
                        <div
                          className={`text-[9px] font-medium mt-0.5 ${
                            subStatus === 'sent'
                              ? 'text-emerald-300'
                              : subStatus === 'locked'
                                ? 'text-sky-300'
                                : 'text-slate-400'
                          }`}
                        >
                          {subStatus === 'sent'
                            ? 'Terkirim'
                            : subStatus === 'locked'
                              ? 'Terkunci'
                              : 'Draft'}
                        </div>
                      </th>
                    );
                  })}
                  <th className="py-2.5 px-3 text-right border-l border-slate-800 bg-emerald-950 text-emerald-200">
                    Jumlah
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-slate-800 bg-emerald-950 text-emerald-200">
                    Rata-rata
                  </th>
                  <th className="py-2.5 px-3 text-center border-l border-slate-800">
                    Peringkat
                  </th>
                  <th className="py-2.5 px-3 text-center border-l border-slate-800">
                    S / I / A
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {legerRows.map((row, idx) => (
                  <tr key={row.student.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                      {row.student.nis}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 sticky left-0 bg-white">
                      {row.student.fullName}
                    </td>
                    {row.subjectScores.map((score, sIdx) => {
                      const kktp = classSubjects[sIdx]?.kktp ?? 70;
                      const isLow = score > 0 && score < kktp;
                      return (
                        <td
                          key={classSubjects[sIdx].id}
                          className={`py-2.5 px-2.5 text-center border-l border-slate-100 font-mono tabular-nums ${
                            isLow
                              ? 'bg-red-50 text-red-700 font-semibold'
                              : 'text-slate-800'
                          }`}
                        >
                          {score > 0 ? score : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right border-l border-slate-100 font-mono tabular-nums font-semibold text-slate-900 bg-emerald-50/40">
                      {row.total || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right border-l border-slate-100 font-mono tabular-nums font-bold text-emerald-800 bg-emerald-50/60">
                      {row.avg > 0 ? row.avg.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center border-l border-slate-100 font-mono tabular-nums font-semibold text-slate-700">
                      {row.rank}
                    </td>
                    <td className="py-2.5 px-3 text-center border-l border-slate-100 font-mono tabular-nums text-slate-600">
                      {row.hr.sakit}/{row.hr.izin}/{row.hr.alpha}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 4: Nilai Masuk dari Guru Mapel */}
      {subTab === 'kiriman_guru' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Status Pengiriman Nilai Guru Mata Pelajaran — {selectedClass.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pantau mata pelajaran yang sudah dikunci dan dikirim oleh Guru Mapel sebelum mencetak raport.
              </p>
            </div>
            <div className="text-xs font-mono tabular-nums font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 shrink-0">
              {sentCount} / {classSubjects.length} Mapel Terkirim
            </div>
          </div>

          {returnMsg && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs flex items-center justify-between gap-3">
              <span>{returnMsg}</span>
              <button
                type="button"
                onClick={() => setReturnMsg('')}
                className="underline shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-100 font-semibold">
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4">Mata Pelajaran</th>
                    <th className="py-3 px-4">Guru Pengampu</th>
                    <th className="py-3 px-3 text-right">Siswa Dinilai</th>
                    <th className="py-3 px-3 text-right">Rata-rata</th>
                    <th className="py-3 px-4">Status & Catatan Guru</th>
                    <th className="py-3 px-4 text-right">Tindakan Wali Kelas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {incomingSubjects.map(
                    ({ subject, submission, status, filledCount, avg }, idx) => (
                      <tr key={subject.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{subject.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {subject.code} · KKTP {subject.kktp}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {subject.teacherName || 'Belum ditentukan'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                          {filledCount}/{classStudents.length}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {filledCount > 0 ? avg.toFixed(2) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          {status === 'sent' ? (
                            <div className="space-y-0.5">
                              <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Terkirim ({formatTimestamp(submission?.sentAt)})</span>
                              </div>
                              {submission?.note && (
                                <div className="text-[11px] text-slate-600 italic">
                                  “{submission.note}”
                                </div>
                              )}
                            </div>
                          ) : status === 'locked' ? (
                            <div className="inline-flex items-center gap-1.5 font-semibold text-sky-800">
                              <Lock className="w-3.5 h-3.5 text-sky-700" />
                              <span>Dikunci Guru (Belum Dikirim)</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-slate-500">
                              <Send className="w-3.5 h-3.5 text-slate-400" />
                              <span>Masih Draft di Guru Mapel</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openGradeInput(selectedClass.id, subject.id)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                                status === 'draft'
                                  ? 'text-white bg-emerald-700 hover:bg-emerald-800'
                                  : 'text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                              <span>{status === 'draft' ? 'Input Nilai' : 'Buka Nilai'}</span>
                            </button>

                            {status === 'sent' && (
                              <button
                                type="button"
                                onClick={() => {
                                  unlockGrades(selectedClass.id, subject.id);
                                  setReturnMsg(
                                    `Nilai ${subject.name} kelas ${selectedClass.name} dikembalikan untuk revisi.`
                                  );
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Kembalikan Revisi</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
