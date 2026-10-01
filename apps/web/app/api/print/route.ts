import { NextRequest, NextResponse } from 'next/server';
import net from 'net';

export const runtime = 'nodejs'; // Requerido: necesita módulo 'net' de Node.js

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { zpl: string; ip: string; port?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido' }, { status: 400 });
  }

  const { zpl, ip, port = 9100 } = body;

  if (!zpl || !ip) {
    return NextResponse.json({ error: 'Se requieren los campos zpl e ip' }, { status: 400 });
  }

  // Validación básica de IP
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) {
    return NextResponse.json({ error: 'Dirección IP inválida' }, { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const done = (result: NextResponse) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(5000);

    socket.connect(port, ip, () => {
      socket.write(zpl, 'utf8', (err) => {
        if (err) {
          done(NextResponse.json({ error: err.message }, { status: 500 }));
        } else {
          done(NextResponse.json({ ok: true }));
        }
      });
    });

    socket.on('error', (err) => {
      done(NextResponse.json(
        { error: `No se pudo conectar a la impresora en ${ip}:${port}. ${err.message}` },
        { status: 502 }
      ));
    });

    socket.on('timeout', () => {
      done(NextResponse.json(
        { error: `Tiempo de espera agotado al conectar con la impresora en ${ip}:${port}` },
        { status: 504 }
      ));
    });
  });
}
