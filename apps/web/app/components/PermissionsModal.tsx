"use client";
import { useState } from "react";
import { CurrentUser } from "../../lib/api";
import { TeamMember } from "./TeamPanel";

export interface UserPermissions {
  // Qué puede ver
  canViewDashboard: boolean;
  canViewKpis: boolean;
  canViewProducts: boolean;
  canViewLocations: boolean;
  canViewInventory: boolean;
  canViewMovements: boolean;
  canView3D: boolean;
  canView2D: boolean;
  canViewAudit: boolean;

  // Qué puede modificar / operar
  canCreateEntry: boolean;
  canCreateExit: boolean;
  canCreateTransfer: boolean;
  canCreateAdjustment: boolean;
  canManageProducts: boolean;
  canManageLocations: boolean;

  // Qué puede descargar / exportar
  canDownloadReports: boolean;
  canBulkImport: boolean;
  canScheduleReports: boolean;
  canPrintLabels: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<CurrentUser["role"], UserPermissions> = {
  ADMIN: {
    canViewDashboard: true,
    canViewKpis: true,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewAudit: true,

    canCreateEntry: true,
    canCreateExit: true,
    canCreateTransfer: true,
    canCreateAdjustment: true,
    canManageProducts: true,
    canManageLocations: true,

    canDownloadReports: true,
    canBulkImport: true,
    canScheduleReports: true,
    canPrintLabels: true,
  },
  SUPERVISOR: {
    canViewDashboard: true,
    canViewKpis: true,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewAudit: true,

    canCreateEntry: true,
    canCreateExit: true,
    canCreateTransfer: true,
    canCreateAdjustment: true,
    canManageProducts: true,
    canManageLocations: false,

    canDownloadReports: true,
    canBulkImport: true,
    canScheduleReports: true,
    canPrintLabels: true,
  },
  OPERATOR: {
    canViewDashboard: true,
    canViewKpis: false,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewAudit: false,

    canCreateEntry: true,
    canCreateExit: true,
    canCreateTransfer: true,
    canCreateAdjustment: false,
    canManageProducts: false,
    canManageLocations: false,

    canDownloadReports: false,
    canBulkImport: false,
    canScheduleReports: false,
    canPrintLabels: true,
  },
  VIEWER: {
    canViewDashboard: true,
    canViewKpis: false,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewAudit: false,

    canCreateEntry: false,
    canCreateExit: false,
    canCreateTransfer: false,
    canCreateAdjustment: false,
    canManageProducts: false,
    canManageLocations: false,

    canDownloadReports: false,
    canBulkImport: false,
    canScheduleReports: false,
    canPrintLabels: false,
  },
};

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
  onSave: (userId: string, permissions: UserPermissions, newRole: CurrentUser["role"]) => Promise<void>;
  onToggleStatus: (userId: string, currentActive: boolean) => Promise<void>;
}) {
  if (!isOpen || !member) return null;

  const [role, setRole] = useState<CurrentUser["role"]>(member.role);
  const [active, setActive] = useState<boolean>(member.active);
  const [saving, setSaving] = useState(false);

  // Inicializar permisos desde el perfil o desde el template del rol
  const [permissions, setPermissions] = useState<UserPermissions>(() => {
    return (
      (member as any).permissions ??
      DEFAULT_ROLE_PERMISSIONS[member.role] ??
      DEFAULT_ROLE_PERMISSIONS.OPERATOR
    );
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

  const handleSave = async () => {
    setSaving(true);
    try {
      if (active !== member.active) {
        await onToggleStatus(member.id, member.active);
      }
      await onSave(member.id, permissions, role);
      onClose();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-sm uppercase">
              {member.name ? member.name.slice(0, 2) : "US"}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Gestionar Permisos y Acceso
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {active ? "● Activo" : "● Suspendido"}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {member.name} ({member.email || "Sin correo"}) · ID: {member.id.slice(0, 8)}...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Quick Account Controls: Role & Status */}
          <div className="grid gap-4 sm:grid-cols-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Rol Base (Aplica plantilla recomendada)
              </label>
              <select
                value={role}
                onChange={(e) => handleRoleSelect(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold focus:ring-2 focus:ring-blue-600"
              >
                <option value="ADMIN">Administrador (Acceso Total)</option>
                <option value="SUPERVISOR">Supervisor (Operación, Ajustes y Reportes)</option>
                <option value="OPERATOR">Operador (Entradas, Salidas y Traslados)</option>
                <option value="VIEWER">Visualizador (Solo Lectura)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Estado de la Cuenta
              </label>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition border ${
                  active
                    ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                {active ? "🚫 Suspender Acceso de Usuario" : "✅ Reactivar Cuenta de Usuario"}
              </button>
            </div>
          </div>

          {/* Granular Permissions Section */}
          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-500">
              Permisos Granulares Específicos
            </h4>

            {/* Group 1: Visualización */}
            <div className="border rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                👁️ 1. Permisos de Visualización (Qué puede ver)
              </span>
              <div className="grid sm:grid-cols-3 gap-2 pt-1 text-xs">
                <CheckboxItem
                  label="Dashboard General"
                  checked={permissions.canViewDashboard}
                  onChange={() => togglePermission("canViewDashboard")}
                />
                <CheckboxItem
                  label="Centro de Mando (KPIs)"
                  checked={permissions.canViewKpis}
                  onChange={() => togglePermission("canViewKpis")}
                />
                <CheckboxItem
                  label="Catálogo de Productos"
                  checked={permissions.canViewProducts}
                  onChange={() => togglePermission("canViewProducts")}
                />
                <CheckboxItem
                  label="Listado de Ubicaciones"
                  checked={permissions.canViewLocations}
                  onChange={() => togglePermission("canViewLocations")}
                />
                <CheckboxItem
                  label="Stock de Inventario"
                  checked={permissions.canViewInventory}
                  onChange={() => togglePermission("canViewInventory")}
                />
                <CheckboxItem
                  label="Historial Movimientos"
                  checked={permissions.canViewMovements}
                  onChange={() => togglePermission("canViewMovements")}
                />
                <CheckboxItem
                  label="Mapa 3D Interactivo"
                  checked={permissions.canView3D}
                  onChange={() => togglePermission("canView3D")}
                />
                <CheckboxItem
                  label="Layout 2D de Pasillos"
                  checked={permissions.canView2D}
                  onChange={() => togglePermission("canView2D")}
                />
                <CheckboxItem
                  label="Bitácora de Auditoría"
                  checked={permissions.canViewAudit}
                  onChange={() => togglePermission("canViewAudit")}
                />
              </div>
            </div>

            {/* Group 2: Operaciones y Modificación */}
            <div className="border rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                ✏️ 2. Permisos de Operación y Modificación (Qué puede ejecutar)
              </span>
              <div className="grid sm:grid-cols-2 gap-2 pt-1 text-xs">
                <CheckboxItem
                  label="Registrar Entradas (Recepción)"
                  checked={permissions.canCreateEntry}
                  onChange={() => togglePermission("canCreateEntry")}
                />
                <CheckboxItem
                  label="Registrar Salidas (Despacho / Picking)"
                  checked={permissions.canCreateExit}
                  onChange={() => togglePermission("canCreateExit")}
                />
                <CheckboxItem
                  label="Registrar Transferencias entre Racks"
                  checked={permissions.canCreateTransfer}
                  onChange={() => togglePermission("canCreateTransfer")}
                />
                <CheckboxItem
                  label="Ajustes Cíclicos de Stock (+ / -)"
                  checked={permissions.canCreateAdjustment}
                  onChange={() => togglePermission("canCreateAdjustment")}
                />
                <CheckboxItem
                  label="Crear y Modificar Productos"
                  checked={permissions.canManageProducts}
                  onChange={() => togglePermission("canManageProducts")}
                />
                <CheckboxItem
                  label="Gestionar Ubicaciones y Racks"
                  checked={permissions.canManageLocations}
                  onChange={() => togglePermission("canManageLocations")}
                />
              </div>
            </div>

            {/* Group 3: Descargas y Herramientas */}
            <div className="border rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                📥 3. Reportes, Descargas y Exportación
              </span>
              <div className="grid sm:grid-cols-2 gap-2 pt-1 text-xs">
                <CheckboxItem
                  label="Descargar Reportes (Excel, CSV, JSON)"
                  checked={permissions.canDownloadReports}
                  onChange={() => togglePermission("canDownloadReports")}
                />
                <CheckboxItem
                  label="Carga Masiva de Stock (Bulk Import)"
                  checked={permissions.canBulkImport}
                  onChange={() => togglePermission("canBulkImport")}
                />
                <CheckboxItem
                  label="Programar Despacho Automático de Correos"
                  checked={permissions.canScheduleReports}
                  onChange={() => togglePermission("canScheduleReports")}
                />
                <CheckboxItem
                  label="Imprimir Etiquetas y ZPL (Zebra)"
                  checked={permissions.canPrintLabels}
                  onChange={() => togglePermission("canPrintLabels")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t px-6 py-4 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? "Guardando..." : "💾 Guardar Permisos y Acceso"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckboxItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className={checked ? "font-semibold text-slate-800" : "text-slate-500"}>{label}</span>
    </label>
  );
}
