"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://yyhocjfyupcunjgixkqm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5aG9jamZ5dXBjdW5qZ2l4a3FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODY1OTAsImV4cCI6MjA5MTA2MjU5MH0.hU4usFzY2A_prPE0n2AywBGrgFuYgjOgb-9DrByqqso";

async function sbFetch(table, method = "GET", body = null, query = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const opts = {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "return=representation" : method === "PATCH" ? "return=representation" : undefined,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  // Clean undefined headers
  Object.keys(opts.headers).forEach(k => opts.headers[k] === undefined && delete opts.headers[k]);
  const res = await fetch(url, opts);
  if (!res.ok) { const t = await res.text(); console.error("Supabase error:", t); return null; }
  if (method === "DELETE") return true;
  try { return await res.json(); } catch { return true; }
}

const db = {
  // Projects
  async getProjects() { return await sbFetch("projects", "GET", null, "?order=created_at.desc") || []; },
  async createProject(p) { const r = await sbFetch("projects", "POST", p); return r?.[0] || null; },
  async updateProject(id, data) { return await sbFetch("projects", "PATCH", data, `?id=eq.${id}`); },
  async deleteProject(id) { return await sbFetch("projects", "DELETE", null, `?id=eq.${id}`); },
  // Dias inhabiles
  async getDias() { return await sbFetch("dias_inhabiles", "GET", null, "?order=fecha.asc") || []; },
  async addDia(fecha, motivo) { return await sbFetch("dias_inhabiles", "POST", { fecha, motivo }); },
  async delDia(fecha) { return await sbFetch("dias_inhabiles", "DELETE", null, `?fecha=eq.${fecha}`); },
};

// ═══════════════════════════════════════════════════════════════
// DÍAS INHÁBILES
// ═══════════════════════════════════════════════════════════════
const LFT = [
  { fecha: "2025-01-01", motivo: "Año Nuevo" },{ fecha: "2025-02-03", motivo: "Día de la Constitución" },
  { fecha: "2025-03-17", motivo: "Natalicio de Benito Juárez" },{ fecha: "2025-05-01", motivo: "Día del Trabajo" },
  { fecha: "2025-09-16", motivo: "Día de la Independencia" },{ fecha: "2025-11-17", motivo: "Revolución Mexicana" },
  { fecha: "2025-12-25", motivo: "Navidad" },{ fecha: "2026-01-01", motivo: "Año Nuevo" },
  { fecha: "2026-02-02", motivo: "Día de la Constitución" },{ fecha: "2026-03-16", motivo: "Natalicio de Benito Juárez" },
  { fecha: "2026-05-01", motivo: "Día del Trabajo" },{ fecha: "2026-09-16", motivo: "Día de la Independencia" },
  { fecha: "2026-11-16", motivo: "Revolución Mexicana" },{ fecha: "2026-12-25", motivo: "Navidad" },
];
function isWE(d) { return d.getDay() === 0 || d.getDay() === 6; }
function inhSet(inh) { const s = new Set(); inh.forEach(i => s.add(i.fecha)); return s; }
function addBD(ds, n, inh) {
  if (!ds || n <= 0) return null;
  const s = inhSet(inh); let d = new Date(ds + "T12:00:00"), a = 0;
  while (a < n) { d.setDate(d.getDate() + 1); if (!isWE(d) && !s.has(d.toISOString().split("T")[0])) a++; }
  return d.toISOString().split("T")[0];
}
function bdBetween(a, b, inh) {
  const s = inhSet(inh); let x = new Date(a + "T12:00:00"), y = new Date(b + "T12:00:00"), neg = false;
  if (y < x) { [x, y] = [y, x]; neg = true; }
  let c = 0, cur = new Date(x);
  while (cur < y) { cur.setDate(cur.getDate() + 1); if (!isWE(cur) && !s.has(cur.toISOString().split("T")[0])) c++; }
  return neg ? -c : c;
}
function td() { return new Date().toISOString().split("T")[0]; }
function fmt(d) {
  if (!d) return "—";
  const p = d.split("-"), m = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${parseInt(p[2])} ${m[parseInt(p[1])-1]} ${p[0]}`;
}

// ═══════════════════════════════════════════════════════════════
// MODELO
// ═══════════════════════════════════════════════════════════════
const NOTARIA = "Notaría 65 de Guadalajara";
const TIPOS = ["sin_registro", "comercio", "propiedad", "personas_juridicas"];
const TIPO_L = { sin_registro: "Sin inscripción", comercio: "Comercio", propiedad: "Propiedad", personas_juridicas: "Personas Jurídicas" };

const BASE_INICIO = [
  { id: "proyeccion", label: "Proyección de documentos", owner: "alonso", plazo: 0, desc: "Proyectar documentos y armar expediente completo" },
  { id: "envio", label: "Envío de expediente", owner: "alonso", plazo: 0, desc: "Enviar expediente completo por email a Notaría 65" },
  { id: "folios", label: "Proyecto en folios", owner: "notaria", plazo: 3, desc: "Preparar proyecto en folios para firma — 3 días hábiles" },
  { id: "firma", label: "Firma en notaría", owner: "alonso", plazo: 2, desc: "Acudir a Notaría 65 a firmar — 2 días hábiles" },
];
const BASE_FIN = [
  { id: "facturacion", label: "Facturación", owner: "notaria", plazo: 0, desc: "Emitir factura a Alonso y Cía" },
  { id: "pago", label: "Pago a notaría", owner: "alonso", plazo: 2, desc: "Pagar dentro de 2 días hábiles tras recibir factura" },
];

function getEtapas(tipo) {
  if (tipo === "sin_registro") return [...BASE_INICIO, { id: "entregables", label: "Entregables", owner: "notaria", plazo: 2, desc: "Copia certificada + testimonio — 2 días hábiles" }, { id: "envio_cliente", label: "Envío a cliente", owner: "alonso", plazo: 0, desc: "Enviar copia certificada y testimonio al cliente" }, ...BASE_FIN];
  if (tipo === "comercio") return [...BASE_INICIO, { id: "entregables", label: "Entregables", owner: "notaria", plazo: 3, desc: "Copia certificada + testimonio + boleta registral — 3 días hábiles" }, { id: "envio_cliente", label: "Envío a cliente", owner: "alonso", plazo: 0, desc: "Enviar copia certificada y testimonio al cliente" }, ...BASE_FIN];
  return [...BASE_INICIO, { id: "entregables", label: "Entregables", owner: "notaria", plazo: 2, desc: "Ingreso solicitud + comprobante + copia certificada — 2 días hábiles" }, { id: "envio_cc", label: "Envío a cliente copia certificada", owner: "alonso", plazo: 0, desc: "Enviar copia certificada al cliente" }, { id: "envio_test", label: "Envío a cliente testimonio con boleta", owner: "alonso", plazo: 0, desc: "Enviar testimonio con boleta de inscripción al cliente" }, ...BASE_FIN];
}

function getSt(p, i, inh) {
  const etapas = getEtapas(p.tipo); const e = etapas[i], d = p.etapas[e.id];
  if (d?.done) return { s: "done", c: "#16a34a", l: "Completada" };
  if (i > p.step) return { s: "wait", c: "#94a3b8", l: "Pendiente" };
  if (i < p.step) return { s: "done", c: "#16a34a", l: "Completada" };
  if (e.plazo > 0 && d?.start) {
    const v = addBD(d.start, e.plazo, inh), h = td();
    if (h > v) return { s: "over", c: "#dc2626", l: "Vencida", v };
    if (bdBetween(h, v, inh) <= 1) return { s: "soon", c: "#d97706", l: "Por vencer", v };
    return { s: "active", c: "#2563eb", l: "En curso", v };
  }
  return { s: "active", c: "#2563eb", l: "Acción requerida" };
}

function makeEtapasState(tipo, startDate) {
  const etapas = getEtapas(tipo); const state = {};
  etapas.forEach((e, i) => { state[e.id] = { done: false, start: i === 0 ? startDate : null, end: null }; });
  return state;
}

// Map DB row to app format
function dbToApp(row) {
  return {
    id: row.id, name: row.name, tipo: row.tipo, step: row.step, created: row.created,
    factSent: row.fact_sent, factDate: row.fact_date, pagoMarcado: row.pago_marcado, pagoDate: row.pago_date,
    respNotaria: row.resp_notaria || "", etapas: row.etapas, finished: row.finished, finDate: row.fin_date,
  };
}

// ═══════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════
function buildAlerts(ps, inh) {
  const a = [];
  ps.forEach(p => {
    const etapas = getEtapas(p.tipo);
    if (p.finished || p.step >= etapas.length) return;
    const e = etapas[p.step], info = getSt(p, p.step, inh);
    if (info.s === "over" || info.s === "soon")
      a.push({ id: `${p.id}-${e.id}-${info.s}`, tipo: info.s === "over" ? "vencida" : "por_vencer", proj: p.name, pid: p.id, etapa: e.label, owner: e.owner, v: info.v, respN: p.respNotaria });
  });
  return a;
}

// ═══════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════
function Bg({ children, bg, color, style: s }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg || "#f1f0ed", color: color || "#8a857c", whiteSpace: "nowrap", ...s }}>{children}</span>;
}
function OBg({ o }) { return o === "notaria" ? <Bg bg="#f5f3ff" color="#7c3aed">Notaría 65</Bg> : <Bg bg="#eff6ff" color="#2563eb">Alonso y Cía</Bg>; }
function Bt({ children, onClick, v = "p", disabled, style: s }) {
  const vs = { p: { background: "#2563eb", color: "#fff" }, g: { background: "transparent", color: "#8a857c", border: "1px solid #e8e5df" }, n: { background: "#7c3aed", color: "#fff" }, d: { background: "#fef2f2", color: "#dc2626" }, w: { background: "#fffbeb", color: "#d97706" } };
  return <button onClick={onClick} disabled={disabled} style={{ borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, fontFamily: "inherit", border: "none", ...vs[v], ...s }}>{children}</button>;
}
function Stat({ label, value, icon, accent, sub }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", border: "1px solid #e8e5df", flex: 1, minWidth: 130, display: "flex", gap: 14, alignItems: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: accent + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
      <div><div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{value}</div><div style={{ fontSize: 11, color: "#8a857c", marginTop: 3, fontWeight: 500 }}>{label}</div>{sub && <div style={{ fontSize: 10, color: accent, fontWeight: 700, marginTop: 1 }}>{sub}</div>}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════════
function Pipe({ p, inh, role, onDone, onUndo, onFact, onPago }) {
  const etapas = getEtapas(p.tipo); const envDone = p.etapas.envio?.done;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {etapas.map((e, i) => {
        const d = p.etapas[e.id], info = getSt(p, i, inh);
        const isAct = i === p.step && !p.finished;
        const canAct = isAct && (role === "alonso" || e.owner === "notaria");
        const isFact = e.id === "facturacion", isPago = e.id === "pago";
        let dI = info;
        if (isFact && envDone && !p.factSent && info.s === "wait") dI = { s: "active", c: "#7c3aed", l: "Disponible" };
        if (isFact && p.factSent) dI = { s: "done", c: "#16a34a", l: "Completada" };
        // Pago: calculate deadline from factDate
        let pagoVenc = null, pagoDI = null;
        if (isPago && p.factSent && !p.pagoMarcado) {
          pagoVenc = addBD(p.factDate, 2, inh);
          const h = td();
          if (h > pagoVenc) pagoDI = { s: "over", c: "#dc2626", l: "Vencida" };
          else if (bdBetween(h, pagoVenc, inh) <= 1) pagoDI = { s: "soon", c: "#d97706", l: "Por vencer" };
          else pagoDI = { s: "active", c: "#2563eb", l: "En curso" };
        }
        if (isPago && p.factSent && !p.pagoMarcado && info.s === "wait") dI = pagoDI || { s: "active", c: "#2563eb", l: "Disponible" };
        if (isPago && p.factSent && !p.pagoMarcado && info.s !== "wait") dI = pagoDI || info;
        if (isPago && p.pagoMarcado) dI = { s: "done", c: "#16a34a", l: "Completada" };
        const rowHL = (isFact && envDone && !p.factSent) || (isPago && p.factSent && !p.pagoMarcado);
        return (
          <div key={e.id}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 12, alignItems: "center", padding: "11px 14px", borderRadius: 12, background: isAct ? (dI.s === "over" ? "#fef2f2" : dI.s === "soon" ? "#fffbeb" : "#f8f7f5") : rowHL ? (isFact ? "#f5f3ff" : "#eff6ff") : "transparent", border: isAct ? `1px solid ${dI.c}25` : rowHL ? `1px solid ${dI.c}20` : "1px solid transparent" }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: dI.s === "done" ? "#16a34a18" : dI.s === "wait" ? "#f1f0ed" : dI.c + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: dI.c, border: `2px solid ${dI.s === "wait" ? "#e8e5df" : dI.c}40` }}>
                {dI.s === "done" ? "✓" : dI.s === "wait" ? (i+1) : dI.s === "over" ? "!" : dI.s === "soon" ? "⏰" : "●"}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: dI.s === "wait" ? "#8a857c" : "#1a1714", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{e.label} <OBg o={e.owner} /></div>
                <div style={{ fontSize: 11, color: "#8a857c", marginTop: 2 }}>{e.desc}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap", fontSize: 11, color: "#8a857c" }}>
                  {e.plazo > 0 && !isPago && <span>Plazo: {e.plazo} días háb.</span>}
                  {isPago && <span>Plazo: 2 días háb. desde factura</span>}
                  {isPago && p.factSent && <span>Factura: {fmt(p.factDate)}</span>}
                  {isPago && pagoVenc && !p.pagoMarcado && <span style={{ color: dI.c, fontWeight: 700 }}>Vence: {fmt(pagoVenc)}</span>}
                  {isPago && p.pagoMarcado && <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Pagado: {fmt(p.pagoDate)}</span>}
                  {!isPago && d?.start && <span>Inicio: {fmt(d.start)}</span>}
                  {!isPago && d?.end && <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {fmt(d.end)}</span>}
                  {!isPago && info.v && !d?.done && <span style={{ color: info.c, fontWeight: 700 }}>Vence: {fmt(info.v)}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                {d?.done && !p.finished && i === p.step - 1 && !isFact && !isPago && <Bt v="w" onClick={() => onUndo(p.id)} style={{ fontSize: 11, padding: "5px 10px" }}>↩ Deshacer</Bt>}
                {isFact && !p.factSent && envDone && <Bt v={role === "notaria" ? "n" : "p"} onClick={() => onFact(p.id)}>📄 Marcar factura enviada</Bt>}
                {isFact && p.factSent && <Bg bg="#f0fdf4" color="#16a34a">✓ Factura {fmt(p.factDate)}</Bg>}
                {isPago && p.factSent && !p.pagoMarcado && role === "alonso" && <Bt v="p" onClick={() => onPago(p.id)}>💰 Marcar pago realizado</Bt>}
                {isPago && !p.factSent && <Bg bg="#f1f0ed" color="#8a857c">Requiere factura primero</Bg>}
                {isPago && p.factSent && !p.pagoMarcado && role === "notaria" && <Bg bg="#fffbeb" color="#d97706">⏳ Esperando pago</Bg>}
                {isPago && p.pagoMarcado && <Bg bg="#f0fdf4" color="#16a34a">✓ Pagado {fmt(p.pagoDate)}</Bg>}
                {canAct && !isFact && !isPago && <Bt v={e.owner === "notaria" ? "n" : "p"} onClick={() => onDone(p.id, e.id)}>Completar ✓</Bt>}
                {isAct && !canAct && !isFact && !isPago && role === "notaria" && <Bg bg="#eff6ff" color="#2563eb">Esperando Alonso y Cía</Bg>}
              </div>
            </div>
            {i < etapas.length - 1 && <div style={{ marginLeft: 29, height: 5, borderLeft: `2px ${i < p.step ? "solid" : "dashed"} ${i < p.step ? "#16a34a" : "#e8e5df"}` }} />}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EFFECTIVENESS
// ═══════════════════════════════════════════════════════════════
function EffPanel({ ps, inh }) {
  const done = ps.filter(p => p.finished);
  if (!done.length) return <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", padding: 40, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 10 }}>📊</div><div style={{ fontSize: 14, fontWeight: 600 }}>Sin proyectos completados</div></div>;
  const calc = (owner) => {
    let ts = 0, tc = 0;
    const details = done.map(p => {
      const etapas = getEtapas(p.tipo); let ps2 = 0, pc = 0;
      etapas.forEach(e => { if (e.owner !== owner) return; const d = p.etapas[e.id]; const start = (e.id === "pago" && p.factDate) ? p.factDate : d?.start; const end = (e.id === "pago" && p.pagoDate) ? p.pagoDate : d?.end; const plazo = e.id === "pago" ? 2 : e.plazo; if (plazo > 0 && start && end) { const real = bdBetween(start, end, inh), sc = real <= plazo ? 100 : Math.max(0, 100 - (real - plazo) * 25); ps2 += sc; pc++; ts += sc; tc++; } });
      return { name: p.name, score: pc > 0 ? Math.round(ps2 / pc) : 100, date: p.finDate };
    });
    return { global: tc > 0 ? Math.round(ts / tc) : 100, details };
  };
  const a = calc("alonso"), n = calc("notaria"), sc = (s) => s >= 90 ? "#16a34a" : s >= 70 ? "#d97706" : "#dc2626";
  const Blk = ({ label, icon, data }) => (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", padding: 22, flex: 1, minWidth: 300 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div><div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>{icon} {label}</div><div style={{ fontSize: 11, color: "#8a857c", marginTop: 2 }}>Cumplimiento de plazos</div></div>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: sc(data.global) + "14", border: `3px solid ${sc(data.global)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: sc(data.global) }}>{data.global}</div>
      </div>
      {data.details.map((d, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderRadius: 10, background: "#f8f7f5", marginBottom: 5 }}><div><span style={{ fontSize: 12, fontWeight: 600 }}>{d.name}</span> <span style={{ fontSize: 11, color: "#8a857c" }}>{fmt(d.date)}</span></div><div style={{ width: 40, height: 26, borderRadius: 8, background: sc(d.score) + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: sc(d.score) }}>{d.score}</div></div>)}
    </div>
  );
  return <div><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📊 Efectividad por equipo</div><div style={{ fontSize: 12, color: "#8a857c", marginBottom: 18 }}>Calificación 0–100. Cada día hábil de retraso descuenta 25 pts.</div><div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}><Blk label="Alonso y Cía" icon="⚖️" data={a} /><Blk label="Notaría 65" icon="📜" data={n} /></div></div>;
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR (with DB persistence)
// ═══════════════════════════════════════════════════════════════
function Cal({ inh, addInhabil, delInhabil }) {
  const [nd, setNd] = useState(""); const [nm, setNm] = useState("");
  const lftSet = new Set(LFT.map(d => d.fecha));
  const lft = inh.filter(d => lftSet.has(d.fecha)), custom = inh.filter(d => !lftSet.has(d.fecha));
  const add = async () => { if (!nd || inh.some(d => d.fecha === nd)) return; await addInhabil(nd, nm || "Personalizado"); setNd(""); setNm(""); };
  const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e5df", fontSize: 13, color: "#1a1714", background: "#fff", outline: "none", fontFamily: "inherit" };
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📅 Días inhábiles</div>
      <div style={{ fontSize: 12, color: "#8a857c", marginBottom: 18 }}>Sábados, domingos y festivos LFT excluidos automáticamente.</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><div style={{ fontSize: 11, fontWeight: 600, color: "#8a857c", marginBottom: 4 }}>Fecha</div><input type="date" value={nd} onChange={e => setNd(e.target.value)} style={iS} /></div>
        <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontSize: 11, fontWeight: 600, color: "#8a857c", marginBottom: 4 }}>Motivo</div><input value={nm} onChange={e => setNm(e.target.value)} placeholder="Vacaciones notario, Cierre RPPC…" style={{ ...iS, width: "100%", boxSizing: "border-box" }} /></div>
        <Bt onClick={add} disabled={!nd}>Agregar</Bt>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div><div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>LFT México ({lft.length})</div><div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 280, overflowY: "auto" }}>{lft.map(d => <div key={d.fecha} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderRadius: 8, background: "#f8f7f5", fontSize: 12 }}><span>{fmt(d.fecha)}</span><span style={{ color: "#8a857c", fontSize: 11 }}>{d.motivo}</span></div>)}</div></div>
        <div><div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Personalizados ({custom.length})</div>
          {!custom.length ? <div style={{ fontSize: 12, color: "#8a857c", padding: 20, textAlign: "center", background: "#f8f7f5", borderRadius: 10 }}>Sin días personalizados</div> :
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 280, overflowY: "auto" }}>{custom.map(d => <div key={d.fecha} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px", borderRadius: 8, background: "#fffbeb", fontSize: 12 }}><span>{fmt(d.fecha)} — <span style={{ color: "#8a857c" }}>{d.motivo}</span></span><button onClick={() => delInhabil(d.fecha)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>✕</button></div>)}</div>}
        </div>
      </div>
    </div>
  );
}

function Bell({ alerts, role }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  const mine = alerts.filter(a => role === "alonso" || a.owner === "notaria");
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ background: mine.length ? "#fef2f2" : "#f1f0ed", border: "none", borderRadius: 10, width: 38, height: 38, cursor: "pointer", fontSize: 16, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>🔔{mine.length > 0 && <span style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: 100, background: "#dc2626", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{mine.length}</span>}</button>
      {open && <div style={{ position: "absolute", top: 44, right: 0, width: 360, maxHeight: 380, background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8e5df", fontSize: 13, fontWeight: 700 }}>Notificaciones ({mine.length})</div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>{!mine.length ? <div style={{ padding: 28, textAlign: "center", color: "#8a857c", fontSize: 13 }}>Sin alertas ✓</div> : mine.map(n => <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid #e8e5df", background: n.tipo === "vencida" ? "#fef2f2" : "#fffbeb" }}><div style={{ fontSize: 12, fontWeight: 600 }}>{n.tipo === "vencida" ? "🔴" : "🟡"} {n.proj}</div><div style={{ fontSize: 11, color: "#8a857c", marginTop: 1 }}>{n.etapa} — Vence {fmt(n.v)}{n.respN ? ` — ${n.respN}` : ""}</div></div>)}</div>
      </div>}
    </div>
  );
}

function Confirm({ msg, onYes, onNo }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}><div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18, lineHeight: 1.5 }}>{msg}</div><div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Bt v="g" onClick={onNo}>Cancelar</Bt><Bt v="d" onClick={onYes}>Confirmar</Bt></div></div></div>;
}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
const USERS = [
  { user: "alonso", pass: "Alonso2025!", role: "alonso", label: "Alonso y Cía" },
  { user: "notaria65", pass: "Notaria65!", role: "notaria", label: NOTARIA },
];
function Login({ onLogin }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [show, setShow] = useState(false);
  const go = () => { const f = USERS.find(x => x.user === u.trim().toLowerCase() && x.pass === p); if (f) { setErr(""); onLogin(f); } else setErr("Usuario o contraseña incorrectos"); };
  const iS = { width: "100%", padding: "14px 16px", borderRadius: 10, border: "1px solid #e0ddd8", fontSize: 14, color: "#1a1714", background: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  return (
    <div style={{ fontFamily: "'Source Sans 3', sans-serif", background: "#faf9f7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ width: "100%", maxWidth: 420, padding: "48px 40px", background: "#fff", borderRadius: 20, border: "1px solid #e8e5df", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 16 }}>A</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Control Notarial</div>
          <div style={{ fontSize: 13, color: "#8a857c", marginTop: 4 }}>Alonso y Cía — Notaría 65 de Guadalajara</div>
        </div>
        <div style={{ marginBottom: 18 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#8a857c", marginBottom: 6 }}>Usuario</div><input style={iS} value={u} onChange={e => { setU(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && go()} placeholder="Ingresa tu usuario" autoFocus /></div>
        <div style={{ marginBottom: 24 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#8a857c", marginBottom: 6 }}>Contraseña</div><div style={{ position: "relative" }}><input type={show ? "text" : "password"} style={iS} value={p} onChange={e => { setP(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && go()} placeholder="••••••••" /><button onClick={() => setShow(!show)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#8a857c", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>{show ? "Ocultar" : "Ver"}</button></div></div>
        {err && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#dc2626", fontSize: 13, fontWeight: 500, marginBottom: 18, textAlign: "center" }}>{err}</div>}
        <button onClick={go} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Iniciar sesión</button>
        <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: "#b0ad9f" }}>Acceso exclusivo para usuarios autorizados</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession] = useState(null);
  if (!session) return <Login onLogin={s => setSession(s)} />;
  return <Dash session={session} onLogout={() => setSession(null)} />;
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD — with Supabase persistence
// ═══════════════════════════════════════════════════════════════
function Dash({ session, onLogout }) {
  const role = session.role;
  const [vista, setVista] = useState("dashboard");
  const [ps, setPs] = useState([]);
  const [inh, setInh] = useState([...LFT]);
  const [selId, setSelId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filtro, setFiltro] = useState("todos");
  const [cfm, setCfm] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load data from Supabase on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [projects, dias] = await Promise.all([db.getProjects(), db.getDias()]);
      setPs((projects || []).map(dbToApp));
      setInh([...LFT, ...(dias || []).map(d => ({ fecha: d.fecha, motivo: d.motivo }))]);
      setLoading(false);
    })();
  }, []);

  // Auto-refresh every 30 seconds to sync between users
  useEffect(() => {
    const interval = setInterval(async () => {
      const [projects, dias] = await Promise.all([db.getProjects(), db.getDias()]);
      if (projects) setPs(projects.map(dbToApp));
      if (dias) setInh([...LFT, ...dias.map(d => ({ fecha: d.fecha, motivo: d.motivo }))]);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const alerts = useMemo(() => buildAlerts(ps, inh), [ps, inh]);

  const saveProject = async (id, updates) => {
    const dbUpdates = {};
    if ("step" in updates) dbUpdates.step = updates.step;
    if ("etapas" in updates) dbUpdates.etapas = updates.etapas;
    if ("finished" in updates) dbUpdates.finished = updates.finished;
    if ("finDate" in updates) dbUpdates.fin_date = updates.finDate;
    if ("factSent" in updates) dbUpdates.fact_sent = updates.factSent;
    if ("factDate" in updates) dbUpdates.fact_date = updates.factDate;
    if ("pagoMarcado" in updates) dbUpdates.pago_marcado = updates.pagoMarcado;
    if ("pagoDate" in updates) dbUpdates.pago_date = updates.pagoDate;
    if ("respNotaria" in updates) dbUpdates.resp_notaria = updates.respNotaria;
    await db.updateProject(id, dbUpdates);
  };

  const advance = useCallback(async (pid, eid) => {
    setPs(prev => {
      const updated = prev.map(p => {
        if (p.id !== pid) return p;
        const etapas = getEtapas(p.tipo); const h = td(), ne = { ...p.etapas };
        ne[eid] = { ...ne[eid], done: true, end: h };
        let nx = p.step + 1;
        if (nx < etapas.length && etapas[nx].id === "facturacion" && p.factSent) { ne.facturacion = { ...ne.facturacion, done: true, start: p.factDate, end: p.factDate }; nx++; }
        if (nx < etapas.length && etapas[nx].id === "pago" && p.pagoMarcado) { ne.pago = { ...ne.pago, done: true, start: p.pagoDate, end: p.pagoDate }; nx++; }
        if (nx < etapas.length) ne[etapas[nx].id] = { ...ne[etapas[nx].id], start: h };
        const fin = nx >= etapas.length;
        const result = { ...p, etapas: ne, step: nx, finished: fin, finDate: fin ? h : null };
        saveProject(pid, result);
        return result;
      });
      return updated;
    });
  }, []);

  const undo = useCallback(async (pid) => {
    setPs(prev => prev.map(p => {
      if (p.id !== pid || p.step <= 0) return p;
      const etapas = getEtapas(p.tipo); const pr = p.step - 1, ne = { ...p.etapas };
      ne[etapas[pr].id] = { ...ne[etapas[pr].id], done: false, end: null };
      if (p.step < etapas.length) ne[etapas[p.step].id] = { ...ne[etapas[p.step].id], start: null };
      const result = { ...p, etapas: ne, step: pr, finished: false, finDate: null };
      saveProject(pid, result);
      return result;
    }));
  }, []);

  const markFact = useCallback(async (pid) => {
    const h = td();
    setPs(prev => prev.map(p => { if (p.id !== pid) return p; const r = { ...p, factSent: true, factDate: h }; saveProject(pid, r); return r; }));
  }, []);

  const markPago = useCallback(async (pid) => {
    const h = td();
    setPs(prev => prev.map(p => { if (p.id !== pid) return p; const r = { ...p, pagoMarcado: true, pagoDate: h }; saveProject(pid, r); return r; }));
  }, []);

  const setRN = useCallback(async (pid, v) => {
    setPs(prev => prev.map(p => { if (p.id !== pid) return p; const r = { ...p, respNotaria: v }; saveProject(pid, { respNotaria: v }); return r; }));
  }, []);

  const create = useCallback(async (f) => {
    const etapas = makeEtapasState(f.tipo, f.fecha);
    const row = await db.createProject({ name: f.nombre, tipo: f.tipo, step: 0, created: f.fecha, etapas, fact_sent: false, pago_marcado: false, resp_notaria: "", finished: false });
    if (row) setPs(prev => [dbToApp(row), ...prev]);
    setShowForm(false);
  }, []);

  const del = useCallback(async (pid) => {
    await db.deleteProject(pid);
    setPs(prev => prev.filter(p => p.id !== pid));
    setSelId(null);
  }, []);

  const addInhabil = useCallback(async (fecha, motivo) => {
    await db.addDia(fecha, motivo);
    setInh(prev => [...prev, { fecha, motivo }].sort((a, b) => a.fecha.localeCompare(b.fecha)));
  }, []);

  const delInhabil = useCallback(async (fecha) => {
    await db.delDia(fecha);
    setInh(prev => prev.filter(d => d.fecha !== fecha));
  }, []);

  const isMyTurn = (p) => { const etapas = getEtapas(p.tipo); if (p.finished || p.step >= etapas.length) return false; return role === "alonso" || etapas[p.step].owner === "notaria"; };

  const filtered = useMemo(() => {
    return ps.filter(p => {
      const etapas = getEtapas(p.tipo);
      if (filtro === "activos" && p.finished) return false;
      if (filtro === "completados" && !p.finished) return false;
      if (filtro === "mi_turno") return isMyTurn(p);
      if (filtro === "vencidos") { if (p.finished || p.step >= etapas.length) return false; return getSt(p, p.step, inh).s === "over"; }
      return true;
    });
  }, [ps, filtro, role, inh]);

  const sel = ps.find(p => p.id === selId);
  const act = ps.filter(p => !p.finished).length;
  const mt = ps.filter(p => isMyTurn(p)).length;
  const ov = ps.filter(p => { const et = getEtapas(p.tipo); return !p.finished && p.step < et.length && getSt(p, p.step, inh).s === "over"; }).length;
  const comp = ps.filter(p => p.finished).length;
  const tab = (v, l) => <button key={v} onClick={() => setVista(v)} style={{ padding: "6px 13px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: vista === v ? "#2563eb" : "transparent", color: vista === v ? "#fff" : "#8a857c" }}>{l}</button>;

  if (loading) return (
    <div style={{ fontFamily: "'Source Sans 3', sans-serif", background: "#faf9f7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 12 }}>⚖️</div><div style={{ fontSize: 14, fontWeight: 600, color: "#8a857c" }}>Cargando sistema...</div></div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Source Sans 3', sans-serif", background: "#faf9f7", minHeight: "100vh", color: "#1a1714" }}>
      
      {cfm && <Confirm msg={cfm.msg} onYes={() => { cfm.action(); setCfm(null); }} onNo={() => setCfm(null)} />}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid #e8e5df", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: role === "alonso" ? "#2563eb" : "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>{role === "alonso" ? "A" : "N"}</div>
          <div><div style={{ fontSize: 13, fontWeight: 700 }}>{session.label}</div><div style={{ fontSize: 9, color: "#8a857c", letterSpacing: "0.05em", textTransform: "uppercase" }}>Control Notarial</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><button onClick={onLogout} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e8e5df", background: "transparent", color: "#8a857c", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cerrar sesión</button></div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {tab("dashboard", "Panel")}{tab("proyectos", "Proyectos")}{tab("efectividad", "Efectividad")}{tab("calendario", "Calendario")}
          <Bell alerts={alerts} role={role} />
          {role === "alonso" && <Bt onClick={() => { setShowForm(true); setVista("proyectos"); }} style={{ marginLeft: 4, fontSize: 11, padding: "6px 12px" }}>+ Nuevo</Bt>}
        </div>
      </div>
      <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
        {vista === "dashboard" && <>
          <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}><Stat label="Activos" value={act} icon="📂" accent="#2563eb" /><Stat label="Tu turno" value={mt} icon="👆" accent="#d97706" sub={mt > 0 ? "Acción requerida" : ""} /><Stat label="Vencidos" value={ov} icon="🔴" accent="#dc2626" sub={ov > 0 ? "Urgente" : ""} /><Stat label="Completados" value={comp} icon="✅" accent="#16a34a" /></div>
          {alerts.filter(a => role === "alonso" || a.owner === "notaria").length > 0 && <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", padding: 16, marginBottom: 18 }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🔔 Alertas</div>{alerts.filter(a => role === "alonso" || a.owner === "notaria").map(n => <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, marginBottom: 5, cursor: "pointer", background: n.tipo === "vencida" ? "#fef2f2" : "#fffbeb" }} onClick={() => { setSelId(n.pid); setVista("proyectos"); }}><span>{n.tipo === "vencida" ? "🔴" : "🟡"}</span><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{n.proj}</div><div style={{ fontSize: 11, color: "#8a857c" }}>{n.etapa} — Vence {fmt(n.v)}{n.respN ? ` — ${n.respN}` : ""}</div></div><Bg bg={n.tipo === "vencida" ? "#fef2f2" : "#fffbeb"} color={n.tipo === "vencida" ? "#dc2626" : "#d97706"}>{n.tipo === "vencida" ? "VENCIDA" : "POR VENCER"}</Bg></div>)}</div>}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Tu turno</div>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", overflow: "hidden" }}>
            {!ps.filter(p => isMyTurn(p)).length ? <div style={{ padding: 28, textAlign: "center", color: "#8a857c", fontSize: 13 }}>Sin tareas pendientes 🎉</div>
              : ps.filter(p => isMyTurn(p)).map(p => { const etapas = getEtapas(p.tipo); const e = etapas[p.step]; const info = getSt(p, p.step, inh); return <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid #e8e5df", cursor: "pointer" }} onClick={() => { setSelId(p.id); setVista("proyectos"); }} onMouseEnter={ev => ev.currentTarget.style.background = "#f8f7f5"} onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: "#8a857c" }}>{e.label} — {TIPO_L[p.tipo]}{p.respNotaria ? ` — ${p.respNotaria}` : ""}</div></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}>{info.v && <span style={{ fontSize: 11, color: info.c, fontWeight: 600 }}>Vence {fmt(info.v)}</span>}<Bg bg={info.c + "15"} color={info.c}>{info.l}</Bg></div></div>; })}
          </div>
        </>}
        {vista === "proyectos" && <>
          {showForm && role === "alonso" && <NewForm onCreate={create} onCancel={() => setShowForm(false)} />}
          {sel && <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{sel.name}</div>
                <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}><Bg>{TIPO_L[sel.tipo]}</Bg><Bg>Creado {fmt(sel.created)}</Bg>{sel.finished && <Bg bg="#f0fdf4" color="#16a34a">✓ Entregado {fmt(sel.finDate)}</Bg>}{sel.respNotaria && <Bg bg="#f5f3ff" color="#7c3aed">📜 {sel.respNotaria}</Bg>}</div>
                {role === "notaria" && !sel.finished && <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, fontWeight: 600, color: "#8a857c" }}>Responsable notaría:</span><input value={sel.respNotaria} onChange={e => setRN(sel.id, e.target.value)} placeholder="Nombre del encargado (opcional)" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e8e5df", fontSize: 12, color: "#1a1714", background: "#fff", outline: "none", fontFamily: "inherit", width: 220 }} /></div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}><Bt v="d" onClick={() => setCfm({ msg: `¿Eliminar "${sel.name}"?`, action: () => del(sel.id) })} style={{ fontSize: 11, padding: "5px 10px" }}>🗑</Bt><button onClick={() => setSelId(null)} style={{ background: "#f1f0ed", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14, color: "#8a857c", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button></div>
            </div>
            <Pipe p={sel} inh={inh} role={role} onDone={advance} onUndo={(pid) => setCfm({ msg: "¿Deshacer la última etapa?", action: () => undo(pid) })} onFact={markFact} onPago={markPago} />
          </div>}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e8e5df", background: "#fff", color: "#1a1714", fontSize: 12, outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos</option><option value="activos">Activos</option><option value="mi_turno">Mi turno</option><option value="vencidos">Vencidos</option><option value="completados">Completados</option></select>
            <span style={{ fontSize: 12, color: "#8a857c" }}>{filtered.length} proyecto{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 1fr 70px", padding: "9px 16px", borderBottom: "1px solid #e8e5df", fontSize: 10, fontWeight: 700, color: "#8a857c", textTransform: "uppercase", letterSpacing: "0.05em" }}><span>Proyecto</span><span>Etapa</span><span>Turno</span><span style={{ textAlign: "center" }}>Estado</span></div>
            {!filtered.length && <div style={{ padding: 36, textAlign: "center", color: "#8a857c", fontSize: 13 }}>Sin proyectos</div>}
            {filtered.map(p => { const etapas = getEtapas(p.tipo); const e = p.step < etapas.length ? etapas[p.step] : null; const info = e ? getSt(p, p.step, inh) : { c: "#16a34a", l: "✓" }; return <div key={p.id} style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 1fr 70px", padding: "10px 16px", borderBottom: "1px solid #e8e5df", cursor: "pointer", alignItems: "center", background: selId === p.id ? "#dbeafe" : "transparent" }} onClick={() => setSelId(selId === p.id ? null : p.id)} onMouseEnter={ev => { if (selId !== p.id) ev.currentTarget.style.background = "#f8f7f5"; }} onMouseLeave={ev => { if (selId !== p.id) ev.currentTarget.style.background = "transparent"; }}><div><div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: "#8a857c" }}>{TIPO_L[p.tipo]}{p.respNotaria ? ` — ${p.respNotaria}` : ""}</div></div><div>{p.finished ? <Bg bg="#f0fdf4" color="#16a34a">✓ Completado</Bg> : <Bg bg={info.c + "15"} color={info.c}>{e?.label}</Bg>}</div><div>{e && !p.finished ? <OBg o={e.owner} /> : "—"}</div><div style={{ textAlign: "center" }}>{p.finished ? <Bg bg="#f0fdf4" color="#16a34a">✓</Bg> : <Bg bg={info.c + "15"} color={info.c} style={{ fontSize: 10 }}>{info.l}</Bg>}</div></div>; })}
          </div>
        </>}
        {vista === "efectividad" && <EffPanel ps={ps} inh={inh} />}
        {vista === "calendario" && <Cal inh={inh} addInhabil={addInhabil} delInhabil={delInhabil} />}
      </div>
    </div>
  );
}

function NewForm({ onCreate, onCancel }) {
  const [f, setF] = useState({ nombre: "", tipo: "sin_registro", fecha: td() });
  const up = (k, v) => setF(o => ({ ...o, [k]: v }));
  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e8e5df", fontSize: 13, color: "#1a1714", background: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e5df", padding: 22, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Nuevo proyecto</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div><div style={{ fontSize: 11, fontWeight: 600, color: "#8a857c", marginBottom: 4 }}>Nombre del proyecto</div><input style={iS} value={f.nombre} onChange={e => up("nombre", e.target.value)} placeholder="Ej: Constitución XYZ SA de CV" /></div>
        <div><div style={{ fontSize: 11, fontWeight: 600, color: "#8a857c", marginBottom: 4 }}>Tipo de registro</div><select style={iS} value={f.tipo} onChange={e => up("tipo", e.target.value)}>{TIPOS.map(t => <option key={t} value={t}>{TIPO_L[t]}</option>)}</select></div>
        <div><div style={{ fontSize: 11, fontWeight: 600, color: "#8a857c", marginBottom: 4 }}>Fecha de inicio</div><input type="date" style={iS} value={f.fecha} onChange={e => up("fecha", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Bt v="g" onClick={onCancel}>Cancelar</Bt><Bt onClick={() => { if (f.nombre.trim() && f.fecha) onCreate(f); }} disabled={!f.nombre.trim() || !f.fecha}>Crear proyecto</Bt></div>
    </div>
  );
}
