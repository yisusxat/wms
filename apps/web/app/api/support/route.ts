import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subject, category, description, user, role, url, userAgent, screenResolution } = body;

    const resendApiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || 'WMS Logística <onboarding@resend.dev>';
    const supportTarget = process.env.SUPPORT_EMAIL_TARGET || 'yisusxat@gmail.com';

    let emailStatus = 'skipped';
    if (resendApiKey) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + resendApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [supportTarget],
            subject: '[Ticket Soporte - ' + category + '] ' + subject,
            html: '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">' +
              '<div style="background-color: #1e3a8a; padding: 18px; border-radius: 8px; text-align: center; color: white;">' +
              '<h2 style="margin: 0; font-size: 20px;">Nueva Incidencia de Soporte WMS</h2>' +
              '</div>' +
              '<div style="margin-top: 20px;">' +
              '<p style="font-size: 14px;"><strong>Asunto:</strong> ' + subject + '</p>' +
              '<p style="font-size: 14px;"><strong>Categoría:</strong> ' + category + '</p>' +
              '<p style="font-size: 14px;"><strong>Reportado por:</strong> ' + (user || 'Anónimo') + ' (' + (role || 'Usuario') + ')</p>' +
              '<div style="margin-top: 16px; padding: 14px; background: #f8fafc; border-left: 4px solid #2563eb; border-radius: 4px;">' +
              '<p style="margin: 0; font-size: 14px; font-weight: bold;">Descripción:</p>' +
              '<p style="margin: 8px 0 0 0; font-size: 13px; line-height: 1.5; white-space: pre-wrap;">' + description + '</p>' +
              '</div>' +
              '<div style="margin-top: 16px; padding: 12px; background: #f1f5f9; border-radius: 6px; font-size: 11px; color: #64748b;">' +
              '<p style="margin: 0;"><strong>Contexto técnico del reporte:</strong></p>' +
              '<p style="margin: 4px 0 0 0;">URL: ' + (url || '-') + '</p>' +
              '<p style="margin: 2px 0 0 0;">Resolución: ' + (screenResolution || '-') + '</p>' +
              '<p style="margin: 2px 0 0 0;">Navegador: ' + (userAgent || '-') + '</p>' +
              '<p style="margin: 2px 0 0 0;">Fecha: ' + new Date().toISOString() + '</p>' +
              '</div>' +
              '</div>' +
              '</div>',
          }),
        });

        if (resendRes.ok) {
          const resendData = await resendRes.json();
          emailStatus = 'sent (ID: ' + resendData.id + ')';
        } else {
          const errText = await resendRes.text();
          console.error('Failed to send support email via Resend:', errText);
          emailStatus = 'failed';
        }
      } catch (emailErr) {
        console.error('Error invoking Resend for support ticket:', emailErr);
        emailStatus = 'error';
      }
    }

    return NextResponse.json({
      status: 'ok',
      message: 'Ticket de soporte registrado y notificado por correo',
      emailStatus,
    });
  } catch (err: any) {
    console.error('Error processing support report:', err);
    return NextResponse.json({ error: err.message || 'Error al procesar el reporte' }, { status: 500 });
  }
}
