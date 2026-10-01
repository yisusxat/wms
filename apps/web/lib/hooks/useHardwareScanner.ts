'use client';
import { useEffect, useRef, useCallback } from 'react';

export interface UseHardwareScannerOptions {
  /** Callback que recibe el código escaneado completo */
  onScan: (code: string) => void;
  /** Si el hook está activo. Default: true */
  enabled?: boolean;
  /** Longitud mínima del código para considerarlo válido. Default: 3 */
  minLength?: number;
  /**
   * Tiempo máximo en ms entre pulsaciones para considerar que viene
   * de un escáner (ráfaga) vs escritura manual del usuario. Default: 80ms
   */
  maxInterKeyDelay?: number;
  /**
   * Tiempo de inactividad en ms tras el cual se descarta el buffer.
   * Evita que caracteres sueltos se acumulen. Default: 300ms
   */
  bufferTimeout?: number;
}

/**
 * Hook que detecta entrada de escáneres de código de barras industriales (HID Wedge).
 * Los escáneres HID emiten el código como ráfaga de teclas muy rápidas (< 80ms entre
 * caracteres) terminando con la tecla Enter.
 *
 * Funcionamiento:
 * 1. Escucha `keydown` globalmente.
 * 2. Ignora eventos cuando el foco está en un input del usuario
 *    (excepto inputs marcados con `data-scanner-input`).
 * 3. Acumula caracteres en un buffer mientras el intervalo entre teclas
 *    sea menor a `maxInterKeyDelay`.
 * 4. Al recibir Enter, si el buffer >= `minLength`, llama `onScan(buffer)`.
 * 5. Si pasa `bufferTimeout` ms sin nueva tecla, descarta el buffer.
 */
export function useHardwareScanner({
  onScan,
  enabled = true,
  minLength = 3,
  maxInterKeyDelay = 80,
  bufferTimeout = 300,
}: UseHardwareScannerOptions) {
  const bufferRef   = useRef('');
  const lastKeyRef  = useRef<number>(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef   = useRef(onScan);

  // Mantener referencia actualizada para evitar closures obsoletos
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const clearBuffer = useCallback(() => {
    bufferRef.current = '';
    lastKeyRef.current = 0;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetBufferTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(clearBuffer, bufferTimeout);
  }, [clearBuffer, bufferTimeout]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      const target = e.target as HTMLElement;

      // Ignorar si el foco está en un campo de texto del usuario
      // EXCEPTO si el campo tiene el atributo data-scanner-input
      const isUserInput =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) &&
        target.getAttribute('data-scanner-input') === null;

      if (isUserInput) {
        clearBuffer();
        return;
      }

      // Ignorar teclas modificadoras
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        if (code.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(code);
        }
        clearBuffer();
        return;
      }

      // Solo acumular caracteres imprimibles
      if (e.key.length !== 1) return;

      const timeSinceLast = lastKeyRef.current ? now - lastKeyRef.current : 0;

      // Si pasó demasiado tiempo desde la última tecla, resetear buffer
      // (el usuario está escribiendo manualmente, no es una ráfaga de escáner)
      if (lastKeyRef.current && timeSinceLast > maxInterKeyDelay) {
        // Solo descartar si el buffer no es muy largo (podría ser escritura rápida)
        if (bufferRef.current.length < 4) {
          clearBuffer();
        }
      }

      bufferRef.current += e.key;
      lastKeyRef.current = now;
      resetBufferTimer();
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.removeEventListener('keydown', handler, { capture: true });
      clearBuffer();
    };
  }, [enabled, minLength, maxInterKeyDelay, clearBuffer, resetBufferTimer]);
}
