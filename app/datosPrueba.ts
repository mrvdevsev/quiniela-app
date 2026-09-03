export interface Partido {
  id: number;
  local: string;
  visitante: string;
  horario: string;
  marcador: string;
  signo: string;
  estado: string;
}

export const PARTIDOS_OFICIALES: Partido[] = [
  { id: 1, local: "Celta de Vigo", visitante: "Valencia CF", horario: "Finalizado", marcador: "3 - 1", signo: "1", estado: "Final" },
  { id: 2, local: "Sevilla FC", visitante: "Villarreal CF", horario: "Finalizado", marcador: "1 - 2", signo: "2", estado: "Final" },
  { id: 3, local: "CA Osasuna", visitante: "RCD Mallorca", horario: "Finalizado", marcador: "1 - 0", signo: "1", estado: "Final" },
  { id: 4, local: "FC Barcelona", visitante: "Athletic Club", horario: "Finalizado", marcador: "2 - 1", signo: "1", estado: "Final" },
  { id: 5, local: "Getafe CF", visitante: "Rayo Vallecano", horario: "Finalizado", marcador: "0 - 0", signo: "X", estado: "Final" },
  { id: 6, local: "Real Madrid", visitante: "Real Valladolid", horario: "Finalizado", marcador: "3 - 0", signo: "1", estado: "Final" },
  { id: 7, local: "CD Leganés", visitante: "UD Las Palmas", horario: "Finalizado", marcador: "2 - 1", signo: "1", estado: "Final" },
  { id: 8, local: "Deportivo Alavés", visitante: "Real Betis", horario: "Finalizado", marcador: "0 - 0", signo: "X", estado: "Final" },
  { id: 9, local: "Atlético de Madrid", visitante: "Girona FC", horario: "Finalizado", marcador: "3 - 0", signo: "1", estado: "Final" },
  { id: 10, local: "Racing Santander", visitante: "SD Eibar", horario: "Finalizado", marcador: "2 - 2", signo: "X", estado: "Final" },
  { id: 11, local: "Levante UD", visitante: "Cádiz CF", horario: "Finalizado", marcador: "1 - 1", signo: "X", estado: "Final" },
  { id: 12, local: "Málaga CF", visitante: "CD Mirandés", horario: "Finalizado", marcador: "1 - 1", signo: "X", estado: "Final" },
  { id: 13, local: "CD Tenerife", visitante: "UD Almería", horario: "Finalizado", marcador: "0 - 1", signo: "2", estado: "Final" },
  { id: 14, local: "Real Zaragoza", visitante: "Elche CF", horario: "Finalizado", marcador: "3 - 0", signo: "1", estado: "Final" },
];

export const PLENO_15 = {
  local: "RCD Espanyol",
  visitante: "Real Sociedad",
  marcador: "0 - 1",
  golesLocal: "0",
  golesVisitante: "1",
  estado: "Final",
};