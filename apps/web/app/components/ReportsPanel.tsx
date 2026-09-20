"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://wms-api-service.onrender.com";

type ReportType = "inventory" | "movements" | "break-risk";
type ReportFormat = "xlsx" | "csv" | "json";
type Period = "7d" | "30d" | "all";
type PanelSubTab = "reports" | "bulk" | "schedule";

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

interface DryRunRow {
  row: number;
  sku: string;
  locationCode: string;
  quantity: number;
  valid: boolean;
  errors: string[];
  productName?: string;
  currentStock?: number;
}

interface DryRunResponse {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: DryRunRow[];
}

export default function ReportsPanel({ token, organizationId }: Props) {
  const [subTab, setSubTab] = useState<PanelSubTab>("reports");
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>("xlsx");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("30d");
  const [downloads, setDownloads] = useState<DownloadState[]>([]);

  // Bulk Import state
  const [bulkRawText, setBulkRawText] = useState("");
  const [bulkMode, setBulkMode] = useState<"REPLENISH" | "SET_EXACT">("REPLENISH");
  const [dryRunData, setDryRunData] = useState<DryRunResponse | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<{ applied: number; skipped: number } | null>(null);

  // Scheduled report state
  const [scheduleType, setScheduleType] = useState<ReportType>("inventory");
  const [scheduleFormat, setScheduleFormat] = useState<ReportFormat>("xlsx");
  const [scheduleEmail, setScheduleEmail] = useState("yisusxat@gmail.com");
  const [scheduleSending, setScheduleSending] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);

  const isDownloading = (reportId: ReportType, format: ReportFormat) =>
    downloads.some((d) => d.reportId === reportId && d.format === format && d.status === "loading");

  const getDownloadState = (reportId: ReportType, format: ReportFormat) =>
    downloads.find((d) => d.reportId === reportId && d.format === format);

  const downloadReport = async (reportId: ReportType) => {
    const format = selectedFormat;
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

      setDownloads((prev) =>
        prev.map((d) => (d.reportId === reportId && d.format === format ? { ...d, status: "done" } : d))
      );
      setTimeout(
        () => setDownloads((prev) => prev.filter((d) => !(d.reportId === reportId && d.format === format))),
        3000
      );
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Error desconocido";
      setDownloads((prev) =>
        prev.map((d) => (d.reportId === reportId && d.format === format ? { ...d, status: "error", error: errMsg } : d))
      );
    }
  };

  // Parse CSV or tab-separated text to items array
  const parseBulkItems = (text: string) => {
    const lines = text.trim().split("\n");
    const items: { sku: string; locationCode: string; quantity: number }[] = [];

    lines.forEach((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length >= 3 && parts[0].toUpperCase() !== "SKU") {
        items.push({
          sku: parts[0],
          locationCode: parts[1],
          quantity: Number(parts[2]),
        });
      }
    });
    return items;
  };

  const handleDryRun = async () => {
    const items = parseBulkItems(bulkRawText);
    if (items.length === 0) {
      alert("Por favor ingresa al menos una fila con formato: SKU, UBICACION, CANTIDAD");
      return;
    }

    setBulkLoading(true);
    setApplyResult(null);
    try {
      const res = await fetch(`${API_BASE}/reports/bulk/dry-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: DryRunResponse = await res.json();
      setDryRunData(data);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleApplyBulk = async () => {
    if (!dryRunData) return;
    const items = parseBulkItems(bulkRawText);

    setBulkLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reports/bulk/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items, mode: bulkMode }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setApplyResult(data);
      setDryRunData(null);
      setBulkRawText("");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSendScheduledReport = async () => {
    setScheduleSending(true);
    setScheduleStatus(null);
    try {
      const res = await fetch(`${API_BASE}/reports/schedule/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          reportType: scheduleType,
          format: scheduleFormat,
          recipients: [scheduleEmail],
          organizationId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setScheduleStatus(`✅ Despachado con éxito a ${scheduleEmail} (ID: ${data.emailId})`);
    } catch (err) {
      setScheduleStatus(`⚠️ Error: ${(err as Error).message}`);
    } finally {
      setScheduleSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📑 Centro de Reportes & Operaciones Masivas</h2>
          <p className="text-sm text-slate-500">
            Descarga multiformato, carga masiva con dry-run y automatización con Resend
          </p>
        </div>

        {/* Sub-tab pills */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setSubTab("reports")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === "reports" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"
            }`}
          >
            📊 Reportes Multiformato
          </button>
          <button
            onClick={() => setSubTab("bulk")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === "bulk" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"
            }`}
          >
            📦 Carga Masiva (Dry-Run)
          </button>
          <button
            onClick={() => setSubTab("schedule")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === "schedule" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"
            }`}
          >
            ⏰ Envíos Programados
          </button>
        </div>
      </div>

      {/* 1. REPORTS MULTIFORMAT SUBTAB */}
      {subTab === "reports" && (
        <div className="space-y-4">
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

          <div className="grid gap-4">
            {REPORTS.map((report) => {
              const state = getDownloadState(report.id, selectedFormat);
              const isLoading = isDownloading(report.id, selectedFormat);

              return (
                <div
                  key={report.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-start gap-4"
                >
                  <div className="text-4xl shrink-0">{report.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 mb-1">{report.label}</h3>
                    <p className="text-sm text-slate-500 mb-3">{report.description}</p>
                    {report.hasPeriod && (
                      <p className="text-xs text-slate-400 mb-2">
                        Período:{" "}
                        <span className="font-medium text-slate-600">
                          {selectedPeriod === "7d"
                            ? "Últimos 7 días"
                            : selectedPeriod === "30d"
                            ? "Últimos 30 días"
                            : "Todo el historial"}
                        </span>
                      </p>
                    )}
                    {state?.status === "error" && <p className="text-xs text-red-600 mb-2">⚠️ {state.error}</p>}
                    {state?.status === "done" && <p className="text-xs text-green-600 mb-2">✅ Descarga iniciada</p>}
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
        </div>
      )}

      {/* 2. BULK IMPORT (DRY-RUN) SUBTAB */}
      {subTab === "bulk" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Carga Masiva con Dry-Run (Validación Previa)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pega filas en formato CSV o separado por tabulación (SKU, UBICACIÓN, CANTIDAD).
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBulkRawText(
                    "SKU,UBICACION,CANTIDAD\nSKU-001,A-A-01-01,10\nSKU-002,A-A-01-02,25\nSKU-003,A-B-02-01,5"
                  )
                }
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200"
              >
                📋 Cargar Ejemplo
              </button>
            </div>

            <textarea
              rows={6}
              className="w-full rounded-xl border p-3 font-mono text-xs focus:ring-2 focus:ring-blue-500"
              placeholder="SKU,UBICACION,CANTIDAD&#10;SKU-001,A-A-01-01,10&#10;SKU-002,A-A-01-02,25"
              value={bulkRawText}
              onChange={(e) => setBulkRawText(e.target.value)}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-600">Modo de aplicación:</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkMode"
                    value="REPLENISH"
                    checked={bulkMode === "REPLENISH"}
                    onChange={() => setBulkMode("REPLENISH")}
                  />
                  Reabastecimiento (+ suma entradas)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkMode"
                    value="SET_EXACT"
                    checked={bulkMode === "SET_EXACT"}
                    onChange={() => setBulkMode("SET_EXACT")}
                  />
                  Ajuste Cíclico (= fija stock exacto)
                </label>
              </div>

              <button
                onClick={handleDryRun}
                disabled={bulkLoading || !bulkRawText.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow disabled:opacity-50"
              >
                {bulkLoading ? "Analizando..." : "🔍 Fase 1: Validar con Dry-Run"}
              </button>
            </div>

            {applyResult && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-4 text-emerald-800 text-sm">
                🎉 Carga completada con éxito: <strong>{applyResult.applied}</strong> filas aplicadas transaccionalmente
                ({applyResult.skipped} descartadas).
              </div>
            )}
          </div>

          {/* Dry Run Interactive Table */}
          {dryRunData && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Resultado de la Simulación en Memoria</h4>
                  <p className="text-xs text-slate-500">
                    Total: {dryRunData.totalRows} | Válidas:{" "}
                    <span className="text-emerald-600 font-bold">{dryRunData.validRows}</span> | Errores:{" "}
                    <span className="text-red-600 font-bold">{dryRunData.invalidRows}</span>
                  </p>
                </div>

                <button
                  onClick={handleApplyBulk}
                  disabled={bulkLoading || dryRunData.validRows === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow disabled:opacity-50"
                >
                  {bulkLoading ? "Aplicando..." : `💾 Fase 2: Aplicar ${dryRunData.validRows} Filas a Base de Datos`}
                </button>
              </div>

              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                    <tr>
                      <th className="p-2.5">Fila</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5">Ubicación</th>
                      <th className="p-2.5 text-right">Cantidad</th>
                      <th className="p-2.5">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dryRunData.rows.map((row) => (
                      <tr key={row.row} className={row.valid ? "bg-white" : "bg-red-50/70"}>
                        <td className="p-2.5 font-mono text-slate-400">#{row.row}</td>
                        <td className="p-2.5">
                          {row.valid ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                              ✓ Válida
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold">
                              ⚠️ Error
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-slate-800">{row.sku}</td>
                        <td className="p-2.5 font-mono text-slate-700">{row.locationCode}</td>
                        <td className="p-2.5 font-semibold text-right">{row.quantity}</td>
                        <td className="p-2.5 text-slate-500">
                          {row.valid ? (
                            <span>{row.productName} (Stock previo: {row.currentStock} u)</span>
                          ) : (
                            <span className="text-red-600 font-medium">{row.errors.join(", ")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. SCHEDULED REPORTS SUBTAB */}
      {subTab === "schedule" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
          <div>
            <h3 className="font-bold text-slate-800">⏰ Reportes Automatizados Programados (Resend)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configura envíos periódicos con archivo adjunto directo a tu correo electrónico.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Reporte</label>
              <select
                className="w-full rounded-lg border p-2.5 text-sm"
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value as ReportType)}
              >
                <option value="inventory">📦 Inventario Consolidado</option>
                <option value="movements">🔄 Movimientos (30 días)</option>
                <option value="break-risk">🚨 Riesgo de Quiebre</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Formato Adjunto</label>
              <select
                className="w-full rounded-lg border p-2.5 text-sm"
                value={scheduleFormat}
                onChange={(e) => setScheduleFormat(e.target.value as ReportFormat)}
              >
                <option value="xlsx">📊 Excel (.xlsx)</option>
                <option value="csv">📄 CSV UTF-8 BOM (.csv)</option>
                <option value="json">🔧 JSON con metadatos (.json)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Correo Destinatario</label>
              <input
                type="email"
                className="w-full rounded-lg border p-2.5 text-sm"
                value={scheduleEmail}
                onChange={(e) => setScheduleEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-slate-400">
              Despacho ejecutado en servidor vía Resend con archivo adjunto binario.
            </p>
            <button
              onClick={handleSendScheduledReport}
              disabled={scheduleSending || !scheduleEmail}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow disabled:opacity-50"
            >
              {scheduleSending ? "Enviando adjunto..." : "✉️ Despachar Reporte de Prueba"}
            </button>
          </div>

          {scheduleStatus && (
            <div
              className={`p-3 rounded-lg text-xs font-medium ${
                scheduleStatus.startsWith("✅")
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {scheduleStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
