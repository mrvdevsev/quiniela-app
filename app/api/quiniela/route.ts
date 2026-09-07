import { NextResponse } from "next/server";
import { supabase } from "@/supabaseClient";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizar(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([mf]\)\s*/gi, "")
    .replace(/\b(ii|2)\b/gi, "b") // Unifica Real Sociedad II -> Real Sociedad B
    .replace(/^(c\.?d\.?|u\.?d\.?|r\.?c\.?d\.?|r\.?c\.?|atletico|atleti|real)\s+/gi, "")
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

    const jornadaActual = jornadas[0];

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

    const urlLaLiga = `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${rangoFechas}&limit=50`;
    const urlSegunda = `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=${rangoFechas}&limit=50`;
    const urlFemenina = `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.w.1/scoreboard?dates=${rangoFechas}&limit=50`;

    const [resLaLiga, resSegunda, resFemenina] = await Promise.allSettled([
      fetch(urlLaLiga, { cache: "no-store" }),
      fetch(urlSegunda, { cache: "no-store" }),
      fetch(urlFemenina, { cache: "no-store" }),
    ]);

    let eventos: any[] = [];
    for (const res of [resLaLiga, resSegunda, resFemenina]) {
      if (res.status === "fulfilled" && res.value.ok) {
        try {
          const d = await res.value.json();
          eventos = eventos.concat(d.events || []);
        } catch (_) {}
      }
    }

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