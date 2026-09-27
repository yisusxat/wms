'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Boxes,
  Box,
  Check,
  Eye,
  EyeOff,
  FileBarChart,
  Gauge,
  Grid3x3,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  MapPin,
  Menu,
  Package,
  RefreshCw,
  Scale,
  ScanBarcode,
  ScanSearch,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
  Warehouse,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { insforge } from '../lib/insforge';
import dynamic from 'next/dynamic';
import { apiFetch, CurrentUser, InventoryItem, Location, Page, Product } from '../lib/api';
import { locationStatusClass, locationStatusLabel } from '../lib/locationStatus';
import { MovementsPanel } from './components/MovementsPanel';
import { ProductsPanel } from './components/ProductsPanel';
import { RoleBadge, UserMenu } from './components/UserMenu';

const Warehouse3D = dynamic(
  () => import('./components/Warehouse3D').then((m) => m.Warehouse3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 w-full flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          <span className="text-sm font-medium">Inicializando vista 3D interactiva...</span>
        </div>
      </div>
    ),
  }
);

const Warehouse2D = dynamic(
  () => import('./components/Warehouse2D').then((m) => m.Warehouse2D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 w-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm font-medium">Cargando layout 2D de bodega...</span>
        </div>
      </div>
    ),
  }
);

const WarehouseMappingView = dynamic(
  () => import('./components/WarehouseMappingView').then((m) => m.WarehouseMappingView),
  { ssr: false }
);

const KPIPanel = dynamic(
  () => import('./components/KPIPanel'),
  { ssr: false }
);

const ReportsPanel = dynamic(
  () => import('./components/ReportsPanel'),
  { ssr: false }
);

const TeamPanel = dynamic(
  () => import('./components/TeamPanel').then((m) => m.TeamPanel),
  { ssr: false }
);

const SupportModal = dynamic(
  () => import('./components/SupportModal').then((m) => m.SupportModal),
  { ssr: false }
);

const ForgotPasswordModal = dynamic(
  () => import('./components/ForgotPasswordModal').then((m) => m.ForgotPasswordModal),
  { ssr: false }
);

const AuditLogsModal = dynamic(
  () => import('./components/AuditLogsModal').then((m) => m.AuditLogsModal),
  { ssr: false }
);

const LegalModal = dynamic(
  () => import('./components/LegalModal').then((m) => m.LegalModal),
  { ssr: false }
);

const TwoFactorModal = dynamic(
  () => import('./components/TwoFactorModal').then((m) => m.TwoFactorModal),
  { ssr: false }
);

const BarcodeScanner = dynamic(
  () => import('./components/BarcodeScanner'),
  { ssr: false }
);

import { ToastProvider, useToast } from './components/Toast';
import { ThemeProvider, useTheme, ThemeToggle } from './components/ThemeContext';
import CommandPalette from './components/CommandPalette';
import { DashboardSkeleton } from './components/Skeleton';
import { isSoundEnabled, setSoundEnabled } from '../lib/audioCues';

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

const baseTabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'kpis', label: 'Centro de mando', icon: Gauge },
  { id: 'reports', label: 'Reportes', icon: FileBarChart },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'locations', label: 'Ubicaciones', icon: MapPin },
  { id: 'inventory', label: 'Inventario', icon: Boxes },
  { id: 'movements', label: 'Movimientos', icon: ArrowLeftRight },
  { id: 'warehouse3d', label: 'Vista 3D', icon: Box },
  { id: 'warehouse2d', label: 'Vista 2D', icon: Grid3x3 },
  { id: 'mapping', label: 'Mapeo', icon: ScanSearch },
];

const NAV_GROUPS: { id: string; label: string; items: Tab[] }[] = [
  { id: 'operate', label: 'Operar', items: ['movements', 'inventory'] },
  { id: 'consult', label: 'Consultar', items: ['dashboard', 'kpis', 'reports'] },
  { id: 'masters', label: 'Maestros', items: ['products', 'locations'] },
  { id: 'floor', label: 'Plano', items: ['warehouse2d', 'warehouse3d', 'mapping'] },
  { id: 'admin', label: 'Administración', items: ['team'] },
];

const FLOOR_TABS: Tab[] = ['warehouse2d', 'warehouse3d', 'mapping'];

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

function HomePageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<{ email?: string; id?: string } | null>(null);
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  // Command palette & sound & theme states
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const { isDark, toggleTheme } = useTheme();
  const { showToast } = useToast();

  // Restore active tab from URL or localStorage so page reload/direct link preserves current section
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const fromUrl = urlParams.get('tab') as Tab;
        if (fromUrl && baseTabs.some((t) => t.id === fromUrl)) {
          return fromUrl;
        }
        const saved = localStorage.getItem('wms_active_tab') as Tab;
        if (saved && baseTabs.some((t) => t.id === saved)) {
          return saved;
        }
      } catch {}
    }
    return 'dashboard';
  });

  const [dataVersion, setDataVersion] = useState(0);

  const changeTab = useCallback((newTab: Tab) => {
    setTab(newTab);
    setDataVersion((v) => v + 1);
    try {
      localStorage.setItem('wms_active_tab', newTab);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', newTab);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, []);

  // Keep browser address bar in sync with active tab
  useEffect(() => {
    if (typeof window !== 'undefined' && user) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('tab') !== tab) {
          url.searchParams.set('tab', tab);
          window.history.replaceState({}, '', url.toString());
        }
      } catch {}
    }
  }, [tab, user]);

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
  const [globalScannerOpen, setGlobalScannerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  // Global Ctrl+K / Cmd+K Command Palette Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      showToast({ message: 'Conexión a internet restablecida.', type: 'success' });
      setTimeout(() => setShowReconnected(false), 4000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast({ message: 'Sin conexión a internet. Los movimientos se guardarán en modo offline.', type: 'warning' });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

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

  // Shared callback — passed to all mutating panels so Dashboard summary stays fresh
  const refreshSummary = useCallback(() => {
    if (!token) return;
    setDataVersion((v) => v + 1);
    apiFetch<Summary>('/dashboard/summary', token)
      .then(setSummary)
      .catch(() => {/* silent — do not replace visible error for a background refresh */});
  }, [token]);

  // Synchronize dashboard summary whenever user views the dashboard or data updates
  useEffect(() => {
    if (!token) return;
    if (tab === 'dashboard') {
      apiFetch<Summary>('/dashboard/summary', token)
        .then(setSummary)
        .catch(() => {});
    }
  }, [tab, token, dataVersion]);

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
        ? [{ id: 'team' as Tab, label: 'Equipo', icon: Users }]
        : []),
    ].filter((t) => isTabVisible(t.id));
  }, [profile?.role, userPerms, isTabVisible]);

  const groupedNav = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        tabs: group.items
          .map((id) => visibleTabs.find((t) => t.id === id))
          .filter((t): t is (typeof visibleTabs)[number] => Boolean(t)),
      })).filter((group) => group.tabs.length > 0),
    [visibleTabs],
  );

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
      <main className="grid min-h-screen place-items-center bg-surface text-slate-600 dark:text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-sm font-medium">Cargando WMS…</span>
        </div>
      </main>
    );
  }

  if (!user || !token) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface p-4 sm:p-6 dark:bg-slate-950">
        <div className="w-full max-w-md space-y-4">
          <form onSubmit={signIn} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Warehouse className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">WMS Enterprise</p>
                <p className="text-[11px] font-medium uppercase tracking-widest text-blue-700 dark:text-blue-300">Logística</p>
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Iniciar sesión</h1>

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Correo electrónico
              <input
                name="email"
                autoComplete="username"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                type="email"
                required
                placeholder="usuario@bodega.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Contraseña
              <div className="relative mt-1.5">
                <input
                  name="password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 pr-11 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                  title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 select-none dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Recordar contraseña</span>
              </label>

              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger dark:border-red-900 dark:bg-red-950/40">{error}</p>}

            <button className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white shadow-sm transition hover:bg-blue-700">
              Entrar al sistema
            </button>
          </form>

          <div className="text-center">
            <button
              onClick={() => setLegalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Scale className="h-3.5 w-3.5" /> Términos · SLA · Privacidad
            </button>
          </div>
        </div>

        {forgotOpen ? <ForgotPasswordModal isOpen={forgotOpen} onClose={() => setForgotOpen(false)} /> : null}
        {legalOpen ? <LegalModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} /> : null}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-surface lg:flex dark:bg-slate-950">
      <div className="sticky top-0 z-40 flex items-center justify-between bg-[var(--color-sidebar)] px-3.5 py-2.5 text-white shadow-md lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Warehouse className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold tracking-wide text-blue-100">WMS</span>
          <span className="max-w-[140px] truncate rounded-full bg-blue-800/80 px-2 py-0.5 text-[11px] font-medium text-blue-100">
            {visibleTabs.find(item => item.id === tab)?.label}
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
          aria-label="Abrir menú"
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          {mobileMenuOpen ? 'Cerrar' : 'Menú'}
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col justify-between overflow-y-auto bg-[var(--color-sidebar)] p-5 text-white transition-transform duration-300 ease-in-out lg:static lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <Warehouse className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">WMS Enterprise</p>
                <p className="text-[10px] uppercase tracking-widest text-blue-200">Logística</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg p-1 text-blue-200 hover:bg-white/10 hover:text-white lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-xs text-blue-200">Operaciones de bodega</p>
          <nav className="mt-6 space-y-4">
            {groupedNav.map((group) => (
              <div key={group.id}>
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-blue-300/80">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.tabs.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          changeTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ' +
                          (tab === item.id ? 'bg-white/20 font-semibold text-white' : 'text-blue-100 hover:bg-white/10')
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-8 space-y-2.5 border-t border-blue-700/50 pt-5 text-xs text-blue-200">
          <div>
            <p className="truncate font-medium text-white">{user.email}</p>
            <div className="mt-1">
              <RoleBadge role={profile?.role} />
            </div>
          </div>
          <div className="space-y-1.5 pt-1">
            {profile?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setAuditOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 text-xs text-blue-200 transition hover:text-white cursor-pointer"
              >
                <ScrollText className="h-3.5 w-3.5" /> Auditoría
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTwoFactorOpen(true);
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 text-xs text-blue-200 transition hover:text-white cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> 2FA
            </button>
            <button
              type="button"
              onClick={() => {
                setSupportOpen(true);
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 text-xs text-blue-200 transition hover:text-white cursor-pointer"
            >
              <LifeBuoy className="h-3.5 w-3.5" /> Soporte
            </button>
            <button
              type="button"
              onClick={() => {
                setLegalOpen(true);
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 text-xs text-blue-200 transition hover:text-white cursor-pointer"
            >
              <Scale className="h-3.5 w-3.5" /> Términos, SLA y Privacidad
            </button>
          </div>
        </div>
      </aside>

      {!isOnline && (
        <div className="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Modo offline: operando con almacenamiento local</span>
        </div>
      )}
      {showReconnected && (
        <div className="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg animate-fadeIn">
          <Wifi className="h-3.5 w-3.5" />
          <span>Conexión restablecida con el servidor</span>
        </div>
      )}

      <section className="min-w-0 flex-1 p-3 pb-28 sm:p-6 lg:p-8 lg:pb-8">
        <header className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <Warehouse className="h-3.5 w-3.5" /> Bodega Central
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-white">
              {visibleTabs.find(item => item.id === tab)?.label ?? 'Dashboard'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Abrir paleta de comandos (Ctrl+K)"
            >
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Comandos</span>
              <kbd className="hidden items-center rounded border border-slate-300 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 sm:inline-flex dark:border-slate-600 dark:bg-slate-900">
                Ctrl K
              </kbd>
            </button>
            <button
              onClick={() => setGlobalScannerOpen(true)}
              className="hidden items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 lg:flex cursor-pointer"
              title="Escanear código de barras o QR"
            >
              <ScanBarcode className="h-4 w-4" /> Escanear
            </button>
            <ThemeToggle />
            <UserMenu
              email={user.email}
              role={profile?.role}
              isDark={isDark}
              soundOn={soundOn}
              onToggleTheme={toggleTheme}
              onToggleSound={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
                showToast({
                  message: next ? 'Efectos de sonido activados' : 'Efectos de sonido silenciados',
                  type: 'info',
                });
              }}
              onOpenAudit={profile?.role === 'ADMIN' ? () => setAuditOpen(true) : undefined}
              onOpen2FA={() => setTwoFactorOpen(true)}
              onOpenSupport={() => setSupportOpen(true)}
              onOpenLegal={() => setLegalOpen(true)}
              onRevokeAll={revokeAll}
              onSignOut={signOut}
            />
          </div>
        </header>

        {error && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger dark:border-red-900 dark:bg-red-950/40">{error}</p>}

        {FLOOR_TABS.includes(tab) ? (
          <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {FLOOR_TABS.filter((id) => visibleTabs.some((t) => t.id === id)).map((id) => {
              const item = visibleTabs.find((t) => t.id === id);
              if (!item) return null;
              const Icon = item.icon;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeTab(id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    tab === id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-6">
          {tab === 'dashboard' ? <Dashboard summary={summary} onNavigate={changeTab} role={profile?.role} /> : null}
          {tab === 'kpis' ? <KPIPanel token={token} organizationId={profile?.organizationId} refreshKey={dataVersion} /> : null}
          {tab === 'reports' ? <ReportsPanel token={token} organizationId={profile?.organizationId} onDataChanged={refreshSummary} refreshKey={dataVersion} /> : null}
          {tab === 'products' ? <ProductsPanel token={token} role={profile?.role} onError={setError} onDataChanged={refreshSummary} refreshKey={dataVersion} /> : null}
          {tab === 'locations' ? <Locations token={token} onError={setError} refreshKey={dataVersion} /> : null}
          {tab === 'inventory' ? <Inventory token={token} onError={setError} refreshKey={dataVersion} /> : null}
          {tab === 'movements' ? <MovementsPanel token={token} role={profile?.role} onError={setError} onDataChanged={refreshSummary} refreshKey={dataVersion} /> : null}
          {tab === 'warehouse3d' ? <Warehouse3D token={token} onError={setError} refreshKey={dataVersion} /> : null}
          {tab === 'warehouse2d' ? (
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
          ) : null}
          {tab === 'mapping' ? (
            <WarehouseMappingView
              token={token}
              onError={setError}
              initialLocationCode={mappingInitialLocation}
              onNavigate={(nextTab) => changeTab(nextTab as Tab)}
              onDataChanged={refreshSummary}
              refreshKey={dataVersion}
            />
          ) : null}
          {tab === 'team' && (profile?.role === 'ADMIN' || userPerms?.canManageTeam) ? (
            <TeamPanel token={token} onError={setError} onDataChanged={refreshSummary} refreshKey={dataVersion} />
          ) : null}
        </div>
      </section>

      {/* Mobile Bottom Navigation Bar (Persistent Thumb-Zone Navigation) */}
      <div
        role="region"
        aria-label="Barra de acciones móviles"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="relative flex items-center justify-around">
          <button
            type="button"
            onClick={() => changeTab('dashboard')}
            className={`flex min-h-[48px] min-w-[56px] flex-col items-center justify-center px-2 py-1 text-xs transition ${
              tab === 'dashboard' ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[10px] tracking-tight">Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => changeTab('movements')}
            className={`flex min-h-[48px] min-w-[56px] flex-col items-center justify-center px-2 py-1 text-xs transition ${
              tab === 'movements' ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <ArrowLeftRight className="h-5 w-5" />
            <span className="text-[10px] tracking-tight">Movimientos</span>
          </button>

          <div className="relative -top-5 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setGlobalScannerOpen(true)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl shadow-orange-500/30 ring-4 ring-white transition-transform active:scale-95 dark:ring-slate-900"
              aria-label="Escanear código de barras o QR"
              title="Escanear código de barras o QR"
            >
              <ScanBarcode className="h-6 w-6" />
            </button>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-tight text-orange-700 dark:text-orange-300">Escanear</span>
          </div>

          <button
            type="button"
            onClick={() => changeTab('warehouse2d')}
            className={`flex min-h-[48px] min-w-[56px] flex-col items-center justify-center px-2 py-1 text-xs transition ${
              tab === 'warehouse2d' || tab === 'warehouse3d' || tab === 'mapping'
                ? 'font-semibold text-blue-700 dark:text-blue-300'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Grid3x3 className="h-5 w-5" />
            <span className="text-[10px] tracking-tight">Plano</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex min-h-[48px] min-w-[56px] flex-col items-center justify-center px-2 py-1 text-xs font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] tracking-tight">Más</span>
          </button>
        </div>
      </div>

      {/* Global Barcode Scanner Modal triggered from FAB */}
      {globalScannerOpen && (
        <BarcodeScanner
          label="Escanear SKU o Casillero de Bodega"
          onClose={() => setGlobalScannerOpen(false)}
          onScan={(code) => {
            setGlobalScannerOpen(false);
            if (code.includes('-')) {
              setMappingInitialLocation(code);
              changeTab('warehouse2d');
            } else {
              changeTab('products');
            }
          }}
        />
      )}

      {/* Modals - Mounted only when active to save memory and avoid DOM overhead */}
      {supportOpen ? (
        <SupportModal
          isOpen={supportOpen}
          onClose={() => setSupportOpen(false)}
          user={user}
          profile={profile}
          currentTab={tab}
          currentTabLabel={visibleTabs.find((t) => t.id === tab)?.label ?? 'Dashboard'}
          warehouseName="Bodega Central"
        />
      ) : null}
      {auditOpen ? <AuditLogsModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} token={token} /> : null}
      {legalOpen ? <LegalModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} token={token} onAnonymized={signOut} /> : null}
      {twoFactorOpen ? <TwoFactorModal isOpen={twoFactorOpen} onClose={() => setTwoFactorOpen(false)} userEmail={user?.email} /> : null}
      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={(t) => changeTab(t as Tab)}
        onOpenScanner={() => setGlobalScannerOpen(true)}
        onOpenAudit={() => setAuditOpen(true)}
        onOpenSupport={() => setSupportOpen(true)}
        onOpen2FA={() => setTwoFactorOpen(true)}
        onOpenLegal={() => setLegalOpen(true)}
        onToggleTheme={toggleTheme}
        onToggleSound={() => {
          const next = !soundOn;
          setSoundOn(next);
          setSoundEnabled(next);
          showToast({
            message: next ? 'Efectos de sonido activados' : 'Efectos de sonido silenciados',
            type: 'info',
          });
        }}
        isDark={isDark}
        isSoundOn={soundOn}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <HomePageContent />
      </ToastProvider>
    </ThemeProvider>
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
  if (!summary) {
    return <DashboardSkeleton />;
  }

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
        <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                Guía de puesta en marcha
              </span>
              <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Bienvenido al sistema WMS</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Sigue estos pasos esenciales para operar la bodega de forma eficiente y segura:
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Ocultar guía"
            >
              <X className="h-3.5 w-3.5" /> Ocultar
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
                <span className="mt-3 text-xs font-medium text-emerald-600">Rol verificado</span>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500 sm:text-sm dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 sm:mt-2 sm:text-3xl dark:text-white">{value}</p>
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
    apiFetch<Page<Location>>('/locations?pageSize=500', token)
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
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Ubicaciones del almacén</h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span>Actualizar</span>
        </button>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <Table
          headers={['Código', 'Nivel', 'Posición', 'Estado']}
          rows={(data?.items ?? []).map(item => [item.code, item.level, item.position, item.status])}
          statusColumn={3}
        />
      </div>
    </div>
  );
}

function Inventory({ token, onError, refreshKey }: { token: string; onError: (value: string) => void; refreshKey?: number }) {
  const [data, setData] = useState<Page<InventoryItem> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<Page<InventoryItem>>('/inventory?pageSize=500', token)
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
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Inventario consolidado</h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span>Actualizar</span>
        </button>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <Table headers={['SKU', 'Producto', 'Ubicación', 'Cantidad', 'Reservado']} rows={(data?.items ?? []).map(item => [item.product?.sku ?? 'N/A', item.product?.name ?? 'N/A', item.location?.code ?? 'N/A', item.quantity, item.reservedQuantity])} />
      </div>
    </div>
  );
}

function Table({ headers, rows, statusColumn }: { headers: (string | number)[]; rows: (string | number)[][]; statusColumn?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500 sm:text-xs dark:border-slate-700">
            {headers.map(header => (
              <th key={header} className="whitespace-nowrap px-3 py-2.5 font-semibold sm:py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-10 text-center text-slate-500">
                <p className="font-medium text-slate-700 dark:text-slate-200">Sin registros</p>
                <p className="mt-1 text-xs">Cuando existan datos, aparecerán en esta tabla.</p>
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-3 py-2.5 sm:py-3">
                    {statusColumn === cellIndex ? (
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${locationStatusClass(String(cell))}`}>
                        {locationStatusLabel(String(cell))}
                      </span>
                    ) : cellIndex === 0 ? (
                      <span className="font-mono text-xs">{cell}</span>
                    ) : (
                      cell
                    )}
                  </td>
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
