"use client";

import React, { useState } from "react";
import { supabase } from "../supabaseClient";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any, profile: any) => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [modo, setModo] = useState<"login" | "registro" | "recuperar">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apodo, setApodo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const limpiarFormulario = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  // Registro tradicional + Creación de Perfil
  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    limpiarFormulario();

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}`,
          data: {
            nombre: nombre.trim(),
            apodo: apodo.trim().toUpperCase(),
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.from("perfiles").insert({
          id: authData.user.id,
          nombre: nombre.trim(),
          apodo: apodo.trim().toUpperCase(),
          email: email.trim(),
          rol: "socio",
        });

        if (profileError) throw profileError;

        if (!authData.session) {
          setSuccessMsg(
            "📩 ¡Registro completado! Te hemos enviado un enlace a tu correo. Revisa tu bandeja de entrada o spam para activar tu cuenta antes de iniciar sesión."
          );
        } else {
          onSuccess(authData.user, { nombre: nombre.trim(), apodo: apodo.trim().toUpperCase(), rol: "socio" });
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al registrar socio");
    } finally {
      setCargando(false);
    }
  };

  // Login con email y contraseña
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    limpiarFormulario();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      if (data.user) {
        const { data: profile } = await supabase
          .from("perfiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

        onSuccess(data.user, profile);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al iniciar sesión");
    } finally {
      setCargando(false);
    }
  };

  // Recuperación de Contraseña por Correo
  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setCargando(true);
    limpiarFormulario();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) throw error;

      setSuccessMsg(
        "📩 Te hemos enviado un correo para restablecer tu contraseña. Revisa la bandeja de entrada o la carpeta de spam."
      );
    } catch (err: any) {
      setErrorMsg(err.message || "Error al solicitar restablecimiento");
    } finally {
      setCargando(false);
    }
  };

  // Acceso Biométrico / Passkey
  const handleBiometrico = async () => {
    if (!window.PublicKeyCredential) {
      setErrorMsg("Tu navegador o dispositivo no soporta autenticación biométrica.");
      return;
    }

    try {
      setCargando(true);
      limpiarFormulario();

      const disponible = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!disponible) {
        throw new Error("No hay sensor biométrico configurado en este dispositivo.");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const { data: profile } = await supabase
          .from("perfiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .single();

        onSuccess(sessionData.session.user, profile);
        onClose();
        return;
      }

      setErrorMsg("Primero inicia sesión con tu contraseña para activar tu huella en este dispositivo.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error biométrico");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-white">
        {/* Botón Cerrar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white text-xl font-bold"
        >
          ✕
        </button>

        {/* Encabezado */}
        <div className="text-center mb-6">
          <span className="text-3xl">⚽</span>
          <h2 className="text-2xl font-black tracking-tight mt-2 text-emerald-400">
            {modo === "registro" && "Nuevo Socio"}
            {modo === "login" && "Área de Socios"}
            {modo === "recuperar" && "Recuperar Acceso"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {modo === "registro" && "Regístrate para guardar tus pronósticos y sumar puntos"}
            {modo === "login" && "Introduce tus credenciales para acceder a tu boleto"}
            {modo === "recuperar" && "Te enviaremos las instrucciones a tu correo electrónico"}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-medium text-center">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-[#00e699] text-xs font-semibold text-center leading-relaxed">
            {successMsg}
          </div>
        )}

        {/* MODO RECUPERAR CONTRASEÑA */}
        {modo === "recuperar" ? (
          <form onSubmit={handleRecuperar} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Correo Electrónico</label>
              <input
                type="email"
                required
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-white"
              />
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {cargando ? "Enviando correo..." : "Enviar Enlace de Recuperación"}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setModo("login");
                  limpiarFormulario();
                }}
                className="text-xs text-slate-400 hover:text-white transition underline underline-offset-2"
              >
                ← Volver a Iniciar Sesión
              </button>
            </div>
          </form>
        ) : (
          /* MODO LOGIN O REGISTRO */
          <>
            {/* Botón de Acceso Rápido Biométrico (Solo en Login) */}
            {modo === "login" && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={handleBiometrico}
                  disabled={cargando}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 hover:border-emerald-400 flex items-center justify-center gap-3 font-semibold text-emerald-300 transition active:scale-[0.98]"
                >
                  <span className="text-2xl">👆</span>
                  <span>Entrar con Huella / Face ID</span>
                </button>
                <div className="flex items-center my-4">
                  <div className="flex-grow border-t border-slate-800"></div>
                  <span className="px-3 text-xs text-slate-500 uppercase font-mono">o con clave</span>
                  <div className="flex-grow border-t border-slate-800"></div>
                </div>
              </div>
            )}

            <form onSubmit={modo === "registro" ? handleRegistro : handleLogin} className="space-y-4">
              {modo === "registro" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Nombre Completo</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Antonio David"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Apodo / Alias en la Peña</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: ADR, ILR..."
                      value={apodo}
                      onChange={(e) => setApodo(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm uppercase tracking-wider font-bold focus:outline-none focus:border-emerald-500 text-white"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-400">Contraseña</label>
                  {modo === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setModo("recuperar");
                        limpiarFormulario();
                      }}
                      className="text-[11px] text-slate-400 hover:text-emerald-400 underline underline-offset-2 transition"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-white"
                />
              </div>

              <button
                type="submit"
                disabled={cargando}
                className="w-full py-3 mt-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {cargando ? "Procesando..." : modo === "registro" ? "Completar Registro" : "Iniciar Sesión"}
              </button>
            </form>

            {/* Alternar entre Login y Registro */}
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => {
                  setModo(modo === "registro" ? "login" : "registro");
                  limpiarFormulario();
                }}
                className="text-xs text-slate-400 hover:text-emerald-400 underline underline-offset-4"
              >
                {modo === "registro"
                  ? "¿Ya eres socio? Inicia sesión aquí"
                  : "¿Nuevo en la peña? Date de alta aquí"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}