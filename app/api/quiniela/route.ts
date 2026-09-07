import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizar(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([mf]\)\s*/gi, "")
    .replace(/^(c\.?d\.?|u\.?d\.?|r\.?c\.?d\.?|r\.?c\.?|atletico|atleti|real)\s+/gi, "")
    .trim();
}

function coinciden(nombreA: string, nombreB: string): boolean {
  const a = normalizar(nombreA);
  const b = normalizar(nombreB);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export async function GET() {
  try {
    const ahora = new Date();
    const dia = ahora.getDay();
    const diasHastaDomingo = dia === 1 ? -1 : (dia === 0 ? 0 : 7 - dia);
    const fechaDomingo = new Date(ahora);
    fechaDomingo.setDate(ahora.getDate() + diasHastaDomingo);

    const pad = (n: number) => String(n).padStart(2, "0");
    const fechaSorteo = `${fechaDomingo.getFullYear()}${pad(fechaDomingo.getMonth() + 1)}${pad(fechaDomingo.getDate())}`;

    const urlFechav3 = `https://www.loteriasyapuestas.es/servicios/fechav3?game_id=LAQU&fecha_sorteo=${fechaSorteo}`;
    const urlActu = "https://www.loteriasyapuestas.es/servicios/actuliga1x2";
    const workerProxy = "https://selae-proxy.mrv-dev-sev.workers.dev/?url=";

    const urlEspnLaLiga = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard";
    const urlEspnSegunda = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard";

    const [resLaLiga, resSegunda] = await Promise.allSettled([
      fetch(urlEspnLaLiga, { cache: "no-store" }),
      fetch(urlEspnSegunda, { cache: "no-store" }),
    ]);

    let dataLoterias: any = null;
    try {
      const r = await fetch(`${workerProxy}${encodeURIComponent(urlFechav3)}`, { cache: "no-store" });
      if (r.ok) dataLoterias = await r.json();
    } catch (_) {}

    if (!dataLoterias || (Array.isArray(dataLoterias) && dataLoterias.length === 0)) {
      try {
        const r2 = await fetch(`${workerProxy}${encodeURIComponent(urlActu)}`, { cache: "no-store" });
        if (r2.ok) dataLoterias = await r2.json();
      } catch (_) {}
    }

    const sorteo = Array.isArray(dataLoterias) ? dataLoterias[0] : dataLoterias;

    const listaOrigen: any[] =
      sorteo?.partidos ||
      sorteo?.partido ||
      (Array.isArray(sorteo) ? sorteo : []) ||
      [];
    const jornada = Number(sorteo?.jornada || 4);
    const temporada = sorteo?.temporada || "2026-2027";

    let eventosEspn: any[] = [];
    if (resLaLiga.status === "fulfilled" && resLaLiga.value.ok) {
      const d = await resLaLiga.value.json();
      eventosEspn = eventosEspn.concat(d.events || []);
    }
    if (resSegunda.status === "fulfilled" && resSegunda.value.ok) {
      const d = await resSegunda.value.json();
      eventosEspn = eventosEspn.concat(d.events || []);
    }

    const limpiarNombre = (texto: string) =>
      (texto || "").replace(/\s*\([mf]\)\s*/gi, "").trim();

    const partidos = listaOrigen.slice(0, 15).map((p: any, index: number) => {
      const id = index + 1;
      const local = limpiarNombre(p.local || p.equipo1 || p.nombre_local);
      const visitante = limpiarNombre(p.visitante || p.equipo2 || p.nombre_visitante);

      let horarioFormateado = id === 15 ? "Pleno al 15" : `Partido ${id}`;
      if (p.fecha) {
        try {
          const fLimpia = p.fecha.replace(/\\/g, "");
          const partes = fLimpia.split(" ");
          if (partes.length >= 2) {
            const fechaParte = partes[0];
            const horaParte = partes[1].substring(0, 5);
            const [y, m, d] = fechaParte.split(/[\/\-]/).map(Number);
            const objFecha = new Date(y, m - 1, d);
            const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
            horarioFormateado = `${dias[objFecha.getDay()] || ""} ${horaParte}`.trim();
          }
        } catch (_) {}
      }

      let marcador = p.marcador && p.marcador.trim() !== "" ? p.marcador.trim() : "- vs -";
      let signo = p.signo && p.signo.trim() !== "" ? p.signo.trim() : "-";
      let estado = signo !== "-" ? "Final" : horarioFormateado;

      if (signo === "-") {
        const eventoEncontrado = eventosEspn.find((ev: any) => {
          const comp = ev.competitions?.[0]?.competitors || [];
          const eqLocal = comp.find((c: any) => c.homeAway === "home")?.team?.name || "";
          const eqVisitante = comp.find((c: any) => c.homeAway === "away")?.team?.name || "";

          return (
            coinciden(local, eqLocal) ||
            coinciden(visitante, eqVisitante) ||
            coinciden(local, eqVisitante) ||
            coinciden(visitante, eqLocal)
          );
        });

        if (eventoEncontrado) {
          const comp = eventoEncontrado.competitions?.[0];
          const cLocal = comp?.competitors?.find((c: any) => c.homeAway === "home");
          const cAway = comp?.competitors?.find((c: any) => c.homeAway === "away");

          const statusType = eventoEncontrado.status?.type || {};
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
                const reloj = eventoEncontrado.status?.displayClock;
                estado = reloj ? `${reloj}'` : "En vivo";
              }
            }
          }
        }
      }

      return {
        id,
        local,
        visitante,
        equipo1: local,
        equipo2: visitante,
        horario: horarioFormateado,
        marcador,
        signo,
        estado,
      };
    });

    return NextResponse.json({
      jornada,
      temporada,
      partidos,
      total: partidos.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error al sincronizar resultados", partidos: [] },
      { status: 500 }
    );
  }
}