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
    .replace(/\b(v\.?|vallecano|united|cf|de|del)\b/gi, "")
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

    // 2. Traer los 15 partidos oficiales ordenados
    const { data: partidosBd, error: errPartidos } = await supabase
      .from("partidos")
      .select("*")
      .eq("jornada_id", jornadaActual.id)
      .order("casilla", { ascending: true });

    if (errPartidos || !partidosBd) {
      return NextResponse.json({ error: "Error al cargar los partidos", partidos: [] }, { status: 500 });
    }
    // SI YA ESTÁN EN SUPABASE, DEVUÉLVELOS DIRECTO SIN LLAMAR A ESPN
    const yaEstanGuardados = partidosBd.length > 0 && partidosBd.every(
      (p) => p.signo && p.signo !== "-" && p.marcador && p.marcador !== "- vs -"
    );

    if (jSolicitada && yaEstanGuardados) {
      return NextResponse.json({
        jornada: jornadaActual.id,
        temporada: jornadaActual.temporada,
        fecha: jornadaActual.fecha,
        partidos: partidosBd.map((p) => ({
          id: p.casilla,
          casilla: p.casilla,
          local: p.local,
          visitante: p.visitante,
          equipo1: p.local,
          equipo2: p.visitante,
          horario: p.horario,
          marcador: p.marcador,
          signo: p.signo,
          estado: "Final",
        })),
        total: partidosBd.length,
      });
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
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.log("--> ERROR HTTP EN ESPN:", res.status, url);
          return [];
        }
        const data = await res.json();
        const liga = url.split("/scoreboard")[0].split("/").pop();
        console.log(`--> ESPN (${liga}) -> EVENTOS:`, data.events?.length || 0);
        return data.events || [];
      } catch (err: any) {
        console.log("--> FALLO FETCH ESPN:", err.message, url);
        return [];
      }
    };

    const fechaAyer = new Date(ahora);
    fechaAyer.setDate(ahora.getDate() - 1);
    const fechaManana = new Date(ahora);
    fechaManana.setDate(ahora.getDate() + 1);

    const fAyerStr = fmt(fechaAyer);
    const fHoyStr = fmt(ahora);
    const fMananaStr = fmt(fechaManana);

    const ligas = [
      "esp.1",                   // LaLiga EA Sports (Primera)
      "esp.2",                   // LaLiga Hypermotion (Segunda)
      "esp.copa_del_rey",        // Copa del Rey
      "esp.w.1",                 // Liga F (Femenina)
      "uefa.champions",          // Champions League
      "uefa.europa",             // Europa League
      "uefa.europa.conf",        // Conference League
    ];
    const fechasConsultar = [fAyerStr, fHoyStr, fMananaStr];

    const urls: string[] = [];
    ligas.forEach((liga) => {
      // Petición directa a la jornada activa
      urls.push(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`);
      // Petición con fechas de ayer, hoy y mañana
      fechasConsultar.forEach((f) => {
        urls.push(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard?dates=${f}&limit=100`);
      });
    });

    const resultadosEventos = await Promise.all(urls.map(fetchSeguro));
    const eventos = resultadosEventos.flat();

    // 4. Cruzar tus casillas oficiales con los marcadores en directo
    const partidos = await Promise.all(partidosBd.map(async (p) => {
      let marcador = p.marcador && p.marcador !== "- vs -" ? p.marcador : "- vs -";
      let signo = p.signo && p.signo !== "-" ? p.signo : "-";
      let estado = (p.marcador && p.marcador !== "- vs -" && p.marcador !== "-") ? "Final" : p.horario;

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

            const reloj = evento.status?.displayClock ? `${evento.status.displayClock}'` : (evento.status?.type?.shortDetail || "En juego");
            estado = estaFinalizado ? "Final" : reloj;

            if (p.signo !== signo || p.marcador !== marcador) {
              await supabase
                .from("partidos")
                .update({ 
                  marcador, 
                  signo,
                  estado: estaFinalizado ? "Final" : reloj 
                })
                .eq("id", p.id);
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
    }));

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