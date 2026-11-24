import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Printer, Users } from 'lucide-react';
import { ReportPaperSize, useApp } from '../context/AppContext';
import {
  getRaportSubjectGroup,
  isSubjectForClass,
  Student,
} from '../types/raport';
import { recalculateSubjectGrade } from '../utils/gradeCalculator';
import { SchoolCrest } from './SchoolCrest';

export function ReportCardView() {
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
    reportPaperSize,
    setReportPaperSize,
  } = useApp();

  const [selectedStudentId, setSelectedStudentId] = useState<string>('stu-1');
  const [printAllMode, setPrintAllMode] = useState<boolean>(false);

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

  const homeroomTeacher =
    users.find((u) => u.id === selectedClass.homeroomTeacherId) ||
    users.find((u) => u.role === 'wali_kelas');

  const activeStudent =
    classStudents.find((s) => s.id === selectedStudentId) || classStudents[0];

  const studentsToRender = printAllMode
    ? classStudents
    : activeStudent
      ? [activeStudent]
      : [];

  const handlePrint = (all: boolean) => {
    setPrintAllMode(all);
    window.setTimeout(() => {
      window.print();
    }, 120);
  };

  const renderSingleRaport = (student: Student) => {
    const hr = homeroomRecords.find((h) => h.studentId === student.id);

    const buildRows = (group: 'Umum' | 'Pilihan' | 'Muatan Lokal') =>
      classSubjects
        .filter((sub) => getRaportSubjectGroup(sub, selectedClass) === group)
        .map((sub) => {
          const found = grades.find(
            (g) => g.studentId === student.id && g.subjectId === sub.id
          );
          const computed = found
            ? recalculateSubjectGrade(found, sub, settings)
            : null;
          return {
            id: sub.id,
            subjectName: sub.name,
            nilaiAkhir: computed?.nilaiAkhir ?? 0,
            deskripsi:
              computed?.deskripsiManual ||
              computed?.deskripsiAuto ||
              `Belum ada capaian yang diinput pada mata pelajaran ${sub.name}.`,
          };
        });

    const umumRows = buildRows('Umum');
    const pilihanRows = buildRows('Pilihan');
    const mulokRows = buildRows('Muatan Lokal');

    const semesterLabel =
      settings.semester === 'Ganjil' ? '1 (Ganjil)' : '2 (Genap)';

    const paperPageClass =
      reportPaperSize === 'F4'
        ? 'max-w-[215mm] min-h-[330mm] print:min-h-0'
        : 'max-w-[210mm] min-h-[297mm] print:min-h-0';

    return (
      <article
        key={student.id}
        className={`raport-page bg-white border border-slate-300 shadow-xs mx-auto w-full ${paperPageClass} p-8 sm:p-10 text-slate-900 transition-all`}
      >
        {/* KOP SURAT RESMI SMA PASUNDAN 9 BANDUNG */}
        <div className="flex items-center gap-4 pb-3 border-b-[3px] border-double border-slate-900">
          <SchoolCrest src={settings.logoUrl} className="w-16 h-16 shrink-0" />
          <div className="flex-1 text-center">
            <div className="text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
              {settings.yayasan}
            </div>
            <h2 className="text-lg font-bold tracking-wide text-slate-950 uppercase mt-0.5">
              {settings.schoolName}
            </h2>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {settings.address}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              NPSN: {settings.npsn}
            </div>
          </div>
          <div className="w-16 shrink-0 hidden sm:block" />
        </div>

        {/* JUDUL DOKUMEN */}
        <div className="text-center my-4">
          <h3 className="text-sm font-bold uppercase tracking-wide underline underline-offset-4">
            Laporan Hasil Belajar Peserta Didik (Raport)
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Sekolah Menengah Atas (SMA) · Kurikulum Merdeka
          </p>
        </div>

        {/* IDENTITAS PESERTA DIDIK */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs mb-5 pb-3 border-b border-slate-200">
          <table className="w-full">
            <tbody>
              <tr>
                <td className="py-0.5 text-slate-600 w-32">Nama Peserta Didik</td>
                <td className="py-0.5 w-3">:</td>
                <td className="py-0.5 font-bold uppercase">{student.fullName}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-slate-600">NIS / NISN</td>
                <td className="py-0.5">:</td>
                <td className="py-0.5 font-mono tabular-nums">
                  {student.nis} / {student.nisn || '-'}
                </td>
              </tr>
              <tr>
                <td className="py-0.5 text-slate-600">Sekolah</td>
                <td className="py-0.5">:</td>
                <td className="py-0.5">{settings.schoolName}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-slate-600 align-top">Alamat Sekolah</td>
                <td className="py-0.5 align-top">:</td>
                <td className="py-0.5 text-[11px] leading-snug">
                  Jl. Babakan Ciparay Gg. Atakiria I No. 28 Bandung
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full">
            <tbody>
              <tr>
                <td className="py-0.5 text-slate-600 w-32">Kelas</td>
                <td className="py-0.5 w-3">:</td>
                <td className="py-0.5 font-semibold">{selectedClass.name}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-slate-600">Fase</td>
                <td className="py-0.5">:</td>
                <td className="py-0.5 font-semibold">
                  Fase {selectedClass.fase} (Kelas {selectedClass.gradeLevel})
                </td>
              </tr>
              <tr>
                <td className="py-0.5 text-slate-600">Semester</td>
                <td className="py-0.5">:</td>
                <td className="py-0.5">{semesterLabel}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-slate-600">Tahun Pelajaran</td>
                <td className="py-0.5">:</td>
                <td className="py-0.5 font-mono tabular-nums">{settings.academicYear}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* A. NILAI AKADEMIK (STRUKTUR RESMI KURIKULUM MERDEKA SMA) */}
        <div className="mb-5">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2">
            A. Nilai Akademik
          </h4>
          <table className="w-full border-collapse border border-slate-800 text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-slate-900 font-bold">
                <th className="border border-slate-800 py-2 px-2 text-center w-9">
                  No
                </th>
                <th className="border border-slate-800 py-2 px-3 text-left w-52">
                  Mata Pelajaran
                </th>
                <th className="border border-slate-800 py-2 px-2 text-center w-20">
                  Nilai Akhir
                </th>
                <th className="border border-slate-800 py-2 px-3 text-left">
                  Capaian Kompetensi
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Kelompok Mata Pelajaran Umum */}
              {umumRows.length > 0 && (
                <>
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td colSpan={4} className="border border-slate-800 py-1.5 px-3">
                      Kelompok Mata Pelajaran Umum
                    </td>
                  </tr>
                  {umumRows.map((row, idx) => (
                    <tr key={row.id} className="align-top">
                      <td className="border border-slate-800 py-2 px-2 text-center font-mono tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-800 py-2 px-3 font-medium">
                        {row.subjectName}
                      </td>
                      <td className="border border-slate-800 py-2 px-2 text-center font-mono tabular-nums font-bold text-xs">
                        {row.nilaiAkhir > 0 ? row.nilaiAkhir : '-'}
                      </td>
                      <td className="border border-slate-800 py-2 px-3 leading-relaxed text-justify">
                        {row.deskripsi}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* Kelompok Mata Pelajaran Pilihan (Khusus Fase F - Kelas XI & XII) */}
              {pilihanRows.length > 0 && (
                <>
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td colSpan={4} className="border border-slate-800 py-1.5 px-3">
                      Kelompok Mata Pelajaran Pilihan (Fase {selectedClass.fase})
                    </td>
                  </tr>
                  {pilihanRows.map((row, idx) => (
                    <tr key={row.id} className="align-top">
                      <td className="border border-slate-800 py-2 px-2 text-center font-mono tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-800 py-2 px-3 font-medium">
                        {row.subjectName}
                      </td>
                      <td className="border border-slate-800 py-2 px-2 text-center font-mono tabular-nums font-bold text-xs">
                        {row.nilaiAkhir > 0 ? row.nilaiAkhir : '-'}
                      </td>
                      <td className="border border-slate-800 py-2 px-3 leading-relaxed text-justify">
                        {row.deskripsi}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* Muatan Lokal */}
              {mulokRows.length > 0 && (
                <>
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td colSpan={4} className="border border-slate-800 py-1.5 px-3">
                      Muatan Lokal (Provinsi Jawa Barat)
                    </td>
                  </tr>
                  {mulokRows.map((row, idx) => (
                    <tr key={row.id} className="align-top">
                      <td className="border border-slate-800 py-2 px-2 text-center font-mono tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-800 py-2 px-3 font-medium">
                        {row.subjectName}
                      </td>
                      <td className="border border-slate-800 py-2 px-2 text-center font-mono tabular-nums font-bold text-xs">
                        {row.nilaiAkhir > 0 ? row.nilaiAkhir : '-'}
                      </td>
                      <td className="border border-slate-800 py-2 px-3 leading-relaxed text-justify">
                        {row.deskripsi}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* B. EKSTRAKURIKULER */}
        <div className="mb-5">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2">
            B. Kegiatan Ekstrakurikuler
          </h4>
          <table className="w-full border-collapse border border-slate-800 text-[11px]">
            <thead>
              <tr className="bg-slate-100 font-bold">
                <th className="border border-slate-800 py-1.5 px-2 text-center w-9">
                  No
                </th>
                <th className="border border-slate-800 py-1.5 px-3 text-left w-56">
                  Kegiatan Ekstrakurikuler
                </th>
                <th className="border border-slate-800 py-1.5 px-2 text-center w-28">
                  Predikat
                </th>
                <th className="border border-slate-800 py-1.5 px-3 text-left">
                  Keterangan
                </th>
              </tr>
            </thead>
            <tbody>
              {hr && hr.extracurriculars.length > 0 ? (
                hr.extracurriculars.map((eks, idx) => (
                  <tr key={eks.id}>
                    <td className="border border-slate-800 py-1.5 px-2 text-center font-mono tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-800 py-1.5 px-3 font-medium">
                      {eks.nama}
                    </td>
                    <td className="border border-slate-800 py-1.5 px-2 text-center">
                      {eks.predikat}
                    </td>
                    <td className="border border-slate-800 py-1.5 px-3">
                      {eks.keterangan}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="border border-slate-800 py-2 px-3 text-slate-500 text-center">
                    -
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* C. KETIDAKHADIRAN & D. CATATAN WALI KELAS */}
        <div className="grid grid-cols-12 gap-4 mb-5">
          <div className="col-span-12 sm:col-span-5">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2">
              C. Ketidakhadiran
            </h4>
            <table className="w-full border-collapse border border-slate-800 text-[11px]">
              <tbody>
                <tr>
                  <td className="border border-slate-800 py-1.5 px-3">Sakit</td>
                  <td className="border border-slate-800 py-1.5 px-3 text-right font-mono tabular-nums">
                    {hr?.sakit ?? 0} hari
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-800 py-1.5 px-3">Izin</td>
                  <td className="border border-slate-800 py-1.5 px-3 text-right font-mono tabular-nums">
                    {hr?.izin ?? 0} hari
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-800 py-1.5 px-3">
                    Tanpa Keterangan
                  </td>
                  <td className="border border-slate-800 py-1.5 px-3 text-right font-mono tabular-nums">
                    {hr?.alpha ?? 0} hari
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="col-span-12 sm:col-span-7 flex flex-col">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2">
              D. Catatan Wali Kelas
            </h4>
            <div className="flex-1 border border-slate-800 p-3 text-[11px] leading-relaxed">
              <p>{hr?.waliNote || '-'}</p>
            </div>
          </div>
        </div>

        {/* E. TANGGAPAN ORANG TUA / KEPUTUSAN KENAIKAN (KHUSUS SEMESTER GENAP) */}
        <div className="mb-5">
          {settings.semester === 'Genap' ? (
            <>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2">
                E. Keputusan Kenaikan Kelas / Kelulusan
              </h4>
              <div className="border border-slate-800 p-3 text-[11px]">
                Berdasarkan hasil pencapaian seluruh kompetensi pada Semester Ganjil dan Genap Tahun Pelajaran{' '}
                {settings.academicYear}, peserta didik dinyatakan:{' '}
                <strong className="uppercase">
                  {hr?.promotionStatus ||
                    (selectedClass.gradeLevel === 12
                      ? 'Lulus dari Satuan Pendidikan'
                      : `Naik ke kelas ${selectedClass.gradeLevel === 10 ? 'XI' : 'XII'}`)}
                </strong>
                .
              </div>
            </>
          ) : (
            <>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-2">
                E. Tanggapan Orang Tua / Wali
              </h4>
              <div className="border border-slate-800 p-3 h-14 text-[11px] text-slate-400">
                (Diisi oleh orang tua/wali peserta didik)
              </div>
            </>
          )}
        </div>

        {/* F. PROJEK PENGUATAN PROFIL PELAJAR PANCASILA (P5) */}
        {hr && hr.p5Projects.length > 0 && (
          <div className="mb-6">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900 mb-1">
              F. Capaian Projek Penguatan Profil Pelajar Pancasila (P5)
            </h4>
            <p className="text-[10px] text-slate-600 mb-2">
              Kategori Capaian: Mulai Berkembang · Sedang Berkembang · Berkembang Sesuai Harapan · Sangat Berkembang
            </p>
            <table className="w-full border-collapse border border-slate-800 text-[11px]">
              <thead>
                <tr className="bg-slate-100 font-bold">
                  <th className="border border-slate-800 py-1.5 px-3 text-left w-52">
                    Tema Projek & Dimensi
                  </th>
                  <th className="border border-slate-800 py-1.5 px-2 text-center w-36">
                    Capaian
                  </th>
                  <th className="border border-slate-800 py-1.5 px-3 text-left">
                    Catatan Proses
                  </th>
                </tr>
              </thead>
              <tbody>
                {hr.p5Projects.map((p5) => (
                  <tr key={p5.id} className="align-top">
                    <td className="border border-slate-800 py-1.5 px-3">
                      <div className="font-semibold">{p5.projek}</div>
                      <div className="text-[10px] text-slate-600">{p5.dimensi}</div>
                    </td>
                    <td className="border border-slate-800 py-1.5 px-2 text-center font-medium">
                      {p5.capaian}
                    </td>
                    <td className="border border-slate-800 py-1.5 px-3">
                      {p5.catatan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* BLOK TANDA TANGAN RESMI */}
        <div className="mt-8 pt-2 text-[11px] grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="mb-14">Mengetahui,<br />Orang Tua / Wali</p>
            <p className="font-semibold border-b border-slate-800 inline-block min-w-[140px] pb-0.5">
              {student.parentName || '.........................'}
            </p>
          </div>

          <div>
            <p className="mb-14">
              {settings.reportCity}, {settings.reportDate}
              <br />
              Wali Kelas {selectedClass.name},
            </p>
            <p className="font-bold underline underline-offset-2">
              {homeroomTeacher?.fullName || 'Wali Kelas'}
            </p>
            <p className="text-[10px] font-mono">
              NIP/NUPTK: {homeroomTeacher?.nipNuptk || '-'}
            </p>
          </div>

          <div>
            <p className="mb-14">
              Mengetahui,
              <br />
              Kepala Sekolah
            </p>
            <p className="font-bold underline underline-offset-2">
              {settings.principalName}
            </p>
            <p className="text-[10px] font-mono">
              NIP/NUPTK: {settings.principalNip}
            </p>
          </div>
        </div>
      </article>
    );
  };

  const activeStudentIndex = Math.max(
    0,
    classStudents.findIndex((s) => s.id === activeStudent?.id)
  );

  const stepStudent = (delta: number) => {
    if (classStudents.length === 0) return;
    const nextIdx =
      (activeStudentIndex + delta + classStudents.length) % classStudents.length;
    setSelectedStudentId(classStudents[nextIdx].id);
    setPrintAllMode(false);
  };

  const pageDimensionsCss =
    reportPaperSize === 'F4' ? '215mm 330mm' : '210mm 297mm';

  return (
    <div className="space-y-5">
      {/* Dynamic @page size for selected paper (A4 or F4 / Folio) */}
      <style>{`
        @media print {
          @page {
            size: ${pageDimensionsCss};
            margin: 12mm 14mm;
          }
        }
      `}</style>

      {/* Control Bar (Hidden in Print) */}
      <div className="no-print bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kelas & Fase
            </label>
            <select
              value={selectedClass.id}
              onChange={(e) => {
                setFocusedClassId(e.target.value);
                setPrintAllMode(false);
              }}
              className="px-3 py-2 text-sm font-medium bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} (Kelas {cls.gradeLevel} · Fase {cls.fase})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Peserta Didik ({activeStudentIndex + 1}/{classStudents.length})
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepStudent(-1)}
                disabled={classStudents.length <= 1}
                className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 disabled:opacity-40"
                title="Siswa sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={activeStudent?.id || ''}
                onChange={(e) => {
                  setSelectedStudentId(e.target.value);
                  setPrintAllMode(false);
                }}
                className="px-3 py-2 text-sm font-medium bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700 min-w-[220px]"
              >
                {classStudents.map((stu, idx) => (
                  <option key={stu.id} value={stu.id}>
                    {idx + 1}. {stu.fullName} ({stu.nis})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => stepStudent(1)}
                disabled={classStudents.length <= 1}
                className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 disabled:opacity-40"
                title="Siswa berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Ukuran Kertas Cetak
            </label>
            <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg">
              {(
                [
                  { id: 'A4', label: 'A4', dim: '210×297 mm' },
                  { id: 'F4', label: 'F4 (Folio)', dim: '215×330 mm' },
                ] as { id: ReportPaperSize; label: string; dim: string }[]
              ).map((paper) => {
                const active = reportPaperSize === paper.id;
                return (
                  <button
                    key={paper.id}
                    type="button"
                    onClick={() => setReportPaperSize(paper.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{paper.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {paper.dim}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePrint(false)}
            disabled={!activeStudent}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak {reportPaperSize} Siswa Ini</span>
          </button>

          <button
            type="button"
            onClick={() => handlePrint(true)}
            disabled={classStudents.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Cetak {reportPaperSize} Satu Kelas ({classStudents.length} Siswa)</span>
          </button>
        </div>
      </div>

      {/* Active Paper Indicator */}
      <div className="no-print flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Pratinjau dokumen aktif:{' '}
          <strong className="text-slate-800">
            {reportPaperSize === 'F4'
              ? 'F4 / Folio (215 × 330 mm)'
              : 'A4 Standar (210 × 297 mm)'}
          </strong>
        </span>
        <span className="hidden sm:inline">
          Pastikan ukuran kertas pada dialog cetak browser / PDF sesuai pilihan ({reportPaperSize}).
        </span>
      </div>

      {/* Preview / Print Area */}
      {studentsToRender.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Tidak ada peserta didik pada kelas {selectedClass.name}.
        </div>
      ) : (
        <div className="space-y-8 print:space-y-0">
          {studentsToRender.map((stu) => renderSingleRaport(stu))}
        </div>
      )}
    </div>
  );
}
