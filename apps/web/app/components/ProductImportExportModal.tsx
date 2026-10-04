'use client';

import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import ExcelJS from 'exceljs';
import { apiFetch, Product } from '../../lib/api';
import { useToast } from './Toast';

export interface ParsedProductRow {
  sku: string;
  name: string;
  category: string;
  unit: string;
  active: boolean;
  barcode?: string;
  description?: string;
  isValid: boolean;
  errors: string[];
}

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}

// ==================== TEMPLATES FOR DOWNLOAD ====================
const SAMPLE_PRODUCTS = [
  {
    sku: 'ALM-ARR-001',
    nombre: 'Arroz Diana Especial 1kg',
    categoria: 'Granos y Cereales',
    unidad: 'kg',
    estado: 'Activo',
    codigo_barras: '7702001001234',
    descripcion: 'Arroz blanco seleccionado grado 1',
  },
  {
    sku: 'ALM-ACE-002',
    nombre: 'Aceite Vegetal Premier 1L',
    categoria: 'Aceites y Grasas',
    unidad: 'litro',
    estado: 'Activo',
    codigo_barras: '7702001005678',
    descripcion: 'Aceite vegetal refinado botella 1000ml',
  },
  {
    sku: 'BEB-JUG-003',
    nombre: 'Jugo Hit Mora 500ml',
    categoria: 'Bebidas',
    unidad: 'unidad',
    estado: 'Activo',
    codigo_barras: '7702001009012',
    descripcion: 'Bebida de fruta pasteurizada',
  },
  {
    sku: 'LAC-LECH-004',
    nombre: 'Leche Entera Alquería 1L',
    categoria: 'Lácteos',
    unidad: 'litro',
    estado: 'Activo',
    codigo_barras: '7702001003456',
    descripcion: 'Leche entera ultrapasteurizada',
  },
];

export async function downloadProductTemplate(format: 'xlsx' | 'csv' | 'json') {
  const filename = `plantilla_productos_wms.${format}`;

  if (format === 'json') {
    const jsonStr = JSON.stringify(
      SAMPLE_PRODUCTS.map((p) => ({
        sku: p.sku,
        name: p.nombre,
        category: p.categoria,
        unit: p.unidad,
        active: p.estado === 'Activo',
        barcode: p.codigo_barras,
        description: p.descripcion,
      })),
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (format === 'csv') {
    const headers = ['sku', 'nombre', 'categoria', 'unidad', 'estado', 'codigo_barras', 'descripcion'];
    const rows = SAMPLE_PRODUCTS.map((p: any) =>
      headers.map((h) => `"${String(p[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvOutput = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // xlsx via ExcelJS
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Plantilla');
  worksheet.columns = [
    { header: 'sku', key: 'sku', width: 16 },
    { header: 'nombre', key: 'nombre', width: 28 },
    { header: 'categoria', key: 'categoria', width: 20 },
    { header: 'unidad', key: 'unidad', width: 12 },
    { header: 'estado', key: 'estado', width: 12 },
    { header: 'codigo_barras', key: 'codigo_barras', width: 18 },
    { header: 'descripcion', key: 'descripcion', width: 32 },
  ];
  SAMPLE_PRODUCTS.forEach((p) => worksheet.addRow(p));
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== EXPORT UTILITY ====================
export async function exportProductsToFile(
  token: string,
  format: 'xlsx' | 'csv' | 'json',
  filteredProducts?: Product[]
) {
  let list = filteredProducts;

  // If not provided, fetch all products from API
  if (!list || list.length === 0) {
    try {
      const res = await apiFetch<{ items?: Product[] }>('/products?pageSize=100', token);
      list = res.items ?? [];
    } catch {
      list = [];
    }
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `productos_wms_${dateStr}.${format}`;

  if (format === 'json') {
    const jsonStr = JSON.stringify(list, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const exportRows = list.map((p) => ({
    SKU: p.sku,
    Nombre: p.name,
    Categoría: p.category || 'General',
    Unidad: p.unit || 'unidad',
    Estado: p.active ? 'Activo' : 'Inactivo',
    'Código de Barras': p.barcode || '',
  }));

  if (format === 'csv') {
    const headers = ['SKU', 'Nombre', 'Categoría', 'Unidad', 'Estado', 'Código de Barras'];
    const rows = exportRows.map((r: any) =>
      headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvOutput = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // xlsx via ExcelJS
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Productos');
  worksheet.columns = [
    { header: 'SKU', key: 'SKU', width: 16 },
    { header: 'Nombre', key: 'Nombre', width: 28 },
    { header: 'Categoría', key: 'Categoría', width: 20 },
    { header: 'Unidad', key: 'Unidad', width: 12 },
    { header: 'Estado', key: 'Estado', width: 12 },
    { header: 'Código de Barras', key: 'Código de Barras', width: 20 },
  ];
  exportRows.forEach((r) => worksheet.addRow(r));
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== IMPORT MODAL COMPONENT ====================
export function ProductImportModal({
  isOpen,
  onClose,
  token,
  onSuccess,
}: ProductImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseFile = async (uploadedFile: File) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setFile(uploadedFile);

    try {
      const fileName = uploadedFile.name.toLowerCase();
      let rawData: any[] = [];

      if (fileName.endsWith('.json')) {
        const text = await uploadedFile.text();
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          rawData = json;
        } else if (json && Array.isArray(json.items)) {
          rawData = json.items;
        } else if (json && Array.isArray(json.products)) {
          rawData = json.products;
        } else {
          throw new Error('El archivo JSON debe contener un arreglo de productos.');
        }
      } else if (fileName.endsWith('.csv')) {
        const text = await uploadedFile.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) throw new Error('El archivo CSV no contiene suficientes filas.');
        const parseLine = (l: string) => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < l.length; i++) {
            const char = l[i];
            if (char === '"' && (i === 0 || l[i - 1] !== '\\')) {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result.map((s) => s.replace(/^"(.*)"$/, '$1'));
        };
        const headers = parseLine(lines[0]);
        rawData = lines.slice(1).map((line) => {
          const vals = parseLine(line);
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            obj[h] = vals[idx] ?? '';
          });
          return obj;
        });
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await uploadedFile.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          throw new Error('El archivo no contiene hojas de cálculo válidas.');
        }
        const rows: any[] = [];
        let headers: string[] = [];
        worksheet.eachRow((row, rowNumber) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          if (rowNumber === 1) {
            headers = values.map((v: any) => String(v ?? '').trim());
          } else {
            const rowObj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              rowObj[h] = values[idx] ?? '';
            });
            rows.push(rowObj);
          }
        });
        rawData = rows;
      } else {
        throw new Error('Formato no compatible. Por favor sube un archivo .xlsx, .csv o .json');
      }

      if (!rawData || rawData.length === 0) {
        throw new Error('El archivo está vacío o no contiene filas de datos.');
      }

      // Normalize row columns
      const normalized: ParsedProductRow[] = rawData.map((row: any) => {
        const errors: string[] = [];

        // Flexible column mapping (supports Spanish and English aliases)
        const rawSku =
          row.sku ?? row.SKU ?? row.codigo ?? row.código ?? row.cod ?? row['Código'] ?? '';
        const sku = String(rawSku).trim();

        const rawName =
          row.name ?? row.nombre ?? row.Nombre ?? row.producto ?? row.Producto ?? row.item ?? '';
        const name = String(rawName).trim();

        const rawCategory =
          row.category ??
          row.categoria ??
          row.categoría ??
          row.Categoría ??
          row.Categoria ??
          row.familia ??
          row.rubro ??
          '';
        const category = String(rawCategory).trim() || 'General';

        const rawUnit =
          row.unit ??
          row.unidad ??
          row.Unidad ??
          row.medida ??
          row.uom ??
          '';
        const unit = String(rawUnit).trim() || 'unidad';

        const rawActive =
          row.active ?? row.activo ?? row.Activo ?? row.estado ?? row.Estado ?? true;
        let active = true;
        if (typeof rawActive === 'boolean') {
          active = rawActive;
        } else if (typeof rawActive === 'string') {
          const lower = rawActive.toLowerCase().trim();
          active = lower === 'activo' || lower === 'true' || lower === '1' || lower === 'si';
        }

        const rawBarcode = row.barcode ?? row.codigo_barras ?? row['Código de Barras'] ?? row.ean ?? '';
        const barcode = rawBarcode ? String(rawBarcode).trim() : undefined;

        const rawDescription = row.description ?? row.descripcion ?? row['Descripción'] ?? '';
        const description = rawDescription ? String(rawDescription).trim() : undefined;

        if (!sku) errors.push('Falta el SKU');
        if (!name) errors.push('Falta el Nombre');

        return {
          sku,
          name,
          category,
          unit,
          active,
          barcode,
          description,
          isValid: errors.length === 0,
          errors,
        };
      });

      setParsedRows(normalized);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar el archivo.');
      setParsedRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      void parseFile(selected);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      void parseFile(droppedFile);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleExecuteImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setErrorMsg('No hay filas válidas para importar.');
      return;
    }

    setImporting(true);
    setProgress(0);
    setErrorMsg(null);
    setSuccessMsg(null);

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    try {
      // 1. Fetch current existing products to know who to update vs insert
      const existingRes = await apiFetch<{ items?: Product[] }>(
        '/products?pageSize=100',
        token
      ).catch(() => ({ items: [] }));
      const existingMap = new Map<string, Product>();
      for (const p of existingRes.items ?? []) {
        if (p?.sku) existingMap.set(p.sku.toUpperCase(), p);
      }

      // 2. Separate into inserts and updates
      const toInsert: any[] = [];
      const toUpdate: { id: string; data: any }[] = [];

      for (const row of validRows) {
        const existing = existingMap.get(row.sku.toUpperCase());
        if (existing) {
          if (updateExisting) {
            toUpdate.push({
              id: existing.id,
              data: {
                name: row.name,
                category: row.category,
                unit: row.unit,
                active: row.active,
                barcode: row.barcode,
                description: row.description,
              },
            });
          }
        } else {
          toInsert.push({
            sku: row.sku,
            name: row.name,
            category: row.category,
            unit: row.unit,
            active: row.active,
            barcode: row.barcode,
            description: row.description,
          });
        }
      }

      const totalOperations = toInsert.length + toUpdate.length;
      let completedOps = 0;

      // Execute batch inserts
      if (toInsert.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          try {
            await apiFetch('/products', token, {
              method: 'POST',
              body: JSON.stringify(chunk),
            });
            createdCount += chunk.length;
          } catch (err: any) {
            console.warn('Batch insert chunk error:', err);
            // Fallback row-by-row
            for (const item of chunk) {
              try {
                await apiFetch('/products', token, {
                  method: 'POST',
                  body: JSON.stringify(item),
                });
                createdCount++;
              } catch {
                failedCount++;
              }
            }
          }
          completedOps += chunk.length;
          setProgress(Math.round((completedOps / Math.max(totalOperations, 1)) * 100));
        }
      }

      // Execute updates
      if (toUpdate.length > 0) {
        for (const up of toUpdate) {
          try {
            await apiFetch(`/products`, token, {
              method: 'PATCH',
              body: JSON.stringify({ id: up.id, ...up.data }),
            });
            updatedCount++;
          } catch {
            failedCount++;
          }
          completedOps++;
          setProgress(Math.round((completedOps / Math.max(totalOperations, 1)) * 100));
        }
      }

      setSuccessMsg(
        `¡Importación completada! ${createdCount} productos creados, ${updatedCount} actualizados${
          failedCount > 0 ? `, ${failedCount} fallidos` : ''
        }.`
      );
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error durante la importación.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !importing) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="flex flex-col w-full max-w-2xl max-h-[92vh] rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-xl font-bold shrink-0">
              📥
            </span>
            <div>
              <h3 id="import-modal-title" className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Importar Catálogo de Productos</h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Formatos compatibles: Excel (.xlsx, .xls), CSV (.csv) o JSON (.json)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 font-bold transition disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Download Templates Banner */}
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-900/20 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-300">
                ¿Aún no tienes el archivo? Descarga una plantilla de ejemplo:
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => downloadProductTemplate('xlsx')}
                className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>📗</span> Plantilla Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => downloadProductTemplate('csv')}
                className="rounded-lg border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-blue-800 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>📄</span> Plantilla CSV (.csv)
              </button>
              <button
                type="button"
                onClick={() => downloadProductTemplate('json')}
                className="rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>📦</span> Plantilla JSON (.json)
              </button>
            </div>
          </div>

          {/* Upload Dropzone */}
          {!file && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
                isDragOver
                  ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-900/20 scale-101'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <span className="text-4xl mb-2">📁</span>
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Arrastra tu archivo aquí o <span className="text-indigo-600 dark:text-indigo-400 underline">haz clic para examinar</span>
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Soporta SKU, Nombre, Categoría, Unidad, Estado, Código de barras
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-3 p-6 text-indigo-700 dark:text-indigo-400 font-bold text-sm">
              <div className="h-6 w-6 animate-spin rounded-full border-3 border-indigo-600 dark:border-indigo-400 border-t-transparent" />
              Procesando y validando archivo...
            </div>
          )}

          {/* Alert Messages */}
          {errorMsg && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-3 text-xs font-bold text-red-800 dark:text-red-400 flex items-center justify-between">
              <span>⚠️ {errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 dark:hover:text-red-300">✕</button>
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 p-4 text-xs font-bold text-emerald-800 dark:text-emerald-400 space-y-1">
              <p className="text-sm">🎉 {successMsg}</p>
              <p className="text-emerald-600 dark:text-emerald-500 font-normal">
                El catálogo en pantalla se ha actualizado con los nuevos registros.
              </p>
            </div>
          )}

          {/* File Selected & Preview */}
          {file && parsedRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-slate-100 dark:bg-slate-800/80 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <div>
                    <p className="font-bold text-xs text-slate-900 dark:text-white">{file.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB · {parsedRows.length} filas detectadas
                    </p>
                  </div>
                </div>
                {!importing && (
                  <button
                    onClick={handleReset}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Cambiar archivo
                  </button>
                )}
              </div>

              {/* Status summary counts */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 p-2.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">
                    Filas Válidas
                  </span>
                  <span className="text-lg font-black text-emerald-900 dark:text-emerald-100">{validCount}</span>
                </div>
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 p-2.5">
                  <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 block">
                    Con Errores / Incompletas
                  </span>
                  <span className="text-lg font-black text-amber-900 dark:text-amber-100">{invalidCount}</span>
                </div>
              </div>

              {/* Import options */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-800 text-xs">
                <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="h-4 w-4 rounded text-indigo-600 dark:text-indigo-500"
                  />
                  <span>Actualizar productos si el SKU ya existe en el sistema</span>
                </label>
              </div>

              {/* Preview Table */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Vista Previa (primeras {Math.min(parsedRows.length, 25)} de {parsedRows.length}):
                </span>
                <div className="max-h-56 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-2">Estado</th>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Nombre</th>
                        <th className="p-2">Categoría</th>
                        <th className="p-2">Unidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {parsedRows.slice(0, 25).map((row, idx) => (
                        <tr key={idx} className={row.isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50' : 'bg-red-50/60 dark:bg-red-900/20'}>
                          <td className="p-2 font-mono">
                            {row.isValid ? (
                              <span className="rounded bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                ✓ OK
                              </span>
                            ) : (
                              <span
                                className="rounded bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 text-[10px] font-bold text-red-800 dark:text-red-300"
                                title={row.errors.join(', ')}
                              >
                                ⚠️ Error
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-mono font-bold text-slate-900 dark:text-slate-100">{row.sku || '—'}</td>
                          <td className="p-2 font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                            {row.name || '—'}
                          </td>
                          <td className="p-2 text-slate-600 dark:text-slate-400">{row.category}</td>
                          <td className="p-2 text-slate-600 dark:text-slate-400">{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress Bar when importing */}
              {importing && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900 dark:text-indigo-300">
                    <span>Importando productos al sistema...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="w-full sm:w-auto rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50 text-center"
          >
            {successMsg ? 'Cerrar' : 'Cancelar'}
          </button>

          {parsedRows.length > 0 && !successMsg && (
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={importing || validCount === 0}
              className="w-full sm:w-auto rounded-lg bg-indigo-600 dark:bg-indigo-500 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Confirmar e Importar {validCount} Productos</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== EXPORT DROPDOWN COMPONENT ====================
export function ProductExportMenu({
  token,
  products,
  currentSearch,
}: {
  token: string;
  products: Product[];
  currentSearch?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  const handleExport = async (format: 'xlsx' | 'csv' | 'json') => {
    setExporting(true);
    try {
      await exportProductsToFile(token, format, products);
    } catch (err: any) {
      showToast({ message: err.message || 'Error al exportar', type: 'error' });
    } finally {
      setExporting(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={exporting}
        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        <span>📤</span>
        <span>{exporting ? 'Generando...' : 'Exportar'}</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">▼</span>
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 animate-fadeIn space-y-1 text-xs">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
              Formato de Exportación
            </div>

            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left font-bold text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-800 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              <span className="text-base">📗</span>
              <div>
                <p className="leading-tight">Excel (.xlsx)</p>
                <p className="text-[10px] font-normal text-slate-400 dark:text-slate-500">Hoja de cálculo completa</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left font-bold text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-800 dark:hover:text-blue-400 transition cursor-pointer"
            >
              <span className="text-base">📄</span>
              <div>
                <p className="leading-tight">CSV (.csv)</p>
                <p className="text-[10px] font-normal text-slate-400 dark:text-slate-500">Valores separados por coma UTF-8</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleExport('json')}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left font-bold text-slate-800 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-800 dark:hover:text-amber-400 transition cursor-pointer"
            >
              <span className="text-base">📦</span>
              <div>
                <p className="leading-tight">JSON (.json)</p>
                <p className="text-[10px] font-normal text-slate-400 dark:text-slate-500">Estructura cruda para integración</p>
              </div>
            </button>

            {products.length > 0 && (
              <div className="px-3 py-1 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 mt-1">
                Total a exportar: <strong className="dark:text-slate-300">{products.length}</strong> productos
                {currentSearch ? ` (filtrados)` : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
