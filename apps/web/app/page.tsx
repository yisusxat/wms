'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { insforge } from '../lib/insforge';
import { apiFetch, CurrentUser, InventoryItem, Location, Page, Product } from '../lib/api';
import { MovementsPanel } from './components/MovementsPanel';
import { Warehouse3D } from './components/Warehouse3D';
import { Warehouse2D } from './components/Warehouse2D';
import { WarehouseMappingView } from './components/WarehouseMappingView';
import { TeamPanel } from './components/TeamPanel';
import { SupportModal } from './components/SupportModal';
import { ForgotPasswordModal } from './components/ForgotPasswordModal';
import { AuditLogsModal } from './components/AuditLogsModal';
import { LegalModal } from './components/LegalModal';
import KPIPanel from './components/KPIPanel';
import ReportsPanel from './components/ReportsPanel';
import { TwoFactorModal } from './components/TwoFactorModal';
import { ProductsPanel } from './components/ProductsPanel';

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
  | 'mapping'
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
  { id: 'mapping', label: 'Mapeo Almacén', icon: '🔍' },
];

function isTokenValid(jwt: string): boolean {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return true;
    return payload.exp * 1000 > Date.now() + 15000;
  } catch {
    return false;
  }
}

function getEmailFromJwt(jwt: string): string {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return '';
    const payload = JSON.parse(atob(parts[1]));
    return payload.email ?? '';
  } catch {
    return '';
  }
}

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<{ email?: string; id?: string } | null>(null);
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  // Restore active tab from localStorage so page reload preserves the current section
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wms_active_tab') as Tab;
        if (saved && baseTabs.some(t => t.id === saved)) {
          return saved;
        }
      } catch {}
    }
    return 'dashboard';
  });

  const changeTab = useCallback((newTab: Tab) => {
    setTab(newTab);
    try {
      localStorage.setItem('wms_active_tab', newTab);
    } catch {}
  }, []);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [mappingInitialLocation, setMappingInitialLocation] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // 1. Restore remembered credentials for login form if previously saved
    try {
      const savedCreds = localStorage.getItem('wms_remembered_credentials');
      if (savedCreds) {
        const parsed = JSON.parse(savedCreds);
        if (parsed?.email) setEmail(parsed.email);
        if (parsed?.password) setPassword(parsed.password);
        setRememberPassword(true);
      }
    } catch {}

    // 2. Restore active session across page reloads (F5)
    void (async () => {
      try {
        const savedSessionRaw = localStorage.getItem('wms_auth_session');
        if (savedSessionRaw) {
          try {
            const savedSession = JSON.parse(savedSessionRaw);
            const tokenStr = savedSession?.accessToken;
            if (tokenStr && isTokenValid(tokenStr)) {
              insforge.setAccessToken(tokenStr);
              if (!active) return;
              setToken(tokenStr);
              setUser(savedSession.user ?? { email: getEmailFromJwt(tokenStr) });
              setLoading(false);
              return;
            }
          } catch {}
        }

        // Fallback: Check if InsForge has an active session cookie or can refresh
        const { data } = await insforge.auth.getCurrentUser().catch(() => ({ data: null }));
        if (!active) return;
        if (data?.user) {
          const { data: session } = await insforge.auth.refreshSession().catch(() => ({ data: null }));
          if (session?.accessToken) {
            insforge.setAccessToken(session.accessToken);
            if (!active) return;
            setToken(session.accessToken);
            const userObj = { email: data.user.email, id: data.user.id };
            setUser(userObj);
            try {
              localStorage.setItem('wms_auth_session', JSON.stringify({
                accessToken: session.accessToken,
                user: userObj,
              }));
            } catch {}
            setLoading(false);
            return;
          }
        }

        // Not authenticated
        try {
          localStorage.removeItem('wms_auth_session');
        } catch {}
        if (active) setLoading(false);
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
      .catch((e: Error) => {
        if (e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('jwt expired')) {
          signOut();
        } else {
          setError(e.message);
        }
      });
  }, [token]);

  const [dataVersion, setDataVersion] = useState(0);

  // Shared callback — passed to all mutating panels so Dashboard summary stays fresh
  const refreshSummary = useCallback(() => {
    if (!token) return;
    setDataVersion((v) => v + 1);
    apiFetch<Summary>('/dashboard/summary', token)
      .then(setSummary)
      .catch(() => {/* silent — do not replace visible error for a background refresh */});
  }, [token]);

  // User permissions and tab visibility (Hooks must be called unconditionally at top level)
  const userPerms = profile?.permissions as any;


  const isTabVisible = useCallback(
    (tabId: Tab): boolean => {
      if (profile?.role === 'ADMIN') return true;
      if (!userPerms || typeof userPerms !== 'object' || Object.keys(userPerms).length === 0) return true;

      switch (tabId) {
        case 'dashboard':
          return userPerms.canViewDashboard ?? true;
        case 'kpis':
          return userPerms.canViewKpis ?? false;
        case 'reports':
          return userPerms.canViewReports ?? false;
        case 'products':
          return userPerms.canViewProducts ?? true;
        case 'locations':
          return userPerms.canViewLocations ?? true;
        case 'inventory':
          return userPerms.canViewInventory ?? true;
        case 'movements':
          return userPerms.canViewMovements ?? true;
        case 'warehouse3d':
          return userPerms.canView3D ?? true;
        case 'warehouse2d':
          return userPerms.canView2D ?? true;
        case 'mapping':
          return userPerms.canViewMapping ?? true;
        case 'team':
          return userPerms.canManageTeam ?? false;
        default:
          return true;
      }
    },
    [profile?.role, userPerms],
  );

  const visibleTabs = useMemo(() => {
    return [
      ...baseTabs,
      ...(profile?.role === 'ADMIN' || userPerms?.canManageTeam
        ? [{ id: 'team' as Tab, label: 'Equipo', icon: '👥' }]
        : []),
    ].filter((t) => isTabVisible(t.id));
  }, [profile?.role, userPerms, isTabVisible]);

  // Fallback to first available tab if current tab is restricted
  useEffect(() => {
    if (token && visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) {
      changeTab(visibleTabs[0].id);
    }
  }, [token, visibleTabs, tab, changeTab]);

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
    const userObj = { email: data.user.email, id: data.user.id };
    setUser(userObj);

    // Save active session in localStorage so F5 / refresh stays logged in
    try {
      localStorage.setItem('wms_auth_session', JSON.stringify({
        accessToken: data.accessToken,
        user: userObj,
      }));
    } catch {}

    // Save or clear remembered credentials
    try {
      if (rememberPassword) {
        localStorage.setItem('wms_remembered_credentials', JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem('wms_remembered_credentials');
      }
    } catch {}
  }

  async function signOut() {
    try {
      await insforge.auth.signOut().catch(() => {});
    } catch {}
    insforge.setAccessToken(null);
    setToken(null);
    setUser(null);
    setProfile(null);
    setSummary(null);
    try {
      localStorage.removeItem('wms_auth_session');
      localStorage.removeItem('wms_active_tab');
      // Do NOT clear wms_remembered_credentials so user's password stays remembered if checked
    } catch {}
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
            <div className="flex items-center gap-2">
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold tracking-wider text-blue-800">WMS</span>
              <p className="text-sm font-semibold uppercase tracking-widest text-brand">Logística</p>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Iniciar sesión</h1>

            <label className="block text-sm font-medium text-slate-700">
              Correo electrónico
              <input
                name="email"
                autoComplete="username"
                className="mt-1.5 w-full rounded-lg border p-3 outline-blue-600 focus:ring-2 focus:ring-blue-500"
                type="email"
                required
                placeholder="usuario@bodega.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Contraseña
              <div className="relative mt-1.5">
                <input
                  name="password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border p-3 pr-10 outline-blue-600 focus:ring-2 focus:ring-blue-500"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 text-sm cursor-pointer select-none"
                  tabIndex={-1}
                  title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Recordar contraseña</span>
              </label>

              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p>}

            <button className="w-full rounded-lg bg-brand p-3 font-semibold text-white transition hover:bg-blue-800 cursor-pointer shadow-sm">
              Entrar al Sistema
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
                  changeTab(item.id);
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
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">{visibleTabs.find(item => item.id === tab)?.label ?? 'Dashboard'}</h1>
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
              onClick={() => setTwoFactorOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-900 transition hover:bg-purple-100 shadow-xs"
              title="Configurar 2FA"
            >
              🔐 2FA / TOTP
            </button>
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
          {tab === 'dashboard' && <Dashboard summary={summary} onNavigate={changeTab} role={profile?.role} />}
          {tab === 'kpis' && <KPIPanel token={token} organizationId={profile?.organizationId} refreshKey={dataVersion} />}
          {tab === 'reports' && <ReportsPanel token={token} organizationId={profile?.organizationId} onDataChanged={refreshSummary} />}
          {tab === 'products' && <ProductsPanel token={token} role={profile?.role} onError={setError} onDataChanged={refreshSummary} />}
          {tab === 'locations' && <Locations token={token} onError={setError} refreshKey={dataVersion} />}
          {tab === 'inventory' && <Inventory token={token} onError={setError} refreshKey={dataVersion} />}
          {tab === 'movements' && <MovementsPanel token={token} role={profile?.role} onError={setError} onDataChanged={refreshSummary} refreshKey={dataVersion} />}
          {tab === 'warehouse3d' && <Warehouse3D token={token} onError={setError} />}
          {tab === 'warehouse2d' && (
            <Warehouse2D
              token={token}
              onError={setError}
              onDataChanged={refreshSummary}
              refreshKey={dataVersion}
              onNavigate={(nextTab, locCode) => {
                if (nextTab === 'mapping') {
                  if (locCode) setMappingInitialLocation(locCode);
                  changeTab('mapping');
                } else {
                  changeTab(nextTab as Tab);
                }
              }}
            />
          )}
          {tab === 'mapping' && (
            <WarehouseMappingView
              token={token}
              onError={setError}
              initialLocationCode={mappingInitialLocation}
              onNavigate={(nextTab) => changeTab(nextTab as Tab)}
              onDataChanged={refreshSummary}
            />
          )}
          {tab === 'team' && (profile?.role === 'ADMIN' || userPerms?.canManageTeam) && (
            <TeamPanel token={token} onError={setError} />
          )}
        </div>
      </section>

      {/* Modals */}
      <SupportModal isOpen={supportOpen} onClose={() => setSupportOpen(false)} user={user} profile={profile} />
      <AuditLogsModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} token={token} />
      <LegalModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} token={token} onAnonymized={signOut} />
      <TwoFactorModal isOpen={twoFactorOpen} onClose={() => setTwoFactorOpen(false)} userEmail={user?.email} />
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


function Locations({ token, onError, refreshKey }: { token: string; onError: (value: string) => void; refreshKey?: number }) {
  const [data, setData] = useState<Page<Location> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<Page<Location>>('/locations?pageSize=100', token)
      .then(setData)
      .catch((e: Error) => onError(e.message))
      .finally(() => setLoading(false));
  }, [token, onError]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Ubicaciones del Almacén</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs flex items-center gap-1.5"
        >
          <span>{loading ? '⏳' : '🔄'}</span>
          <span>Actualizar</span>
        </button>
      </div>
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        <Table headers={['Código', 'Nivel', 'Posición', 'Estado']} rows={(data?.items ?? []).map(item => [item.code, item.level, item.position, item.status])} />
      </div>
    </div>
  );
}

function Inventory({ token, onError, refreshKey }: { token: string; onError: (value: string) => void; refreshKey?: number }) {
  const [data, setData] = useState<Page<InventoryItem> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<Page<InventoryItem>>('/inventory?pageSize=100', token)
      .then(setData)
      .catch((e: Error) => onError(e.message))
      .finally(() => setLoading(false));
  }, [token, onError]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Inventario Consolidado</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs flex items-center gap-1.5"
        >
          <span>{loading ? '⏳' : '🔄'}</span>
          <span>Actualizar</span>
        </button>
      </div>
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        <Table headers={['SKU', 'Producto', 'Ubicación', 'Cantidad', 'Reservado']} rows={(data?.items ?? []).map(item => [item.product?.sku ?? 'N/A', item.product?.name ?? 'N/A', item.location?.code ?? 'N/A', item.quantity, item.reservedQuantity])} />
      </div>
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
