"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
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
    // Fallback if rendered outside provider
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

      setToasts((prev) => [...prev.slice(-3), newToast]); // Keep max 4 visible at once

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      bg: "bg-emerald-950/90 dark:bg-emerald-950/95 border-emerald-600/50 text-emerald-100",
      icon: "✓",
      iconBg: "bg-emerald-500/20 text-emerald-400",
      barBg: "bg-emerald-400",
    },
    error: {
      bg: "bg-rose-950/90 dark:bg-rose-950/95 border-rose-600/50 text-rose-100",
      icon: "✕",
      iconBg: "bg-rose-500/20 text-rose-400",
      barBg: "bg-rose-500",
    },
    warning: {
      bg: "bg-amber-950/90 dark:bg-amber-950/95 border-amber-600/50 text-amber-100",
      icon: "⚠",
      iconBg: "bg-amber-500/20 text-amber-400",
      barBg: "bg-amber-400",
    },
    info: {
      bg: "bg-slate-900/90 dark:bg-slate-900/95 border-slate-700/60 text-slate-100",
      icon: "ℹ",
      iconBg: "bg-blue-500/20 text-blue-400",
      barBg: "bg-blue-400",
    },
  }[toast.type];

  return (
    <div
      role="status"
      className={`pointer-events-auto relative overflow-hidden rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100 ${typeConfig.bg}`}
    >
      <div className="p-3.5 flex items-start gap-3">
        <div
          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${typeConfig.iconBg}`}
        >
          {typeConfig.icon}
        </div>
        <div className="flex-1 min-w-0 pr-1">
          {toast.title && <p className="font-bold text-xs uppercase tracking-wider mb-0.5 opacity-90">{toast.title}</p>}
          <p className="text-xs sm:text-sm font-medium leading-snug break-words">{toast.message}</p>
        </div>

        {toast.undoAction && (
          <button
            type="button"
            onClick={() => {
              toast.undoAction?.();
              onDismiss();
            }}
            className="shrink-0 px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg transition-colors text-white border border-white/20"
          >
            {toast.undoLabel || "Deshacer"}
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="text-white/60 hover:text-white shrink-0 p-1 text-xs font-bold rounded-lg transition"
          aria-label="Cerrar notificación"
        >
          ✕
        </button>
      </div>

      {/* Progress countdown bar */}
      <div className="h-1 w-full bg-white/10">
        <div
          className={`h-full transition-all duration-75 ease-linear ${typeConfig.barBg}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
