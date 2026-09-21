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

export function TeamPanel({ token, onError }: { token: string; onError: (msg: string) => void }) {
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
  }, [token]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gestión de Equipo y Accesos</h2>
          <p className="text-xs text-slate-500">
            Administra los operadores, supervisores y administradores de la bodega
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar miembro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 sm:flex-initial rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
          />
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-800 transition"
          >
            <span>+</span>
            <span>Nuevo Miembro</span>
          </button>
        </div>
      </div>

      {/* Team Table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm border border-slate-100">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider">
            <tr>
              <th className="p-4">Miembro</th>
              <th className="p-4">Correo</th>
              <th className="p-4">Rol Asignado</th>
              <th className="p-4">Estado</th>
              <th className="p-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  Cargando equipo...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  No se encontraron miembros de equipo
                </td>
              </tr>
            ) : (
              filtered.map((member) => {
                const roleBadge = ROLE_LABELS[member.role] ?? ROLE_LABELS.VIEWER;
                return (
                  <tr key={member.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-4 font-bold text-slate-800 flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 text-xs uppercase">
                        {member.name ? member.name.slice(0, 2) : 'US'}
                      </div>
                      <div>
                        <p>{member.name}</p>
                        <p className="text-[10px] text-slate-400 font-normal">ID: {member.id.slice(0, 8)}...</p>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-slate-600">{member.email || '—'}</td>
                    <td className="p-4">
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as any)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold border-0 cursor-pointer focus:ring-2 focus:ring-blue-600 ${roleBadge.bg} ${roleBadge.text}`}
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
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            member.active ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        />
                        {member.active ? 'Activo' : 'Suspendido'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingMember(member)}
                          className="flex items-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
                        >
                          <span>⚙️</span>
                          <span>Permisos</span>
                          {member.permissions && typeof member.permissions === 'object' && (
                            <span
                              className="ml-0.5 rounded-md bg-blue-200/80 px-1.5 py-0.2 text-[10px] text-blue-900 font-extrabold"
                              title="Permisos personalizados asignados"
                            >
                              {Object.values(member.permissions).filter(Boolean).length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => handleToggleStatus(member.id, member.active)}
                          className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold border transition shadow-2xs ${
                            member.active
                              ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Registrar Nuevo Miembro</h3>
                <p className="text-xs text-slate-500">Crea el acceso directo para un operario o supervisor</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-400 hover:bg-slate-200 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nombre Completo</label>
                <input
                  required
                  placeholder="Ej: Carlos Mendoza"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Correo Electrónico</label>
                <input
                  required
                  type="email"
                  placeholder="carlos@empresa.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Contraseña Inicial</label>
                <input
                  required
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Rol Operativo</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
                >
                  <option value="OPERATOR">Operador (Entradas, salidas y transferencias)</option>
                  <option value="SUPERVISOR">Supervisor (Gestión de catálogo y ubicaciones)</option>
                  <option value="ADMIN">Administrador (Acceso total)</option>
                  <option value="VIEWER">Visualizador (Solo lectura de stock y layout)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-900 px-5 py-2 text-xs font-bold text-white shadow hover:bg-blue-800 disabled:opacity-50"
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
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900/95 px-4 py-3 text-xs font-bold text-white shadow-2xl border border-slate-700 backdrop-blur-sm animate-fadeIn">
          <span className="text-emerald-400 text-sm">✓</span>
          <span>{toastMessage}</span>
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
