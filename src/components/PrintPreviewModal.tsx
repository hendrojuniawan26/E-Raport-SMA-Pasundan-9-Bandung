import React, { useEffect, useState } from 'react';
import {
  FileText,
  Maximize2,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { ReportPaperSize } from '../context/AppContext';

export interface PrintMarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_PRINT_MARGINS: PrintMarginsMm = {
  top: 12,
  right: 14,
  bottom: 12,
  left: 14,
};

interface PrintPreviewModalProps {
  open: boolean;
  onClose: () => void;
  paperSize: ReportPaperSize;
  onChangePaperSize: (size: ReportPaperSize) => void;
  margins: PrintMarginsMm;
  onChangeMargins: (margins: PrintMarginsMm) => void;
  printAllMode: boolean;
  onChangePrintAllMode: (all: boolean) => void;
  activeStudentName?: string;
  classNameLabel: string;
  totalClassStudents: number;
  onTriggerPrint: () => void;
  renderPages: (options: { showMarginGuide: boolean }) => React.ReactNode[];
}

const MARGIN_PRESETS: { id: string; label: string; desc: string; value: PrintMarginsMm }[] = [
  {
    id: 'compact',
    label: 'Rapat',
    desc: '8 / 10 mm',
    value: { top: 8, right: 10, bottom: 8, left: 10 },
  },
  {
    id: 'standard',
    label: 'Standar',
    desc: '12 / 14 mm',
    value: { top: 12, right: 14, bottom: 12, left: 14 },
  },
  {
    id: 'wide',
    label: 'Lebar',
    desc: '18 / 20 mm',
    value: { top: 18, right: 18, bottom: 18, left: 20 },
  },
];

export function PrintPreviewModal({
  open,
  onClose,
  paperSize,
  onChangePaperSize,
  margins,
  onChangeMargins,
  printAllMode,
  onChangePrintAllMode,
  activeStudentName,
  classNameLabel,
  totalClassStudents,
  onTriggerPrint,
  renderPages,
}: PrintPreviewModalProps) {
  const [zoomPct, setZoomPct] = useState<number>(75);
  const [showMarginGuide, setShowMarginGuide] = useState<boolean>(true);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const pageWidthMm = paperSize === 'F4' ? 215 : 210;
  const pageHeightMm = paperSize === 'F4' ? 330 : 297;
  const scale = zoomPct / 100;
  const pages = renderPages({ showMarginGuide });

  const updateSingleMargin = (key: keyof PrintMarginsMm, raw: string) => {
    const parsed = Number(raw);
    const clamped = Number.isFinite(parsed) ? Math.max(5, Math.min(35, Math.round(parsed))) : 12;
    onChangeMargins({ ...margins, [key]: clamped });
  };

  const isPresetActive = (preset: PrintMarginsMm) =>
    margins.top === preset.top &&
    margins.right === preset.right &&
    margins.bottom === preset.bottom &&
    margins.left === preset.left;

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-preview-modal-title"
    >
      <div className="w-full max-w-7xl h-[94vh] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3
              id="print-preview-modal-title"
              className="text-sm sm:text-base font-bold text-slate-900 truncate"
            >
              Pratinjau Cetak Raport ({paperSize} · {pageWidthMm} × {pageHeightMm} mm)
            </h3>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              Kelas {classNameLabel} ·{' '}
              {printAllMode
                ? `Seluruh kelas (${totalClassStudents} siswa)`
                : activeStudentName || '1 peserta didik'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={onTriggerPrint}
              disabled={pages.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Simpan PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Tutup jendela pratinjau cetak"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Settings Sidebar + Right Live Paper Canvas */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Controls Panel */}
          <aside className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 p-4 sm:p-5 overflow-y-auto space-y-5">
            {/* Scope */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Cakupan Dokumen
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => onChangePrintAllMode(false)}
                  className={`px-2.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    !printAllMode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Siswa Aktif (1)
                </button>
                <button
                  type="button"
                  onClick={() => onChangePrintAllMode(true)}
                  disabled={totalClassStudents === 0}
                  className={`inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
                    printAllMode
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Sekelas ({totalClassStudents})</span>
                </button>
              </div>
            </div>

            {/* Paper Size */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Ukuran Kertas
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'A4', label: 'A4 Standar', dim: '210 × 297 mm' },
                    { id: 'F4', label: 'F4 / Folio', dim: '215 × 330 mm' },
                  ] as { id: ReportPaperSize; label: string; dim: string }[]
                ).map((item) => {
                  const active = paperSize === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChangePaperSize(item.id)}
                      className={`p-2.5 text-left rounded-xl border transition-colors ${
                        active
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <FileText
                          className={`w-3.5 h-3.5 ${
                            active ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                        {item.dim}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Margin Presets + Manual Controls */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Pengaturan Margin (mm)</span>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeMargins(DEFAULT_PRINT_MARGINS)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-emerald-700"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {MARGIN_PRESETS.map((preset) => {
                  const active = isPresetActive(preset.value);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onChangeMargins(preset.value)}
                      className={`p-2 text-center rounded-lg border transition-colors ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">{preset.label}</div>
                      <div
                        className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                          active ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {preset.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Atas (mm)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={35}
                    value={margins.top}
                    onChange={(e) => updateSingleMargin('top', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono tabular-nums text-xs focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Bawah (mm)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={35}
                    value={margins.bottom}
                    onChange={(e) => updateSingleMargin('bottom', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono tabular-nums text-xs focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Kiri (mm)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={35}
                    value={margins.left}
                    onChange={(e) => updateSingleMargin('left', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono tabular-nums text-xs focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Kanan (mm)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={35}
                    value={margins.right}
                    onChange={(e) => updateSingleMargin('right', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono tabular-nums text-xs focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={showMarginGuide}
                  onChange={(e) => setShowMarginGuide(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>Tampilkan garis panduan margin</span>
              </label>
            </div>

            {/* Screen Zoom */}
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 inline-flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                  Zoom Pratinjau
                </span>
                <span className="font-mono tabular-nums text-slate-500">{zoomPct}%</span>
              </div>
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/70 rounded-lg">
                {[60, 75, 90, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setZoomPct(pct)}
                    className={`py-1 text-xs font-mono tabular-nums font-semibold rounded-md transition-colors ${
                      zoomPct === pct
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Ringkasan Cetak</div>
              <div className="flex justify-between font-mono tabular-nums">
                <span>Kertas:</span>
                <span>
                  {paperSize} ({pageWidthMm}×{pageHeightMm} mm)
                </span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span>Margin (T/R/B/L):</span>
                <span>
                  {margins.top}/{margins.right}/{margins.bottom}/{margins.left} mm
                </span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span>Jumlah Dokumen:</span>
                <span>{pages.length} siswa</span>
              </div>
              <p className="text-[10px] text-slate-400 pt-1 leading-snug">
                Saat dialog browser terbuka, pilih ukuran kertas {paperSize} dan atur margin ke Default/None agar mengikuti margin di atas.
              </p>
            </div>
          </aside>

          {/* Live Scaled Paper Canvas */}
          <div className="flex-1 bg-slate-200/80 overflow-auto p-4 sm:p-8 flex flex-col items-center gap-6">
            {pages.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500 my-auto">
                Tidak ada data raport siswa untuk ditampilkan.
              </div>
            ) : (
              pages.map((pageNode, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 shrink-0">
                  <div className="text-[11px] font-mono tabular-nums text-slate-600">
                    Halaman Siswa {idx + 1} / {pages.length} · {paperSize} ({pageWidthMm}×
                    {pageHeightMm} mm)
                  </div>
                  <div
                    className="relative"
                    style={{
                      width: `${pageWidthMm * scale}mm`,
                      minHeight: `${pageHeightMm * scale}mm`,
                    }}
                  >
                    <div
                      style={{
                        width: `${pageWidthMm}mm`,
                        minHeight: `${pageHeightMm}mm`,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      {pageNode}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
