import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Función para comparar nombres de equipos sin fallos por acentos o (m)/(f)
function normalizar(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([mf]\)\s*/gi, "")
    .replace(/^(c\.?d\.?|u\.?d\.?|r\.?c\.?d\.?|r\.?c\.?|atletico|atleti|real)\s+/gi, "")
    .trim();
}

function coinciden(nombreLoterias: string, nombreEspn: string): boolean {
  const a = normalizar(nombreLoterias);
  const b = normalizar(nombreEspn);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export async function GET() {
  try {
    // 1. Calculamos automáticamente el domingo de la jornada activa
    const ahora = new Date();
    const dia = ahora.getDay(); // 0: Dom, 1: Lun, ..., 6: Sáb
    const diasHastaDomingo = dia === 1 ? -1 : (dia === 0 ? 0 : 7 - dia);
    
    const fechaDomingo = new Date(ahora);
    fechaDomingo.setDate(ahora.getDate() + diasHastaDomingo);

    const pad = (n: number) => String(n).padStart(2, "0");
    const fechaSorteo = `${fechaDomingo.getFullYear()}${pad(fechaDomingo.getMonth() + 1)}${pad(fechaDomingo.getDate())}`;

    // 2. Pedimos en paralelo los datos a SELAE (Loterías) y a ESPN (LaLiga y Segunda)
    const urlLoterias = `https://www.loteriasyapuestas.es/servicios/fechav3?game_id=LAQU&fecha_sorteo=${fechaSorteo}`;
    const urlEspnLaLiga = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard";
    const urlEspnSegunda = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard";

    const [resLoterias, resLaLiga, resSegunda] = await Promise.allSettled([
      fetch(urlLoterias, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      }),
      fetch(urlEspnLaLiga, { cache: "no-store" }),
      fetch(urlEspnSegunda, { cache: "no-store" }),
    ]);

    if (resLoterias.status !== "fulfilled" || !resLoterias.value.ok) {
      throw new Error("No se pudo conectar con el servidor de Loterías");
    }

    const dataLoterias = await resLoterias.value.json();
    const sorteo = Array.isArray(dataLoterias) ? dataLoterias[0] : dataLoterias;

    // Obtenemos los partidos activos en directo desde ESPN
    let eventosEspn: any[] = [];
    if (resLaLiga.status === "fulfilled" && resLaLiga.value.ok) {
      const d = await resLaLiga.value.json();
      eventosEspn = eventosEspn.concat(d.events || []);
    }
    if (resSegunda.status === "fulfilled" && resSegunda.value.ok) {
      const d = await resSegunda.value.json();
      eventosEspn = eventosEspn.concat(d.events || []);
    }

    // Limpiador visual de nombres
    const limpiarNombre = (texto: string) =>
      (texto || "").replace(/\s*\([mf]\)\s*/gi, "").trim();

    // 3. Procesamos los 15 partidos oficiales cruzándolos con el directo
    const partidos = sorteo.partidos.slice(0, 15).map((p: any, index: number) => {
      const id = index + 1;
      const local = limpiarNombre(p.local);
      const visitante = limpiarNombre(p.visitante);

      // Formateo del día y hora oficial
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

      // Valores por defecto
      let marcador = p.marcador && p.marcador.trim() !== "" ? p.marcador.trim() : "- vs -";
      let signo = p.signo && p.signo.trim() !== "" ? p.signo.trim() : "-";
      let estado = signo !== "-" ? "Final" : horarioFormateado;

      // Si SELAE aún no ha cerrado el acta oficial, buscamos en el directo de ESPN
      if (signo === "-") {
        const eventoEncontrado = eventosEspn.find((ev: any) => {
          const competidores = ev.competitions?.[0]?.competitors || [];
          const eqLocal = competidores.find((c: any) => c.homeAway === "home")?.team?.name || "";
          const eqVisitante = competidores.find((c: any) => c.homeAway === "away")?.team?.name || "";

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

          // CONDICIÓN CRÍTICA: Solo leemos goles y signo si el partido YA HA EMPEZADO o HA TERMINADO
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
        horario: horarioFormateado,
        marcador,
        signo,
        estado,
      };
    });

    return NextResponse.json({
      jornada: Number(sorteo.jornada || 4),
      temporada: sorteo.temporada || "2026-2027",
      partidos,
      total: partidos.length,
    });
  } catch (error: any) {
    console.error("Error al actualizar la quiniela híbrida:", error.message);
    return NextResponse.json(
      { error: "Error al sincronizar resultados", partidos: [] },
      { status: 500 }
    );
  }
}