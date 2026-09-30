import { useEffect, useState } from 'react';
import { apiFetch, CurrentUser } from '../../lib/api';
import { PermissionsModal, UserPermissions } from './PermissionsModal';

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: CurrentUser['role'];
  active: boolean;
  permissions?: UserPermissions;
  createdAt: string;
};

const ROLE_LABELS: Record<CurrentUser['role'], { label: string; bg: string; text: string }> = {
  ADMIN: { label: 'Administrador', bg: 'bg-purple-100', text: 'text-purple-800' },
  SUPERVISOR: { label: 'Supervisor', bg: 'bg-blue-100', text: 'text-blue-800' },
  OPERATOR: { label: 'Operador', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  VIEWER: { label: 'Visualizador', bg: 'bg-slate-100', text: 'text-slate-700' },
};

export function TeamPanel({
  token,
  onError,
  onDataChanged,
  refreshKey,
}: {
  token: string;
  onError: (msg: string) => void;
  onDataChanged?: () => void;
  refreshKey?: number;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // New user form state
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'OPERATOR' as CurrentUser['role'],
  });

  const loadTeam = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<TeamMember[]>('/users', token);
      setMembers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onError(err?.message ?? 'Error al cargar miembros del equipo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeam();
  }, [token, refreshKey]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/users', token, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'OPERATOR' });
      setToastMessage('Nuevo miembro registrado exitosamente');
      await loadTeam();
      onDataChanged?.();
    } catch (err: any) {
      onError(err?.message ?? 'Error al registrar miembro del equipo');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: CurrentUser['role']) => {
    try {
      await apiFetch(`/users/${userId}/role`, token, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m))
      );
      setToastMessage(`Rol actualizado a ${ROLE_LABELS[newRole]?.label ?? newRole}`);
      onDataChanged?.();
    } catch (err: any) {
      onError(err?.message ?? 'No fue posible actualizar el rol');
    }
  };

  const handleToggleStatus = async (userId: string, currentActive: boolean) => {
    const nextActive = !currentActive;
    try {
      await apiFetch(`/users/${userId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ active: nextActive }),
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, active: nextActive } : m))
      );
      setToastMessage(
        nextActive
          ? 'Cuenta de usuario reactivada correctamente'
          : 'Acceso de usuario suspendido'
      );
      onDataChanged?.();
    } catch (err: any) {
      onError(err?.message ?? 'No fue posible cambiar el estado del usuario');
    }
  };

  const handleSavePermissions = async (
    userId: string,
    permissions: UserPermissions,
    newRole: CurrentUser['role'],
    newActive?: boolean
  ) => {
    try {
      const body: any = { permissions, role: newRole };
      if (typeof newActive === 'boolean') {
        body.active = newActive;
      }
      await apiFetch(`/users/${userId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === userId
            ? {
                ...m,
                permissions,
                role: newRole,
                active: typeof newActive === 'boolean' ? newActive : m.active,
              }
            : m
        )
      );
      setToastMessage('Permisos y configuración de acceso guardados con éxito ✨');
      onDataChanged?.();
    } catch (err: any) {
      onError(err?.message ?? 'No fue posible guardar los permisos');
      throw err;
    }
  };

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
  });

  return (
    <section className="space-y-5">
      {/* Header with Search and Invite Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">Gestión de Equipo y Accesos</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Administra los operadores, supervisores y administradores de la bodega
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Buscar miembro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-medium dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
          />
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 dark:bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-500 dark:hover:bg-blue-500 transition cursor-pointer"
          >
            <span>+</span>
            <span>Nuevo Miembro</span>
          </button>
        </div>
      </div>

      {/* Team Table */}
      <div className="overflow-x-auto rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-300 font-bold uppercase tracking-wider">
            <tr>
              <th className="p-4">Miembro</th>
              <th className="p-4">Correo</th>
              <th className="p-4">Rol Asignado</th>
              <th className="p-4">Estado</th>
              <th className="p-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 dark:text-slate-500">
                  Cargando equipo...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 dark:text-slate-500">
                  No se encontraron miembros de equipo
                </td>
              </tr>
            ) : (
              filtered.map((member) => {
                const roleBadge = ROLE_LABELS[member.role] ?? ROLE_LABELS.VIEWER;
                return (
                  <tr key={member.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition">
                    <td className="p-4 font-bold text-slate-800 dark:text-white flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 font-bold text-slate-600 dark:text-slate-300 text-xs uppercase">
                        {member.name ? member.name.slice(0, 2) : 'US'}
                      </div>
                      <div>
                        <p>{member.name}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">ID: {member.id.slice(0, 8)}...</p>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-slate-600 dark:text-slate-400">{member.email || '—'}</td>
                    <td className="p-4">
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as any)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold border-0 cursor-pointer focus:ring-2 focus:ring-blue-600 ${roleBadge.bg} ${roleBadge.text} dark:bg-slate-800 dark:border-slate-600 dark:text-white`}
                      >
                        <option value="ADMIN">Administrador</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="OPERATOR">Operador</option>
                        <option value="VIEWER">Visualizador</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          member.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            member.active ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-rose-600 dark:bg-rose-500'
                          }`}
                        />
                        {member.active ? 'Activo' : 'Suspendido'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingMember(member)}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition shadow-2xs"
                        >
                          <span>⚙️</span>
                          <span>Permisos</span>
                          {member.permissions && typeof member.permissions === 'object' && (
                            <span
                              className="ml-0.5 rounded-md bg-blue-200/80 dark:bg-blue-800/80 px-1.5 py-0.2 text-[10px] text-blue-900 dark:text-blue-100 font-extrabold"
                              title="Permisos personalizados asignados"
                            >
                              {Object.values(member.permissions).filter(Boolean).length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => handleToggleStatus(member.id, member.active)}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold border transition shadow-2xs ${
                            member.active
                              ? 'border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30'
                              : 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                          }`}
                        >
                          {member.active ? 'Suspender' : 'Reactivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: New Team Member */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Registrar Nuevo Miembro</h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Crea el acceso directo para un operario o supervisor</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-full bg-slate-100 dark:bg-slate-800 p-1.5 sm:p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">Nombre Completo</label>
                <input
                  required
                  placeholder="Ej: Carlos Mendoza"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs font-medium dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">Correo Electrónico</label>
                <input
                  required
                  type="email"
                  placeholder="carlos@empresa.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs font-medium dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">Contraseña Inicial</label>
                <input
                  required
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs font-medium dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">Rol Operativo</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs font-medium dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="OPERATOR">Operador (Entradas, salidas y transferencias)</option>
                  <option value="SUPERVISOR">Supervisor (Gestión de catálogo y ubicaciones)</option>
                  <option value="ADMIN">Administrador (Acceso total)</option>
                  <option value="VIEWER">Visualizador (Solo lectura de stock y layout)</option>
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto rounded-lg bg-blue-600 dark:bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-blue-500 dark:hover:bg-blue-500 disabled:opacity-50 text-center"
                >
                  {submitting ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Granular Permissions Manager */}
      <PermissionsModal
        member={editingMember}
        isOpen={editingMember !== null}
        onClose={() => setEditingMember(null)}
        onSave={handleSavePermissions}
        onToggleStatus={handleToggleStatus}
      />

      {/* Floating Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 flex items-center justify-between sm:justify-start gap-2.5 rounded-xl bg-slate-900/95 dark:bg-slate-800 px-4 py-3 text-xs font-bold text-white shadow-2xl border border-slate-700 dark:border-slate-600 backdrop-blur-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-sm">✓</span>
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-3 text-slate-400 hover:text-white p-1 rounded-lg"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
