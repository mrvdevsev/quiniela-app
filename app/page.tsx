"use client";

import React, { useState, useEffect } from "react";
import AuthModal from "./AuthModal";
import { supabase } from "../supabaseClient";
import * as XLSX from "xlsx";

interface Partido {
  id: number;
  local?: string;
  visitante?: string;
  equipo1?: string;
  equipo2?: string;
  goles1?: number | null;
  goles2?: number | null;
  golesLocal?: number | null;
  golesVisitante?: number | null;
  minuto?: string;
  estado?: string;
  signoReal?: string;
  signo?: string;
  horario?: string;
  marcador?: string;
}

interface PremioRegistro {
  id?: number;
  socio_id: string;
  jornada: number;
  ciclo: number;
  importe: number;
  concepto: string;
  creado_en?: string;
}

const CORREOS_ADMIN = [
  "antonio_d_r@hotmail.com",
  "ivi.delgado.9@gmail.com",
  "carmenromerovivero@hotmail.com"
];

export default function Home() {
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [jornadaActiva, setJornadaActiva] = useState<number>(4);
  const [cambiandoJornada, setCambiandoJornada] = useState<boolean>(false);
  const [pestana, setPestana] = useState<"boleto" | "directo" | "matriz" | "clasificacion" | "caja" | "cuotas">("directo");
  const [listaJornadasDisponibles, setListaJornadasDisponibles] = useState<number[]>([]);
  const [jornadaSeleccionadaMatriz, setJornadaSeleccionadaMatriz] = useState<number>(jornadaActiva);
  const [partidosMatriz, setPartidosMatriz] = useState<any[]>([]);

  // Sesión y Perfil
  const [usuario, setUsuario] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [modalAuth, setModalAuth] = useState<boolean>(false);
  const [modalAdmin, setModalAdmin] = useState<boolean>(false);
  const [sociosPendientes, setSociosPendientes] = useState<any[]>([]);
  const cargarPendientes = async () => {
  const { data } = await supabase
    .from("perfiles")
    .select("*")
    .eq("estado", "pendiente");
  setSociosPendientes(data || []);
};

  const aprobarSocio = async (idSocio: string) => {
    const { data, error } = await supabase
      .from("perfiles")
      .update({ estado: "aprobado" })
      .eq("id", idSocio)
      .select();

    if (error) {
      console.error("Error al aprobar socio:", error);
      alert("Error de permisos en Supabase: " + error.message);
      return;
    }

  // Si fue bien:
  setSociosPendientes((prev) => prev.filter((s) => s.id !== idSocio));
  cargarDatosCompletos();
};

  const rechazarSocio = async (idSocio: string) => {
    const seguro = window.confirm("¿Seguro que deseas rechazar y eliminar esta solicitud?");
    if (!seguro) return;

    try {
      const { error } = await supabase
        .from("perfiles")
        .delete()
        .eq("id", idSocio);

      if (error) {
        console.error("Error al rechazar socio:", error);
        alert("Error de permisos en Supabase: " + error.message);
        return;
      }

      setSociosPendientes((prev) => prev.filter((s) => s.id !== idSocio));
      cargarDatosCompletos();
    } catch (err: any) {
      alert("Error al rechazar solicitud: " + err.message);
    }
  };

  const [borrandoPronosticos, setBorrandoPronosticos] = useState(false);

  const resetearBoletoSocio = async (socioId: string, jornadaNum: number) => {
    const confirmar = window.confirm(
      "¿Seguro que quieres borrar todos los pronósticos de este socio para la jornada " + jornadaNum + "?"
    );
    if (!confirmar) return;

    setBorrandoPronosticos(true);
    try {
      const { error } = await supabase
        .from("pronosticos")
        .delete()
        .eq("socio_id", socioId)
        .eq("jornada", jornadaNum);

      if (error) throw error;

      alert("Pronósticos eliminados correctamente. El socio ya puede rellenar su boleto de nuevo.");
      cargarDatosCompletos();
      setTodosPronosticos((prev) => {
        const copia = { ...prev };
        delete copia[socioId];
        return copia;
      });
    } catch (err: any) {
      console.error("Error al borrar pronósticos:", err);
      alert("Error al borrar: " + err.message);
    } finally {
      setBorrandoPronosticos(false);
    }
  };

  const actualizarJornadaActiva = async (nuevaJornada: number) => {
    setCambiandoJornada(true);
    try {
      const { error } = await supabase
        .from("configuracion")
        .upsert({ clave: "jornada_activa", valor: String(nuevaJornada) });

      if (error) throw error;

      setJornadaActiva(nuevaJornada);
      setMisPronosticos({});
      await cargarDatosCompletos();
      alert("✅ Jornada activa cambiada a la Jornada " + nuevaJornada);
    } catch (err: any) {
      alert("Error al cambiar jornada: " + err.message);
    } finally {
      setCambiandoJornada(false);
    }
  };

    const descargarSabanaExcel = () => {
    const sociosLista = listaSocios.length > 0 ? listaSocios : sociosBrutos;

    if (!partidos || partidos.length === 0 || !sociosLista || sociosLista.length === 0) {
      alert("No hay datos de partidos o socios para exportar.");
      return;
    }

    // 1. Cabecera con datos del partido y apodos de socios
    const cabecera = ["#", "Partido", "Real", ...sociosLista.map((s: any) => s.apodo || s.alias || s.nombre)];

    // 2. Filas de los 15 partidos
    const filas = partidos.map((p: any) => {
      const sReal = getSignoRealPartido(p);
      const fila: any[] = [
        p.id,
        `${p.local || p.equipo1 || ""} vs ${p.visitante || p.equipo2 || ""}`,
        sReal !== "-" ? sReal : ""
      ];

      sociosLista.forEach((s: any) => {
        const pronosticoBD = todosPronosticos[s.id]?.[p.id];
        const signo = s.id === usuario?.id
          ? (getMiPronostico(p.id) !== "-" ? getMiPronostico(p.id) : (pronosticoBD || "-"))
          : (pronosticoBD || "-");

        fila.push(signo);
      });

      return fila;
    });

    // 3. Fila final de aciertos acumulados
    const filaAciertos: any[] = ["", "TOTAL ACIERTOS", ""];
    sociosLista.forEach((s: any) => {
      const totalAciertos = partidos.reduce((acc: number, p: any) => {
        const sReal = getSignoRealPartido(p);
        const pronosticoBD = todosPronosticos[s.id]?.[p.id];
        const signo = s.id === usuario?.id
          ? (getMiPronostico(p.id) !== "-" ? getMiPronostico(p.id) : (pronosticoBD || "-"))
          : (pronosticoBD || "-");

        if (sReal !== "-" && signo !== "-" && signo.toUpperCase() === sReal.toUpperCase()) {
          return acc + 1;
        }
        return acc;
      }, 0);
      filaAciertos.push(totalAciertos);
    });

    filas.push(filaAciertos);

    // 4. Generar archivo .xlsx
    const datosHoja = [cabecera, ...filas];
    const hoja = XLSX.utils.aoa_to_sheet(datosHoja);

    hoja["!cols"] = [
      { wch: 5 },
      { wch: 34 },
      { wch: 8 },
      ...sociosLista.map(() => ({ wch: 10 }))
    ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Jornada");
    XLSX.writeFile(libro, `QuinielaHub_Jornada_${jornadaSeleccionadaMatriz || jornadaActiva}.xlsx`);
  };

  // Cuotas de socios
  const [mapaCuotas, setMapaCuotas] = useState<{ [socioId: string]: number }>({});
  const [editandoCuota, setEditandoCuota] = useState<{ [socioId: string]: string }>({});
  const [guardandoCuota, setGuardandoCuota] = useState<string | null>(null);

  const guardarCuotaSocio = async (socioId: string) => {
    const valor = parseFloat(editandoCuota[socioId] ?? String(mapaCuotas[socioId] || 0));
    if (isNaN(valor)) return;

    setGuardandoCuota(socioId);
    try {
      const { error } = await supabase
        .from("cuotas_socios")
        .upsert({ socio_id: socioId, importe: valor, actualizado_en: new Date().toISOString() });

      if (error) throw error;

      setMapaCuotas((prev) => ({ ...prev, [socioId]: valor }));
    } catch (err: any) {
      alert("Error al guardar cuota: " + err.message);
    } finally {
      setGuardandoCuota(null);
    }
  };

  // Pronósticos
  const [misPronosticos, setMisPronosticos] = useState<{ [key: number]: string }>({});
  const [guardando, setGuardando] = useState<boolean>(false);
  const [notificacion, setNotificacion] = useState<string>("");

  // Pleno al 15 por defecto en 0 - 0
  const [plenoLocal, setPlenoLocal] = useState<string>("0");
  const [plenoVisitante, setPlenoVisitante] = useState<string>("0");

  // Apuesta Especial Barça vs Madrid
  const [apuestaClasico, setApuestaClasico] = useState<string>("Ganan Barça y Madrid");

  // Ciclo seleccionado en Clasificación (0 = General / 1 a 4)
  const [cicloSeleccionado, setCicloSeleccionado] = useState<number>(1);

  // Datos dinámicos de Supabase
  const [listaSocios, setListaSocios] = useState<any[]>([]);
  const [todosPronosticos, setTodosPronosticos] = useState<{ [key: string]: { [partidoId: number]: string } }>({});
  const [listaPremios, setListaPremios] = useState<PremioRegistro[]>([]);
  const [premiosDB, setPremiosDB] = useState<{ [socioId: string]: number }>({});
  const [puntosAcumuladosDB, setPuntosAcumuladosDB] = useState<{ [socioId: string]: number }>({});

  // Formulario Admin
  const [formSocioId, setFormSocioId] = useState<string>("");
  const [formJornada, setFormJornada] = useState<number>(4);
  const [formCiclo, setFormCiclo] = useState<number>(1);
  const [formImporte, setFormImporte] = useState<string>("");
  const [formConcepto, setFormConcepto] = useState<string>("Premio Apuestas");
  const [guardandoAdmin, setGuardandoAdmin] = useState<boolean>(false);
  const [msgAdmin, setMsgAdmin] = useState<string>("");

  // Estados para la Apuesta Especial Barça vs Real Madrid
  const [jornadaClasico, setJornadaClasico] = useState<number>(4);
  const [importeClasico, setImporteClasico] = useState<string>("");
  const [guardandoClasico, setGuardandoClasico] = useState<boolean>(false);
  const [msgClasico, setMsgClasico] = useState("");

// Cargar la lista de jornadas existentes en la BD
  const cargarListaJornadas = async () => {
    const { data } = await supabase
      .from("jornadas")
      .select("id")
      .order("id", { ascending: false });

    if (data && data.length > 0) {
      const ids = data.map((j) => j.id);
      setListaJornadasDisponibles(ids);
    }
  };

  // Cargar los partidos y pronósticos específicos de la jornada seleccionada en la matriz
  const cargarDatosJornadaMatriz = async (numJornada: number) => {
    try {
      const res = await fetch(`/api/quiniela?jornada=${numJornada}`, { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setPartidosMatriz(d.partidos || []);
      }

      const { data: pronosDB } = await supabase
        .from("pronosticos")
        .select("socio_id, partido_id, signo")
        .eq("jornada", numJornada);

      const mapaJornada: { [key: string]: { [partidoId: number]: string } } = {};
      pronosDB?.forEach((p: any) => {
        if (!mapaJornada[p.socio_id]) {
          mapaJornada[p.socio_id] = {};
        }
        mapaJornada[p.socio_id][p.partido_id] = p.signo;
      });
      setTodosPronosticos(mapaJornada);
    } catch (err) {
      console.error("Error al cargar jornada histórica:", err);
    }
  };

  useEffect(() => {
    async function init() {
      await verificarYAvanzarJornada();
      cargarListaJornadas();
    }
    init();
  }, []);
  
  useEffect(() => {
    if (jornadaSeleccionadaMatriz) {
      cargarDatosJornadaMatriz(jornadaSeleccionadaMatriz);
    }
  }, [jornadaSeleccionadaMatriz]);

  // Cargar sesión inicial y datos colectivos
  const cargarDatosCompletos = async () => {
    try {
      // Consultar la jornada activa directamente desde Supabase
    let { data: jData } = await supabase
      .from("jornadas")
      .select("id")
      .eq("activa", true)
      .maybeSingle();

    // Si ninguna tiene activa=true, coge automáticamente la última jornada existente
    if (!jData) {
      const { data: ultimaJornada } = await supabase
        .from("jornadas")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      jData = ultimaJornada;
    }

    const jActiva = jData?.id;
    if (!jActiva) return; // Si la tabla estuviera totalmente vacía

    setJornadaActiva(jActiva);
    setFormJornada(jActiva);
    setJornadaClasico(jActiva);
    setJornadaSeleccionadaMatriz(jActiva);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUsuario(session.user);
        const { data: prof } = await supabase
          .from("perfiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (prof) {
          const esAdminPorEmail = CORREOS_ADMIN.includes((session.user.email || "").toLowerCase());
          setPerfil({
            ...prof,
            rol: esAdminPorEmail ? "admin" : (prof.rol || "socio"),
            estado: esAdminPorEmail ? "aprobado" : prof.estado
          });
        }

        const { data: pronos } = await supabase
          .from("pronosticos")
          .select("*")
          .eq("socio_id", session.user.id)
          .eq("jornada", jActiva);

        if (pronos && pronos.length > 0) {
          const mapa: { [key: number]: string } = {};
          pronos.forEach((p) => {
            if (p.partido_id === 15 && p.signo?.includes("-")) {
              const [l, v] = p.signo.split("-");
              if (l) setPlenoLocal(l);
              if (v) setPlenoVisitante(v);
            }
            mapa[p.partido_id] = p.signo;
          });
          setMisPronosticos(mapa);
        }
      }

      // 1. Cargar socios
      const { data: sociosDB } = await supabase
        .from("perfiles")
        .select("id, nombre, apodo, rol, email, estado");

      if (sociosDB && sociosDB.length > 0) {
        setListaSocios(sociosDB);
        if (!formSocioId) setFormSocioId(sociosDB[0].id);
      } else {
        setListaSocios([]);
      }

      // Cargar cuotas guardadas
      const { data: cuotasDB } = await supabase.from("cuotas_socios").select("*");
      if (cuotasDB) {
        const mapa: { [key: string]: number } = {};
        cuotasDB.forEach((c: any) => {
          mapa[c.socio_id] = Number(c.importe || 0);
        });
        setMapaCuotas(mapa);
      }

      // 2. Cargar pronósticos colectivos J4
      const { data: pronosDB } = await supabase
        .from("pronosticos")
        .select("socio_id, partido_id, signo")
        .eq("jornada", jActiva);

      const mapaGeneral: { [key: string]: { [partidoId: number]: string } } = {};
      pronosDB?.forEach((p: any) => {
        if (!mapaGeneral[p.socio_id]) {
          mapaGeneral[p.socio_id] = {};
        }
        mapaGeneral[p.socio_id][p.partido_id] = p.signo;
      });
      setTodosPronosticos(mapaGeneral);

      // 3. Cargar histórico de premios y cobros
      const { data: premiosData } = await supabase
        .from("premios")
        .select("*")
        .order("creado_en", { ascending: false });

      if (premiosData) {
        setListaPremios(premiosData);
        const mapaPremios: { [key: string]: number } = {};
        premiosData.forEach((pr: any) => {
          mapaPremios[pr.socio_id] = (mapaPremios[pr.socio_id] || 0) + Number(pr.importe || 0);
        });
        setPremiosDB(mapaPremios);
      }

      setPuntosAcumuladosDB({});
    } catch (err) {
      console.error("Error al cargar datos:", err);
    }
  };

  useEffect(() => {
    cargarDatosCompletos();
  }, []);

  // Consultar marcadores en vivo de la API
  const obtenerDatos = async () => {
    try {
      const res = await fetch("/api/quiniela", { cache: "no-store" });
      if (!res.ok) throw new Error("Error en API");
      const data = await res.json();
      setPartidos(data.partidos || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    obtenerDatos();
    const intervalo = setInterval(obtenerDatos, 15000);
    return () => clearInterval(intervalo);
  }, []);

  const seleccionarSigno = (partidoId: number, signo: string) => {
    setMisPronosticos((prev) => ({
      ...prev,
      [partidoId]: prev[partidoId] === signo ? "" : signo,
    }));
    setNotificacion("");
  };

  const restaurarBoleto = () => {
    setMisPronosticos({});
    setPlenoLocal("0");
    setPlenoVisitante("0");
    setNotificacion("Pronósticos limpiados.");
  };

  const guardarBoleto = async () => {
    if (!usuario) {
      setModalAuth(true);
      return;
    }

    setGuardando(true);
    try {
      const inserts = Object.entries(misPronosticos)
        .filter(([partidoId]) => Number(partidoId) !== 15)
        .map(([partidoId, signo]) => ({
          socio_id: usuario.id,
          jornada: jornadaActiva,
          partido_id: parseInt(partidoId),
          signo: signo,
        }));

      // Pleno al 15
      inserts.push({
        socio_id: usuario.id,
        jornada: jornadaActiva,
        partido_id: 15,
        signo: `${plenoLocal}-${plenoVisitante}`,
      });

      const { error } = await supabase
        .from("pronosticos")
        .upsert(inserts, { onConflict: "socio_id,jornada,partido_id" });

      if (error) throw error;

      setTodosPronosticos((prev) => ({
        ...prev,
        [usuario.id]: {
          ...(prev[usuario.id] || {}),
          ...misPronosticos,
          15: `${plenoLocal}-${plenoVisitante}`,
        },
      }));

      setNotificacion("✅ ¡Pronósticos guardados en tu peña!");
    } catch (err: any) {
      setNotificacion("❌ " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Guardar premio desde el modal de administración
  const handleGuardarPremioAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formImporte || isNaN(Number(formImporte)) || !formSocioId) {
      alert("⚠️ Tienes que seleccionar a un socio en el desplegable.");
      return;
    }

    setGuardandoAdmin(true);
    setMsgAdmin("");
    try {
      const nuevoPremio = {
        socio_id: formSocioId,
        jornada: formJornada,
        ciclo: formCiclo,
        importe: parseFloat(formImporte),
        concepto: "Premio Quiniela",
      };

      const { error } = await supabase.from("premios").insert([nuevoPremio]);
      if (error) throw error;

      await cargarDatosCompletos();
      setFormImporte("");
      setMsgAdmin("✅ ¡Premio registrado correctamente en la peña!");
      setTimeout(() => setMsgAdmin(""), 3500);
    } catch (err: any) {
      setMsgAdmin("❌ Error registrando premio: " + err.message);
    } finally {
      setGuardandoAdmin(false);
    }
  };

  // Guardar premio de la apuesta especial Barça vs Madrid
  const handleGuardarApuestaClasico = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importeClasico || isNaN(Number(importeClasico))) return;

    setGuardandoClasico(true);
    try {
      const nuevoMovimiento = {
        socio_id: usuario?.id || formSocioId,
        jornada: Number(jornadaClasico),
        ciclo: getCicloPorJornada(Number(jornadaClasico)),
        importe: parseFloat(importeClasico),
        concepto: "Premio Apuestas Clásico",
      };

      const { error } = await supabase.from("premios").insert([nuevoMovimiento]);
      if (error) throw error;

      await cargarDatosCompletos();
      setImporteClasico("");
      setMsgClasico("✅ Premio de la Apuesta Clásico registrado en la peña.");
      setTimeout(() => setMsgClasico(""), 4000);
    } catch (err: any) {
      alert("Error registrando apuesta: " + err.message);
    } finally {
      setGuardandoClasico(false);
    }
  };

  // Eliminar un premio o movimiento erróneo (Solo Admin)
  const handleEliminarPremio = async (idPremio?: number) => {
    if (!idPremio) return;
    const seguro = window.confirm("¿Seguro que deseas eliminar este movimiento? Se recalculará la deuda y el saldo.");
    if (!seguro) return;

    try {
      const { error } = await supabase.from("premios").delete().eq("id", idPremio);
      if (error) throw error;
      await cargarDatosCompletos();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setPerfil(null);
    setMisPronosticos({});
  };

  // Calcula ciclo según jornada (10 jornadas por ciclo)
  const getCicloPorJornada = (jornada: number): number => {
    if (jornada <= 10) return 1;
    if (jornada <= 20) return 2;
    if (jornada <= 30) return 3;
    return 4;
  };

  const formatoGolQuiniela = (goles: number | string | null | undefined): string => {
    if (goles === null || goles === undefined || goles === "") return "-";
    const n = Number(goles);
    if (isNaN(n)) return String(goles);
    return n >= 3 ? "M" : String(n);
  };

  const getSignoRealPartido = (p: any): string => {
    if (Number(p.id) === 15) {
      if (p.marcador && p.marcador.includes("-") && !p.marcador.includes("vs")) {
        const partes = p.marcador.split("-");
        const gL = formatoGolQuiniela(partes[0]?.trim());
        const gV = formatoGolQuiniela(partes[1]?.trim());
        return `${gL}-${gV}`;
      }
      return "-";
    }
    return p.signo || "-";
  };

  const getMiPronostico = (id: number): string => {
    if (Number(id) === 15) {
      return `${plenoLocal}-${plenoVisitante}`;
    }
    return misPronosticos[id] || "-";
  };

  const partidosDisputados = partidos.filter((p: any) => {
    const s = getSignoRealPartido(p);
    return s && s !== "-";
  });

  const aciertos = partidos.reduce((acc: number, p: any) => {
    const mi = getMiPronostico(p.id);
    const sReal = getSignoRealPartido(p);
    if (sReal !== "-" && mi !== "-" && mi.toUpperCase() === sReal.toUpperCase()) {
      return acc + 1;
    }
    return acc;
  }, 0);


  const sociosBrutos: any[] = [];

  const sociosActivos = (listaSocios.length > 0 ? listaSocios : sociosBrutos).filter(
  (s: any) => s.estado === "aprobado" && s.rol !== "admin"
);

  // --- MODELO CONTABLE EXACTO DE LA PEÑA ---
  const PRESUPUESTO_TEMPORADA = 4320.00;
  const PERDEDORES_POR_CICLO = 9;
  const TOTAL_PLAZAS_PAGO_TEMPORADA = PERDEDORES_POR_CICLO * 4; // 36 plazas

  const ingresosQuinielaPorCiclo: { [ciclo: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const ingresosApuestasPorCiclo: { [ciclo: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const retiradasSociosPorCiclo: { [ciclo: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0 };

  listaPremios.forEach((p) => {
    const imp = Number(p.importe || 0);
    const c = p.ciclo || 1;
    const conc = (p.concepto || "").toLowerCase();

    if (conc.includes("apuesta")) {
      ingresosApuestasPorCiclo[c] = (ingresosApuestasPorCiclo[c] || 0) + imp;
    } else if (conc.includes("retirada") || conc.includes("cobro")) {
      retiradasSociosPorCiclo[c] = (retiradasSociosPorCiclo[c] || 0) + imp;
    } else {
      ingresosQuinielaPorCiclo[c] = (ingresosQuinielaPorCiclo[c] || 0) + imp;
    }
  });

  const totalIngresosQuiniela = Object.values(ingresosQuinielaPorCiclo).reduce((a, b) => a + b, 0);
  const totalIngresosApuestas = Object.values(ingresosApuestasPorCiclo).reduce((a, b) => a + b, 0);
  const totalRetiradasSocios = Object.values(retiradasSociosPorCiclo).reduce((a, b) => a + b, 0);

  const totalRecuperado = totalIngresosQuiniela + totalIngresosApuestas - totalRetiradasSocios;
  const fondoPendienteTemporada = Math.max(0, PRESUPUESTO_TEMPORADA - totalRecuperado);
  const deudaVivaActual = -fondoPendienteTemporada;

  const cuotaExactaPorCicloPerdido = (fondoPendienteTemporada / TOTAL_PLAZAS_PAGO_TEMPORADA).toFixed(2);

  // Clasificación por ciclo
  const rankingSocios = sociosActivos.map((socio) => {
    const premiosFiltrados = listaPremios.filter((pr) => {
      if (pr.socio_id !== socio.id) return false;
      if (pr.concepto?.toLowerCase().includes("apuesta")) return false;
      return cicloSeleccionado === 0 ? true : pr.ciclo === cicloSeleccionado;
    });
    const premioSocio = premiosFiltrados.reduce((acc, curr) => acc + Number(curr.importe || 0), 0);

    const aciertosJornadaActual = partidos.reduce((acc: number, p: any) => {
      const sReal = getSignoRealPartido(p);
      const pronosticoBD = todosPronosticos[socio.id]?.[p.id];
      const pronostico = socio.id === usuario?.id
        ? (getMiPronostico(p.id) !== "-" ? getMiPronostico(p.id) : (pronosticoBD || "-"))
        : (pronosticoBD || "-");

      if (sReal !== "-" && pronostico !== "-" && pronostico.toUpperCase() === sReal.toUpperCase()) {
        return acc + 1;
      }
      return acc;
    }, 0);

    const puntosPrevios = puntosAcumuladosDB[socio.id] ?? 0;
    const puntosTotales = puntosPrevios + aciertosJornadaActual;

    return {
      id: socio.id,
      nombre: socio.nombre,
      alias: socio.apodo || socio.alias || socio.nombre?.split(" ")[0] || "Socio",
      premioNum: premioSocio,
      pts: puntosTotales,
    };
  });

  const premiosOrdenados = [...rankingSocios]
    .map((s) => s.premioNum)
    .filter((p) => p > 0)
    .sort((a, b) => b - a);

  const top1Premio = premiosOrdenados[0] ?? -1;
  const top2Premio = premiosOrdenados[1] ?? -1;

  const totalParticipantes = rankingSocios.length;
  // Si hay socios, la mitad inferior va a pago; si no hay nadie, queda en 0
  const corteZonaPago = totalParticipantes > 0 ? Math.ceil(totalParticipantes / 2) + 1 : 0;

  // 1. Identificar el rango de jornadas del ciclo activo
  const rangoCiclo = {
    1: { min: 1, max: 10 },
    2: { min: 11, max: 20 },
    3: { min: 21, max: 30 },
    4: { min: 31, max: 40 },
  }[cicloSeleccionado] || { min: 1, max: 10 };

  // 2. Calcular los socios con sus puntos del ciclo y dinero acumulado en el ciclo
  const sociosConCiclo = sociosActivos.map((socio) => {
    // Sumar aciertos en las jornadas del ciclo
    let aciertosCiclo = 0;
    partidos.forEach((p: any) => {
      // 1. Validar si el partido pertenece a las jornadas del ciclo seleccionado
      const jNum = Number(p.jornada ?? p.jornada_numero ?? p.numero_jornada ?? 4);
      if (jNum >= rangoCiclo.min && jNum <= rangoCiclo.max) {
        // 2. Obtener el pronóstico del socio
        const pronostico = (todosPronosticos[socio.id]?.[p.id] ?? "").toString().trim().toUpperCase();

        // 3. Determinar el signo real (por campo directo o calculado por goles si están definidos)
        let signoReal = (p.signo_real ?? p.signo ?? p.resultado ?? "").toString().trim().toUpperCase();
        
        if (!signoReal || signoReal === "-") {
          const gL = p.goles_local ?? p.golesLocal;
          const gV = p.goles_visitante ?? p.golesVisitante;
          if (gL !== null && gL !== undefined && gV !== null && gV !== undefined && gL !== "" && gV !== "") {
            const nL = Number(gL);
            const nV = Number(gV);
            if (nL > nV) signoReal = "1";
            else if (nL === nV) signoReal = "X";
            else if (nL < nV) signoReal = "2";
          }
        }

        // 4. Si coincide el pronóstico con el resultado final, sumamos acierto
        if (signoReal && pronostico && signoReal !== "-" && signoReal === pronostico) {
          aciertosCiclo += 1;
        }
      }
    });

    // Sumar premios monetarios registrados en este ciclo
    const dineroCiclo = (listaPremios || [])
      .filter((pr: any) => pr.socio_id === socio.id && Number(pr.ciclo) === Number(cicloSeleccionado))
      .reduce((acc: number, curr: any) => acc + Number(curr.importe || 0), 0);

    return {
      ...socio,
      pts: aciertosCiclo,
      premioNum: dineroCiclo,
      premio: `${dineroCiclo.toFixed(2)} €`,
    };
  });

  // 3. Ordenar por puntos (y por premio si empatan a puntos)
  const rankingOrdenado = [...sociosConCiclo].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return b.premioNum - a.premioNum;
  });

  // 4. Inmunidad: Socios de la zona baja (posiciones 10 a 18) que hayan ganado dinero (>0€)
    const sociosZonaBaja = rankingOrdenado.slice(9);
    const usurpadoresPremio = [...sociosZonaBaja]
      .filter((s) => s.premioNum > 0)
      .sort((a, b) => b.premioNum - a.premioNum)
      .slice(0, 2); // Máximo 2 plazas de rescate por dinero

    const idsSalvadosPorDinero = new Set(usurpadoresPremio.map((s) => s.id));

    // 5. Los 9 que se salvan: Los primeros del ranking que no hayan sido desplazados + los rescatados por premio
    const plazasRescate = usurpadoresPremio.length; // 0, 1 o 2
    const salvadosPorPuntos = rankingOrdenado.slice(0, 9 - plazasRescate);
    const idsSalvadosTotal = new Set([
      ...salvadosPorPuntos.map((s) => s.id),
      ...usurpadoresPremio.map((s) => s.id),
    ]);

    // Los 9 restantes son estrictamente los que van a Zona de Pago
    const idsEnZonaPago = new Set(
      rankingOrdenado.filter((s) => !idsSalvadosTotal.has(s.id)).map((s) => s.id)
    );
    const idsTopDinero = idsSalvadosPorDinero;

  // 6. Generar la tabla final con los flags de estado
  const tablaClasificacion = rankingOrdenado.map((socio, index) => ({
    ...socio,
    pos: index + 1,
    esTopPremio: idsTopDinero.has(socio.id),
    enZonaPago: idsEnZonaPago.has(socio.id),
  }));

  const sociosEnZonaPago = tablaClasificacion.filter((s) => s.enZonaPago);
  const deudaPorPerdedor =
    sociosEnZonaPago.length > 0
      ? (Math.abs(deudaVivaActual) / sociosEnZonaPago.length).toFixed(2)
      : "0.00";

  const getNombreSocioPorId = (id: string) => {
    if (!id || id === "00000000-0000-0000-0000-000000000000" || id === "pena") {
      return "Peña";
    }
    const s = sociosActivos.find((soc) => soc.id === id) || listaSocios.find((soc) => soc.id === id);
    return s ? (s.apodo || s.alias || s.nombre) : "Peña";
  };

// // Estado y función para enviar aviso por correo a los socios que faltan
//   const [enviandoAvisos, setEnviandoAvisos] = useState(false);

//   const enviarRecordatorioBoletos = async () => {
//     // 1. Detectar quién no tiene los 15 partidos completados en la jornada activa
//     const sociosSinBoleto = sociosActivos.filter((socio: any) => {
//       const pronos = todosPronosticos[socio.id];
      
//       // Contar cuántos pronósticos reales tiene marcados
//       let totalMarcados = 0;
//       if (pronos) {
//         // Si pronos guarda { [partidoId]: '1' | 'X' | '2' }
//         totalMarcados = Object.values(pronos).filter(
//           (valor) => valor !== null && valor !== undefined && valor !== "" && valor !== "-"
//         ).length;
//       }

//       return totalMarcados < 15;
//     });

//     if (sociosSinBoleto.length === 0) {
//       alert("¡Todos los socios ya han completado su boleto!");
//       return;
//     }

//     // 2. Extraer los correos (probando email o correo)
//     const destinatarios = sociosSinBoleto
//       .map((s: any) => s.email || s.correo || s.mail)
//       .filter((correo: any) => Boolean(correo));

//     if (destinatarios.length === 0) {
//       const nombres = sociosSinBoleto.map((s: any) => s.nombre || s.alias || s.apodo || s.id).join(", ");
//       alert(`Faltan ${sociosSinBoleto.length} socio(s) por rellenar (${nombres}), pero no tienen ningún email registrado en su perfil.`);
//       return;
//     }

//     const confirmar = confirm(
//       `Hay ${sociosSinBoleto.length} socio(s) sin completar el boleto (${destinatarios.length} con email registrado). ¿Quieres enviarles el recordatorio para la Jornada ${jornadaActiva}?`
//     );
//     if (!confirmar) return;

//     setEnviandoAvisos(true);
//     try {
//       const res = await fetch("/api/recordatorio", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           emails: destinatarios,
//           jornada: jornadaActiva,
//         }),
//       });

//       if (res.ok) {
//         alert(`Aviso enviado con éxito a ${destinatarios.length} socio(s).`);
//       } else {
//         const errorData = await res.json().catch(() => ({}));
//         alert(`Error al enviar: ${errorData.error || "Revisa la configuración de Resend."}`);
//       }
//     } catch (err) {
//       alert("Error de conexión al enviar los avisos.");
//     } finally {
//       setEnviandoAvisos(false);
//     }
//   };

  // Comprueba si el usuario tiene los 15 partidos marcados o si es admin
  const tieneBoletoSubido = Boolean(
    usuario &&
    todosPronosticos[usuario.id] &&
    Object.keys(todosPronosticos[usuario.id]).length >= 15
  );
  const puedeVerMatriz = perfil?.rol === "admin" || tieneBoletoSubido;

  // Bloqueo total si no hay sesión iniciada
  if (!usuario) {
    return (
      <div className="min-h-screen bg-[#0d1527] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-3xl mb-4">
          ⚽
        </div> 
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
          Quiniela<span className="text-[#00e699]">Hub</span>
        </h1>
        <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
          Peña privada <span className="text-white font-bold">"Con 18 Basta"</span>. Debes iniciar sesión con tu cuenta para acceder a los boletos, marcadores y clasificaciones.
        </p>
        <button
          onClick={() => setModalAuth(true)}
          className="px-6 py-3 rounded-2xl bg-[#00e699] hover:bg-[#00c985] text-slate-950 text-xs font-extrabold transition shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
        >
          Iniciar Sesión / Registrarse
        </button>

        <AuthModal
          isOpen={modalAuth}
          onClose={() => setModalAuth(false)}
          onSuccess={(usr, prof) => {
            setUsuario(usr);
            const esAdminPorEmail = CORREOS_ADMIN.includes((usr.email || "").toLowerCase());
            setPerfil({
              ...prof,
              rol: esAdminPorEmail ? "admin" : (prof?.rol || "socio"),
              estado: esAdminPorEmail ? "aprobado" : prof?.estado
            });
          }}
        />
      </div>
    );
  }

  if (perfil && perfil.estado === "pendiente") {
    return (
      <div className="min-h-screen bg-[#0d1527] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-3xl mb-4">
          ⏳
        </div>
        <h2 className="text-2xl font-black text-amber-400 mb-2">Cuenta pendiente de aprobación</h2>
        <p className="text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
          Hola <span className="text-white font-bold">{perfil.nombre || perfil.apodo}</span>. 
          Los administradores deben autorizar tu acceso antes de que puedas participar y registrar apuestas en la peña.
        </p>
        <button
          onClick={cerrarSesion}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition"
        >
          Cerrar Sesión
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1527] text-slate-100 flex flex-col items-center py-6 px-4 font-sans">
      {/* Badge Superior */}
      <div className="mb-2 flex items-center gap-2">
        <span className="bg-[#0b2b2b] text-[#00e699] text-xs font-semibold px-4 py-1.5 rounded-full border border-[#00e699]/30">
          Peña "Con 18 Basta" · Temporada 2026/2027
        </span>
        {perfil?.rol === "admin" && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setModalAdmin(true);
              cargarPendientes();
            }}
            className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-amber-500/30 transition flex items-center gap-1.5"
          >
            ⚙️ Panel Admin
          </button>

          {/* <button
            onClick={enviarRecordatorioBoletos}
            disabled={enviandoAvisos}
            className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-emerald-500/30 transition flex items-center gap-1.5 disabled:opacity-50"
            title="Enviar recordatorio por email a quienes no hayan completado el boleto"
          >
            <span>📧</span>
            {enviandoAvisos ? "Enviando..." : "Recordar boletos"}
          </button> */}
        </div>
      )}
      </div>

      {/* Título Principal y Perfil */}
      <div className="w-full max-w-xl flex items-center justify-between mt-2 mb-6">
        <div className="w-20"></div>
        <div className="text-center flex-1">
          <h1 className="text-4xl font-extrabold tracking-tight">
            Quiniela<span className="text-[#00e699]">Hub</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Panel de control de la jornada</p>
        </div>

        <div className="w-20 flex justify-end">
          {usuario ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-black text-[#00e699] tracking-wider">
                {perfil?.apodo || perfil?.nombre?.split(" ")[0] || "Usuario"}
              </span>
              <button
                onClick={cerrarSesion}
                className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-[10px] font-semibold transition"
              >
                Salir
              </button>
            </div>
          ) : (
            <button
              onClick={() => setModalAuth(true)}
              className="bg-[#00e699] hover:bg-[#00c985] text-slate-950 text-xs font-bold px-3 py-1.5 rounded-xl transition"
            >
              Acceso
            </button>
          )}
        </div>
      </div>

      {/* Selector de Pestañas */}
      <div className="w-full max-w-3xl bg-[#090f1d] p-1.5 rounded-2xl border border-slate-800/80 flex gap-1.5 mb-6 overflow-x-auto">
        <button
          onClick={() => setPestana("boleto")}
          className={`flex-1 min-w-[90px] py-2.5 text-xs font-bold rounded-xl transition ${
            pestana === "boleto"
              ? "bg-[#00e699] text-slate-950 shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Mi Boleto
        </button>

        <button
          onClick={() => setPestana("directo")}
          className={`flex-1 min-w-[95px] py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
            pestana === "directo"
              ? "bg-[#00e699] text-slate-950 shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
          En Directo
        </button>

        <button
          onClick={() => setPestana("matriz")}
          className={`flex-1 min-w-[120px] py-2.5 text-xs font-bold rounded-xl transition ${
            pestana === "matriz"
              ? "bg-[#00e699] text-slate-950 shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Todos los Boletos
        </button>

        <button
          onClick={() => setPestana("clasificacion")}
          className={`flex-1 min-w-[95px] py-2.5 text-xs font-bold rounded-xl transition ${
            pestana === "clasificacion"
              ? "bg-[#00e699] text-slate-950 shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Clasificación
        </button>

        <button
          onClick={() => setPestana("caja")}
          className={`flex-1 min-w-[110px] py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 ${
            pestana === "caja"
              ? "bg-[#00e699] text-slate-950 shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          💰 Saldo
        </button>

        <button
          onClick={() => setPestana("cuotas")}
          className={`flex-1 min-w-[110px] py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 ${
            pestana === "cuotas"
              ? "bg-[#00e699] text-slate-950 shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          💶 Cuotas
        </button>
      </div>

      {/* PESTAÑA 1: EN DIRECTO */}
      {pestana === "directo" && (
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-[#091522] border border-[#00e699]/30 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[#00e699] font-bold text-xs uppercase tracking-wider">
                TU BALANCE EN VIVO · JORNADA {jornadaActiva}
              </div>
              <div className="text-slate-400 text-xs mt-0.5">
                {partidosDisputados.length} finalizados · {partidos.length - partidosDisputados.length} pendientes
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-[#00e699]">{aciertos}</span>
              <span className="text-xl font-black text-[#00e699] mx-1">/</span>
              <span className="text-2xl font-black text-[#00e699]">{partidos.length || 15}</span>
              <div className="text-[10px] text-slate-400 font-medium">aciertos provisionales</div>
            </div>
          </div>

          <div className="space-y-3">
            {cargando ? (
              <div className="text-center py-10 text-slate-500 text-sm">Cargando marcadores...</div>
            ) : (
              partidos.map((p: any, index: number) => {
                const sReal = getSignoRealPartido(p);
                const mi = getMiPronostico(p.id);
                const esDirecto = p.estado !== "Final" && p.estado !== p.horario;
                const esFinal = p.estado === "Final";
                const esPleno = Number(p.id) === 15;

                return (
                  <div
                    key={p.id || index}
                    className="bg-[#0f172a] border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between shadow-lg"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          #{p.id}
                        </span>

                        {esDirecto ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                            {p.estado}
                          </span>
                        ) : esFinal ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-[#00e699] border border-[#00e699]/30">
                            Final
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            {p.horario || p.estado}
                          </span>
                        )}

                        <span className="text-xs font-black text-white font-mono tracking-wider ml-1">
                          {p.marcador || "- vs -"}
                        </span>
                      </div>

                      <div className="text-sm font-bold text-white">
                        {p.local} <span className="text-xs font-normal text-slate-400">vs</span> {p.visitante}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-slate-400 font-semibold mb-0.5">TÚ</span>
                        <div
                          className={`h-8 rounded-lg bg-[#090f1d] border border-slate-700 flex items-center justify-center font-bold text-white ${
                            esPleno ? "w-12 px-1 text-[11px]" : "w-8 text-xs"
                          }`}
                        >
                          {mi}
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-slate-400 font-semibold mb-0.5">REAL</span>
                        <div
                          className={`h-8 rounded-lg flex items-center justify-center font-bold ${
                            esPleno ? "w-12 px-1 text-[11px]" : "w-8 text-xs"
                          } ${
                            sReal !== "-" && mi === sReal
                              ? "bg-emerald-500/20 border border-emerald-500/60 text-emerald-400 shadow-sm shadow-emerald-500/10"
                              : sReal !== "-" && mi !== sReal
                              ? "bg-red-500/20 border border-red-500/60 text-red-400 shadow-sm shadow-red-500/10"
                              : "bg-[#090f1d] border border-slate-800 text-slate-500"
                          }`}
                        >
                          {sReal}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      
      {/* PESTAÑA 2: TODOS LOS BOLETOS */}
      {pestana === "matriz" && (
        !puedeVerMatriz ? (
          <div className="w-full max-w-xl bg-[#0f172a] border border-slate-800 rounded-3xl p-8 text-center shadow-xl space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl mx-auto">
              🔒
            </div>
            <h3 className="text-xl font-black text-white">Boletos Ocultos</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Para garantizar el juego limpio, debes rellenar y guardar primero tu pronóstico de los 15 partidos en <span className="text-[#00e699] font-bold">Mi Boleto</span> antes de poder ver lo que han jugado tus compañeros.
            </p>
            <button
              onClick={() => setPestana("boleto")}
              className="px-5 py-2.5 bg-[#00e699] hover:bg-[#00c985] text-slate-950 font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              Ir a Mi Boleto
            </button>
          </div>
        ) : (
          <div className="w-full max-w-5xl bg-[#0f172a] border border-slate-800 rounded-2xl p-4 shadow-xl overflow-hidden">
          <div className="flex flex-col gap-3 mb-4 pb-3 border-b border-slate-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00e699]"></span>
                Jugada socios · Jornada {jornadaSeleccionadaMatriz}
              </h2>
              <p className="text-xs text-slate-400">
                Comparativa de {sociosActivos.length} socios en directo
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Selector de Histórico de Jornadas */}
              <div className="flex items-center gap-1.5 bg-[#091522] border border-slate-700/80 rounded-xl px-2.5 py-1">
                <span className="text-[11px] text-slate-400 font-semibold">Jornada:</span>
                <select
                  value={jornadaSeleccionadaMatriz}
                  onChange={(e) => {
                    const j = Number(e.target.value);
                    setJornadaSeleccionadaMatriz(j);
                    if (j === jornadaActiva) {
                      setPartidosMatriz([]);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-[#00e699] focus:outline-none cursor-pointer"
                >
                  {listaJornadasDisponibles.length > 0 ? (
                    listaJornadasDisponibles.map((num) => (
                      <option key={num} value={num} className="bg-[#0f172a] text-white">
                        Jornada {num} {num === jornadaActiva ? "(Activa)" : ""}
                      </option>
                    ))
                  ) : (
                    <option value={jornadaActiva} className="bg-[#0f172a] text-white">Jornada {jornadaActiva}</option>
                  )}
                </select>
              </div>

              {/* Botón Descargar Excel */}
              <button
                type="button"
                onClick={descargarSabanaExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
              >
                <span>📥</span> Descargar Excel
              </button>
            <div className="bg-[#091522] border border-amber-500/30 px-3 py-1 rounded-xl flex items-center gap-2 text-xs">
              <span className="text-amber-400 font-bold">⚽ Apuestas:</span>
              <span className="font-black text-white">{apuestaClasico}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 text-xs font-semibold pt-1">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/50"></span> Acierto
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500/20 border border-red-500/50"></span> Fallo
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-slate-700"></span> Pendiente
          </span>
        </div>
      </div>

          <div className="overflow-x-auto">
            <table className="w-auto mx-auto border-collapse text-center text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3 text-left font-semibold sticky left-0 bg-[#0f172a] z-10 min-w-[190px]">
                    Partido
                  </th>
                  <th className="py-2.5 px-2 font-bold text-pink-400 min-w-[50px]">
                    Real
                  </th>
                  {sociosActivos.map((socio: any) => (
                    <th key={socio.id} className="py-2.5 px-2 font-semibold text-slate-200 min-w-[65px]">
                      {socio.apodo || socio.alias || socio.nombre.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {((jornadaSeleccionadaMatriz === jornadaActiva || partidosMatriz.length === 0) ? partidos : partidosMatriz).map((p: any) => {
                  const sReal = getSignoRealPartido(p);
                  const esPleno = Number(p.id) === 15;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 text-left sticky left-0 bg-[#0f172a] z-10 border-r border-slate-800/70">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-400">#{p.id}</span>
                          <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">
                            {p.local} - {p.visitante}
                          </span>
                        </div>
                      </td>

                      <td className="py-2 px-1 font-black text-pink-400 bg-slate-900/40 border-r border-slate-800/70">
                        <span className={`px-1.5 py-0.5 rounded ${sReal !== "-" ? "bg-pink-950/80 border border-pink-500/40" : "text-slate-600"}`}>
                          {sReal}
                        </span>
                      </td>

                      {sociosActivos.map((socio: any) => {
                        const pronosticoBD = todosPronosticos[socio.id]?.[p.id];
                        const pronosticoSocio = socio.id === usuario?.id
                          ? (getMiPronostico(p.id) !== "-" ? getMiPronostico(p.id) : (pronosticoBD || "-"))
                          : (pronosticoBD || "-");

                        const disputado = sReal !== "-";
                        const tienePronostico = pronosticoSocio && pronosticoSocio !== "-";
                        const acertado = disputado && tienePronostico && pronosticoSocio.toUpperCase() === sReal.toUpperCase();
                        const fallado = disputado && tienePronostico && !acertado;

                        return (
                          <td key={socio.id} className="py-1.5 px-2 font-bold text-center">
                            <span
                              className={`inline-flex items-center justify-center rounded-md font-mono text-[11px] ${
                                esPleno ? "w-11 py-0.5" : "w-7 h-7"
                              } ${
                                acertado
                                  ? "bg-emerald-950/90 text-emerald-400 border border-emerald-500/50"
                                  : fallado
                                  ? "bg-red-950/80 text-red-400 border border-red-500/40"
                                  : tienePronostico
                                  ? "bg-[#090f1d] text-slate-300 border border-slate-700/60"
                                  : "bg-[#090f1d]/40 text-slate-600 border border-slate-800/40"
                              }`}
                            >
                              {pronosticoSocio}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                <tr className="bg-slate-900/80 font-black border-t-2 border-slate-700">
                  <td className="py-3 px-3 text-left text-xs uppercase tracking-wider text-slate-300 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                    Aciertos
                  </td>
                  <td className="py-3 px-1 text-slate-500 border-r border-slate-800">-</td>
                  {sociosActivos.map((socio: any) => {
                    const totalAciertosSocio = partidos.reduce((acc: number, p: any) => {
                      const sReal = getSignoRealPartido(p);
                      const pronosticoBD = todosPronosticos[socio.id]?.[p.id];
                      const pronostico = socio.id === usuario?.id
                        ? (getMiPronostico(p.id) !== "-" ? getMiPronostico(p.id) : (pronosticoBD || "-"))
                        : (pronosticoBD || "-");

                      if (sReal !== "-" && pronostico !== "-" && pronostico.toUpperCase() === sReal.toUpperCase()) {
                        return acc + 1;
                      }
                      return acc;
                    }, 0);

                    return (
                      <td key={socio.id} className="py-3 px-1 text-sm font-black text-[#00e699]">
                        {totalAciertosSocio}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        )
      )}

      {/* PESTAÑA 3: CLASIFICACIÓN CON 4 CICLOS (10 JORNADAS CADA UNO) */}
      {pestana === "clasificacion" && (
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-[#090f1d] p-1.5 rounded-2xl border border-slate-800 flex gap-1">
            {[
              { id: 1, label: "1º Ciclo", rango: "J1 - J10" },
              { id: 2, label: "2º Ciclo", rango: "J11 - J20" },
              { id: 3, label: "3º Ciclo", rango: "J21 - J30" },
              { id: 4, label: "4º Ciclo", rango: "J31 - J40" },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setCicloSeleccionado(c.id)}
                className={`flex-1 py-1.5 px-1 rounded-xl transition text-center ${
                  cicloSeleccionado === c.id
                    ? "bg-[#00e699] text-slate-950 font-black shadow-md shadow-emerald-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <div className="text-xs font-bold leading-none">{c.label}</div>
                <div className={`text-[9px] mt-0.5 ${cicloSeleccionado === c.id ? "text-slate-900 font-semibold" : "text-slate-500"}`}>
                  {c.rango}
                </div>
              </button>
            ))}
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="grid grid-cols-12 text-[10px] font-bold text-slate-400 pb-2 border-b border-slate-800 uppercase">
              <span className="col-span-1 text-center">Pos</span>
              <span className="col-span-6 pl-2">Socio</span>
              <span className="col-span-3 text-right">Premio</span>
              <span className="col-span-2 text-right">Ciclo</span>
            </div>

            <div className="divide-y divide-slate-800/60 mt-1">
              {tablaClasificacion.map((s) => (
                <div
                  key={s.id}
                  className={`grid grid-cols-12 items-center py-2.5 ${
                    s.enZonaPago ? "bg-red-950/20 px-1 rounded-xl" : ""
                  }`}
                >
                  <div className="col-span-1 flex justify-center">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${
                        s.pos === 1
                          ? "bg-amber-400 text-slate-950"
                          : s.pos === 2
                          ? "bg-slate-300 text-slate-950"
                          : s.pos === 3
                          ? "bg-amber-600 text-white"
                          : s.enZonaPago
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {s.pos}
                    </span>
                  </div>

                  <div className="col-span-6 pl-2 flex flex-col justify-center">
                    <span className="text-xs font-bold text-white leading-tight">
                      {s.apodo || s.alias || s.nombre}
                    </span>
                    {s.esTopPremio && (
                      <span className="text-[9px] text-amber-400 font-bold leading-tight">
                        ★ SALVADO POR PREMIO
                      </span>
                    )}
                    {s.enZonaPago && (
                      <span className="text-[9px] text-red-400 font-bold leading-tight">
                        ZONA DE PAGO
                      </span>
                    )}
                  </div>

                  <div className="col-span-3 text-right">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg inline-block ${
                        s.premioNum > 0
                          ? "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                          : "text-slate-500"
                      }`}
                    >
                      {s.premioNum.toFixed(2)} €
                    </span>
                  </div>

                  <div className="col-span-2 text-right">
                    <span className="text-xs font-black text-[#00e699]">
                      {s.pts} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tarjetas de Resumen del Ciclo: Inmunes y Zona de Pago */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {/* 1. Socios que se salvan (9 socios) */}
            <div className="bg-[#091522] border border-emerald-500/30 rounded-2xl p-3.5 shadow-lg">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 mb-2.5">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🛡️</span> Socios que se salvan
                </h3>
              </div>

              {tablaClasificacion.filter((s: any) => !s.enZonaPago).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {tablaClasificacion
                    .filter((s: any) => !s.enZonaPago)
                    .map((s: any) => (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between p-1.5 px-2 rounded-xl border ${
                          s.esTopPremio
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                            : "bg-emerald-950/20 border-emerald-500/20 text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[10px] font-bold w-5 ${s.esTopPremio ? "text-amber-400" : "text-emerald-400"}`}>
                            #{s.pos}
                          </span>
                          <span className="text-xs font-medium truncate">
                            {s.apodo || s.alias || s.nombre}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.esTopPremio ? (
                            <span className="text-[10px] font-mono font-bold text-amber-400">
                              ⭐ +{s.premioNum.toFixed(2)} €
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              {s.pts} pts
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic py-1">
                  Sin socios registrados.
                </p>
              )}
            </div>

            {/* 2. Zona de Pago en este Ciclo */}
            <div className="bg-[#091522] border border-red-500/30 rounded-2xl p-3.5 shadow-lg">
              <div className="flex items-center justify-between border-b border-red-500/20 pb-2 mb-2.5">
                <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💸</span> Socios que financian el ciclo
                </h3>
              </div>

              {sociosEnZonaPago.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {sociosEnZonaPago.map((s: any, idx: number) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-1.5 px-2 rounded-xl bg-red-950/20 border border-red-500/20"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold text-red-400 w-5">#{s.pos}</span>
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {s.apodo || s.alias || s.nombre}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                        {s.pts} pts
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic py-1">
                  Sin socios en zona de pago para este ciclo.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: CAJA Y FINANZAS */}
      {pestana === "caja" && (
        <div className="w-full max-w-3xl space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-3.5 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                Presupuesto Inicial
              </span>
              <span className="text-xl sm:text-2xl font-black text-white font-mono">
                {PRESUPUESTO_TEMPORADA.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
              </span>
            </div>

            <div className="bg-[#0f172a] border border-[#00e699]/30 rounded-2xl p-3.5 text-center">
              <span className="text-[10px] text-[#00e699] font-bold uppercase tracking-wider block mb-1">
                Total Recuperado
              </span>
              <span className="text-xl sm:text-2xl font-black text-[#00e699] font-mono">
                +{totalRecuperado.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
              </span>
            </div>

            <div className="bg-[#091522] border border-amber-400/40 rounded-2xl p-3.5 text-center">
              <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block mb-1">
                Fondo Pendiente
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                {fondoPendienteTemporada.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
              </span>
            </div>
          </div>

          {/* Tarjeta Destacada: Cuota por Ciclo Perdido */}
          <div className="bg-gradient-to-r from-[#0d1e33] to-[#091522] border border-amber-500/40 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-white uppercase tracking-wider">
                  Cuota por Ciclo Perdido
                </span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-400/30">
                  En directo
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Importe que abona cada socio por cada ciclo que finalice en <span className="text-red-400 font-semibold">Zona de Pago</span>.
              </p>
            </div>

            <div className="bg-[#090f1d] border border-amber-500/40 px-5 py-2.5 rounded-2xl text-center min-w-[150px]">
              <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                {cuotaExactaPorCicloPerdido} €
              </span>
              <span className="block text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                por ciclo / socio
              </span>
            </div>
          </div>

          {/* Cuadro de Amortización por Ciclos (Premios vs Apuestas) */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-2 mb-3 border-b border-slate-800">
              <span className="w-2 h-2 rounded-full bg-[#00e699]"></span>
              Balance Económico por Ciclos (Premios vs Apuestas)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                    <th className="py-2 text-left font-semibold">Concepto</th>
                    <th className="py-2 px-1">1º Ciclo</th>
                    <th className="py-2 px-1">2º Ciclo</th>
                    <th className="py-2 px-1">3º Ciclo</th>
                    <th className="py-2 px-1">4º Ciclo</th>
                    <th className="py-2 px-2 text-right font-bold text-white">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  <tr>
                    <td className="py-2.5 text-left font-sans font-semibold text-slate-200">
                      🏆 Premios Quiniela
                    </td>
                    <td className="py-2.5 text-slate-300">+{ingresosQuinielaPorCiclo[1]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-slate-300">+{ingresosQuinielaPorCiclo[2]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-slate-300">+{ingresosQuinielaPorCiclo[3]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-slate-300">+{ingresosQuinielaPorCiclo[4]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-right font-bold text-[#00e699]">
                      +{totalIngresosQuiniela.toFixed(2)} €
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 text-left font-sans font-semibold text-slate-200">
                      ⚽ Premios Apuestas
                    </td>
                    <td className="py-2.5 text-slate-300">+{ingresosApuestasPorCiclo[1]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-slate-300">+{ingresosApuestasPorCiclo[2]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-slate-300">+{ingresosApuestasPorCiclo[3]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-slate-300">+{ingresosApuestasPorCiclo[4]?.toFixed(2)} €</td>
                    <td className="py-2.5 text-right font-bold text-[#00e699]">
                      +{totalIngresosApuestas.toFixed(2)} €
                    </td>
                  </tr>
                  
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-black text-xs">
                    <td className="py-2.5 text-left text-white uppercase font-sans">
                      Amortización Neta
                    </td>
                    <td className="py-2.5 text-[#00e699]">
                      +{(ingresosQuinielaPorCiclo[1] + ingresosApuestasPorCiclo[1] - retiradasSociosPorCiclo[1]).toFixed(2)} €
                    </td>
                    <td className="py-2.5 text-[#00e699]">
                      +{(ingresosQuinielaPorCiclo[2] + ingresosApuestasPorCiclo[2] - retiradasSociosPorCiclo[2]).toFixed(2)} €
                    </td>
                    <td className="py-2.5 text-[#00e699]">
                      +{(ingresosQuinielaPorCiclo[3] + ingresosApuestasPorCiclo[3] - retiradasSociosPorCiclo[3]).toFixed(2)} €
                    </td>
                    <td className="py-2.5 text-[#00e699]">
                      +{(ingresosQuinielaPorCiclo[4] + ingresosApuestasPorCiclo[4] - retiradasSociosPorCiclo[4]).toFixed(2)} €
                    </td>
                    <td className="py-2.5 text-right font-mono text-[#00e699]">
                      +{totalRecuperado.toFixed(2)} €
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Historial Cronológico de Movimientos */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00e699]"></span>
                Historial de Premios y Cobros
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {listaPremios.length} movimientos registrados
              </span>
            </div>

            {listaPremios.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No hay movimientos registrados todavía. Usa el panel de Admin para registrar apuestas o premios.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2">Jornada</th>
                      <th className="py-2 px-2">Ciclo</th>
                      <th className="py-2 px-2">Concepto</th>
                      <th className="py-2 px-2">Beneficiario</th>
                      <th className="py-2 px-2 text-right">Importe</th>
                      {perfil?.rol === "admin" && <th className="py-2 px-2 text-center">Acción</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {listaPremios.map((pr, idx) => (
                      <tr key={pr.id || idx} className="hover:bg-slate-800/30 transition">
                        <td className="py-2 px-2 text-slate-400 font-mono text-[11px]">
                          {pr.creado_en ? new Date(pr.creado_en).toLocaleDateString() : "2026-09-02"}
                        </td>
                        <td className="py-2 px-2 font-bold text-slate-300">J{pr.jornada}</td>
                        <td className="py-2 px-2 font-semibold text-slate-400">{pr.ciclo}º</td>
                        <td className="py-2 px-2 font-medium text-slate-200">{pr.concepto}</td>
                        <td className="py-2 px-2 font-bold text-[#00e699]">
                          {pr.concepto?.toLowerCase().includes("apuesta") ? "Peña" : getNombreSocioPorId(pr.socio_id)}
                        </td>
                        <td className="py-2 px-2 text-right font-black text-emerald-400 font-mono">
                          +{Number(pr.importe).toFixed(2)} €
                        </td>
                        {perfil?.rol === "admin" && (
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleEliminarPremio(pr.id)}
                              title="Eliminar este movimiento"
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 text-xs transition"
                            >
                              🗑️
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA: CUOTAS */}
      {pestana === "cuotas" && (
        <div className="w-full max-w-2xl bg-[#0f172a] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00e699]"></span>
                Control de Aportaciones y Cuotas
              </h2>
              <p className="text-xs text-slate-400">Seguimiento individual de pagos de la temporada</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-medium">Total Recaudado</span>
              <span className="text-lg font-black text-[#00e699] font-mono">
                {sociosActivos.reduce((acc, s) => acc + (mapaCuotas[s.id] || 0), 0).toFixed(2)} €
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-800/60">
            {sociosActivos.map((socio) => {
              const valorActual = mapaCuotas[socio.id] || 0;
              const valorInput = editandoCuota[socio.id] ?? String(valorActual);

              return (
                <div key={socio.id} className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/20 px-2 rounded-xl transition">
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {socio.nombre}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {socio.apodo || socio.alias || "Socio"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {perfil?.rol === "admin" ? (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          value={valorInput}
                          onChange={(e) =>
                            setEditandoCuota((prev) => ({ ...prev, [socio.id]: e.target.value }))
                          }
                          className="w-24 bg-[#090f1d] border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-right text-white font-mono focus:outline-none focus:border-[#00e699]"
                        />
                        <span className="text-xs text-slate-400">€</span>
                        <button
                          type="button"
                          disabled={guardandoCuota === socio.id}
                          onClick={() => guardarCuotaSocio(socio.id)}
                          className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-[11px] font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
                        >
                          {guardandoCuota === socio.id ? "..." : "Guardar"}
                        </button>
                      </>
                    ) : (
                      <span className="text-sm font-bold text-white font-mono px-3 py-1 bg-slate-900 rounded-xl border border-slate-800">
                        {valorActual.toFixed(2)} €
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between font-black text-sm bg-slate-900/60 p-3 rounded-xl">
            <span className="text-white uppercase tracking-wider text-xs">Total Peña</span>
            <span className="text-[#00e699] font-mono text-base">
              {sociosActivos.reduce((acc, s) => acc + (mapaCuotas[s.id] || 0), 0).toFixed(2)} €
            </span>
          </div>
        </div>
      )}

      {/* PESTAÑA 5: MI BOLETO */}
      {pestana === "boleto" && (
        <div className="w-full max-w-xl space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
            <span>Marca tus pronósticos oficiales para la jornada</span>
            <button
              onClick={restaurarBoleto}
              className="text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2 flex items-center gap-1"
            >
              🔄 Restaurar boleto
            </button>
          </div>

          {notificacion && (
            <div className="p-3 bg-[#091522] border border-[#00e699]/40 rounded-xl text-center text-xs font-bold text-[#00e699]">
              {notificacion}
            </div>
          )}

          <div className="space-y-3">
            {partidos.filter((p: any) => Number(p.id) !== 15).map((p: any) => {
              const eq1 = p.local || p.equipo1 || "Local";
              const eq2 = p.visitante || p.equipo2 || "Visitante";
              const mi = misPronosticos[p.id];

              return (
                <div
                  key={p.id}
                  className="bg-[#0f172a] border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[10px] text-slate-400 font-medium mb-0.5">
                      {p.horario || (p.estado === "FINALIZADO" ? "Final" : "Pendiente")}
                    </div>
                    <div className="text-sm font-bold text-white">
                      {eq1} <span className="text-xs font-normal text-slate-400">vs</span> {eq2}
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    {["1", "X", "2"].map((s) => (
                      <button
                        key={s}
                        onClick={() => seleccionarSigno(p.id, s)}
                        className={`w-9 h-9 rounded-xl font-bold text-xs transition ${
                          mi === s
                            ? "bg-[#00e699] text-slate-950 font-black shadow-md shadow-emerald-500/20"
                            : "bg-[#090f1d] hover:bg-slate-800 text-slate-300 border border-slate-700/60"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            

            {/* Pleno al 15 */}
            <div className="bg-[#091522] border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#00e699] font-bold text-xs uppercase tracking-wider">
                  Partido 15 · Pleno al 15
                </span>
                <span className="text-[10px] text-slate-400">Goles exactos (0, 1, 2, M)</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white">
                  {partidos.find((p: any) => Number(p.id) === 15)?.local ? `${partidos.find((p: any) => Number(p.id) === 15)?.local} vs ${partidos.find((p: any) => Number(p.id) === 15)?.visitante}` : "Partido 15"}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={plenoLocal}
                    onChange={(e) => setPlenoLocal(e.target.value)}
                    className="bg-[#090f1d] border border-slate-700 text-[#00e699] font-bold rounded-lg px-2.5 py-1 text-xs focus:outline-none"
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="M">M</option>
                  </select>
                  <span className="text-slate-500">-</span>
                  <select
                    value={plenoVisitante}
                    onChange={(e) => setPlenoVisitante(e.target.value)}
                    className="bg-[#090f1d] border border-slate-700 text-[#00e699] font-bold rounded-lg px-2.5 py-1 text-xs focus:outline-none"
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="M">M</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={restaurarBoleto}
                className="w-1/3 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl transition border border-slate-700"
              >
                Limpiar Todo
              </button>
              <button
                type="button"
                onClick={guardarBoleto}
                disabled={guardando}
                className="w-2/3 py-3.5 bg-[#00e699] hover:bg-[#00c985] text-slate-950 font-black text-sm rounded-2xl transition shadow-lg shadow-emerald-500/20 active:scale-[0.99] disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar mi Quiniela"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PANEL DE ADMINISTRADOR */}
      {modalAdmin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative space-y-5">
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <span>⚙️</span> Panel de Administración
              </h3>
              <button
                onClick={() => setModalAdmin(false)}
                className="w-8 h-8 rounded-full bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 1. Solicitudes de Socios Pendientes */}
            <div className="bg-[#090f1d] p-4 rounded-2xl border border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>⏳</span> Solicitudes Pendientes ({sociosPendientes.length})
                </span>
              </div>

              {sociosPendientes.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-1">No hay solicitudes pendientes de aprobación.</p>
              ) : (
                <div className="space-y-2">
                  {sociosPendientes.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{s.nombre || "Sin nombre"}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono">
                            {s.apodo}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{s.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => rechazarSocio(s.id)}
                          className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Rechazar
                        </button>
                        <button
                          type="button"
                          onClick={() => aprobarSocio(s.id)}
                          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Aprobar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Fijar Jornada Activa */}
            <div className="bg-[#090f1d] p-4 rounded-2xl border border-[#00e699]/30">
              <span className="text-xs font-bold text-[#00e699] uppercase tracking-wider block mb-1">
                ⚽ Jornada Activa Oficial
              </span>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                Cambia la jornada en juego para todos los socios de la peña.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="42"
                  value={jornadaActiva}
                  onChange={(e) => setJornadaActiva(Number(e.target.value))}
                  className="w-24 bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-sm text-center font-bold text-white font-mono focus:outline-none focus:border-[#00e699]"
                />
                <button
                  type="button"
                  disabled={cambiandoJornada}
                  onClick={() => actualizarJornadaActiva(jornadaActiva)}
                  className="flex-1 py-2.5 bg-[#00e699] hover:bg-[#00c985] text-slate-950 text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  {cambiandoJornada ? "Actualizando..." : "Fijar como Jornada Actual"}
                </button>
              </div>
            </div>

            {/* 3. Asignar Premio Económico */}
            <form onSubmit={handleGuardarPremioAdmin} className="bg-[#090f1d] p-4 rounded-2xl border border-slate-800 space-y-3.5">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                🏆 Asignar Premio
              </span>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1 font-medium">Beneficiario</label>
                <select
                  value={formSocioId}
                  onChange={(e) => setFormSocioId(e.target.value)}
                  className="w-full bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  required
                >
                  <option value="">Selecciona un socio...</option>
                    {sociosActivos.map((s) => (
                      <option key={s.id || s.socio_id} value={s.id || s.socio_id}>
                        {s.nombre} ({s.apodo || s.alias || "Socio"})
                      </option>
                    ))}
                    </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Jornada</label>
                  <input
                    type="number"
                    value={formJornada}
                    onChange={(e) => {
                      const j = Number(e.target.value);
                      setFormJornada(j);
                      setFormCiclo(getCicloPorJornada(j));
                    }}
                    className="w-full bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00e699]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Ciclo Calculado</label>
                  <select
                    value={formCiclo}
                    onChange={(e) => setFormCiclo(Number(e.target.value))}
                    className="w-full bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00e699]"
                  >
                    <option value={1}>1º Ciclo (J1-J10)</option>
                    <option value={2}>2º Ciclo (J11-J20)</option>
                    <option value={3}>3º Ciclo (J21-J30)</option>
                    <option value={4}>4º Ciclo (J31-J40)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1 font-medium">Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej: 181.60"
                  value={formImporte}
                  onChange={(e) => setFormImporte(e.target.value)}
                  className="w-full bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00e699]"
                />
              </div>

              {msgAdmin && (
                <div className="p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-[#00e699] text-center text-xs font-bold">
                  {msgAdmin}
                </div>
              )}

              <button
                type="submit"
                disabled={guardandoAdmin}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                {guardandoAdmin ? "Guardando..." : "Registrar Premio Quiniela"}
              </button>
            </form>

            {/* 4. Ganancia Apuesta Especial Barça vs Real Madrid */}
            <form onSubmit={handleGuardarApuestaClasico} className="bg-[#090f1d] p-4 rounded-2xl border border-emerald-500/30 space-y-3.5">
              <span className="text-xs font-bold text-[#00e699] uppercase tracking-wider block">
                ⚽ Ganancia Apuesta Especial: Barça vs Real Madrid
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Jornada</label>
                  <input
                    type="number"
                    value={jornadaClasico}
                    onChange={(e) => setJornadaClasico(Number(e.target.value))}
                    className="w-full bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00e699]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Importe Ganado (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 120.00"
                    value={importeClasico}
                    onChange={(e) => setImporteClasico(e.target.value)}
                    className="w-full bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00e699]"
                  />
                </div>
              </div>

              {msgClasico && (
                <div className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs text-center py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5">
                  {msgClasico}
                </div>
              )}

              <button
                type="submit"
                disabled={guardandoClasico}
                className="w-full py-2.5 bg-[#00e699] hover:bg-[#00c985] text-slate-950 font-extrabold text-xs rounded-xl transition cursor-pointer shadow-md shadow-emerald-500/20"
              >
                {guardandoClasico ? "Guardando..." : "Registrar Ganancia Clásico"}
              </button>
            </form>

            {/* 5. Resetear Boleto de Socio (Dentro de la ventana) */}
            <div className="bg-[#090f1d] p-4 rounded-2xl border border-red-500/30 space-y-2.5">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🗑️</span> Resetear Boleto de Socio
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Elimina las marcas de la jornada activa si un socio se ha equivocado y necesita enviarla otra vez.
              </p>
              <div className="flex items-center gap-2.5 pt-1">
                <select
                  id="selectResetSocio"
                  className="flex-1 bg-[#0d1527] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/50"
                >
                  <option value="">Selecciona socio...</option>
                  {sociosActivos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} ({s.apodo})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={borrandoPronosticos}
                  onClick={() => {
                    const el = document.getElementById("selectResetSocio") as HTMLSelectElement;
                    if (!el || !el.value) return alert("Selecciona un socio primero");
                    resetearBoletoSocio(el.value, jornadaActiva);
                  }}
                  className="px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer"
                >
                  {borrandoPronosticos ? "Borrando..." : "Borrar Boleto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AuthModal
        isOpen={modalAuth}
        onClose={() => setModalAuth(false)}
        onSuccess={(usr, prof) => {
          setUsuario(usr);
          const esAdminPorEmail = CORREOS_ADMIN.includes((usr.email || "").toLowerCase());
          setPerfil({
            ...prof,
            rol: esAdminPorEmail ? "admin" : (prof?.rol || "socio"),
            estado: esAdminPorEmail ? "aprobado" : prof?.estado
          });
        }}
      />
    </div>
  );
}

async function verificarYAvanzarJornada() {
  try {
    const { data: jornadaActiva, error: errJornada } = await supabase
      .from('jornadas')
      .select('id')
      .eq('activa', true)
      .maybeSingle();

    if (errJornada || !jornadaActiva) return;

    const siguienteId = jornadaActiva.id + 1;
    const { data: jornadaSiguiente } = await supabase
      .from('jornadas')
      .select('id')
      .eq('id', siguienteId)
      .maybeSingle();

    if (!jornadaSiguiente) return;

    const { data: ultimoPartido } = await supabase
      .from('partidos')
      .select('fecha_inicio')
      .eq('jornada_id', jornadaActiva.id)
      .not('fecha_inicio', 'is', null)
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimoPartido?.fecha_inicio) return;

    const inicioMs = new Date(ultimoPartido.fecha_inicio).getTime();
    const cuatroHorasMs = 4 * 60 * 60 * 1000;
    const tiempoCierre = new Date(inicioMs + cuatroHorasMs);
    const ahora = new Date();

    if (ahora > tiempoCierre) {
      await supabase.from('jornadas').update({ activa: false }).eq('id', jornadaActiva.id);
      await supabase.from('jornadas').update({ activa: true }).eq('id', siguienteId);
      console.log(`Jornada ${jornadaActiva.id} cerrada. Jornada ${siguienteId} activada.`);
    }
  } catch (error) {
    console.error('Error en verificarYAvanzarJornada:', error);
  }
}