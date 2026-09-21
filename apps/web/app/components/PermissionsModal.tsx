"use client";
import { useState, useMemo } from "react";
import { CurrentUser } from "../../lib/api";
import { TeamMember } from "./TeamPanel";

export interface UserPermissions {
  // 1. Módulos y Visualización (11)
  canViewDashboard: boolean;
  canViewKpis: boolean;
  canViewReports: boolean;
  canViewProducts: boolean;
  canViewLocations: boolean;
  canViewInventory: boolean;
  canViewMovements: boolean;
  canView3D: boolean;
  canView2D: boolean;
  canViewMapping: boolean;
  canViewAudit: boolean;

  // 2. Operaciones de Bodega (5)
  canCreateEntry: boolean;
  canCreateExit: boolean;
  canCreateTransfer: boolean;
  canCreateAdjustment: boolean;
  canAuditMapping: boolean;

  // 3. Configuración y Maestros (3)
  canManageProducts: boolean;
  canManageLocations: boolean;
  canManageTeam: boolean;

  // 4. Descarga, Exportación y Herramientas (5)
  canBulkImport: boolean;
  canExportProducts: boolean;
  canDownloadReports: boolean;
  canScheduleReports: boolean;
  canPrintLabels: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<CurrentUser["role"], UserPermissions> = {
  ADMIN: {
    canViewDashboard: true,
    canViewKpis: true,
    canViewReports: true,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewMapping: true,
    canViewAudit: true,

    canCreateEntry: true,
    canCreateExit: true,
    canCreateTransfer: true,
    canCreateAdjustment: true,
    canAuditMapping: true,

    canManageProducts: true,
    canManageLocations: true,
    canManageTeam: true,

    canBulkImport: true,
    canExportProducts: true,
    canDownloadReports: true,
    canScheduleReports: true,
    canPrintLabels: true,
  },
  SUPERVISOR: {
    canViewDashboard: true,
    canViewKpis: true,
    canViewReports: true,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewMapping: true,
    canViewAudit: true,

    canCreateEntry: true,
    canCreateExit: true,
    canCreateTransfer: true,
    canCreateAdjustment: true,
    canAuditMapping: true,

    canManageProducts: true,
    canManageLocations: false,
    canManageTeam: false,

    canBulkImport: true,
    canExportProducts: true,
    canDownloadReports: true,
    canScheduleReports: true,
    canPrintLabels: true,
  },
  OPERATOR: {
    canViewDashboard: true,
    canViewKpis: false,
    canViewReports: false,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewMapping: true,
    canViewAudit: false,

    canCreateEntry: true,
    canCreateExit: true,
    canCreateTransfer: true,
    canCreateAdjustment: false,
    canAuditMapping: true,

    canManageProducts: false,
    canManageLocations: false,
    canManageTeam: false,

    canBulkImport: false,
    canExportProducts: false,
    canDownloadReports: false,
    canScheduleReports: false,
    canPrintLabels: true,
  },
  VIEWER: {
    canViewDashboard: true,
    canViewKpis: false,
    canViewReports: false,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: false,
    canView2D: true,
    canViewMapping: true,
    canViewAudit: true,

    canCreateEntry: false,
    canCreateExit: false,
    canCreateTransfer: false,
    canCreateAdjustment: false,
    canAuditMapping: false,

    canManageProducts: false,
    canManageLocations: false,
    canManageTeam: false,

    canBulkImport: false,
    canExportProducts: false,
    canDownloadReports: false,
    canScheduleReports: false,
    canPrintLabels: false,
  },
};

interface PermissionMeta {
  key: keyof UserPermissions;
  label: string;
  desc: string;
  icon: string;
}

const VIEW_PERMISSIONS: PermissionMeta[] = [
  { key: "canViewDashboard", label: "Dashboard General", desc: "Panel resumen con métricas clave, alertas y accesos rápidos", icon: "📊" },
  { key: "canViewKpis", label: "Centro de Mando (KPIs)", desc: "Indicadores de rotación, ocupación volumétrica y valorización", icon: "📈" },
  { key: "canViewReports", label: "Módulo de Reportes", desc: "Historial de balances, movimientos y reportes operativos", icon: "📑" },
  { key: "canViewProducts", label: "Catálogo de SKUs", desc: "Explorar catálogo, fichas técnicas, categorías y códigos de barra", icon: "📦" },
  { key: "canViewLocations", label: "Listado de Ubicaciones", desc: "Grilla de pasillos, estanterías, niveles y capacidades", icon: "📍" },
  { key: "canViewInventory", label: "Stock de Inventario", desc: "Existencias físicas, lotes, vencimientos y disponibilidad", icon: "📋" },
  { key: "canViewMovements", label: "Historial Movimientos", desc: "Kardex y trazabilidad de ingresos, egresos y traslados", icon: "🔄" },
  { key: "canView3D", label: "Mapa 3D Interactivo", desc: "Gemelo digital tridimensional interactivo con cámaras", icon: "🧊" },
  { key: "canView2D", label: "Layout 2D de Pasillos", desc: "Plano esquemático oficial de los 5 bloques estructurales", icon: "🗺️" },
  { key: "canViewMapping", label: "Mapeo Almacén 2D", desc: "Plano de planta 2D a ancho completo para auditoría física", icon: "🔍" },
  { key: "canViewAudit", label: "Bitácora de Auditoría", desc: "Registro inmutable de seguridad y acciones del personal", icon: "🛡️" },
];

const OP_PERMISSIONS: PermissionMeta[] = [
  { key: "canCreateEntry", label: "Registrar Entradas", desc: "Recepción de mercancía de proveedores y órdenes de ingreso", icon: "📥" },
  { key: "canCreateExit", label: "Registrar Salidas", desc: "Picking, despacho a clientes y órdenes de egreso", icon: "📤" },
  { key: "canCreateTransfer", label: "Transferencias Internas", desc: "Movimientos entre pasillos, estantes o racks", icon: "🔀" },
  { key: "canCreateAdjustment", label: "Ajustes de Inventario", desc: "Ajustes cíclicos por conteo, mermas o sobrantes", icon: "⚖️" },
  { key: "canAuditMapping", label: "Auditoría en Mapeo", desc: "Confirmar casilleros OK, editar discrepancias y generar reporte", icon: "🎯" },
];

const CONFIG_PERMISSIONS: PermissionMeta[] = [
  { key: "canManageProducts", label: "Gestión de Productos", desc: "Crear nuevos SKUs, editar fichas técnicas o descontinuar", icon: "🏷️" },
  { key: "canManageLocations", label: "Gestión de Ubicaciones", desc: "Crear, reconfigurar o inhabilitar celdas y racks", icon: "🏗️" },
  { key: "canManageTeam", label: "Gestión de Equipo", desc: "Administrar personal, asignar roles y configurar permisos", icon: "👥" },
];

const EXPORT_PERMISSIONS: PermissionMeta[] = [
  { key: "canBulkImport", label: "Carga Masiva de Stock", desc: "Importar productos por lotes desde Excel (.xlsx), CSV o JSON", icon: "📁" },
  { key: "canExportProducts", label: "Exportar Catálogo", desc: "Descargar catálogo completo en formato Excel, CSV o JSON", icon: "📤" },
  { key: "canDownloadReports", label: "Descargar Reportes", desc: "Exportar balances y movimientos a Excel, CSV y PDF", icon: "📊" },
  { key: "canScheduleReports", label: "Programar Despachos", desc: "Automatización de balances periódicos por correo", icon: "⏰" },
  { key: "canPrintLabels", label: "Impresión de Etiquetas", desc: "Generar códigos de barra y rótulos térmicos Zebra (ZPL)", icon: "🏷️" },
];

const ALL_PERMISSION_KEYS: (keyof UserPermissions)[] = [
  ...VIEW_PERMISSIONS.map((p) => p.key),
  ...OP_PERMISSIONS.map((p) => p.key),
  ...CONFIG_PERMISSIONS.map((p) => p.key),
  ...EXPORT_PERMISSIONS.map((p) => p.key),
];

export function PermissionsModal({
  member,
  isOpen,
  onClose,
  onSave,
  onToggleStatus,
}: {
  member: TeamMember | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (userId: string, permissions: UserPermissions, newRole: CurrentUser["role"], newActive?: boolean) => Promise<void>;
  onToggleStatus: (userId: string, currentActive: boolean) => Promise<void>;
}) {
  if (!isOpen || !member) return null;

  const [role, setRole] = useState<CurrentUser["role"]>(member.role);
  const [active, setActive] = useState<boolean>(member.active);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inicializar permisos desde el perfil o desde el template del rol
  const [permissions, setPermissions] = useState<UserPermissions>(() => {
    const raw = (member as any).permissions;
    const defaults = DEFAULT_ROLE_PERMISSIONS[member.role] ?? DEFAULT_ROLE_PERMISSIONS.OPERATOR;
    if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
      return { ...defaults, ...raw };
    }
    return { ...defaults };
  });

  const handleRoleSelect = (newRole: CurrentUser["role"]) => {
    setRole(newRole);
    // Aplicar preset del rol
    setPermissions({ ...DEFAULT_ROLE_PERMISSIONS[newRole] });
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const setGroupState = (keys: (keyof UserPermissions)[], value: boolean) => {
    setPermissions((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = value;
      });
      return next;
    });
  };

  const handleSelectAllGlobal = () => {
    setGroupState(ALL_PERMISSION_KEYS, true);
  };

  const handleDeselectAllGlobal = () => {
    setGroupState(ALL_PERMISSION_KEYS, false);
  };

  // Conteo de permisos activos
  const totalActive = useMemo(() => {
    return ALL_PERMISSION_KEYS.filter((k) => permissions[k]).length;
  }, [permissions]);

  const viewActiveCount = useMemo(() => {
    return VIEW_PERMISSIONS.filter((p) => permissions[p.key]).length;
  }, [permissions]);

  const opActiveCount = useMemo(() => {
    return OP_PERMISSIONS.filter((p) => permissions[p.key]).length;
  }, [permissions]);

  const configActiveCount = useMemo(() => {
    return CONFIG_PERMISSIONS.filter((p) => permissions[p.key]).length;
  }, [permissions]);

  const exportActiveCount = useMemo(() => {
    return EXPORT_PERMISSIONS.filter((p) => permissions[p.key]).length;
  }, [permissions]);

  // Filtro de búsqueda
  const filterList = (list: PermissionMeta[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (p) => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)
    );
  };

  const filteredViews = useMemo(() => filterList(VIEW_PERMISSIONS), [searchQuery]);
  const filteredOps = useMemo(() => filterList(OP_PERMISSIONS), [searchQuery]);
  const filteredConfigs = useMemo(() => filterList(CONFIG_PERMISSIONS), [searchQuery]);
  const filteredExports = useMemo(() => filterList(EXPORT_PERMISSIONS), [searchQuery]);

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave(member.id, permissions, role, active);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Ocurrió un error al guardar los permisos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-5 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-4xl max-h-[94vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white text-base shadow-sm">
              {member.name ? member.name.slice(0, 2).toUpperCase() : "US"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  Gestionar Permisos y Acceso
                </h3>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold shadow-2xs ${
                    active
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-rose-100 text-rose-800 border border-rose-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-600" : "bg-rose-600"}`} />
                  {active ? "Activo" : "Acceso Suspendido"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                <strong className="text-slate-700">{member.name}</strong> · {member.email || "Sin correo"} · ID:{" "}
                <span className="font-mono text-slate-400">{member.id.slice(0, 8)}...</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            title="Cerrar ventana"
          >
            ✕
          </button>
        </div>

        {/* Error Alert if any */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-fadeIn">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1">
              <p className="font-bold">Error al guardar los cambios</p>
              <p className="text-[11px] text-rose-600 mt-0.5">{errorMsg}</p>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm bg-slate-50/40">
          {/* Quick Account Controls: Role Preset & Status */}
          <div className="grid gap-4 sm:grid-cols-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Rol Asignado & Plantilla Base</span>
                <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-md">
                  Carga sugerida
                </span>
              </label>
              <select
                value={role}
                onChange={(e) => handleRoleSelect(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition cursor-pointer"
              >
                <option value="ADMIN">👑 Administrador (Acceso Total a la Plataforma)</option>
                <option value="SUPERVISOR">🔍 Supervisor (Operación, Ajustes y Reportes)</option>
                <option value="OPERATOR">📦 Operador (Entradas, Salidas, Traslados y Mapeo)</option>
                <option value="VIEWER">👁️ Visualizador (Solo Consulta / Auditoría)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Al seleccionar un rol, se aplicará automáticamente la configuración recomendada.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Estado de la Cuenta
              </label>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition border shadow-2xs ${
                  active
                    ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                {active ? "🚫 Suspender Acceso del Usuario" : "✅ Reactivar Cuenta del Usuario"}
              </button>
              <p className="text-[11px] text-slate-500 mt-1">
                {active
                  ? "El usuario puede iniciar sesión y operar con sus permisos asignados."
                  : "Acceso denegado: el usuario no podrá iniciar sesión en el sistema."}
              </p>
            </div>
          </div>

          {/* Quick Toolbar: Counters, Global Toggles & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-100 text-blue-800 text-xs font-black">
                {totalActive}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {totalActive} de {ALL_PERMISSION_KEYS.length} permisos habilitados
                </p>
                <div className="w-36 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((totalActive / ALL_PERMISSION_KEYS.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar permiso..."
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 font-medium focus:bg-white focus:border-blue-600 focus:outline-none w-36 sm:w-44"
              />
              <button
                type="button"
                onClick={handleSelectAllGlobal}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-[11px] font-bold text-slate-700 transition cursor-pointer"
                title="Habilitar todos los permisos"
              >
                ✓ Marcar Todos
              </button>
              <button
                type="button"
                onClick={handleDeselectAllGlobal}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-[11px] font-bold text-slate-700 transition cursor-pointer"
                title="Desmarcar todos los permisos"
              >
                ✕ Desmarcar Todos
              </button>
            </div>
          </div>

          {/* Granular Permissions Section */}
          <div className="space-y-5">
            {/* Group 1: Visualización y Secciones */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between bg-blue-50/60 border-b border-blue-100/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">👁️</span>
                  <div>
                    <h4 className="text-xs font-bold text-blue-900">
                      1. Permisos de Módulos y Visualización (Secciones)
                    </h4>
                    <p className="text-[10px] text-blue-700/80">
                      Secciones completas del menú lateral y dashboards que puede consultar en pantalla
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold bg-blue-100/80 text-blue-800 px-2 py-0.5 rounded-md">
                    {viewActiveCount}/{VIEW_PERMISSIONS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        VIEW_PERMISSIONS.map((p) => p.key),
                        true
                      )
                    }
                    className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-blue-200 transition cursor-pointer"
                  >
                    ✓ Todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        VIEW_PERMISSIONS.map((p) => p.key),
                        false
                      )
                    }
                    className="text-[10px] font-bold text-slate-500 hover:text-rose-700 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-slate-200 transition cursor-pointer"
                  >
                    ✕ Ninguno
                  </button>
                </div>
              </div>

              <div className="p-3 grid sm:grid-cols-3 gap-2 text-xs">
                {filteredViews.length === 0 ? (
                  <p className="col-span-3 text-center py-3 text-slate-400 text-xs">
                    No hay permisos que coincidan con la búsqueda
                  </p>
                ) : (
                  filteredViews.map((item) => (
                    <PermissionCard
                      key={item.key}
                      meta={item}
                      checked={permissions[item.key]}
                      onToggle={() => togglePermission(item.key)}
                      accent="blue"
                    />
                  ))
                )}
              </div>
            </div>

            {/* Group 2: Operaciones de Bodega */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between bg-purple-50/60 border-b border-purple-100/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">✏️</span>
                  <div>
                    <h4 className="text-xs font-bold text-purple-900">
                      2. Operaciones de Bodega y Movimientos
                    </h4>
                    <p className="text-[10px] text-purple-700/80">
                      Registro de entradas, salidas, traslados y auditoría física de casilleros
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold bg-purple-100/80 text-purple-800 px-2 py-0.5 rounded-md">
                    {opActiveCount}/{OP_PERMISSIONS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        OP_PERMISSIONS.map((p) => p.key),
                        true
                      )
                    }
                    className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-purple-200 transition cursor-pointer"
                  >
                    ✓ Todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        OP_PERMISSIONS.map((p) => p.key),
                        false
                      )
                    }
                    className="text-[10px] font-bold text-slate-500 hover:text-rose-700 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-slate-200 transition cursor-pointer"
                  >
                    ✕ Ninguno
                  </button>
                </div>
              </div>

              <div className="p-3 grid sm:grid-cols-2 gap-2 text-xs">
                {filteredOps.length === 0 ? (
                  <p className="col-span-2 text-center py-3 text-slate-400 text-xs">
                    No hay permisos que coincidan con la búsqueda
                  </p>
                ) : (
                  filteredOps.map((item) => (
                    <PermissionCard
                      key={item.key}
                      meta={item}
                      checked={permissions[item.key]}
                      onToggle={() => togglePermission(item.key)}
                      accent="purple"
                    />
                  ))
                )}
              </div>
            </div>

            {/* Group 3: Configuración y Gestión de Maestros */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between bg-amber-50/60 border-b border-amber-100/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛠️</span>
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">
                      3. Configuración, Catálogo y Gestión de Maestros
                    </h4>
                    <p className="text-[10px] text-amber-700/80">
                      Creación de fichas de SKUs, reconfiguración de racks y gestión de usuarios
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold bg-amber-100/80 text-amber-800 px-2 py-0.5 rounded-md">
                    {configActiveCount}/{CONFIG_PERMISSIONS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        CONFIG_PERMISSIONS.map((p) => p.key),
                        true
                      )
                    }
                    className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-amber-200 transition cursor-pointer"
                  >
                    ✓ Todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        CONFIG_PERMISSIONS.map((p) => p.key),
                        false
                      )
                    }
                    className="text-[10px] font-bold text-slate-500 hover:text-rose-700 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-slate-200 transition cursor-pointer"
                  >
                    ✕ Ninguno
                  </button>
                </div>
              </div>

              <div className="p-3 grid sm:grid-cols-3 gap-2 text-xs">
                {filteredConfigs.length === 0 ? (
                  <p className="col-span-3 text-center py-3 text-slate-400 text-xs">
                    No hay permisos que coincidan con la búsqueda
                  </p>
                ) : (
                  filteredConfigs.map((item) => (
                    <PermissionCard
                      key={item.key}
                      meta={item}
                      checked={permissions[item.key]}
                      onToggle={() => togglePermission(item.key)}
                      accent="amber"
                    />
                  ))
                )}
              </div>
            </div>

            {/* Group 4: Descargas, Exportaciones y Herramientas */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between bg-emerald-50/60 border-b border-emerald-100/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">📥</span>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">
                      4. Importación, Exportación y Herramientas
                    </h4>
                    <p className="text-[10px] text-emerald-700/80">
                      Cargas masivas (Excel/CSV/JSON), exportaciones, reportes y etiquetas térmicas
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold bg-emerald-100/80 text-emerald-800 px-2 py-0.5 rounded-md">
                    {exportActiveCount}/{EXPORT_PERMISSIONS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        EXPORT_PERMISSIONS.map((p) => p.key),
                        true
                      )
                    }
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-emerald-200 transition cursor-pointer"
                  >
                    ✓ Todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupState(
                        EXPORT_PERMISSIONS.map((p) => p.key),
                        false
                      )
                    }
                    className="text-[10px] font-bold text-slate-500 hover:text-rose-700 bg-white/80 hover:bg-white px-2 py-1 rounded-lg border border-slate-200 transition cursor-pointer"
                  >
                    ✕ Ninguno
                  </button>
                </div>
              </div>

              <div className="p-3 grid sm:grid-cols-2 gap-2 text-xs">
                {filteredExports.length === 0 ? (
                  <p className="col-span-2 text-center py-3 text-slate-400 text-xs">
                    No hay permisos que coincidan con la búsqueda
                  </p>
                ) : (
                  filteredExports.map((item) => (
                    <PermissionCard
                      key={item.key}
                      meta={item}
                      checked={permissions[item.key]}
                      onToggle={() => togglePermission(item.key)}
                      accent="emerald"
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t px-6 py-4 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            Cancelar
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              <strong>{totalActive}</strong> de {ALL_PERMISSION_KEYS.length} permisos activos asignados
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {saving ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>💾 Guardar Permisos y Acceso</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PermissionCard({
  meta,
  checked,
  onToggle,
  accent,
}: {
  meta: PermissionMeta;
  checked: boolean;
  onToggle: () => void;
  accent: "blue" | "purple" | "amber" | "emerald";
}) {
  const accentClasses = {
    blue: checked
      ? "border-blue-300 bg-blue-50/60 text-blue-900 ring-1 ring-blue-200"
      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
    purple: checked
      ? "border-purple-300 bg-purple-50/60 text-purple-900 ring-1 ring-purple-200"
      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
    amber: checked
      ? "border-amber-300 bg-amber-50/60 text-amber-900 ring-1 ring-amber-200"
      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
    emerald: checked
      ? "border-emerald-300 bg-emerald-50/60 text-emerald-900 ring-1 ring-emerald-200"
      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
  }[accent];

  return (
    <div
      onClick={onToggle}
      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${accentClasses}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
      />
      <div className="flex-1 min-w-0">
        <p className={`font-bold text-xs flex items-center gap-1.5 ${checked ? "text-slate-900" : "text-slate-600"}`}>
          <span>{meta.icon}</span>
          <span className="truncate">{meta.label}</span>
        </p>
        <p className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
          {meta.desc}
        </p>
      </div>
    </div>
  );
}


