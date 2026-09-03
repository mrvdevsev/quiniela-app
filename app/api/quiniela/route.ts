import { NextResponse } from "next/server";

export async function GET() {
  const jornadaActiva = 4;
  const temporada = "2026/2027";

  // Boleto completo oficial de 15 partidos
  const plantillaPartidos = [
    { id: 1, local: "Real Betis", visitante: "Real Madrid", horario: "Vie 21:00", marcador: "- vs -", signo: "-", estado: "Vie 21:00" },
    { id: 2, local: "Athletic Club", visitante: "Atlético de Madrid", horario: "Sáb 16:15", marcador: "- vs -", signo: "-", estado: "Sáb 16:15" },
    { id: 3, local: "Rayo Vallecano", visitante: "Racing", horario: "Sáb 18:30", marcador: "- vs -", signo: "-", estado: "Sáb 18:30" },
    { id: 4, local: "Villarreal", visitante: "Deportivo", horario: "Sáb 21:00", marcador: "- vs -", signo: "-", estado: "Sáb 21:00" },
    { id: 5, local: "Valencia", visitante: "Barcelona", horario: "Dom 16:15", marcador: "- vs -", signo: "-", estado: "Dom 16:15" },
    { id: 6, local: "Alavés", visitante: "Osasuna", horario: "Dom 18:30", marcador: "- vs -", signo: "-", estado: "Dom 18:30" },
    { id: 7, local: "Málaga", visitante: "Levante", horario: "Dom 18:30", marcador: "- vs -", signo: "-", estado: "Dom 18:30" },
    { id: 8, local: "Espanyol", visitante: "Sevilla", horario: "Dom 21:00", marcador: "- vs -", signo: "-", estado: "Dom 21:00" },
    { id: 9, local: "Getafe", visitante: "Celta", horario: "Lun 19:00", marcador: "- vs -", signo: "-", estado: "Lun 19:00" },
    { id: 10, local: "Elche", visitante: "Real Sociedad", horario: "Lun 21:30", marcador: "- vs -", signo: "-", estado: "Lun 21:30" },
    { id: 11, local: "Granada", visitante: "Zaragoza", horario: "Sáb 18:30", marcador: "- vs -", signo: "-", estado: "Sáb 18:30" },
    { id: 12, local: "Sporting", visitante: "Burgos", horario: "Sáb 21:00", marcador: "- vs -", signo: "-", estado: "Sáb 21:00" },
    { id: 13, local: "Eibar", visitante: "Oviedo", horario: "Dom 16:15", marcador: "- vs -", signo: "-", estado: "Dom 16:15" },
    { id: 14, local: "Almería", visitante: "Tenerife", horario: "Dom 18:30", marcador: "- vs -", signo: "-", estado: "Dom 18:30" },
    { id: 15, local: "Barcelona", visitante: "Villarreal", horario: "Pleno al 15", marcador: "- vs -", signo: "-", estado: "Dom 21:00" },
  ];

  try {
    const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard", {
      next: { revalidate: 15 },
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (res.ok) {
      const data = await res.json();
      const eventos = data.events || [];

      eventos.forEach((ev: any) => {
        const comp = ev.competitions?.[0];
        const local = comp?.competitors?.find((c: any) => c.homeAway === "home");
        const visitante = comp?.competitors?.find((c: any) => c.homeAway === "away");

        const nombreLocal = (local?.team?.shortDisplayName || local?.team?.name || "").toLowerCase();
        const nombreVisitante = (visitante?.team?.shortDisplayName || visitante?.team?.name || "").toLowerCase();

        const index = plantillaPartidos.findIndex(
          (p) =>
            (nombreLocal.includes(p.local.toLowerCase()) || p.local.toLowerCase().includes(nombreLocal)) &&
            (nombreVisitante.includes(p.visitante.toLowerCase()) || p.visitante.toLowerCase().includes(nombreVisitante))
        );

        if (index !== -1) {
          const golesL = local?.score !== undefined && local?.score !== "" ? parseInt(local.score) : null;
          const golesV = visitante?.score !== undefined && visitante?.score !== "" ? parseInt(visitante.score) : null;
          const completado = ev.status?.type?.completed ?? false;
          const enJuego = ev.status?.type?.state === "in";

          if (completado && golesL !== null && golesV !== null) {
            plantillaPartidos[index].estado = "Final";
            plantillaPartidos[index].marcador = `${golesL} - ${golesV}`;
            plantillaPartidos[index].signo = golesL > golesV ? "1" : golesL === golesV ? "X" : "2";
          } else if (enJuego && golesL !== null && golesV !== null) {
            plantillaPartidos[index].estado = `Min ${ev.status?.displayClock || "Vivo"}`;
            plantillaPartidos[index].marcador = `${golesL} - ${golesV}`;
            plantillaPartidos[index].signo = golesL > golesV ? "1" : golesL === golesV ? "X" : "2";
          }
        }
      });
    }
  } catch (error) {
    console.error("Modo seguro activo para el calendario de la jornada");
  }

  return NextResponse.json({
    jornada: jornadaActiva,
    temporada: temporada,
    partidos: plantillaPartidos,
    total: plantillaPartidos.length,
  });
}