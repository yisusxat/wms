'use client';

import { FormEvent, useEffect, useState } from 'react';
import { insforge } from '../lib/insforge';
import { apiFetch, CurrentUser, InventoryItem, Location, Page, Product } from '../lib/api';
import { MovementsPanel } from './components/MovementsPanel';
import { Warehouse3D } from './components/Warehouse3D';
import { Warehouse2D } from './components/Warehouse2D';
import { TeamPanel } from './components/TeamPanel';
import { SupportModal } from './components/SupportModal';
import { ForgotPasswordModal } from './components/ForgotPasswordModal';
import { AuditLogsModal } from './components/AuditLogsModal';
import { LegalModal } from './components/LegalModal';
import KPIPanel from './components/KPIPanel';
import ReportsPanel from './components/ReportsPanel';

type Summary = {
  products: number;
  locations: number;
  occupiedLocations: number;
  availableLocations: number;
  totalUnits: number;
  entriesToday: number;
  issuesToday: number;
};

type Tab =
  | 'dashboard'
  | 'kpis'
  | 'reports'
  | 'products'
  | 'locations'
  | 'inventory'
  | 'movements'
  | 'warehouse3d'
  | 'warehouse2d'
  | 'team';

const baseTabs: { id: Tab; label: string; icon?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'kpis', label: 'Centro de Mando', icon: '🎯' },
  { id: 'reports', label: 'Reportes', icon: '📑' },
  { id: 'products', label: 'Productos', icon: '📦' },
  { id: 'locations', label: 'Ubicaciones', icon: '📍' },
  { id: 'inventory', label: 'Inventario', icon: '🗂️' },
  { id: 'movements', label: 'Movimientos', icon: '🔄' },
  { id: 'warehouse3d', label: 'Vista 3D', icon: '🧊' },
  { id: 'warehouse2d', label: 'Vista 2D', icon: '🗺️' },
];

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error: userError } = await insforge.auth.getCurrentUser();
        if (!active) return;
        if (userError || !data?.user) {
          setLoading(false);
          return;
        }
        const { data: session, error: refreshError } = await insforge.auth.refreshSession();
        if (!active) return;
        if (refreshError || !session?.accessToken) {
          setUser(null);
          setLoading(false);
          return;
        }
        insforge.setAccessToken(session.accessToken);
        setToken(session.accessToken);
        setUser({ email: data.user.email });
        setLoading(false);
      } catch {
        if (active) setLoading(false);
      }
    })();
    const unsubscribe = insforge.auth.onAuthStateChange(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      apiFetch<Summary>('/dashboard/summary', token),
      apiFetch<CurrentUser>('/auth/me', token),
    ])
      .then(([nextSummary, nextProfile]) => {
        setSummary(nextSummary);
        setProfile(nextProfile);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const { data, error: authError } = await insforge.auth.signInWithPassword({ email, password });
    if (authError || !data?.user || !data.accessToken) {
      setError(authError?.message ?? 'No fue posible iniciar sesión');
      return;
    }
    insforge.setAccessToken(data.accessToken);
    setToken(data.accessToken);
    setUser({ email: data.user.email });
  }

  async function signOut() {
    await insforge.auth.signOut();
    insforge.setAccessToken(null);
    setToken(null);
    setUser(null);
    setProfile(null);
    setSummary(null);
  }

  async function revokeAll() {
    if (!confirm('¿Cerrar sesión en todos los dispositivos activos?')) return;
    if (token) {
      await apiFetch('/auth/revoke-all', token, { method: 'POST' }).catch(() => null);
    }
    await signOut();
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <span className="text-sm font-medium">Cargando WMS…</span>
        </div>
      </main>
    );
  }

  if (!user || !token) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="w-full max-w-md space-y-4">
          <form onSubmit={signIn} className="rounded-2xl bg-white p-8 shadow-sm border border-slate-100 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">WMS</p>
            <h1 className="text-3xl font-bold text-slate-900">Iniciar sesión</h1>
            <label className="block text-sm font-medium">
              Correo
              <input
                className="mt-1.5 w-full rounded-lg border p-3 outline-blue-600"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Contraseña
              <input
                className="mt-1.5 w-full rounded-lg border p-3 outline-blue-600"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p>}
            <button className="w-full rounded-lg bg-brand p-3 font-semibold text-white transition hover:bg-blue-800">
              Entrar
            </button>
          </form>

          <div className="text-center">
            <button
              onClick={() => setLegalOpen(true)}
              className="text-xs text-slate-400 hover:text-slate-600 transition"
            >
              ⚖️ Términos de Servicio · SLA · Privacidad & RGPD
            </button>
          </div>
        </div>

        <ForgotPasswordModal isOpen={forgotOpen} onClose={() => setForgotOpen(false)} />
        <LegalModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} />
      </main>
    );
  }

  const visibleTabs = profile?.role === 'ADMIN'
    ? [...baseTabs, { id: 'team' as Tab, label: 'Equipo', icon: '👥' }]
    : baseTabs;

  return (
    <div className="min-h-screen lg:flex bg-slate-50">
      {/* Mobile Top Navigation Bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-[#1E3A8A] px-4 py-3 text-white shadow-md">
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/20 px-2 py-0.5 text-xs font-bold tracking-wider">WMS</span>
          <span className="text-sm font-semibold tracking-wide text-blue-100">Logística</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition"
          aria-label="Abrir menú"
        >
          {mobileMenuOpen ? '✕ Cerrar' : '☰ Menú'}
        </button>
      </div>

      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Responsive Sidebar (Mobile Drawer + Desktop Sticky) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#1E3A8A] p-6 text-white flex flex-col justify-between overflow-y-auto transform transition-transform duration-300 ease-in-out lg:static lg:h-screen lg:w-64 lg:sticky lg:top-0 lg:translate-x-0 shrink-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded bg-white/20 px-2 py-0.5 text-xs font-bold tracking-wider">WMS</span>
              <span className="text-sm font-semibold uppercase tracking-widest text-blue-100">Logística</span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden rounded-lg p-1 text-blue-200 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs text-blue-200">Operaciones de bodega</p>
          <nav className="mt-8 space-y-1">
            {visibleTabs.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={"flex items-center gap-2.5 w-full rounded-lg px-3 py-2.5 text-left text-sm transition " + (tab === item.id ? "bg-white/20 font-semibold text-white shadow-xs" : "text-blue-100 hover:bg-white/10")}
              >
                {item.icon && <span className="text-base">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-blue-700/50 text-xs text-blue-200 space-y-3">
          <div>
            <p className="font-medium text-white truncate">{user.email}</p>
            <p className="text-[11px] capitalize text-blue-300">Rol: {profile?.role ?? 'Usuario'}</p>
          </div>
          <button
            onClick={() => {
              setLegalOpen(true);
              setMobileMenuOpen(false);
            }}
            className="text-[11px] text-blue-300 hover:text-white flex items-center gap-1 transition"
          >
            ⚖️ Términos, SLA y Privacidad
          </button>
        </div>
      </aside>

      <section className="flex-1 p-4 sm:p-6 lg:p-10 min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                🏢 Bodega Central
              </span>
              <span className="text-xs text-slate-400">· Multi-Tenant</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">{visibleTabs.find(item => item.id === tab)?.label}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {profile?.role === 'ADMIN' && (
              <button
                onClick={() => setAuditOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 transition hover:bg-indigo-100 shadow-xs"
                title="Ver bitácora de auditoría"
              >
                📜 Auditoría
              </button>
            )}
            <button
              onClick={() => setSupportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 shadow-xs"
              title="Reportar problema técnico"
            >
              <span className="text-amber-600 font-bold">⚠</span> Soporte
            </button>
            <button
              onClick={revokeAll}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition shadow-xs"
              title="Cerrar sesión en todos los dispositivos"
            >
              Cerrar en todos
            </button>
            <button
              onClick={signOut}
              className="rounded-lg border bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 shadow-xs"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p>}

        <div className="mt-8">
          {tab === 'dashboard' && <Dashboard summary={summary} onNavigate={setTab} role={profile?.role} />}
          {tab === 'kpis' && <KPIPanel token={token} organizationId={profile?.organizationId} />}
          {tab === 'reports' && <ReportsPanel token={token} organizationId={profile?.organizationId} />}
          {tab === 'products' && <Products token={token} role={profile?.role} onError={setError} />}
          {tab === 'locations' && <Locations token={token} onError={setError} />}
          {tab === 'inventory' && <Inventory token={token} onError={setError} />}
          {tab === 'movements' && <MovementsPanel token={token} role={profile?.role} onError={setError} />}
          {tab === 'warehouse3d' && <Warehouse3D token={token} onError={setError} />}
          {tab === 'warehouse2d' && <Warehouse2D token={token} onError={setError} />}
          {tab === 'team' && profile?.role === 'ADMIN' && <TeamPanel token={token} onError={setError} />}
        </div>
      </section>

      {/* Modals */}
      <SupportModal isOpen={supportOpen} onClose={() => setSupportOpen(false)} user={user} profile={profile} />
      <AuditLogsModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} token={token} />
      <LegalModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} token={token} onAnonymized={signOut} />
    </div>
  );
}

function Dashboard({
  summary,
  onNavigate,
  role,
}: {
  summary: Summary | null;
  onNavigate: (tab: Tab) => void;
  role?: CurrentUser['role'];
}) {
  const cards = summary
    ? [
        ['Productos', summary.products],
        ['Ubicaciones', summary.locations],
        ['Stock total', summary.totalUnits],
        ['Ocupadas', summary.occupiedLocations],
        ['Disponibles', summary.availableLocations],
        ['Entradas hoy', summary.entriesToday],
        ['Salidas hoy', summary.issuesToday],
      ]
    : [];

  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="space-y-6">
      {!dismissed && (
        <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50 to-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                🚀 Guía de Puesta en Marcha (Onboarding)
              </span>
              <h2 className="mt-2 text-lg font-bold text-gray-900">Bienvenido al Sistema WMS</h2>
              <p className="mt-1 text-sm text-gray-600">
                Sigue estos pasos esenciales para operar la bodega de forma eficiente y segura:
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-xs text-gray-400 hover:text-gray-600"
              title="Ocultar guía"
            >
              ✕ Ocultar
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col justify-between rounded-xl bg-white p-4 border border-blue-50 shadow-xs">
              <div>
                <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white font-bold">1</span>
                  Explorar Layout 2D/3D
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {summary ? summary.locations : 0} ubicaciones modeladas en racks A-F con pasillos y niveles.
                </p>
              </div>
              <button
                onClick={() => onNavigate('warehouse2d')}
                className="mt-3 text-left text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Abrir Vista 2D →
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white p-4 border border-blue-50 shadow-xs">
              <div>
                <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white font-bold">2</span>
                  Catálogo de Productos
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {summary?.products ? summary.products + " SKUs registrados." : 'Registra tus primeros artículos con SKU y unidad de medida.'}
                </p>
              </div>
              <button
                onClick={() => onNavigate('products')}
                className="mt-3 text-left text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Gestionar SKUs →
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white p-4 border border-blue-50 shadow-xs">
              <div>
                <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white font-bold">3</span>
                  {role === 'ADMIN' ? 'Gestión de Equipo' : 'Niveles de Acceso'}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {role === 'ADMIN'
                    ? 'Invita a supervisores y operarios asignando roles RBAC.'
                    : "Tu rol actual es " + (role || 'OPERATOR') + ". Operaciones auditadas."}
                </p>
              </div>
              {role === 'ADMIN' ? (
                <button
                  onClick={() => onNavigate('team')}
                  className="mt-3 text-left text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Panel de Equipo →
                </button>
              ) : (
                <span className="mt-3 text-xs text-emerald-600 font-medium">✓ Rol verificado</span>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-xl bg-white p-4 border border-blue-50 shadow-xs">
              <div>
                <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white font-bold">4</span>
                  Movimientos de Stock
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Registra entradas, salidas y transferencias guiadas entre ubicaciones.
                </p>
              </div>
              <button
                onClick={() => onNavigate('movements')}
                className="mt-3 text-left text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Registrar Movimiento →
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          </article>
        ))}
      </div>

      {!summary && <p className="mt-8 text-gray-500">Cargando indicadores…</p>}
    </div>
  );
}

function Products({ token, role, onError }: { token: string; role?: CurrentUser['role']; onError: (value: string) => void }) {
  const [data, setData] = useState<Page<Product> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ sku: '', name: '', unit: 'unidad' });
  const canManage = role === 'ADMIN' || role === 'SUPERVISOR';
  const load = () => apiFetch<Page<Product>>('/products?search=' + encodeURIComponent(search) + '&page=' + page + '&pageSize=20', token).then(setData).catch((e: Error) => onError(e.message));

  useEffect(() => {
    void load();
  }, [page]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/products', token, { method: 'POST', body: JSON.stringify(form) });
      setForm({ sku: '', name: '', unit: 'unidad' });
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <section className="space-y-5">
      {canManage ? (
        <form onSubmit={submit} className="grid gap-3 rounded-xl bg-white p-5 shadow-sm border border-slate-100 md:grid-cols-4">
          <input required placeholder="SKU" className="rounded-lg border p-3" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
          <input required placeholder="Nombre" className="rounded-lg border p-3" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input required placeholder="Unidad" className="rounded-lg border p-3" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
          <button className="rounded-lg bg-brand px-4 py-3 font-semibold text-white transition hover:bg-blue-800">Crear producto</button>
        </form>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Tu rol puede consultar productos, pero no crear ni modificar registros.</p>
      )}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="mb-4 flex gap-2">
          <input
            placeholder="Buscar por SKU o nombre"
            className="w-full rounded-lg border p-3"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (setPage(1), void load())}
          />
          <button onClick={() => { setPage(1); void load(); }} className="rounded-lg border px-4 font-medium hover:bg-slate-50">Buscar</button>
        </div>
        <Table headers={['SKU', 'Nombre', 'Unidad', 'Estado']} rows={(data?.items ?? []).map(item => [item.sku, item.name, item.unit, item.active ? 'Activo' : 'Inactivo'])} />
        <Pager page={page} pageSize={data?.pageSize ?? 20} total={data?.total ?? 0} onChange={setPage} />
      </div>
    </section>
  );
}

function Locations({ token, onError }: { token: string; onError: (value: string) => void }) {
  const [data, setData] = useState<Page<Location> | null>(null);
  useEffect(() => {
    void apiFetch<Page<Location>>('/locations?pageSize=100', token).then(setData).catch((e: Error) => onError(e.message));
  }, [token]);
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
      <Table headers={['Código', 'Nivel', 'Posición', 'Estado']} rows={(data?.items ?? []).map(item => [item.code, item.level, item.position, item.status])} />
    </div>
  );
}

function Inventory({ token, onError }: { token: string; onError: (value: string) => void }) {
  const [data, setData] = useState<Page<InventoryItem> | null>(null);
  useEffect(() => {
    void apiFetch<Page<InventoryItem>>('/inventory?pageSize=100', token).then(setData).catch((e: Error) => onError(e.message));
  }, [token]);
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
      <Table headers={['SKU', 'Producto', 'Ubicación', 'Cantidad', 'Reservado']} rows={(data?.items ?? []).map(item => [item.product.sku, item.product.name, item.location.code, item.quantity, item.reservedQuantity])} />
    </div>
  );
}

function Table({ headers, rows }: { headers: (string | number)[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-gray-500">
            {headers.map(header => (
              <th key={header} className="px-3 py-3 font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-gray-500">Sin registros</td></tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-b last:border-0 hover:bg-slate-50/50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
      <span>Página {page} de {pages} · {total} registros</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded border px-3 py-1 font-medium disabled:opacity-40">Anterior</button>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded border px-3 py-1 font-medium disabled:opacity-40">Siguiente</button>
      </div>
    </div>
  );
}
