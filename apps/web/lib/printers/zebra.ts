export type PrintMethod = 'browser' | 'bluetooth' | 'network';

export interface PrintOptions {
  method: PrintMethod;
  networkIp?: string;
  networkPort?: number;
}

/**
 * Imprime un payload ZPL en una impresora Zebra industrial.
 *
 * Métodos soportados:
 * - 'browser':   Abre el diálogo de impresión del sistema (fallback siempre disponible)
 * - 'bluetooth': Envía ZPL via Web Bluetooth API (Chrome Android/Desktop)
 * - 'network':   Envía ZPL via socket TCP a IP:puerto (proxy en Next.js API)
 */
export async function printZpl(
  zpl: string,
  options: PrintOptions
): Promise<{ ok: boolean; error?: string }> {
  switch (options.method) {
    case 'bluetooth':
      return printViaBluetooth(zpl);
    case 'network':
      return printViaNetwork(zpl, options.networkIp!, options.networkPort ?? 9100);
    case 'browser':
    default:
      printViaBrowser(zpl);
      return { ok: true };
  }
}

// ─── Método A: Web Bluetooth ──────────────────────────────────────────────────
async function printViaBluetooth(
  zpl: string
): Promise<{ ok: boolean; error?: string }> {
  if (!('bluetooth' in navigator)) {
    return { ok: false, error: 'Web Bluetooth no está disponible en este navegador. Usa Chrome en Android o Desktop.' };
  }
  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [
        { namePrefix: 'Zebra' },
        { namePrefix: 'ZD' },
        { namePrefix: 'GK' },
        { namePrefix: 'ZT' },
        { namePrefix: 'ZQ' },
      ],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    });

    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const char    = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

    const encoder = new TextEncoder();
    const data    = encoder.encode(zpl);
    const CHUNK   = 512; // BLE MTU máximo seguro

    for (let i = 0; i < data.length; i += CHUNK) {
      await char.writeValueWithResponse(data.slice(i, i + CHUNK));
    }

    server.disconnect();
    return { ok: true };
  } catch (err: any) {
    if (err?.name === 'NotFoundError') {
      return { ok: false, error: 'No se encontró ninguna impresora Zebra por Bluetooth.' };
    }
    return { ok: false, error: err?.message ?? 'Error de Bluetooth desconocido.' };
  }
}

// ─── Método B: Red TCP/IP via proxy Next.js ───────────────────────────────────
async function printViaNetwork(
  zpl: string,
  ip: string,
  port: number
): Promise<{ ok: boolean; error?: string }> {
  if (!ip) {
    return { ok: false, error: 'Debes ingresar la dirección IP de la impresora.' };
  }
  try {
    const res = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zpl, ip, port }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body?.error ?? `Error HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo conectar con la impresora en red.' };
  }
}

// ─── Método C: Fallback — diálogo del navegador ───────────────────────────────
function printViaBrowser(zpl: string): void {
  // Abrir el ZPL en una nueva ventana y disparar el diálogo de impresión
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head><title>Imprimir Etiqueta ZPL</title></head>
    <body style="font-family:monospace;white-space:pre;padding:16px;">
      <p style="color:#666;font-size:12px;">Copia el contenido ZPL a tu software de impresión Zebra:</p>
      <textarea style="width:100%;height:80vh;font-size:11px;">${zpl.replace(/</g, '&lt;')}</textarea>
    </body>
    </html>
  `);
  win.document.close();
  win.print();
}
