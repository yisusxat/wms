'use client';

import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch, Product } from '../../lib/api';

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

export function downloadProductTemplate(format: 'xlsx' | 'csv' | 'json') {
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

  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_PRODUCTS);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');

  if (format === 'csv') {
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    // Add UTF-8 BOM so Excel opens accents correctly
    const blob = new Blob(['\uFEFF' + csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // xlsx
  XLSX.writeFile(workbook, filename);
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
      const res = await apiFetch<{ items?: Product[] }>('/products?pageSize=1000', token);
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

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');

  if (format === 'csv') {
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob(['\uFEFF' + csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // xlsx
  XLSX.writeFile(workbook, filename);
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
      } else if (
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls') ||
        fileName.endsWith('.csv')
      ) {
        const buffer = await uploadedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) {
          throw new Error('El archivo no contiene hojas de cálculo válidas.');
        }
        rawData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
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
        '/products?pageSize=1000',
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
    >
      <div className="flex flex-col w-full max-w-2xl max-h-[92vh] rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 text-xl font-bold">
              📥
            </span>
            <div>
              <h3 className="text-lg font-black text-slate-900">Importar Catálogo de Productos</h3>
              <p className="text-xs text-slate-500">
                Formatos compatibles: Excel (.xlsx, .xls), CSV (.csv) o JSON (.json)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 font-bold transition disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Download Templates Banner */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950">
                ¿Aún no tienes el archivo? Descarga una plantilla de ejemplo:
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => downloadProductTemplate('xlsx')}
                className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>📗</span> Plantilla Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => downloadProductTemplate('csv')}
                className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-50 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>📄</span> Plantilla CSV (.csv)
              </button>
              <button
                type="button"
                onClick={() => downloadProductTemplate('json')}
                className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
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
              className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
                isDragOver
                  ? 'border-indigo-600 bg-indigo-50/70 scale-101'
                  : 'border-slate-300 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-400'
              }`}
            >
              <span className="text-4xl mb-2">📁</span>
              <p className="font-bold text-sm text-slate-800">
                Arrastra tu archivo aquí o <span className="text-indigo-600 underline">haz clic para examinar</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
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
            <div className="flex items-center justify-center gap-3 p-6 text-indigo-700 font-bold text-sm">
              <div className="h-6 w-6 animate-spin rounded-full border-3 border-indigo-600 border-t-transparent" />
              Procesando y validando archivo...
            </div>
          )}

          {/* Alert Messages */}
          {errorMsg && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-xs font-bold text-red-800 flex items-center justify-between">
              <span>⚠️ {errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700">✕</button>
            </div>
          )}

          {successMsg && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs font-bold text-emerald-800 space-y-1">
              <p className="text-sm">🎉 {successMsg}</p>
              <p className="text-emerald-600 font-normal">
                El catálogo en pantalla se ha actualizado con los nuevos registros.
              </p>
            </div>
          )}

          {/* File Selected & Preview */}
          {file && parsedRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl bg-slate-100 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <div>
                    <p className="font-bold text-xs text-slate-900">{file.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB · {parsedRows.length} filas detectadas
                    </p>
                  </div>
                </div>
                {!importing && (
                  <button
                    onClick={handleReset}
                    className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    Cambiar archivo
                  </button>
                )}
              </div>

              {/* Status summary counts */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                    Filas Válidas
                  </span>
                  <span className="text-lg font-black text-emerald-900">{validCount}</span>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
                  <span className="text-[10px] font-bold uppercase text-amber-700 block">
                    Con Errores / Incompletas
                  </span>
                  <span className="text-lg font-black text-amber-900">{invalidCount}</span>
                </div>
              </div>

              {/* Import options */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-white text-xs">
                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="h-4 w-4 rounded text-indigo-600"
                  />
                  <span>Actualizar productos si el SKU ya existe en el sistema</span>
                </label>
              </div>

              {/* Preview Table */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">
                  Vista Previa (primeras {Math.min(parsedRows.length, 25)} de {parsedRows.length}):
                </span>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                      <tr>
                        <th className="p-2">Estado</th>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Nombre</th>
                        <th className="p-2">Categoría</th>
                        <th className="p-2">Unidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 25).map((row, idx) => (
                        <tr key={idx} className={row.isValid ? 'hover:bg-slate-50' : 'bg-red-50/60'}>
                          <td className="p-2 font-mono">
                            {row.isValid ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                ✓ OK
                              </span>
                            ) : (
                              <span
                                className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800"
                                title={row.errors.join(', ')}
                              >
                                ⚠️ Error
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-mono font-bold text-slate-900">{row.sku || '—'}</td>
                          <td className="p-2 font-medium text-slate-800 truncate max-w-[160px]">
                            {row.name || '—'}
                          </td>
                          <td className="p-2 text-slate-600">{row.category}</td>
                          <td className="p-2 text-slate-600">{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress Bar when importing */}
              {importing && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                    <span>Importando productos al sistema...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
          >
            {successMsg ? 'Cerrar' : 'Cancelar'}
          </button>

          {parsedRows.length > 0 && !successMsg && (
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={importing || validCount === 0}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
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

  const handleExport = async (format: 'xlsx' | 'csv' | 'json') => {
    setExporting(true);
    try {
      await exportProductsToFile(token, format, products);
    } catch (err: any) {
      alert(err.message || 'Error al exportar');
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
        className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        <span>📤</span>
        <span>{exporting ? 'Generando...' : 'Exportar'}</span>
        <span className="text-[10px] text-slate-400">▼</span>
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl z-50 animate-fadeIn space-y-1 text-xs">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-100">
              Formato de Exportación
            </div>

            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left font-bold text-slate-800 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer"
            >
              <span className="text-base">📗</span>
              <div>
                <p className="leading-tight">Excel (.xlsx)</p>
                <p className="text-[10px] font-normal text-slate-400">Hoja de cálculo completa</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-800 transition cursor-pointer"
            >
              <span className="text-base">📄</span>
              <div>
                <p className="leading-tight">CSV (.csv)</p>
                <p className="text-[10px] font-normal text-slate-400">Valores separados por coma UTF-8</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleExport('json')}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left font-bold text-slate-800 hover:bg-amber-50 hover:text-amber-800 transition cursor-pointer"
            >
              <span className="text-base">📦</span>
              <div>
                <p className="leading-tight">JSON (.json)</p>
                <p className="text-[10px] font-normal text-slate-400">Estructura cruda para integración</p>
              </div>
            </button>

            {products.length > 0 && (
              <div className="px-3 py-1 text-[10px] text-slate-400 border-t border-slate-100 mt-1">
                Total a exportar: <strong>{products.length}</strong> productos
                {currentSearch ? ` (filtrados)` : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
