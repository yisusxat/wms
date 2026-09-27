"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { playSuccessSound, playErrorSound } from "../../lib/audioCues";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
  duration: number;
  undoAction?: () => void;
  undoLabel?: string;
  createdAt: number;
}

export interface ToastOptions {
  message: string;
  title?: string;
  type?: ToastType;
  duration?: number;
  undoAction?: () => void;
  undoLabel?: string;
}

interface ToastContextValue {
  showToast: (opts: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (opts: ToastOptions) => {
        if (opts.type === "error") {
          console.error(opts.message);
        } else {
          console.log(opts.message);
        }
        return "fallback";
      },
      dismissToast: () => {},
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      message,
      title,
      type = "info",
      duration = 4000,
      undoAction,
      undoLabel = "Deshacer",
    }: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = {
        id,
        message,
        title,
        type,
        duration,
        undoAction,
        undoLabel,
        createdAt: Date.now(),
      };

      if (type === "success") {
        playSuccessSound();
      } else if (type === "error") {
        playErrorSound();
      }

      setToasts((prev) => [...prev.slice(-3), newToast]);

      return id;
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <aside
      aria-label="Notificaciones del sistema"
      className="fixed bottom-20 lg:bottom-6 right-3 lg:right-6 left-3 sm:left-auto z-50 flex flex-col gap-2 max-w-sm w-auto sm:w-96 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </aside>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const totalTime = toast.duration;
    if (totalTime <= 0) return;

    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / totalTime) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [toast.duration, onDismiss]);

  const typeConfig = {
    success: {
      card: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-emerald-600 text-slate-800 dark:text-slate-100",
      icon: CheckCircle2,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      barBg: "bg-emerald-600",
    },
    error: {
      card: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-red-600 text-slate-800 dark:text-slate-100",
      icon: XCircle,
      iconColor: "text-red-600 dark:text-red-400",
      barBg: "bg-red-600",
    },
    warning: {
      card: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-amber-500 text-slate-800 dark:text-slate-100",
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      barBg: "bg-amber-500",
    },
    info: {
      card: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-blue-600 text-slate-800 dark:text-slate-100",
      icon: Info,
      iconColor: "text-blue-600 dark:text-blue-400",
      barBg: "bg-blue-600",
    },
  }[toast.type];

  const IconComponent = typeConfig.icon;

  return (
    <div
      role="status"
      className={`pointer-events-auto relative overflow-hidden rounded-xl border shadow-lg transition-all duration-300 transform translate-y-0 opacity-100 ${typeConfig.card}`}
    >
      <div className="p-3.5 flex items-start gap-3">
        <IconComponent size={20} className={`shrink-0 mt-0.5 ${typeConfig.iconColor}`} />
        <div className="flex-1 min-w-0 pr-1">
          {toast.title && (
            <p className="font-semibold text-xs uppercase tracking-wider mb-0.5 text-slate-500 dark:text-slate-400">
              {toast.title}
            </p>
          )}
          <p className="text-xs sm:text-sm font-medium leading-snug break-words">{toast.message}</p>
        </div>

        {toast.undoAction && (
          <button
            type="button"
            onClick={() => {
              toast.undoAction?.();
              onDismiss();
            }}
            className="shrink-0 px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-95 rounded-lg transition-colors text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            {toast.undoLabel || "Deshacer"}
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 p-1 rounded-lg transition cursor-pointer"
          aria-label="Cerrar notificación"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress countdown bar */}
      <div className="h-0.5 w-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full transition-all duration-75 ease-linear ${typeConfig.barBg}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
