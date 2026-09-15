import { NextResponse } from "next/server";
import { supabase } from "@/supabaseClient";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizar(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // 1. Quita (f), (m), F o M al final o entre paréntesis
    .replace(/\s*\([fm]\)\s*/gi, "")
    .replace(/\s+[fm]$/gi, "")
    .replace(/\b(ii|2)\b/gi, "b")
    // 2. Quita prefijos típicos (c.d., u.d., r., real, atl, dux...)
    .replace(/^(c\.?d\.?|u\.?d\.?|r\.?c\.?d\.?|r\.?c\.?|r\.?|atletico|atleti|atl\.?|real|dux)\s+/gi, "")
    // 3. Quita sufijos típicos (vallecano, v., united, cf, etc.)
    .replace(/\b(v\.?|vallecano|united|cf)\b/gi, "")
    // 4. Deja solo letras y números
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function coinciden(nombreA: string, nombreB: string): boolean {
  const a = normalizar(nombreA);
  const b = normalizar(nombreB);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jSolicitada = searchParams.get("jornada");

    // 1. Obtener la jornada de Supabase
    let queryJornada = supabase.from("jornadas").select("*");
    if (jSolicitada) {
      queryJornada = queryJornada.eq("id", Number(jSolicitada));
    } else {
      queryJornada = queryJornada.eq("activa", true);
    }

    const { data: jornadas, error: errJornada } = await queryJornada.limit(1);

    if (errJornada || !jornadas || jornadas.length === 0) {
      return NextResponse.json({ error: "No se encontró la jornada", partidos: [] }, { status: 404 });
    }

    let jornadaActual = jornadas[0];

    // AUTO-AVANCE: Si no se pide una jornada específica, verificar si han pasado 4h del último partido
    if (!jSolicitada && jornadaActual.activa) {
      const { data: partidosPrevios } = await supabase
        .from("partidos")
        .select("horario")
        .eq("jornada_id", jornadaActual.id);

      const diasSemana: Record<string, number> = { dom: 0, lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, vie: 5, sab: 6, sáb: 6 };
      const ahora = new Date();
      let ultimoInicio: Date | null = null;

      for (const p of partidosPrevios || []) {
        const match = (p.horario || "").toLowerCase().match(/(lun|mar|mie|mié|jue|vie|sab|sáb|dom)\s+(\d{1,2}):(\d{2})/);
        if (match) {
          const diaTarget = diasSemana[match[1]];
          const horas = parseInt(match[2], 10);
          const minutos = parseInt(match[3], 10);

          const fechaP = new Date(ahora);
          fechaP.setHours(horas, minutos, 0, 0);
          const diffDias = (diaTarget - ahora.getDay() + 7) % 7;
          
          const fechaAjustada = new Date(fechaP);
          if (diffDias > 3) {
            fechaAjustada.setDate(fechaAjustada.getDate() - (7 - diffDias));
          } else {
            fechaAjustada.setDate(fechaAjustada.getDate() + diffDias);
          }

          if (!ultimoInicio || fechaAjustada > ultimoInicio) {
            ultimoInicio = fechaAjustada;
          }
        }
      }

      // Si pasaron más de 4 horas desde el inicio del último partido
      if (ultimoInicio) {
        const cuatroHorasEnMs = 4 * 60 * 60 * 1000;
        if (ahora.getTime() - ultimoInicio.getTime() > cuatroHorasEnMs) {
          const siguienteId = jornadaActual.id + 1;
          const { data: sigExiste } = await supabase
            .from("jornadas")
            .select("*")
            .eq("id", siguienteId)
            .maybeSingle();

          if (sigExiste) {
            await supabase.from("jornadas").update({ activa: false }).eq("id", jornadaActual.id);
            await supabase.from("jornadas").update({ activa: true }).eq("id", siguienteId);
            jornadaActual = sigExiste;
          }
        }
      }
    }

    // 2. Traer los 15 partidos oficiales ordenados
    const { data: partidosBd, error: errPartidos } = await supabase
      .from("partidos")
      .select("*")
      .eq("jornada_id", jornadaActual.id)
      .order("casilla", { ascending: true });

    if (errPartidos || !partidosBd) {
      return NextResponse.json({ error: "Error al cargar los partidos", partidos: [] }, { status: 500 });
    }

    // 3. Consultar resultados en vivo en ESPN
    const ahora = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

    const fInicio = new Date(ahora);
    fInicio.setDate(ahora.getDate() - 4);
    const fFin = new Date(ahora);
    fFin.setDate(ahora.getDate() + 4);
    const rangoFechas = `${fmt(fInicio)}-${fmt(fFin)}`;

    const fetchSeguro = async (url: string) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) return [];
        const data = await res.json();
        return data.events || [];
      } catch {
        return [];
      }
    };

    const urls = [
      `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${rangoFechas}&limit=50`,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=${rangoFechas}&limit=50`,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.w.1/scoreboard?dates=${rangoFechas}&limit=50`,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${rangoFechas}&limit=50`,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${rangoFechas}&limit=50`,
    ];

    const resultadosEventos = await Promise.all(urls.map(fetchSeguro));
    const eventos = resultadosEventos.flat();

    // 4. Cruzar tus casillas oficiales con los marcadores en directo
    const partidos = partidosBd.map((p) => {
      let marcador = p.marcador && p.marcador !== "- vs -" ? p.marcador : "- vs -";
      let signo = p.signo && p.signo !== "-" ? p.signo : "-";
      let estado = p.horario;

      const evento = eventos.find((ev: any) => {
        const comp = ev.competitions?.[0]?.competitors || [];
        const eqLocal = comp.find((c: any) => c.homeAway === "home")?.team?.name || "";
        const eqVisitante = comp.find((c: any) => c.homeAway === "away")?.team?.name || "";

        return (
          (coinciden(p.local, eqLocal) && coinciden(p.visitante, eqVisitante)) ||
          (coinciden(p.local, eqVisitante) && coinciden(p.visitante, eqLocal))
        );
      });

      if (evento) {
        const comp = evento.competitions?.[0];
        const cLocal = comp?.competitors?.find((c: any) => c.homeAway === "home");
        const cAway = comp?.competitors?.find((c: any) => c.homeAway === "away");

        const statusType = evento.status?.type || {};
        const estaFinalizado = Boolean(statusType.completed || statusType.state === "post" || statusType.description === "Final");
        const estaEnJuego = Boolean(statusType.state === "in");

        if (estaFinalizado || estaEnJuego) {
          const scoreLocal = parseInt(cLocal?.score ?? "0", 10);
          const scoreAway = parseInt(cAway?.score ?? "0", 10);

          if (!isNaN(scoreLocal) && !isNaN(scoreAway)) {
            marcador = `${scoreLocal} - ${scoreAway}`;
            if (scoreLocal > scoreAway) signo = "1";
            else if (scoreLocal < scoreAway) signo = "2";
            else signo = "X";

            if (estaFinalizado) {
              estado = "Final";
            } else {
              const reloj = evento.status?.displayClock;
              estado = reloj ? `${reloj}'` : "En vivo";
            }
          }
        }
      }

      return {
        id: p.casilla,
        local: p.local,
        visitante: p.visitante,
        equipo1: p.local,
        equipo2: p.visitante,
        horario: p.horario,
        marcador,
        signo,
        estado,
      };
    });

    return NextResponse.json({
      jornada: jornadaActual.id,
      temporada: jornadaActual.temporada,
      fecha: jornadaActual.fecha,
      partidos,
      total: partidos.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al sincronizar jornada", partidos: [] },
      { status: 500 }
    );
  }
}