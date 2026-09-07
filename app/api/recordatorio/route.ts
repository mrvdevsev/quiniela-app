import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { emails, jornada } = await req.json();

    if (!emails || emails.length === 0) {
      return NextResponse.json(
        { error: "No hay destinatarios pendientes" },
        { status: 400 }
      );
    }

    await resend.emails.send({
      from: "QuinielaHub <onboarding@resend.dev>",
      to: emails,
      subject: `⚽ ¡Recordatorio Jornada ${jornada}! Rellena tu boleto`,
      html: `
        <div style="font-family: sans-serif; background-color: #0b1320; color: #ffffff; padding: 24px; border-radius: 12px;">
          <h2 style="color: #00e699;">¡Atención peñista!</h2>
          <p>Te recordamos que la <strong>Jornada ${jornada}</strong> está a punto de comenzar y aún no has completado tus pronósticos.</p>
          <p>Entra en la aplicación cuanto antes para no quedarte sin puntuar en este ciclo.</p>
          <br/>
          <span style="color: #94a3b8; font-size: 12px;">Mensaje automático enviado desde QuinielaHub.</span>
        </div>
      `,
    });

    return NextResponse.json({ success: true, count: emails.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}