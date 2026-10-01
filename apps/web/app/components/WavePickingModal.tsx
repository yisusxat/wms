'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Layers, Package, MapPin, CheckCircle2, AlertTriangle,
  ChevronRight, X, Plus, Loader2, ClipboardList, Zap
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useToast } from './Toast';

interface OrderLine {
  id: string;
  productId: string;
  quantity: number;
  pickedQty: number;
  product: { sku: string; name: string };
}

interface Order {
  id: string;
  reference: string;
  status: string;
  priority: number;
  lines: OrderLine[];
}

interface RouteItem {
  step: number;
  locationCode: string;
  aisle: string;
  rack: string;
  level: number;
  position: number;
  sku: string;
  productName: string;
  requestedQuantity: number;
  orderBreakdown: { orderId: string; ref: string; qty: number }[];
}

interface Wave {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

interface WavePickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

type Step = 'orders' | 'route' | 'summary';

export function WavePickingModal({ isOpen, onClose, token }: WavePickingModalProps) {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('orders');
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [route, setRoute] = useState<RouteItem[]>([]);
  const [wave, setWave] = useState<Wave | null>(null);
  const [currentRouteStep, setCurrentRouteStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Cargar órdenes pendientes
  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Order[]>('/waves/orders?status=PENDING', token);
      setPendingOrders(Array.isArray(data) ? data : []);
    } catch {
      showToast({ message: 'Error al cargar las órdenes pendientes.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    if (isOpen) {
      setStep('orders');
      setSelectedOrderIds(new Set());
      setRoute([]);
      setWave(null);
      setCurrentRouteStep(0);
      setCompletedSteps(new Set());
      loadOrders();
    }
  }, [isOpen, loadOrders]);

  const toggleOrder = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startWave = async () => {
    if (selectedOrderIds.size === 0) {
      showToast({ message: 'Selecciona al menos una orden para crear la ola.', type: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ wave: Wave; consolidatedRoute: RouteItem[] }>(
        '/waves',
        token,
        {
          method: 'POST',
          body: JSON.stringify({ orderIds: Array.from(selectedOrderIds) }),
        },
      );
      setWave(result.wave);
      setRoute(result.consolidatedRoute ?? []);
      setStep('route');
    } catch (err: any) {
      showToast({ message: err?.message ?? 'Error al crear la ola de picking.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const confirmStep = async () => {
    const item = route[currentRouteStep];
    if (!item) return;

    setCompletedSteps((prev) => new Set([...prev, currentRouteStep]));

    if (currentRouteStep < route.length - 1) {
      setCurrentRouteStep((prev) => prev + 1);
    } else {
      setStep('summary');
    }
  };

  const closeWave = async () => {
    if (!wave) return;
    setLoading(true);
    try {
      await apiFetch(`/waves/${wave.id}/close`, token, { method: 'PATCH' });
      showToast({
        message: `Ola ${wave.name} cerrada exitosamente. ${selectedOrderIds.size} órdenes completadas.`,
        type: 'success',
      });
      onClose();
    } catch (err: any) {
      showToast({ message: err?.message ?? 'Error al cerrar la ola.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const progressPct = route.length > 0
    ? Math.round((completedSteps.size / route.length) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wave-picking-title"
    >
      <div className="flex max-h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-xl dark:bg-slate-900">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/40">
              <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 id="wave-picking-title" className="text-sm font-bold text-slate-900 dark:text-white">
                {wave ? wave.name : 'Ola de Picking Multi-Pedido'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {step === 'orders' && `${pendingOrders.length} órdenes pendientes`}
                {step === 'route'  && `Paso ${currentRouteStep + 1} de ${route.length}`}
                {step === 'summary' && 'Recolección completada'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-0 border-b border-slate-100 px-5 dark:border-slate-800">
          {(['orders', 'route', 'summary'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`flex items-center gap-1.5 py-2.5 text-xs font-medium transition ${
                step === s
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 dark:text-slate-600'
              }`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                  step === s
                    ? 'bg-indigo-600 text-white'
                    : completedSteps.size > 0 && i < (['orders','route','summary'] as Step[]).indexOf(step)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>{i + 1}</span>
                <span className="hidden sm:inline">
                  {s === 'orders' ? 'Pedidos' : s === 'route' ? 'Ruta' : 'Resumen'}
                </span>
              </div>
              {i < 2 && <ChevronRight className="mx-1.5 h-3 w-3 text-slate-300 dark:text-slate-700" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* PASO 1: Selección de órdenes */}
          {step === 'orders' && (
            <div className="p-4 space-y-3">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              )}
              {!loading && pendingOrders.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
                  <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    No hay órdenes pendientes
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Las órdenes en estado PENDIENTE aparecerán aquí.
                  </p>
                </div>
              )}
              {!loading && pendingOrders.map((order) => {
                const selected = selectedOrderIds.has(order.id);
                const totalItems = order.lines.reduce((s, l) => s + l.quantity, 0);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => toggleOrder(order.id)}
                    className={`w-full rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">
                          {order.reference}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {order.lines.length} SKU·s · {totalItems} unidades
                          {' · '}
                          <span className={`font-semibold ${
                            order.priority <= 2
                              ? 'text-red-600 dark:text-red-400'
                              : order.priority <= 4
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}>
                            Prioridad {order.priority}
                          </span>
                        </p>
                      </div>
                      <div className={`mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 transition ${
                        selected
                          ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {selected && <CheckCircle2 className="h-4 w-4 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* PASO 2: Ruta de recolección */}
          {step === 'route' && route.length > 0 && (() => {
            const item = route[currentRouteStep];
            return (
              <div className="p-4 space-y-4">
                {/* Barra de progreso */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Progreso de la ola
                    </span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {progressPct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Parada actual */}
                <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xl font-black tracking-wider text-indigo-700 dark:text-indigo-300">
                        {item.locationCode}
                      </span>
                    </div>
                    <span className="rounded-lg bg-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300">
                      Paso {currentRouteStep + 1}/{route.length}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
                    Pasillo {item.aisle} · Rack {item.rack} · Nivel {item.level} · Pos. {item.position}
                  </p>

                  <div className="mt-3 rounded-lg bg-white p-3 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-slate-500" />
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">{item.sku}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.productName}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Total a recolectar:</span>
                      <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">
                        {item.requestedQuantity} uds.
                      </span>
                    </div>
                  </div>

                  {/* Desglose por orden */}
                  {item.orderBreakdown && item.orderBreakdown.length > 1 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        Distribuir en gavetas:
                      </p>
                      {item.orderBreakdown.map((ob, i) => (
                        <div key={ob.orderId} className="flex items-center justify-between rounded-lg bg-white/70 px-2.5 py-1.5 dark:bg-slate-900/70">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Gaveta {i + 1}: {ob.ref}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-white">
                            {ob.qty} uds.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Próxima parada */}
                {currentRouteStep < route.length - 1 && (
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Próxima parada:
                    </p>
                    <p className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200">
                      {route[currentRouteStep + 1].locationCode}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {route[currentRouteStep + 1].sku}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* PASO 3: Resumen */}
          {step === 'summary' && (
            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-500" />
                <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                  Recolección completada
                </p>
                <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                  {route.length} paradas · {selectedOrderIds.size} órdenes
                </p>
              </div>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Cierra la ola para marcar todas las órdenes como empacadas.
              </p>
            </div>
          )}
        </div>

        {/* Footer con acción principal */}
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          {step === 'orders' && (
            <button
              onClick={startWave}
              disabled={selectedOrderIds.size === 0 || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Crear Ola con {selectedOrderIds.size} pedido{selectedOrderIds.size !== 1 ? 's' : ''}
            </button>
          )}
          {step === 'route' && (
            <button
              onClick={confirmStep}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              <CheckCircle2 className="h-4 w-4" />
              {currentRouteStep < route.length - 1 ? 'Confirmar y siguiente' : 'Finalizar recolección'}
            </button>
          )}
          {step === 'summary' && (
            <button
              onClick={closeWave}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Cerrar Ola y Completar Órdenes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
