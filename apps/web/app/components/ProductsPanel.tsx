'use client';

import { useState, useEffect, useMemo, FormEvent } from 'react';
import { apiFetch, CurrentUser, Page, Product } from '../../lib/api';
import { ProductImportModal, ProductExportMenu } from './ProductImportExportModal';

interface ProductsPanelProps {
  token: string;
  role?: CurrentUser['role'];
  onError: (value: string) => void;
}

export function ProductsPanel({ token, role, onError }: ProductsPanelProps) {
  const [data, setData] = useState<Page<Product> | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Form for creating a new product
  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    unit: 'unidad',
    barcode: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Editing existing product modal/inline
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    category: '',
    unit: 'unidad',
    active: true,
    barcode: '',
  });

  const canManage = role !== 'VIEWER';

  // Load paginated products with search query
  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<Page<Product>>(
        `/products?search=${encodeURIComponent(search)}&page=${page}&pageSize=20`,
        token
      );
      setData(res);

      // Also refresh all products list for category pill calculation and export
      const allRes = await apiFetch<{ items?: Product[] }>('/products?pageSize=100', token).catch(() => ({ items: [] }));
      if (allRes && Array.isArray(allRes.items)) {
        setAllProducts(allRes.items);
      }
    } catch (e: any) {
      onError(e.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  // Extract all unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    }
    return Array.from(set).sort();
  }, [allProducts]);

  // Filter items in current view by category and status
  const displayedItems = useMemo(() => {
    let items = data?.items ?? [];
    if (selectedCategory !== 'ALL') {
      items = items.filter((p) => (p.category || 'General') === selectedCategory);
    }
    if (selectedStatus === 'ACTIVE') {
      items = items.filter((p) => p.active);
    } else if (selectedStatus === 'INACTIVE') {
      items = items.filter((p) => !p.active);
    }
    return items;
  }, [data, selectedCategory, selectedStatus]);

  // Handle product creation
  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/products', token, {
        method: 'POST',
        body: JSON.stringify({
          sku: form.sku.trim(),
          name: form.name.trim(),
          category: form.category.trim() || 'General',
          unit: form.unit.trim() || 'unidad',
          barcode: form.barcode.trim() || undefined,
          description: form.description.trim() || undefined,
          active: true,
        }),
      });
      setForm({ sku: '', name: '', category: '', unit: 'unidad', barcode: '', description: '' });
      setShowAddForm(false);
      await load();
    } catch (e: any) {
      onError(e.message || 'Error al crear producto');
    } finally {
      setSubmitting(false);
    }
  }

  // Handle product edit save
  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    setSubmitting(true);
    try {
      await apiFetch('/products', token, {
        method: 'PATCH',
        body: JSON.stringify({
          id: editingProduct.id,
          sku: editingProduct.sku,
          name: editForm.name.trim(),
          category: editForm.category.trim() || 'General',
          unit: editForm.unit.trim() || 'unidad',
          active: editForm.active,
          barcode: editForm.barcode.trim() || undefined,
        }),
      });
      setEditingProduct(null);
      await load();
    } catch (e: any) {
      onError(e.message || 'Error al actualizar producto');
    } finally {
      setSubmitting(false);
    }
  }

  // Handle quick active toggle
  async function handleToggleActive(p: Product) {
    if (!canManage) return;
    try {
      await apiFetch('/products', token, {
        method: 'PATCH',
        body: JSON.stringify({
          id: p.id,
          active: !p.active,
        }),
      });
      await load();
    } catch (e: any) {
      onError(e.message || 'Error al cambiar estado');
    }
  }

  return (
    <section className="space-y-6">
      {/* Header and Quick Stats */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-3xl bg-slate-900 text-white p-6 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-2xl font-bold">
            📦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black tracking-tight">Catálogo de Productos</h2>
              <span className="rounded-full bg-indigo-500/30 border border-indigo-400/40 px-2.5 py-0.5 text-[11px] font-bold text-indigo-200">
                WMS Inventory
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestiona SKUs, nombres, categorías, unidades de medida e importación/exportación masiva.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
            title="Importar productos masivamente desde Excel, CSV o JSON"
          >
            <span className="text-sm">📥</span>
            <span>Importar (Excel / CSV / JSON)</span>
          </button>

          <ProductExportMenu
            token={token}
            products={allProducts.length > 0 ? allProducts : (data?.items ?? [])}
            currentSearch={search}
          />

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <span>{showAddForm ? '✕ Cerrar' : '➕ Nuevo Producto'}</span>
          </button>
        </div>
      </div>

      {/* New Product Form (Collapsible) */}
      {canManage && showAddForm && (
        <form
          onSubmit={submitCreate}
          className="rounded-3xl bg-white p-6 shadow-md border-2 border-indigo-100 space-y-4 animate-fadeIn"
        >
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <h3 className="font-bold text-sm text-slate-800">Registrar Nuevo Producto</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              ✕ Cancelar
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                SKU / Código Único *
              </label>
              <input
                required
                placeholder="Ej: ALM-ARR-001"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold focus:border-indigo-600 focus:outline-none"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nombre del Producto *
              </label>
              <input
                required
                placeholder="Ej: Arroz Diana Especial 1kg"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold focus:border-indigo-600 focus:outline-none"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Categoría
              </label>
              <input
                placeholder="Ej: Granos, Lácteos, Aseo..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-indigo-600 focus:outline-none"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Unidad de Medida
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs bg-white focus:border-indigo-600 focus:outline-none font-semibold"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                <option value="unidad">unidad (u)</option>
                <option value="kg">kilogramo (kg)</option>
                <option value="litro">litro (L)</option>
                <option value="caja">caja</option>
                <option value="paquete">paquete</option>
                <option value="pallet">pallet</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Código de Barras (Opcional)
              </label>
              <input
                placeholder="EAN / UPC / Barra"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono focus:border-indigo-600 focus:outline-none"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Descripción / Notas
              </label>
              <input
                placeholder="Detalle adicional del producto..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-indigo-600 focus:outline-none"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-indigo-600 px-6 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm transition disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? 'Guardando...' : 'Crear Producto'}
            </button>
          </div>
        </form>
      )}

      {/* Search, Filter Bar and Table */}
      <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-100 space-y-4">
        {/* Filters Row */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Box */}
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-3 text-slate-400 text-xs">🔍</span>
              <input
                placeholder="Buscar por SKU, nombre del producto o categoría..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-2.5 pl-9 pr-4 text-xs font-semibold focus:bg-white focus:border-indigo-600 focus:outline-none shadow-2xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(1), void load())}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setPage(1);
                    void load();
                  }}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setPage(1);
                void load();
              }}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
            >
              Buscar
            </button>
          </div>

          {/* Category and Status Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">Todas las Categorías ({allProducts.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="ACTIVE">Solo Activos</option>
              <option value="INACTIVE">Solo Inactivos</option>
            </select>
          </div>
        </div>

        {/* Products Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="p-3.5">SKU</th>
                <th className="p-3.5">Nombre del Producto</th>
                <th className="p-3.5">Categoría</th>
                <th className="p-3.5">Unidad</th>
                <th className="p-3.5">Estado</th>
                {canManage && <th className="p-3.5 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                      <span>Cargando catálogo de productos...</span>
                    </div>
                  </td>
                </tr>
              ) : displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="p-8 text-center text-slate-400">
                    <div className="space-y-2">
                      <span className="text-3xl">📭</span>
                      <p className="font-bold text-slate-700">No se encontraron productos</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {search
                          ? `No se encontraron coincidencias para "${search}". Prueba ajustando tu búsqueda o limpiando los filtros.`
                          : 'Aún no hay productos registrados en el catálogo de tu bodega.'}
                      </p>
                      <div className="pt-3 flex flex-wrap justify-center items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setImportModalOpen(true)}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <span>📥</span>
                          <span>Importar Productos (Excel / CSV / JSON)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddForm(true)}
                          className="rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <span>➕</span>
                          <span>Registrar Nuevo Producto</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <span className="rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-1 font-mono font-bold text-indigo-800 text-[11px]">
                        {item.sku}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      {item.barcode && (
                        <p className="text-[10px] font-mono text-slate-400">
                          Barra: {item.barcode}
                        </p>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        {item.category || 'General'}
                      </span>
                    </td>
                    <td className="p-3.5 font-medium text-slate-600">{item.unit || 'unidad'}</td>
                    <td className="p-3.5">
                      {item.active ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Inactivo
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(item);
                              setEditForm({
                                name: item.name,
                                category: item.category || 'General',
                                unit: item.unit || 'unidad',
                                active: item.active,
                                barcode: item.barcode || '',
                              });
                            }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 transition"
                            title="Editar producto"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(item)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 transition text-[11px]"
                            title={item.active ? 'Desactivar producto' : 'Activar producto'}
                          >
                            {item.active ? '⏸️' : '▶️'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pager Pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              Mostrando {displayedItems.length} de {data.total} productos
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border px-2.5 py-1 text-xs font-bold hover:bg-slate-50 disabled:opacity-40"
              >
                ◀ Ant
              </button>
              <span className="px-2 font-bold text-slate-800">
                Pág. {page} / {Math.max(1, Math.ceil(data.total / (data.pageSize || 20)))}
              </span>
              <button
                disabled={page >= Math.ceil(data.total / (data.pageSize || 20))}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border px-2.5 py-1 text-xs font-bold hover:bg-slate-50 disabled:opacity-40"
              >
                Sig ▶
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingProduct(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn"
        >
          <form
            onSubmit={submitEdit}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Editar Producto
                </span>
                <h3 className="font-mono font-black text-indigo-950 text-base">
                  [{editingProduct.sku}]
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Categoría</label>
                <input
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unidad</label>
                  <input
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Código de Barras</label>
                  <input
                    value={editForm.barcode}
                    onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2 font-mono"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                    className="h-4 w-4 rounded text-indigo-600"
                  />
                  <span>Producto Activo en Catálogo</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                {submitting ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product Import Modal */}
      <ProductImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        token={token}
        onSuccess={() => void load()}
      />
    </section>
  );
}
