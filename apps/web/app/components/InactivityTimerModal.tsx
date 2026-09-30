"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Clock, ShieldAlert, LogOut, CheckCircle2 } from "lucide-react";
import { playClickSound, playWarningSound } from "../../lib/audioCues";
import { WMS_SYNC_EVENT } from "../../lib/syncEvents";

interface InactivityTimerModalProps {
  isLoggedIn: boolean;
  onSignOut: (reason?: string) => void;
  /** Inactivity timeout in minutes. Defaults to 15 minutes. */
  timeoutMinutes?: number;
  /** Warning countdown window in seconds before auto logout. Defaults to 60 seconds. */
  warningSeconds?: number;
}

const STORAGE_LAST_ACTIVITY = "wms_last_activity";

export function InactivityTimerModal({
  isLoggedIn,
  onSignOut,
  timeoutMinutes = 15,
  warningSeconds = 60,
}: InactivityTimerModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningMs = warningSeconds * 1000;

  const lastActivityRef = useRef<number>(Date.now());
  const soundPlayedRef = useRef<boolean>(false);
  const throttleTimerRef = useRef<number>(0);

  // Record active user interaction
  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    soundPlayedRef.current = false;
    setShowWarning(false);
    setSecondsRemaining(null);

    // Throttle writing to localStorage across tabs (max once per 2 seconds)
    if (now - throttleTimerRef.current > 2000) {
      throttleTimerRef.current = now;
      try {
        localStorage.setItem(STORAGE_LAST_ACTIVITY, now.toString());
      } catch {}
    }
  }, []);

  // Reset timer manually when clicking "Mantener sesión activa"
  const handleKeepAlive = () => {
    playClickSound();
    recordActivity();
  };

  const handleSignOutNow = () => {
    playClickSound();
    setShowWarning(false);
    onSignOut("Has cerrado sesión manualmente por inactividad.");
  };

  useEffect(() => {
    if (!isLoggedIn) {
      setShowWarning(false);
      setSecondsRemaining(null);
      return;
    }

    // Initialize activity timestamp
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem(STORAGE_LAST_ACTIVITY, now.toString());
    } catch {}

    // Throttle event handlers
    let lastMoveTime = 0;
    const handleUserActivity = () => {
      const currentTime = Date.now();
      if (currentTime - lastMoveTime > 1500) {
        lastMoveTime = currentTime;
        recordActivity();
      }
    };

    // Listen across browser tabs for activity in another window
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_LAST_ACTIVITY && e.newValue) {
        const remoteTime = parseInt(e.newValue, 10);
        if (!isNaN(remoteTime) && remoteTime > lastActivityRef.current) {
          lastActivityRef.current = remoteTime;
          soundPlayedRef.current = false;
          setShowWarning(false);
          setSecondsRemaining(null);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Read latest remote activity if user was working in another tab/app
        try {
          const stored = localStorage.getItem(STORAGE_LAST_ACTIVITY);
          if (stored) {
            const remoteTime = parseInt(stored, 10);
            if (!isNaN(remoteTime) && remoteTime > lastActivityRef.current) {
              lastActivityRef.current = remoteTime;
            }
          }
        } catch {}
      }
    };

    // Activity event listeners
    const eventOptions: AddEventListenerOptions = { passive: true };
    window.addEventListener("mousemove", handleUserActivity, eventOptions);
    window.addEventListener("mousedown", handleUserActivity, eventOptions);
    window.addEventListener("keydown", handleUserActivity, eventOptions);
    window.addEventListener("touchstart", handleUserActivity, eventOptions);
    window.addEventListener("scroll", handleUserActivity, eventOptions);
    window.addEventListener("wheel", handleUserActivity, eventOptions);
    window.addEventListener("storage", handleStorageChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(WMS_SYNC_EVENT, handleUserActivity as EventListener);

    // Heartbeat ticker: checks every 1000ms
    const interval = setInterval(() => {
      const current = Date.now();
      // Check if remote tab recorded more recent activity
      try {
        const stored = localStorage.getItem(STORAGE_LAST_ACTIVITY);
        if (stored) {
          const remoteTime = parseInt(stored, 10);
          if (!isNaN(remoteTime) && remoteTime > lastActivityRef.current) {
            lastActivityRef.current = remoteTime;
            soundPlayedRef.current = false;
            setShowWarning(false);
            setSecondsRemaining(null);
            return;
          }
        }
      } catch {}

      const elapsed = current - lastActivityRef.current;
      const timeLeftMs = timeoutMs - elapsed;

      if (timeLeftMs <= 0) {
        // Time expired: force logout
        clearInterval(interval);
        setShowWarning(false);
        setSecondsRemaining(0);
        onSignOut(
          `Tu sesión se cerró automáticamente tras ${timeoutMinutes} minutos de inactividad por seguridad.`
        );
        return;
      }

      if (timeLeftMs <= warningMs) {
        // In warning zone: show countdown modal
        const secondsLeft = Math.max(1, Math.ceil(timeLeftMs / 1000));
        setSecondsRemaining(secondsLeft);
        setShowWarning(true);

        if (!soundPlayedRef.current) {
          soundPlayedRef.current = true;
          playWarningSound();
        }
      } else {
        setShowWarning(false);
        setSecondsRemaining(null);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("mousedown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
      window.removeEventListener("wheel", handleUserActivity);
      window.removeEventListener("storage", handleStorageChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(WMS_SYNC_EVENT, handleUserActivity as EventListener);
    };
  }, [isLoggedIn, timeoutMs, warningMs, timeoutMinutes, recordActivity, onSignOut]);

  if (!isLoggedIn || !showWarning || secondsRemaining === null) {
    return null;
  }

  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round((secondsRemaining / warningSeconds) * 100))
  );

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      aria-describedby="inactivity-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-fadeIn"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl transition-all sm:p-7 dark:border-amber-900/60 dark:bg-slate-900">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>

          <div className="flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Seguridad de Bodega
            </span>
            <h2
              id="inactivity-title"
              className="text-lg font-bold text-slate-900 sm:text-xl dark:text-white"
            >
              Sesión próxima a expirar
            </h2>
          </div>
        </div>

        <p
          id="inactivity-desc"
          className="mt-3.5 text-xs text-slate-600 sm:text-sm dark:text-slate-300"
        >
          No hemos detectado interacción reciente. Por seguridad de los datos de inventario y
          operaciones, la sesión se cerrará automáticamente en:
        </p>

        {/* Circular / Large Digital Countdown */}
        <div className="my-5 flex flex-col items-center justify-center rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 animate-pulse dark:text-amber-400" />
            <span className="font-mono text-3xl sm:text-4xl font-black text-slate-900 tracking-tight dark:text-white">
              {String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:
              {String(secondsRemaining % 60).padStart(2, "0")}
            </span>
            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              seg
            </span>
          </div>

          {/* Progress bar indicator */}
          <div className="mt-3 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full transition-all duration-1000 rounded-full ${
                secondsRemaining <= 15 ? "bg-red-600" : "bg-amber-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Límite configurado: {timeoutMinutes} minutos de inactividad
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleSignOutNow}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-98 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar sesión ahora</span>
          </button>

          <button
            type="button"
            autoFocus
            onClick={handleKeepAlive}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-98 cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Mantener sesión activa</span>
          </button>
        </div>
      </div>
    </div>
  );
}
