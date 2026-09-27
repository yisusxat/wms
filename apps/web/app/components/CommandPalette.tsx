"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { playClickSound } from "../../lib/audioCues";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "Navegación" | "Acción Operativa" | "Ajustes";
  icon: string;
  shortcut?: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onOpenScanner?: () => void;
  onOpenAudit?: () => void;
  onOpenSupport?: () => void;
  onOpen2FA?: () => void;
  onOpenLegal?: () => void;
  onToggleTheme?: () => void;
  onToggleSound?: () => void;
  isDark?: boolean;
  isSoundOn?: boolean;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onOpenScanner,
  onOpenAudit,
  onOpenSupport,
  onOpen2FA,
  onOpenLegal,
  onToggleTheme,
  onToggleSound,
  isDark = false,
  isSoundOn = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // Navigation
      {
        id: "nav-dash",
        title: "Ir a Dashboard Principal",
        subtitle: "Resumen ejecutivo y KPIs en tiempo real",
        category: "Navegación",
        icon: "📊",
        shortcut: "G D",
        action: () => {
          onNavigate("dashboard");
          onClose();
        },
      },
      {
        id: "nav-prod",
        title: "Ir a Catálogo de Productos",
        subtitle: "Listado de SKUs, stock actual y precios",
        category: "Navegación",
        icon: "🏷️",
        shortcut: "G P",
        action: () => {
          onNavigate("products");
          onClose();
        },
      },
      {
        id: "nav-mov",
        title: "Ir a Movimientos y Kardex",
        subtitle: "Entradas, salidas, traslados y ajustes",
        category: "Navegación",
        icon: "📦",
        shortcut: "G M",
        action: () => {
          onNavigate("movements");
          onClose();
        },
      },
      {
        id: "nav-2d",
        title: "Ir a Plano 2D de Bodega",
        subtitle: "Visualización esquemática de pasillos y casilleros",
        category: "Navegación",
        icon: "🗺️",
        shortcut: "G 2",
        action: () => {
          onNavigate("warehouse2d");
          onClose();
        },
      },
      {
        id: "nav-3d",
        title: "Ir a Gemelo Digital 3D",
        subtitle: "Exploración tridimensional inmersiva de estanterías",
        category: "Navegación",
        icon: "🧊",
        shortcut: "G 3",
        action: () => {
          onNavigate("warehouse3d");
          onClose();
        },
      },
      {
        id: "nav-kpi",
        title: "Ir a Centro de Mando / KPIs",
        subtitle: "Rotación, ocupación, OTIF y exactitud de inventario",
        category: "Navegación",
        icon: "📈",
        shortcut: "G K",
        action: () => {
          onNavigate("kpi");
          onClose();
        },
      },
      {
        id: "nav-rep",
        title: "Ir a Módulo de Reportes",
        subtitle: "Exportación de datos a Excel, CSV y PDF",
        category: "Navegación",
        icon: "📄",
        shortcut: "G R",
        action: () => {
          onNavigate("reports");
          onClose();
        },
      },
      {
        id: "nav-team",
        title: "Ir a Gestión de Equipo",
        subtitle: "Usuarios, roles y matriz de permisos RBAC",
        category: "Navegación",
        icon: "👥",
        shortcut: "G T",
        action: () => {
          onNavigate("team");
          onClose();
        },
      },

      // Operational Actions
      {
        id: "act-scan",
        title: "Abrir Escáner de Código de Barras / QR",
        subtitle: "Lectura óptica con cámara del dispositivo",
        category: "Acción Operativa",
        icon: "📷",
        shortcut: "Scan",
        action: () => {
          onOpenScanner?.();
          onClose();
        },
      },
      {
        id: "act-entry",
        title: "Registrar Entrada de Mercadería",
        subtitle: "Recepción de artículos en bodega",
        category: "Acción Operativa",
        icon: "📥",
        action: () => {
          onNavigate("movements");
          onClose();
        },
      },

      // Settings & Modals
      {
        id: "set-2fa",
        title: "Configurar Autenticación 2FA",
        subtitle: "Seguridad de cuenta con código TOTP",
        category: "Ajustes",
        icon: "🔐",
        action: () => {
          onOpen2FA?.();
          onClose();
        },
      },
      {
        id: "set-audit",
        title: "Ver Bitácora de Auditoría",
        subtitle: "Historial inmutable de eventos del sistema",
        category: "Ajustes",
        icon: "📜",
        action: () => {
          onOpenAudit?.();
          onClose();
        },
      },
      {
        id: "set-support",
        title: "Mesa de Ayuda & Soporte Técnico",
        subtitle: "Reportar incidencias operativas",
        category: "Ajustes",
        icon: "⚠",
        action: () => {
          onOpenSupport?.();
          onClose();
        },
      },
      {
        id: "set-legal",
        title: "Marco Legal, SLA y Privacidad",
        subtitle: "Acuerdo de 99.5% de disponibilidad y RGPD",
        category: "Ajustes",
        icon: "⚖️",
        action: () => {
          onOpenLegal?.();
          onClose();
        },
      },
      {
        id: "set-theme",
        title: isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Industrial Oscuro",
        subtitle: "Alternar paleta visual de alto contraste",
        category: "Ajustes",
        icon: isDark ? "☀️" : "🌙",
        action: () => {
          onToggleTheme?.();
          onClose();
        },
      },
      {
        id: "set-sound",
        title: isSoundOn ? "Silenciar Efectos de Sonido" : "Activar Efectos de Sonido",
        subtitle: "Audio cues de confirmación y advertencia",
        category: "Ajustes",
        icon: isSoundOn ? "🔊" : "🔇",
        action: () => {
          onToggleSound?.();
          onClose();
        },
      },
    ];

    return list;
  }, [
    isDark,
    isSoundOn,
    onClose,
    onNavigate,
    onOpen2FA,
    onOpenAudit,
    onOpenLegal,
    onOpenScanner,
    onOpenSupport,
    onToggleSound,
    onToggleTheme,
  ]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle?.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [isOpen, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
        playClickSound();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (filteredCommands.length || 1)) % (filteredCommands.length || 1));
        playClickSound();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] mt-12 sm:mt-0"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <span className="text-xl text-slate-400 dark:text-slate-500 mr-3">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando o busca una sección... (ej: 'productos', 'kpi', 'escanear')"
            className="flex-1 bg-transparent text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1.5 py-0.5 rounded mr-2"
            >
              Borrar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar paleta"
            className="text-xs font-mono uppercase bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition"
          >
            ESC ✕
          </button>
        </div>

        {/* Commands List */}
        <div ref={listRef} className="overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <p className="text-2xl mb-1">🔍</p>
              <p className="text-sm font-medium">No se encontraron comandos para &quot;{query}&quot;</p>
              <p className="text-xs mt-1">Prueba con palabras como &quot;2D&quot;, &quot;SKU&quot;, &quot;kardex&quot; o &quot;reporte&quot;</p>
            </div>
          ) : (
            filteredCommands.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate leading-tight">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-slate-400 dark:text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <span className="hidden sm:inline text-[10px] font-mono bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-300">
                        {item.shortcut}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ Navegar</span>
            <span>↵ Seleccionar</span>
            <span>ESC Cerrar</span>
          </div>
          <span className="font-semibold text-blue-700 dark:text-blue-400">WMS Omnicanal</span>
        </div>
      </div>
    </div>
  );
}
