"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://wms-api-service.onrender.com";

type ReportType = "inventory" | "movements" | "break-risk";
type ReportFormat = "xlsx" | "csv" | "json";
type Period = "7d" | "30d" | "all";

interface Props {
  token: string;
  organizationId?: string;
}

const REPORTS: { id: ReportType; label: string; description: string; icon: string; hasPeriod: boolean }[] = [
  {
    id: "inventory",
    label: "Inventario Consolidado",
    description: "Stock actual con ubicaciones, cantidades disponibles y reservadas.",
    icon: "📦",
    hasPeriod: false,
  },
  {
    id: "movements",
    label: "Historial de Movimientos",
    description: "Todas las entradas, salidas, transferencias y ajustes en el período seleccionado.",
    icon: "🔄",
    hasPeriod: true,
  },
  {
    id: "break-risk",
    label: "Análisis de Quiebres de Stock",
    description: "SKUs clasificados por días de cobertura con alerta de riesgo crítico.",
    icon: "🚨",
    hasPeriod: false,
  },
];

const FORMAT_LABELS: Record<ReportFormat, { label: string; icon: string; description: string }> = {
  xlsx: { label: "Excel", icon: "📊", description: ".xlsx con estilos corporativos" },
  csv: { label: "CSV", icon: "📄", description: "UTF-8 BOM — compatible con Excel" },
  json: { label: "JSON", icon: "🔧", description: "Para integraciones con ERPs" },
};

interface DownloadState {
  reportId: ReportType;
  format: ReportFormat;
  status: "loading" | "done" | "error";
  error?: string;
}

export default function ReportsPanel({ token, organizationId }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>("xlsx");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("30d");
  const [downloads, setDownloads] = useState<DownloadState[]>([]);

  const isDownloading = (reportId: ReportType, format: ReportFormat) =>
    downloads.some((d) => d.reportId === reportId && d.format === format && d.status === "loading");

  const getDownloadState = (reportId: ReportType, format: ReportFormat) =>
    downloads.find((d) => d.reportId === reportId && d.format === format);

  const downloadReport = async (reportId: ReportType) => {
    const format = selectedFormat;
    const key = `${reportId}-${format}`;

    setDownloads((prev) => [
      ...prev.filter((d) => !(d.reportId === reportId && d.format === format)),
      { reportId, format, status: "loading" },
    ]);

    try {
      const params = new URLSearchParams({ format });
      if (organizationId) params.set("organizationId", organizationId);
      if (reportId === "movements") params.set("period", selectedPeriod);

      const res = await fetch(`${API_BASE}/reports/${reportId}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(text);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch?.[1] ?? `reporte_${reportId}_${Date.now()}.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloads((prev) => prev.map((d) => (d.reportId === reportId && d.format === format ? { ...d, status: "done" } : d)));
      setTimeout(() => setDownloads((prev) => prev.filter((d) => !(d.reportId === reportId && d.format === format))), 3000);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Error desconocido";
      setDownloads((prev) => prev.map((d) => (d.reportId === reportId && d.format === format ? { ...d, status: "error", error: errMsg } : d)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">📑 Generador de Reportes</h2>
        <p className="text-sm text-slate-500">Descarga reportes en formato Excel, CSV o JSON para análisis externo y auditorías</p>
      </div>

      {/* Global format selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">Configuración de descarga</h3>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Formato</label>
            <div className="flex gap-2">
              {(Object.keys(FORMAT_LABELS) as ReportFormat[]).map((fmt) => {
                const { label, icon } = FORMAT_LABELS[fmt];
                return (
                  <button
                    key={fmt}
                    onClick={() => setSelectedFormat(fmt)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      selectedFormat === fmt
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {icon} {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">{FORMAT_LABELS[selectedFormat].description}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Período (movimientos)</label>
            <div className="flex gap-2">
              {(["7d", "30d", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    selectedPeriod === p
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {p === "7d" ? "7 días" : p === "30d" ? "30 días" : "Todo"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Report cards */}
      <div className="grid gap-4">
        {REPORTS.map((report) => {
          const state = getDownloadState(report.id, selectedFormat);
          const isLoading = isDownloading(report.id, selectedFormat);

          return (
            <div key={report.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-start gap-4">
              <div className="text-4xl shrink-0">{report.icon}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-800 mb-1">{report.label}</h3>
                <p className="text-sm text-slate-500 mb-3">{report.description}</p>
                {!report.hasPeriod ? null : (
                  <p className="text-xs text-slate-400 mb-2">Período: <span className="font-medium text-slate-600">{selectedPeriod === "7d" ? "Últimos 7 días" : selectedPeriod === "30d" ? "Últimos 30 días" : "Todo el historial"}</span></p>
                )}
                {state?.status === "error" && (
                  <p className="text-xs text-red-600 mb-2">⚠️ {state.error}</p>
                )}
                {state?.status === "done" && (
                  <p className="text-xs text-green-600 mb-2">✅ Descarga iniciada</p>
                )}
              </div>
              <button
                onClick={() => downloadReport(report.id)}
                disabled={isLoading}
                className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isLoading
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-95"
                }`}
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin">⏳</span> Generando...
                  </>
                ) : (
                  <>
                    ⬇️ {FORMAT_LABELS[selectedFormat].icon} {FORMAT_LABELS[selectedFormat].label}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Info footer */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
        <p className="font-medium text-slate-700 mb-1">ℹ️ Notas sobre los formatos</p>
        <ul className="space-y-1 text-xs list-disc list-inside">
          <li><strong>Excel (.xlsx):</strong> Cabeceras con estilo, filtros automáticos y formato de tabla. Listo para imprimir.</li>
          <li><strong>CSV:</strong> Codificado en UTF-8 con BOM. Se abre correctamente en Excel español sin importar configuraciones de región.</li>
          <li><strong>JSON:</strong> Incluye metadatos de auditoría (fecha de generación, total de filas) para integraciones con ERPs o BI externos.</li>
        </ul>
      </div>
    </div>
  );
}
