"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════
const SB_URL = "https://yyhocjfyupcunjgixkqm.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5aG9jamZ5dXBjdW5qZ2l4a3FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODY1OTAsImV4cCI6MjA5MTA2MjU5MH0.hU4usFzY2A_prPE0n2AywBGrgFuYgjOgb-9DrByqqso";

async function sb(table, method = "GET", body = null, query = "") {
  const url = `${SB_URL}/rest/v1/${table}${query}`;
  const h = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  if (method === "POST" || method === "PATCH") h["Prefer"] = "return=representation";
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { console.error("SB:", await res.text()); return null; }
  if (method === "DELETE") return true;
  try { return await res.json(); } catch { return true; }
}

const db = {
  getProjects: () => sb("projects", "GET", null, "?order=created_at.desc"),
  createProject: (p) => sb("projects", "POST", p),
  updateProject: (id, d) => sb("projects", "PATCH", d, `?id=eq.${id}`),
  deleteProject: (id) => sb("projects", "DELETE", null, `?id=eq.${id}`),
  getDias: () => sb("dias_inhabiles", "GET", null, "?order=fecha.asc"),
  addDia: (f, m, nid) => sb("dias_inhabiles", "POST", { fecha: f, motivo: m, notaria_id: nid || null }),
  delDia: (id) => sb("dias_inhabiles", "DELETE", null, `?id=eq.${id}`),
  getNotarias: () => sb("notarias", "GET", null, "?order=created_at.asc"),
  createNotaria: (n) => sb("notarias", "POST", n),
  updateNotaria: (id, d) => sb("notarias", "PATCH", d, `?id=eq.${id}`),
  deleteNotaria: (id) => sb("notarias", "DELETE", null, `?id=eq.${id}`),
};

// ═══════════════════════════════════════════════════════════════
// CALENDAR UTILS
// ═══════════════════════════════════════════════════════════════
const LFT = [
  {fecha:"2025-01-01",motivo:"Año Nuevo"},{fecha:"2025-02-03",motivo:"Constitución"},{fecha:"2025-03-17",motivo:"Benito Juárez"},
  {fecha:"2025-05-01",motivo:"Día del Trabajo"},{fecha:"2025-09-16",motivo:"Independencia"},{fecha:"2025-11-17",motivo:"Revolución"},
  {fecha:"2025-12-25",motivo:"Navidad"},{fecha:"2026-01-01",motivo:"Año Nuevo"},{fecha:"2026-02-02",motivo:"Constitución"},
  {fecha:"2026-03-16",motivo:"Benito Juárez"},{fecha:"2026-05-01",motivo:"Día del Trabajo"},{fecha:"2026-09-16",motivo:"Independencia"},
  {fecha:"2026-11-16",motivo:"Revolución"},{fecha:"2026-12-25",motivo:"Navidad"},
];
const isWE = d => d.getDay()===0||d.getDay()===6;
const iSet = inh => { const s=new Set(); inh.forEach(i=>s.add(i.fecha)); return s; };
function addBD(ds,n,inh){ if(!ds||n<=0)return null; const s=iSet(inh); let d=new Date(ds+"T12:00:00"),a=0; while(a<n){d.setDate(d.getDate()+1);if(!isWE(d)&&!s.has(d.toISOString().split("T")[0]))a++;} return d.toISOString().split("T")[0]; }
function bdBtw(a,b,inh){ const s=iSet(inh); let x=new Date(a+"T12:00:00"),y=new Date(b+"T12:00:00"),neg=false; if(y<x){[x,y]=[y,x];neg=true;} let c=0,cur=new Date(x); while(cur<y){cur.setDate(cur.getDate()+1);if(!isWE(cur)&&!s.has(cur.toISOString().split("T")[0]))c++;} return neg?-c:c; }
const td = () => new Date().toISOString().split("T")[0];
function fmt(d){ if(!d)return"—"; const p=d.split("-"),m=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]; return `${parseInt(p[2])} ${m[parseInt(p[1])-1]} ${p[0]}`; }

// ═══════════════════════════════════════════════════════════════
// CHECKLIST TEMPLATES
// ═══════════════════════════════════════════════════════════════
const ESCENARIOS = {
  acta_interno: "Acta de asamblea — Firma encargado Alonso",
  acta_externo: "Acta de asamblea — Firma persona externa",
  compraventa: "Compraventa",
  constitucion: "Constitución de sociedad",
};

const DOC_PERSONA = [
  { id: "acta_nac", label: "Acta de nacimiento", antiguedad: "≤3 meses" },
  { id: "acta_mat", label: "Acta de matrimonio (si aplica)", antiguedad: "≤3 meses", opcional: true },
  { id: "comp_dom", label: "Comprobante de domicilio", antiguedad: "≤3 meses" },
  { id: "csf", label: "Constancia situación fiscal", antiguedad: "≤3 meses" },
  { id: "id", label: "INE vigente (o 2 IDs alternos)", antiguedad: "vigente" },
  { id: "curp", label: "Constancia CURP", antiguedad: "≤3 meses" },
  { id: "ocupacion", label: "Ocupación", antiguedad: "" },
];

function getChecklistTemplate(escenario) {
  if (escenario === "acta_interno") {
    return {
      sociedad: { label: "Sociedad", docs: [
        { id: "csf_soc", label: "Constancia situación fiscal sociedad", antiguedad: "≤3 meses", done: false },
        { id: "personalidad", label: "Personalidad de la sociedad", antiguedad: "", done: false },
      ]},
      socio_1: { label: "Socio 1", docs: [
        { id: "csf_socio", label: "Constancia situación fiscal socio", antiguedad: "≤3 meses", done: false },
      ]},
      socio_2: { label: "Socio 2", docs: [
        { id: "csf_socio", label: "Constancia situación fiscal socio", antiguedad: "≤3 meses", done: false },
      ]},
    };
  }
  if (escenario === "acta_externo") {
    return {
      sociedad: { label: "Sociedad", docs: [
        { id: "csf_soc", label: "Constancia situación fiscal sociedad", antiguedad: "≤3 meses", done: false },
        { id: "personalidad", label: "Personalidad de la sociedad", antiguedad: "", done: false },
      ]},
      socio_1: { label: "Socio 1", docs: [
        { id: "csf_socio", label: "Constancia situación fiscal socio", antiguedad: "≤3 meses", done: false },
      ]},
      socio_2: { label: "Socio 2", docs: [
        { id: "csf_socio", label: "Constancia situación fiscal socio", antiguedad: "≤3 meses", done: false },
      ]},
      persona_externa: { label: "Persona externa que firma", docs: DOC_PERSONA.map(d => ({ ...d, done: false })) },
    };
  }
  if (escenario === "compraventa") {
    return {
      vendedor_1: { label: "Vendedor 1", docs: DOC_PERSONA.map(d => ({ ...d, done: false })) },
      comprador_1: { label: "Comprador 1", docs: DOC_PERSONA.map(d => ({ ...d, done: false })) },
      inmueble: { label: "Inmueble", docs: [
        { id: "esc_adq", label: "Escritura de adquisición", antiguedad: "", done: false },
        { id: "predial", label: "Predial", antiguedad: "", done: false },
      ]},
    };
  }
  if (escenario === "constitucion") {
    return {
      socio_1: { label: "Socio 1", docs: DOC_PERSONA.map(d => ({ ...d, done: false })) },
      autoridades: { label: "Autorizaciones", docs: [
        { id: "dors", label: "Autorización Dors", antiguedad: "", done: false },
        { id: "personalidad_pm", label: "Personalidad (si hay personas morales)", antiguedad: "", done: false, opcional: true },
      ]},
    };
  }
  return {};
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE MODEL
// ═══════════════════════════════════════════════════════════════
const TIPOS = ["sin_registro","comercio","propiedad","personas_juridicas"];
const TIPO_L = {sin_registro:"Sin inscripción",comercio:"Comercio",propiedad:"Propiedad",personas_juridicas:"Personas Jurídicas"};

// ETAPAS PREVIAS (solo Alonso, antes de notaría)
const PRE_ETAPAS = [
  { id: "expediente", label: "Revisión de expediente del cliente", desc: "Verificar que estén todos los documentos requeridos según el escenario" },
  { id: "elaboracion", label: "Elaboración del acta", desc: "Redactar el acta o instrumento" },
  { id: "fact_cliente", label: "Facturación al cliente", desc: "Emitir factura al cliente (puede ser anticipo, total o efectivo)", opcional: true },
  { id: "envio_acta", label: "Envío de acta y factura al cliente", desc: "Enviar al cliente para firma y pago" },
  { id: "recepcion_acta", label: "Recepción del acta firmada", desc: "Cliente devuelve el acta firmada" },
  { id: "verif_pago", label: "Verificación de pago del cliente", desc: "Confirmar que el cliente pagó (o aplicar excepción)" },
];

const BI = [
  {id:"proyeccion",label:"Proyección de la protocolización",owner:"alonso",plazo:0,desc:"Proyectar la protocolización para envío a notaría"},
  {id:"envio",label:"Envío de expediente a notaría",owner:"alonso",plazo:0,desc:"Enviar expediente completo a notaría"},
  {id:"folios",label:"Proyecto en folios",owner:"notaria",plazo:3,desc:"Preparar proyecto en folios — 3 días hábiles"},
  {id:"firma",label:"Firma en notaría",owner:"alonso",plazo:2,desc:"Acudir a firmar — 2 días hábiles"},
];
const BF = [
  {id:"facturacion",label:"Facturación",owner:"notaria",plazo:0,desc:"Emitir factura a Alonso y Cía"},
  {id:"pago",label:"Pago a notaría",owner:"alonso",plazo:2,desc:"Pagar dentro de 2 días háb. desde factura"},
];

function getEt(tipo){
  if(tipo==="sin_registro") return [...BI,{id:"entregables",label:"Entregables",owner:"notaria",plazo:2,desc:"Copia certificada + testimonio — 2 días háb."},{id:"envio_cliente",label:"Envío a cliente",owner:"alonso",plazo:2,desc:"Escanear y enviar copia certificada y testimonio — 2 días háb."},...BF];
  if(tipo==="comercio") return [...BI,{id:"entregables",label:"Entregables",owner:"notaria",plazo:3,desc:"Copia cert. + testimonio + boleta registral — 3 días háb."},{id:"envio_cliente",label:"Envío a cliente",owner:"alonso",plazo:2,desc:"Escanear y enviar copia certificada y testimonio — 2 días háb."},...BF];
  return [...BI,{id:"entregables",label:"Entregables",owner:"notaria",plazo:2,desc:"Ingreso solicitud + comprobante + copia cert. — 2 días háb."},{id:"envio_cc",label:"Envío copia certificada a cliente",owner:"alonso",plazo:2,desc:"Escanear y enviar copia certificada — 2 días háb."},{id:"envio_test",label:"Envío testimonio con boleta a cliente",owner:"alonso",plazo:2,desc:"Escanear y enviar testimonio con boleta de inscripción — 2 días háb."},...BF];
}

function getSt(p,i,inh){
  const et=getEt(p.tipo),e=et[i],d=p.etapas[e.id];
  if(d?.done)return{s:"done",c:"#16a34a",l:"Completada"};
  if(i>p.step)return{s:"wait",c:"#94a3b8",l:"Pendiente"};
  if(i<p.step)return{s:"done",c:"#16a34a",l:"Completada"};
  if(e.plazo>0&&d?.start){ const v=addBD(d.start,e.plazo,inh),h=td(); if(h>v)return{s:"over",c:"#dc2626",l:"Vencida",v}; if(bdBtw(h,v,inh)<=1)return{s:"soon",c:"#d97706",l:"Por vencer",v}; return{s:"active",c:"#2563eb",l:"En curso",v}; }
  return{s:"active",c:"#2563eb",l:"Acción requerida"};
}

function mkEtapas(tipo,startDate){
  const et=getEt(tipo),st={}; et.forEach((e,i)=>{st[e.id]={done:false,start:i===0?startDate:null,end:null};}); return st;
}
function mkEtapasPast(tipo,date){
  const et=getEt(tipo),st={};
  et.forEach((e,i)=>{
    if(i<=1) st[e.id]={done:true,start:date,end:date};
    else if(i===2) st[e.id]={done:false,start:date,end:null};
    else st[e.id]={done:false,start:null,end:null};
  });
  return st;
}
function mkPreEtapas(){
  const st={};
  PRE_ETAPAS.forEach((e,i)=>{st[e.id]={done:false,start:i===0?td():null,end:null};});
  return st;
}

function dbToApp(r){
  return{id:r.id,name:r.name,cliente:r.cliente||"",tipo:r.tipo,escenario:r.escenario||"acta_interno",
    step:r.step,created:r.created,fechaActo:r.fecha_acto,
    factSent:r.fact_sent,factDate:r.fact_date,
    pagoMarcado:r.pago_marcado,pagoDate:r.pago_date,respNotaria:r.resp_notaria||"",etapas:r.etapas,
    finished:r.finished,finDate:r.fin_date,notariaId:r.notaria_id,
    checklist:r.checklist||{},preEtapas:r.pre_etapas||{},preStep:r.pre_step||0,preDone:r.pre_done||false,
    cliPagoTipo:r.cli_pago_tipo||"",cliFacturaNum:r.cli_factura_num||"",cliFacturaMonto:r.cli_factura_monto,
    cliFacturaConcepto:r.cli_factura_concepto||"",cliFacturaEnviarA:r.cli_factura_enviar_a||"",
    cliFacturaBruto:r.cli_factura_bruto,cliFacturaNeto:r.cli_factura_neto,
    pagoEfectivo:r.pago_efectivo||false,numEscritura:r.num_escritura||"",
    observaciones:r.observaciones||{},notas:r.notas||[],archivado:r.archivado||false};
}

// ═══════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════
function buildAlerts(ps,inh,inhFor){
  const a=[];
  ps.forEach(p=>{
    if(!p.preDone)return;
    const et=getEt(p.tipo),pInh=inhFor?inhFor(p.notariaId):inh;
    if(p.finished||p.step>=et.length)return;
    const e=et[p.step],info=getSt(p,p.step,pInh);
    if(info.s==="over"||info.s==="soon")a.push({id:`${p.id}-${e.id}-${info.s}`,tipo:info.s==="over"?"vencida":"por_vencer",proj:p.name,pid:p.id,etapa:e.label,owner:e.owner,v:info.v,respN:p.respNotaria,nid:p.notariaId});
    if(p.factSent&&!p.pagoMarcado&&!p.pagoEfectivo){const pv=addBD(p.factDate,2,pInh);if(pv){const h=td();if(h>pv)a.push({id:`${p.id}-pago-over`,tipo:"vencida",proj:p.name,pid:p.id,etapa:"Pago a notaría",owner:"alonso",v:pv,respN:p.respNotaria,nid:p.notariaId});else if(bdBtw(h,pv,pInh)<=1)a.push({id:`${p.id}-pago-soon`,tipo:"por_vencer",proj:p.name,pid:p.id,etapa:"Pago a notaría",owner:"alonso",v:pv,respN:p.respNotaria,nid:p.notariaId});}}
  });
  return a;
}

// ═══════════════════════════════════════════════════════════════
// FACTURA HELPERS
// ═══════════════════════════════════════════════════════════════
function generarConcepto(p){
  const articulos={"Acta de Asamblea":"del Acta de Asamblea","Constitución de Sociedad":"de la Constitución de Sociedad","Compraventa":"de la Compraventa"};
  const art=articulos[p.name]||`del ${p.name}`;
  let concepto=`Seguimiento para la formalización ante fedatario público ${art}`;
  if(p.name!=="Compraventa"&&p.cliente)concepto+=` de la Sociedad ${p.cliente}`;
  if(p.fechaActo)concepto+=`, celebrada el ${fmt(p.fechaActo)}`;
  return concepto;
}

function enviarCorreoFactura(p){
  const to="administración@alonsoycia.com.mx";
  const cc="j.rojas@alonsoycia.com.mx,juanpablo@alonsoycia.com.mx,juancarlos@alonsoycia.com.mx,rodrigo@alonsoycia.com.mx";
  const subject=`Solicitud de CFDI — ${p.name} ${p.cliente||""}`;
  const bruto=p.cliFacturaBruto?`$${p.cliFacturaBruto.toLocaleString("es-MX",{minimumFractionDigits:2})}`:"—";
  const neto=p.cliFacturaNeto?`$${p.cliFacturaNeto.toLocaleString("es-MX",{minimumFractionDigits:2})}`:"—";
  const concepto=p.cliFacturaConcepto||generarConcepto(p);
  const body=`Elo, buen día, te pido por favor nos ayudes a emitir un CFDI con las siguientes características:

Cliente: ${p.cliente||"—"}
Concepto: ${concepto}
Monto bruto: ${bruto}
Monto neto (con IVA): ${neto}
Enviar a: ${p.cliFacturaEnviarA||"—"}

Muchas gracias.

Saludos.`;
  const url=`mailto:${encodeURIComponent(to)}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href=url;
}

// ═══════════════════════════════════════════════════════════════
// UI PRIMITIVES (LARGER)
// ═══════════════════════════════════════════════════════════════
function Bg({children,bg,color,style:s}){return <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:100,fontSize:12,fontWeight:600,background:bg||"#f1f0ed",color:color||"#8a857c",whiteSpace:"nowrap",...s}}>{children}</span>;}
function OBg({o}){return o==="notaria"?<Bg bg="#f5f3ff" color="#7c3aed">Notaría</Bg>:<Bg bg="#eff6ff" color="#2563eb">Alonso y Cía</Bg>;}
function Bt({children,onClick,v="p",disabled,style:s}){
  const vs={p:{background:"#2563eb",color:"#fff"},g:{background:"transparent",color:"#8a857c",border:"1px solid #e8e5df"},n:{background:"#7c3aed",color:"#fff"},d:{background:"#fef2f2",color:"#dc2626"},w:{background:"#fffbeb",color:"#d97706"}};
  return <button onClick={onClick} disabled={disabled} style={{borderRadius:9,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,fontFamily:"inherit",border:"none",...vs[v],...s}}>{children}</button>;
}
function Stat({label,value,icon,accent,sub}){
  return <div style={{background:"#fff",borderRadius:14,padding:"20px 22px",border:"1px solid #e8e5df",flex:1,minWidth:140,display:"flex",gap:14,alignItems:"center"}}><div style={{width:48,height:48,borderRadius:12,background:accent+"14",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{icon}</div><div><div style={{fontSize:28,fontWeight:800,lineHeight:1}}>{value}</div><div style={{fontSize:12,color:"#8a857c",marginTop:4,fontWeight:500}}>{label}</div>{sub&&<div style={{fontSize:11,color:accent,fontWeight:700,marginTop:2}}>{sub}</div>}</div></div>;
}
const iS={width:"100%",padding:"11px 13px",borderRadius:9,border:"1px solid #e8e5df",fontSize:14,color:"#1a1714",background:"#fff",outline:"none",fontFamily:"inherit",boxSizing:"border-box"};

// ═══════════════════════════════════════════════════════════════
// CONFETTI
// ═══════════════════════════════════════════════════════════════
function Confetti({onDone}){
  const [pieces, setPieces] = useState([]);
  useEffect(()=>{
    const arr=[];
    for(let i=0;i<150;i++){
      arr.push({id:i,left:Math.random()*100,delay:Math.random()*0.5,color:["#2563eb","#7c3aed","#16a34a","#d97706","#dc2626","#f59e0b"][Math.floor(Math.random()*6)],size:6+Math.random()*8,rot:Math.random()*360});
    }
    setPieces(arr);
    const t=setTimeout(()=>{setPieces([]);if(onDone)onDone();},4500);
    return()=>clearTimeout(t);
  },[]);
  if(!pieces.length)return null;
  return(
    <>
      <style>{`@keyframes fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0.5; } }`}</style>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
        {pieces.map(p=><div key={p.id} style={{position:"absolute",top:0,left:`${p.left}%`,width:p.size,height:p.size,background:p.color,borderRadius:Math.random()>0.5?"50%":"2px",animation:`fall 4s linear ${p.delay}s forwards`,transform:`rotate(${p.rot}deg)`}}/>)}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHECKLIST COMPONENT
// ═══════════════════════════════════════════════════════════════
function ChecklistView({ checklist, escenario, onUpdate, onAddGroup, onRemoveGroup, onAddDoc, onToggleDoc, onRemoveDoc, readOnly }){
  const [showAddDoc, setShowAddDoc] = useState(null);
  const [newDocText, setNewDocText] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupText, setNewGroupText] = useState("");
  const groups = Object.keys(checklist || {});
  const totalDocs = groups.reduce((acc,gid)=>acc+(checklist[gid]?.docs?.length||0),0);
  const doneDocs = groups.reduce((acc,gid)=>acc+(checklist[gid]?.docs?.filter(d=>d.done).length||0),0);

  // Auto-detect if scenario allows multiple persons
  const canAddPersonGroups = ["acta_externo","compraventa","constitucion"].includes(escenario);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>📋 Checklist de documentos</div>
          <div style={{fontSize:12,color:"#8a857c",marginTop:2}}>{ESCENARIOS[escenario]||escenario} — {doneDocs}/{totalDocs} documentos</div>
        </div>
        {!readOnly&&canAddPersonGroups&&<Bt v="g" onClick={()=>setShowAddGroup(!showAddGroup)} style={{fontSize:11,padding:"6px 12px"}}>+ Agregar persona/grupo</Bt>}
      </div>

      {showAddGroup&&!readOnly&&(
        <div style={{padding:14,borderRadius:10,background:"#f8f7f5",marginBottom:12,display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Nombre del grupo (Ej: "Comprador 2", "Socio 3")</div>
            <input style={iS} value={newGroupText} onChange={e=>setNewGroupText(e.target.value)} placeholder="Nombre..."/>
          </div>
          <Bt onClick={()=>{if(newGroupText.trim()){onAddGroup(newGroupText.trim());setNewGroupText("");setShowAddGroup(false);}}}>Agregar</Bt>
          <Bt v="g" onClick={()=>setShowAddGroup(false)}>Cancelar</Bt>
        </div>
      )}

      {groups.map(gid=>{
        const g=checklist[gid];
        if(!g)return null;
        const isPersonGroup = canAddPersonGroups && !["sociedad","inmueble","autoridades"].includes(gid);
        return(
          <div key={gid} style={{marginBottom:14,padding:14,borderRadius:10,border:"1px solid #e8e5df",background:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700}}>{g.label}</div>
              {!readOnly&&isPersonGroup&&groups.filter(x=>!["sociedad","inmueble","autoridades"].includes(x)).length>1&&(
                <button onClick={()=>onRemoveGroup(gid)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>✕ Quitar grupo</button>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {(g.docs||[]).map((d,idx)=>(
                <div key={d.id+idx} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:8,background:d.done?"#f0fdf4":"#f8f7f5"}}>
                  <input type="checkbox" checked={d.done||false} onChange={()=>!readOnly&&onToggleDoc(gid,idx)} disabled={readOnly} style={{width:16,height:16,cursor:readOnly?"default":"pointer"}}/>
                  <div style={{flex:1}}>
                    <span style={{fontSize:12,fontWeight:500,textDecoration:d.done?"line-through":"none",color:d.done?"#16a34a":"#1a1714"}}>{d.label}</span>
                    {d.antiguedad&&<span style={{fontSize:10,color:"#8a857c",marginLeft:6}}>({d.antiguedad})</span>}
                    {d.opcional&&<span style={{fontSize:10,color:"#7c3aed",marginLeft:6}}>opcional</span>}
                  </div>
                  {!readOnly&&<button onClick={()=>onRemoveDoc(gid,idx)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✕</button>}
                </div>
              ))}
            </div>
            {!readOnly&&(
              showAddDoc===gid?(
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <input style={{...iS,padding:"7px 10px",fontSize:12}} value={newDocText} onChange={e=>setNewDocText(e.target.value)} placeholder="Nuevo documento..." autoFocus/>
                  <Bt onClick={()=>{if(newDocText.trim()){onAddDoc(gid,newDocText.trim());setNewDocText("");setShowAddDoc(null);}}} style={{fontSize:11,padding:"6px 12px"}}>+</Bt>
                  <Bt v="g" onClick={()=>setShowAddDoc(null)} style={{fontSize:11,padding:"6px 12px"}}>✕</Bt>
                </div>
              ):(
                <button onClick={()=>setShowAddDoc(gid)} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",marginTop:6,padding:0}}>+ Agregar documento</button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRE-PIPELINE (etapas previas de Alonso)
// ═══════════════════════════════════════════════════════════════
function PrePipe({p, role, onAdvance, onUndo, onEditDate, onUpdateChecklist, onUpdatePagoCliente, onSetObs, onClearObs}){
  const [editingDate, setEditingDate] = useState(null);
  const [dateVal, setDateVal] = useState("");
  const [showObsFor, setShowObsFor] = useState(null);
  const [obsText, setObsText] = useState("");
  const [collapsed, setCollapsed] = useState(p.preDone);
  if(role!=="alonso")return null;

  return(
    <div style={{marginBottom:18,padding:18,borderRadius:14,background:"#fefdfb",border:"1px solid #e8e5df"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:collapsed?0:14,cursor:p.preDone?"pointer":"default"}} onClick={()=>p.preDone&&setCollapsed(!collapsed)}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>🏢 Flujo previo de Alonso y Cía {p.preDone&&<Bg bg="#f0fdf4" color="#16a34a" style={{marginLeft:6}}>✓ Completado</Bg>}</div>
          <div style={{fontSize:11,color:"#8a857c",marginTop:2}}>Pasos internos antes de enviar a notaría — invisible para la notaría</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Bg bg="#eff6ff" color="#2563eb">Solo Alonso</Bg>
          {p.preDone&&<button style={{background:"none",border:"none",color:"#8a857c",cursor:"pointer",fontSize:18,fontWeight:700}}>{collapsed?"▼":"▲"}</button>}
        </div>
      </div>

      {!collapsed&&PRE_ETAPAS.map((e,i)=>{
        const d=p.preEtapas[e.id]||{};
        const isAct=i===p.preStep&&!p.preDone;
        const isDone=d.done||i<p.preStep;
        const isWait=i>p.preStep;
        const obs=p.observaciones?.[`pre_${e.id}`];
        const hasObs=obs?.incompleta;
        const isEditing=editingDate===e.id;

        return(
          <div key={e.id} style={{marginBottom:8}}>
            <div style={{display:"grid",gridTemplateColumns:"36px 1fr auto",gap:12,alignItems:"center",padding:"12px 14px",borderRadius:10,background:isAct?"#f8f7f5":hasObs?"#fffbeb":"transparent",border:isAct?"1px solid #2563eb25":hasObs?"1px solid #d9770625":"1px solid transparent"}}>
              <div style={{width:32,height:32,borderRadius:9,background:isDone?"#16a34a18":isWait?"#f1f0ed":"#2563eb18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:isDone?"#16a34a":isWait?"#94a3b8":"#2563eb",border:`2px solid ${isWait?"#e8e5df":isDone?"#16a34a":"#2563eb"}40`}}>
                {isDone?"✓":hasObs?"⚠":(i+1)}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:isWait?"#8a857c":"#1a1714"}}>{e.label}{e.opcional&&<span style={{fontSize:10,color:"#7c3aed",marginLeft:6}}>opcional</span>}</div>
                <div style={{fontSize:11,color:"#8a857c",marginTop:2}}>{e.desc}</div>
                <div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap",fontSize:11,color:"#8a857c"}}>
                  {d.start&&<span>Inicio: {fmt(d.start)}</span>}
                  {d.end&&!isEditing&&<span style={{color:"#16a34a",fontWeight:600}}>✓ {fmt(d.end)}</span>}
                  {isDone&&!isEditing&&(<button onClick={()=>{setEditingDate(e.id);setDateVal(d.end||"");}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600,padding:0}}>✏️ editar</button>)}
                  {isEditing&&(
                    <span style={{display:"inline-flex",gap:4,alignItems:"center"}}>
                      <input type="date" value={dateVal} onChange={ev=>setDateVal(ev.target.value)} style={{padding:"2px 6px",borderRadius:6,border:"1px solid #e8e5df",fontSize:11}}/>
                      <button onClick={()=>{if(dateVal){onEditDate(p.id,`pre_${e.id}`,dateVal);setEditingDate(null);}}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>✓</button>
                      <button onClick={()=>setEditingDate(null)} style={{background:"#f1f0ed",color:"#8a857c",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
                    </span>
                  )}
                </div>
                {hasObs&&(
                  <div style={{marginTop:6,padding:"6px 10px",borderRadius:8,background:"#fef3c7",fontSize:11,color:"#92400e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>⚠ Incompleta: {obs.texto}</span>
                    <button onClick={()=>onClearObs(p.id,`pre_${e.id}`)} style={{background:"none",border:"none",color:"#92400e",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✕ Quitar</button>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                {isDone&&!p.preDone&&<Bt v="w" onClick={()=>onUndo(p.id,`pre_${e.id}`)} style={{fontSize:11,padding:"5px 10px"}}>↩</Bt>}
                {isAct&&!hasObs&&<Bt v="g" onClick={()=>{setShowObsFor(`pre_${e.id}`);setObsText("");}} style={{fontSize:11,padding:"5px 10px"}}>⚠ Incompleta</Bt>}
                {isAct&&<Bt onClick={()=>onAdvance(p.id,e.id)}>Completar ✓</Bt>}
              </div>
            </div>

            {/* Show checklist when on expediente step (active or done) */}
            {e.id==="expediente"&&(isAct||isDone)&&(
              <div style={{marginTop:8,marginLeft:48,padding:14,borderRadius:10,background:"#fff",border:"1px solid #e8e5df"}}>
                <ChecklistView checklist={p.checklist} escenario={p.escenario} readOnly={isDone&&!isAct&&p.preDone}
                  onAddGroup={(name)=>{const id="grupo_"+Date.now();const nl={...p.checklist,[id]:{label:name,docs:DOC_PERSONA.map(d=>({...d,done:false}))}};onUpdateChecklist(p.id,nl);}}
                  onRemoveGroup={(gid)=>{const nl={...p.checklist};delete nl[gid];onUpdateChecklist(p.id,nl);}}
                  onAddDoc={(gid,label)=>{const nl={...p.checklist};const id="custom_"+Date.now();nl[gid]={...nl[gid],docs:[...(nl[gid].docs||[]),{id,label,done:false}]};onUpdateChecklist(p.id,nl);}}
                  onToggleDoc={(gid,idx)=>{const nl={...p.checklist};const docs=[...nl[gid].docs];docs[idx]={...docs[idx],done:!docs[idx].done};nl[gid]={...nl[gid],docs};onUpdateChecklist(p.id,nl);}}
                  onRemoveDoc={(gid,idx)=>{const nl={...p.checklist};const docs=nl[gid].docs.filter((_,i)=>i!==idx);nl[gid]={...nl[gid],docs};onUpdateChecklist(p.id,nl);}}
                />
              </div>
            )}

            {/* Show pago cliente info when on facturacion step (active or done) */}
            {e.id==="fact_cliente"&&(isAct||isDone)&&(
              <div style={{marginTop:8,marginLeft:48,padding:14,borderRadius:10,background:"#fff",border:"1px solid #e8e5df"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>💰 Información de pago del cliente</div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:3}}>Tipo de pago</div>
                  <select style={iS} value={p.cliPagoTipo||""} onChange={e=>onUpdatePagoCliente(p.id,{cliPagoTipo:e.target.value})}>
                    <option value="">Selecciona</option>
                    <option value="total">Factura total</option>
                    <option value="anticipo">Factura anticipo</option>
                    <option value="efectivo">Efectivo (sin factura)</option>
                  </select>
                </div>
                {p.cliPagoTipo&&p.cliPagoTipo!=="efectivo"&&<>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:3}}>Monto bruto</div>
                      <input type="number" style={iS} value={p.cliFacturaBruto||""} onChange={ev=>{
                        const bruto=parseFloat(ev.target.value)||0;
                        const neto=bruto*1.16;
                        onUpdatePagoCliente(p.id,{cliFacturaBruto:bruto||null,cliFacturaNeto:neto||null});
                      }} placeholder="0.00"/>
                    </div>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:3}}>IVA 16%</div>
                      <input style={{...iS,background:"#f8f7f5"}} value={p.cliFacturaBruto?(p.cliFacturaBruto*0.16).toFixed(2):""} readOnly placeholder="0.00"/>
                    </div>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:3}}>Monto neto</div>
                      <input style={{...iS,background:"#f8f7f5"}} value={p.cliFacturaNeto?p.cliFacturaNeto.toFixed(2):""} readOnly placeholder="0.00"/>
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:3}}>Concepto (editable)</div>
                    <textarea style={{...iS,minHeight:60,resize:"vertical"}} value={p.cliFacturaConcepto||generarConcepto(p)} onChange={ev=>onUpdatePagoCliente(p.id,{cliFacturaConcepto:ev.target.value})}/>
                    <button onClick={()=>onUpdatePagoCliente(p.id,{cliFacturaConcepto:generarConcepto(p)})} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600,marginTop:4,padding:0}}>↻ Regenerar concepto</button>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:3}}>Enviar factura a (nombre y/o correo)</div>
                    <input style={iS} value={p.cliFacturaEnviarA||""} onChange={ev=>onUpdatePagoCliente(p.id,{cliFacturaEnviarA:ev.target.value})} placeholder="Ej: Juan Pérez, juan@empresa.com"/>
                  </div>
                  <Bt onClick={()=>enviarCorreoFactura(p)}>📧 Enviar solicitud a administración</Bt>
                </>}
              </div>
            )}

            {/* Observation form */}
            {showObsFor===`pre_${e.id}`&&(
              <div style={{marginTop:8,marginLeft:48,padding:12,borderRadius:10,background:"#fffbeb",border:"1px solid #fde68a"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#92400e",marginBottom:6}}>¿Qué falta o qué pasó?</div>
                <textarea value={obsText} onChange={ev=>setObsText(ev.target.value)} placeholder="Ej: Falta acta de matrimonio del Socio 2..." style={{...iS,minHeight:60,resize:"vertical"}}/>
                <div style={{display:"flex",gap:6,marginTop:6,justifyContent:"flex-end"}}>
                  <Bt v="g" onClick={()=>setShowObsFor(null)} style={{fontSize:11,padding:"5px 10px"}}>Cancelar</Bt>
                  <Bt v="w" onClick={()=>{if(obsText.trim()){onSetObs(p.id,`pre_${e.id}`,obsText);setShowObsFor(null);setObsText("");}}} style={{fontSize:11,padding:"5px 10px"}}>Marcar incompleta</Bt>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE NORMAL (con notaría)
// ═══════════════════════════════════════════════════════════════
function Pipe({p,inh,role,onDone,onUndo,onFact,onPago,onEditDate,onSetObs,onClearObs,onSetEscritura,onTogglePagoEfectivo}){
  const etapas=getEt(p.tipo),envDone=p.etapas.envio?.done;
  const [editingDate,setEditingDate]=useState(null);
  const [dateVal,setDateVal]=useState("");
  const [showObsFor,setShowObsFor]=useState(null);
  const [obsText,setObsText]=useState("");
  const [editingEscritura,setEditingEscritura]=useState(false);
  const [escVal,setEscVal]=useState(p.numEscritura||"");

  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {/* Toggle pago efectivo */}
      {role==="alonso"&&!p.finished&&(
        <div style={{padding:"10px 14px",marginBottom:8,borderRadius:10,background:p.pagoEfectivo?"#fef3c7":"#f8f7f5",display:"flex",alignItems:"center",gap:10}}>
          <input type="checkbox" checked={p.pagoEfectivo||false} onChange={()=>onTogglePagoEfectivo(p.id)} style={{width:16,height:16,cursor:"pointer"}}/>
          <span style={{fontSize:12,fontWeight:600}}>💵 Pago en efectivo a notaría (sin factura)</span>
          {p.pagoEfectivo&&<span style={{fontSize:11,color:"#92400e"}}>— La etapa de facturación se omite</span>}
        </div>
      )}

      {etapas.map((e,i)=>{
        const d=p.etapas[e.id],info=getSt(p,i,inh);
        const isAct=i===p.step&&!p.finished;
        const canAct=isAct&&(role==="alonso"||e.owner==="notaria");
        const isFact=e.id==="facturacion",isPago=e.id==="pago",isFirma=e.id==="firma";
        const obs=p.observaciones?.[e.id];
        const hasObs=obs?.incompleta;

        // Skip facturacion display if pago_efectivo
        if(isFact&&p.pagoEfectivo){
          return(
            <div key={e.id}>
              <div style={{display:"grid",gridTemplateColumns:"36px 1fr auto",gap:12,alignItems:"center",padding:"12px 14px",borderRadius:10,background:"transparent",opacity:0.5}}>
                <div style={{width:32,height:32,borderRadius:9,background:"#f1f0ed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#94a3b8",border:"2px solid #e8e5df"}}>—</div>
                <div><div style={{fontSize:13,fontWeight:600,color:"#94a3b8"}}>Facturación <Bg bg="#fef3c7" color="#92400e">N/A — Efectivo</Bg></div></div>
                <div></div>
              </div>
              {i<etapas.length-1&&<div style={{marginLeft:30,height:6,borderLeft:"2px dashed #e8e5df"}}/>}
            </div>
          );
        }

        let dI=info;
        if(isFact&&envDone&&!p.factSent&&info.s==="wait")dI={s:"active",c:"#7c3aed",l:"Disponible"};
        if(isFact&&p.factSent)dI={s:"done",c:"#16a34a",l:"Completada"};
        let pagoVenc=null;
        const canPago=isPago&&((p.factSent&&!p.pagoMarcado)||(p.pagoEfectivo&&envDone&&!p.pagoMarcado));
        if(isPago&&p.factSent&&!p.pagoMarcado){pagoVenc=addBD(p.factDate,2,inh);const h=td();if(h>pagoVenc)dI={s:"over",c:"#dc2626",l:"Vencida"};else if(bdBtw(h,pagoVenc,inh)<=1)dI={s:"soon",c:"#d97706",l:"Por vencer"};else dI={s:"active",c:"#2563eb",l:"En curso"};}
        else if(canPago)dI={s:"active",c:"#2563eb",l:"Disponible"};
        if(isPago&&p.pagoMarcado)dI={s:"done",c:"#16a34a",l:"Completada"};
        const rowHL=(isFact&&envDone&&!p.factSent)||canPago;
        const isEditing=editingDate===e.id;

        return(
          <div key={e.id}>
            <div style={{display:"grid",gridTemplateColumns:"36px 1fr auto",gap:12,alignItems:"center",padding:"12px 14px",borderRadius:10,background:isAct?(dI.s==="over"?"#fef2f2":dI.s==="soon"?"#fffbeb":"#f8f7f5"):rowHL?(isFact?"#f5f3ff":"#eff6ff"):hasObs?"#fffbeb":"transparent",border:isAct?`1px solid ${dI.c}25`:rowHL?`1px solid ${dI.c}20`:hasObs?"1px solid #d9770625":"1px solid transparent"}}>
              <div style={{width:32,height:32,borderRadius:9,background:dI.s==="done"?"#16a34a18":dI.s==="wait"?"#f1f0ed":dI.c+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:dI.c,border:`2px solid ${dI.s==="wait"?"#e8e5df":dI.c}40`}}>
                {dI.s==="done"?"✓":hasObs?"⚠":dI.s==="wait"?(i+1):dI.s==="over"?"!":dI.s==="soon"?"⏰":"●"}
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:dI.s==="wait"?"#8a857c":"#1a1714",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{e.label} <OBg o={e.owner}/></div>
                <div style={{fontSize:12,color:"#8a857c",marginTop:3}}>{e.desc}</div>
                <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap",fontSize:12,color:"#8a857c"}}>
                  {e.plazo>0&&!isPago&&<span>Plazo: {e.plazo} días háb.</span>}
                  {isPago&&!p.pagoEfectivo&&<span>Plazo: 2 días háb. desde factura</span>}
                  {isPago&&p.pagoEfectivo&&<span>Pago en efectivo</span>}
                  {isPago&&p.factSent&&<span>Factura: {fmt(p.factDate)}</span>}
                  {isPago&&pagoVenc&&!p.pagoMarcado&&<span style={{color:dI.c,fontWeight:700}}>Vence: {fmt(pagoVenc)}</span>}
                  {isPago&&p.pagoMarcado&&<span style={{color:"#16a34a",fontWeight:600}}>✓ Pagado: {fmt(p.pagoDate)}</span>}
                  {!isPago&&d?.start&&<span>Inicio: {fmt(d.start)}</span>}
                  {!isPago&&d?.end&&!isEditing&&<span style={{color:"#16a34a",fontWeight:600}}>✓ {fmt(d.end)}</span>}
                  {!isPago&&info.v&&!d?.done&&<span style={{color:info.c,fontWeight:700}}>Vence: {fmt(info.v)}</span>}
                  {/* Edit date - alonso, all completed steps */}
                  {!isPago&&!isFact&&d?.done&&role==="alonso"&&!isEditing&&(
                    <button onClick={()=>{setEditingDate(e.id);setDateVal(d.end||"");}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600,padding:0}}>✏️ editar</button>
                  )}
                  {isEditing&&role==="alonso"&&(
                    <span style={{display:"inline-flex",gap:4,alignItems:"center"}}>
                      <input type="date" value={dateVal} onChange={ev=>setDateVal(ev.target.value)} style={{padding:"2px 6px",borderRadius:6,border:"1px solid #e8e5df",fontSize:11}}/>
                      <button onClick={()=>{if(dateVal){onEditDate(p.id,e.id,dateVal);setEditingDate(null);}}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>✓</button>
                      <button onClick={()=>setEditingDate(null)} style={{background:"#f1f0ed",color:"#8a857c",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
                    </span>
                  )}
                </div>

                {/* Escritura number on firma step */}
                {isFirma&&(d?.done||isAct)&&(
                  <div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:"#eff6ff",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:"#2563eb"}}>📜 Núm. Escritura:</span>
                    {!editingEscritura?(
                      <>
                        <span style={{fontSize:13,fontWeight:600}}>{p.numEscritura||"— sin asignar —"}</span>
                        {role==="alonso"&&<button onClick={()=>{setEditingEscritura(true);setEscVal(p.numEscritura||"");}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>✏️ {p.numEscritura?"editar":"agregar"}</button>}
                      </>
                    ):(
                      <>
                        <input value={escVal} onChange={ev=>setEscVal(ev.target.value)} placeholder="N° escritura" style={{padding:"3px 8px",borderRadius:6,border:"1px solid #e8e5df",fontSize:12,width:120}}/>
                        <button onClick={()=>{onSetEscritura(p.id,escVal);setEditingEscritura(false);}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>Guardar</button>
                        <button onClick={()=>setEditingEscritura(false)} style={{background:"#f1f0ed",color:"#8a857c",border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
                      </>
                    )}
                  </div>
                )}

                {hasObs&&(
                  <div style={{marginTop:6,padding:"6px 10px",borderRadius:8,background:"#fef3c7",fontSize:11,color:"#92400e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>⚠ Incompleta: {obs.texto}</span>
                    <button onClick={()=>onClearObs(p.id,e.id)} style={{background:"none",border:"none",color:"#92400e",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✕ Quitar</button>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                {/* Undo - any completed step for alonso */}
                {d?.done&&!p.finished&&role==="alonso"&&!isFact&&!isPago&&<Bt v="w" onClick={()=>onUndo(p.id,e.id)} style={{fontSize:11,padding:"5px 10px"}}>↩</Bt>}
                {isFact&&p.factSent&&role==="alonso"&&<Bt v="w" onClick={()=>onUndo(p.id,"facturacion")} style={{fontSize:11,padding:"5px 10px"}}>↩</Bt>}
                {isPago&&p.pagoMarcado&&role==="alonso"&&<Bt v="w" onClick={()=>onUndo(p.id,"pago")} style={{fontSize:11,padding:"5px 10px"}}>↩</Bt>}
                {/* Mark incompleta */}
                {(isAct||(d?.done&&i===p.step-1))&&!hasObs&&!isFact&&!isPago&&<Bt v="g" onClick={()=>{setShowObsFor(e.id);setObsText("");}} style={{fontSize:11,padding:"5px 10px"}}>⚠ Incompleta</Bt>}
                {isFact&&!p.factSent&&envDone&&<Bt v={role==="notaria"?"n":"p"} onClick={()=>onFact(p.id)}>📄 Factura</Bt>}
                {isFact&&p.factSent&&<Bg bg="#f0fdf4" color="#16a34a">✓ Factura {fmt(p.factDate)}</Bg>}
                {canPago&&role==="alonso"&&<Bt v="p" onClick={()=>onPago(p.id)}>💰 Marcar pago</Bt>}
                {isPago&&!p.factSent&&!p.pagoEfectivo&&<Bg bg="#f1f0ed" color="#8a857c">Requiere factura</Bg>}
                {isPago&&p.factSent&&!p.pagoMarcado&&role==="notaria"&&<Bg bg="#fffbeb" color="#d97706">⏳ Esperando pago</Bg>}
                {isPago&&p.pagoMarcado&&<Bg bg="#f0fdf4" color="#16a34a">✓ Pagado {fmt(p.pagoDate)}</Bg>}
                {canAct&&!isFact&&!isPago&&<Bt v={e.owner==="notaria"?"n":"p"} onClick={()=>onDone(p.id,e.id)}>Completar ✓</Bt>}
                {isAct&&!canAct&&!isFact&&!isPago&&role==="notaria"&&<Bg bg="#eff6ff" color="#2563eb">Esperando Alonso</Bg>}
              </div>
            </div>

            {/* Observation form */}
            {showObsFor===e.id&&(
              <div style={{marginLeft:48,marginTop:6,padding:12,borderRadius:10,background:"#fffbeb",border:"1px solid #fde68a"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#92400e",marginBottom:6}}>¿Qué falta o qué pasó?</div>
                <textarea value={obsText} onChange={ev=>setObsText(ev.target.value)} placeholder="Ej: Solo entregaron testimonio, falta copia certificada..." style={{...iS,minHeight:60,resize:"vertical"}}/>
                <div style={{display:"flex",gap:6,marginTop:6,justifyContent:"flex-end"}}>
                  <Bt v="g" onClick={()=>setShowObsFor(null)} style={{fontSize:11,padding:"5px 10px"}}>Cancelar</Bt>
                  <Bt v="w" onClick={()=>{if(obsText.trim()){onSetObs(p.id,e.id,obsText);setShowObsFor(null);setObsText("");}}} style={{fontSize:11,padding:"5px 10px"}}>Marcar incompleta</Bt>
                </div>
              </div>
            )}

            {i<etapas.length-1&&<div style={{marginLeft:30,height:6,borderLeft:`2px ${i<p.step?"solid":"dashed"} ${i<p.step?"#16a34a":"#e8e5df"}`}}/>}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NOTAS / COMENTARIOS
// ═══════════════════════════════════════════════════════════════
function NotasPanel({notas,onAdd,session}){
  const [text,setText]=useState("");
  const add=()=>{if(text.trim()){onAdd({autor:session.label,role:session.role,fecha:new Date().toISOString(),texto:text.trim()});setText("");}};
  return(
    <div style={{marginTop:18,padding:18,borderRadius:14,background:"#fff",border:"1px solid #e8e5df"}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>💬 Notas y comentarios ({(notas||[]).length})</div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <input style={iS} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Escribe una nota..."/>
        <Bt onClick={add} disabled={!text.trim()}>Agregar</Bt>
      </div>
      {(notas||[]).length===0?<div style={{fontSize:12,color:"#8a857c",textAlign:"center",padding:14}}>Sin notas aún</div>:
        <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:280,overflowY:"auto"}}>
          {[...notas].reverse().map((n,i)=>(
            <div key={i} style={{padding:"10px 12px",borderRadius:10,background:n.role==="alonso"?"#eff6ff":"#f5f3ff"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#8a857c",marginBottom:4}}>
                <span style={{fontWeight:700}}>{n.autor}</span>
                <span>{new Date(n.fecha).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <div style={{fontSize:13}}>{n.texto}</div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EFFECTIVENESS
// ═══════════════════════════════════════════════════════════════
function EffPanel({ps,inh,inhFor,notarias,filtNot}){
  const fp=filtNot?ps.filter(p=>p.notariaId===filtNot):ps;
  const done=fp.filter(p=>p.finished);
  if(!done.length)return <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:40,textAlign:"center"}}><div style={{fontSize:40,marginBottom:10}}>📊</div><div style={{fontSize:14,fontWeight:600}}>Sin proyectos completados</div></div>;
  const calc=(owner)=>{
    let ts=0,tc=0;
    const details=done.map(p=>{const et=getEt(p.tipo);let ps2=0,pc=0;
      et.forEach(e=>{if(e.owner!==owner)return;const d=p.etapas[e.id];const pInh=inhFor?inhFor(p.notariaId):inh;const start=(e.id==="pago"&&p.factDate)?p.factDate:d?.start;const end=(e.id==="pago"&&p.pagoDate)?p.pagoDate:d?.end;const plazo=e.id==="pago"?2:e.plazo;if(plazo>0&&start&&end){const real=bdBtw(start,end,pInh);let sc=real<=plazo?100:Math.max(0,100-(real-plazo)*25);if(p.observaciones?.[e.id]?.incompleta)sc=Math.max(0,sc-30);ps2+=sc;pc++;ts+=sc;tc++;}});
      return{name:p.name,score:pc>0?Math.round(ps2/pc):100,date:p.finDate};
    });
    return{global:tc>0?Math.round(ts/tc):100,details};
  };
  const a=calc("alonso"),n=calc("notaria"),sc=s=>s>=90?"#16a34a":s>=70?"#d97706":"#dc2626";
  const Blk=({label,icon,data})=>(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:22,flex:1,minWidth:280}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><div style={{fontSize:15,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>{icon} {label}</div><div style={{fontSize:12,color:"#8a857c",marginTop:2}}>Cumplimiento de plazos</div></div>
        <div style={{width:64,height:64,borderRadius:16,background:sc(data.global)+"14",border:`3px solid ${sc(data.global)}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:800,color:sc(data.global)}}>{data.global}</div>
      </div>
      {data.details.map((d,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:10,background:"#f8f7f5",marginBottom:5}}><div><span style={{fontSize:13,fontWeight:600}}>{d.name}</span> <span style={{fontSize:12,color:"#8a857c"}}>{fmt(d.date)}</span></div><div style={{width:42,height:28,borderRadius:8,background:sc(d.score)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:sc(d.score)}}>{d.score}</div></div>)}
    </div>
  );
  const notName=filtNot?notarias.find(n=>n.id===filtNot)?.name||"Notaría":"Todas las notarías";
  return <div><div style={{fontSize:16,fontWeight:700,marginBottom:4}}>📊 Efectividad — {notName}</div><div style={{fontSize:12,color:"#8a857c",marginBottom:18}}>Calificación 0–100. Cada día hábil de retraso descuenta 25 pts. Etapas marcadas como incompletas descuentan 30 pts.</div><div style={{display:"flex",gap:16,flexWrap:"wrap"}}><Blk label="Alonso y Cía" icon="⚖️" data={a}/><Blk label={notName} icon="📜" data={n}/></div></div>;
}

// ═══════════════════════════════════════════════════════════════
// METRICAS
// ═══════════════════════════════════════════════════════════════
function MetricsPanel({ps,notarias,filtNot}){
  const fp=filtNot?ps.filter(p=>p.notariaId===filtNot):ps;
  const finished=fp.filter(p=>p.finished&&p.finDate);
  const byMonth={};
  finished.forEach(p=>{const m=p.finDate.substring(0,7);byMonth[m]=(byMonth[m]||0)+1;});
  const months=Object.keys(byMonth).sort();
  const max=Math.max(...Object.values(byMonth),1);
  const byTipo={};
  finished.forEach(p=>{byTipo[p.tipo]=(byTipo[p.tipo]||0)+1;});

  const exportCSV=()=>{
    const rows=[["Proyecto","Cliente","Tipo","Notaría","Creado","Completado","N° Escritura"]];
    fp.forEach(p=>{rows.push([p.name,p.cliente||"",TIPO_L[p.tipo],notarias.find(n=>n.id===p.notariaId)?.name||"",p.created,p.finDate||"",p.numEscritura||""]);});
    const csv=rows.map(r=>r.map(c=>`"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`proyectos_${td()}.csv`;a.click();
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><div style={{fontSize:16,fontWeight:700}}>📈 Métricas</div><div style={{fontSize:12,color:"#8a857c",marginTop:2}}>{finished.length} proyectos completados en total</div></div>
        <Bt onClick={exportCSV}>📥 Exportar CSV</Bt>
      </div>

      <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:22,marginBottom:18}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Proyectos completados por mes</div>
        {!months.length?<div style={{fontSize:13,color:"#8a857c",textAlign:"center",padding:20}}>Sin datos aún</div>:
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:200,paddingTop:20}}>
            {months.map(m=>(
              <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <div style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>{byMonth[m]}</div>
                <div style={{width:"100%",background:"#2563eb",borderRadius:"6px 6px 0 0",height:`${(byMonth[m]/max)*150}px`,minHeight:4}}></div>
                <div style={{fontSize:10,color:"#8a857c",fontWeight:600}}>{m}</div>
              </div>
            ))}
          </div>
        }
      </div>

      <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:22}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Por tipo de registro</div>
        {Object.keys(byTipo).length===0?<div style={{fontSize:13,color:"#8a857c",textAlign:"center",padding:20}}>Sin datos</div>:
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {Object.entries(byTipo).map(([t,c])=>(
              <div key={t} style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:12,fontWeight:600,width:140}}>{TIPO_L[t]}</div>
                <div style={{flex:1,height:24,background:"#f1f0ed",borderRadius:6,position:"relative"}}>
                  <div style={{position:"absolute",inset:0,width:`${(c/finished.length)*100}%`,background:"#7c3aed",borderRadius:6}}></div>
                </div>
                <div style={{fontSize:13,fontWeight:700,width:30,textAlign:"right"}}>{c}</div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VISTA CALENDARIO PROYECTOS
// ═══════════════════════════════════════════════════════════════
function CalView({ps,inh,inhFor,onSelect}){
  const today=new Date();
  const [month,setMonth]=useState(today.getMonth());
  const [year,setYear]=useState(today.getFullYear());

  const monthName=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][month];
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();

  // Map of date -> projects with deadline that day
  const events={};
  ps.forEach(p=>{
    if(p.finished||!p.preDone)return;
    const et=getEt(p.tipo);if(p.step>=et.length)return;
    const e=et[p.step];const d=p.etapas[e.id];
    if(e.plazo>0&&d?.start){
      const v=addBD(d.start,e.plazo,inhFor?inhFor(p.notariaId):inh);
      if(v){events[v]=events[v]||[];events[v].push({p,etapa:e.label});}
    }
    if(p.factSent&&!p.pagoMarcado&&!p.pagoEfectivo){
      const pv=addBD(p.factDate,2,inhFor?inhFor(p.notariaId):inh);
      if(pv){events[pv]=events[pv]||[];events[pv].push({p,etapa:"Pago notaría"});}
    }
  });

  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);

  const prev=()=>{if(month===0){setMonth(11);setYear(year-1);}else setMonth(month-1);};
  const next=()=>{if(month===11){setMonth(0);setYear(year+1);}else setMonth(month+1);};

  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:22}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <Bt v="g" onClick={prev}>‹ Anterior</Bt>
        <div style={{fontSize:16,fontWeight:700}}>{monthName} {year}</div>
        <Bt v="g" onClick={next}>Siguiente ›</Bt>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d=><div key={d} style={{fontSize:11,fontWeight:700,color:"#8a857c",textAlign:"center",padding:6}}>{d}</div>)}
        {cells.map((c,i)=>{
          if(c===null)return <div key={i}></div>;
          const dateStr=`${year}-${String(month+1).padStart(2,"0")}-${String(c).padStart(2,"0")}`;
          const evs=events[dateStr]||[];
          const isToday=dateStr===td();
          return(
            <div key={i} style={{minHeight:80,padding:6,borderRadius:8,background:isToday?"#eff6ff":"#f8f7f5",border:isToday?"2px solid #2563eb":"1px solid #e8e5df"}}>
              <div style={{fontSize:11,fontWeight:700,color:isToday?"#2563eb":"#1a1714"}}>{c}</div>
              {evs.slice(0,3).map((e,j)=>(
                <div key={j} onClick={()=>onSelect(e.p.id)} style={{marginTop:3,padding:"2px 5px",borderRadius:4,background:"#dc2626",color:"#fff",fontSize:9,fontWeight:600,cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.p.name}</div>
              ))}
              {evs.length>3&&<div style={{fontSize:9,color:"#8a857c",marginTop:2}}>+{evs.length-3} más</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR (días inhábiles)
// ═══════════════════════════════════════════════════════════════
function Cal({inh,addInh,delInh,notarias,role,nid}){
  const[nd,setNd]=useState("");const[nm,setNm]=useState("");
  const[selNot,setSelNot]=useState(role==="notaria"?nid:(notarias[0]?.id||""));
  const lftS=new Set(LFT.map(d=>d.fecha));
  const lft=inh.filter(d=>lftS.has(d.fecha)&&!d.nid);
  const generalCustom=inh.filter(d=>!lftS.has(d.fecha)&&!d.nid);
  const notCustom=selNot?inh.filter(d=>!lftS.has(d.fecha)&&d.nid===selNot):[];
  const selNotName=notarias.find(n=>n.id===selNot)?.name||"";

  const add=async(forNotaria)=>{
    if(!nd)return;
    const targetNid=forNotaria?selNot:null;
    const exists=inh.some(d=>d.fecha===nd&&((!d.nid&&!targetNid)||(d.nid===targetNid)));
    if(exists)return;
    await addInh(nd,nm||"Personalizado",targetNid);
    setNd("");setNm("");
  };

  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:24}}>
      <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>📅 Días inhábiles</div>
      <div style={{fontSize:12,color:"#8a857c",marginBottom:18}}>Sábados, domingos y festivos LFT excluidos automáticamente. Agrega días generales o específicos por notaría.</div>
      {role==="alonso"&&notarias.length>0&&(
        <div style={{marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:4}}>Ver días de notaría:</div>
          <select style={{...iS,width:"auto"}} value={selNot} onChange={e=>setSelNot(e.target.value)}>
            {notarias.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      )}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:4}}>Fecha</div><input type="date" value={nd} onChange={e=>setNd(e.target.value)} style={{...iS,width:"auto"}}/></div>
        <div style={{flex:1,minWidth:180}}><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:4}}>Motivo</div><input value={nm} onChange={e=>setNm(e.target.value)} placeholder="Vacaciones, cierre RPPC…" style={iS}/></div>
        {role==="alonso"&&<Bt v="g" onClick={()=>add(false)} disabled={!nd}>+ General</Bt>}
        {selNot&&<Bt onClick={()=>add(true)} disabled={!nd}>+ {selNotName||"Notaría"}</Bt>}
      </div>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Festivos LFT ({lft.length})</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {lft.map(d=><div key={d.fecha} style={{padding:"5px 11px",borderRadius:8,background:"#f8f7f5",fontSize:12}}>{fmt(d.fecha)} — {d.motivo}</div>)}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {role==="alonso"&&(
          <div>
            <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Generales ({generalCustom.length})</div>
            <div style={{fontSize:11,color:"#8a857c",marginBottom:6}}>Aplican para todas las notarías</div>
            {!generalCustom.length?<div style={{fontSize:12,color:"#8a857c",padding:16,textAlign:"center",background:"#f8f7f5",borderRadius:10}}>Sin días generales</div>:
            <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:250,overflowY:"auto"}}>
              {generalCustom.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 11px",borderRadius:8,background:"#eff6ff",fontSize:12}}>
                <span>{fmt(d.fecha)} — <span style={{color:"#8a857c"}}>{d.motivo}</span></span>
                <button onClick={()=>delInh(d.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>✕</button>
              </div>)}
            </div>}
          </div>
        )}
        <div>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>{selNotName||"Notaría"} ({notCustom.length})</div>
          <div style={{fontSize:11,color:"#8a857c",marginBottom:6}}>Solo aplican para esta notaría</div>
          {!notCustom.length?<div style={{fontSize:12,color:"#8a857c",padding:16,textAlign:"center",background:"#f8f7f5",borderRadius:10}}>Sin días específicos</div>:
          <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:250,overflowY:"auto"}}>
            {notCustom.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 11px",borderRadius:8,background:"#f5f3ff",fontSize:12}}>
              <span>{fmt(d.fecha)} — <span style={{color:"#8a857c"}}>{d.motivo}</span></span>
              <button onClick={()=>delInh(d.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>✕</button>
            </div>)}
          </div>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NOTARIAS ADMIN
// ═══════════════════════════════════════════════════════════════
function NotAdmin({notarias,onCreate,onUpdate,onDelete}){
  const[show,setShow]=useState(false);
  const[f,setF]=useState({name:"",username:"",password:""});
  const[editing,setEditing]=useState(null);
  const up=(k,v)=>setF(o=>({...o,[k]:v}));
  const save=async()=>{
    if(!f.name.trim()||!f.username.trim()||!f.password.trim())return;
    if(editing){await onUpdate(editing,f);setEditing(null);}
    else await onCreate(f);
    setF({name:"",username:"",password:""});setShow(false);
  };
  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><div style={{fontSize:16,fontWeight:700}}>📜 Administrar notarías</div><div style={{fontSize:12,color:"#8a857c",marginTop:2}}>Agrega, edita o elimina notarías del sistema</div></div>
        <Bt onClick={()=>{setShow(!show);setEditing(null);setF({name:"",username:"",password:""});}}>+ Agregar notaría</Bt>
      </div>
      {(show||editing)&&(
        <div style={{padding:18,borderRadius:12,background:"#f8f7f5",marginBottom:18}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>{editing?"Editar notaría":"Nueva notaría"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
            <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:4}}>Nombre</div><input style={iS} value={f.name} onChange={e=>up("name",e.target.value)} placeholder="Notaría XX de..."/></div>
            <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:4}}>Usuario</div><input style={iS} value={f.username} onChange={e=>up("username",e.target.value)} placeholder="notariaXX"/></div>
            <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:4}}>Contraseña</div><input style={iS} value={f.password} onChange={e=>up("password",e.target.value)} placeholder="Contraseña"/></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Bt v="g" onClick={()=>{setShow(false);setEditing(null);}}>Cancelar</Bt>
            <Bt onClick={save}>{editing?"Guardar cambios":"Agregar"}</Bt>
          </div>
        </div>
      )}
      {!notarias.length?<div style={{padding:20,textAlign:"center",color:"#8a857c",fontSize:13}}>No hay notarías registradas</div>:
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {notarias.map(n=>(
            <div key={n.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderRadius:10,background:"#f8f7f5"}}>
              <div><div style={{fontSize:14,fontWeight:600}}>{n.name}</div><div style={{fontSize:12,color:"#8a857c"}}>Usuario: {n.username}</div></div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{setEditing(n.id);setF({name:n.name,username:n.username,password:n.password});setShow(false);}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:600}}>✏️ Editar</button>
                <button onClick={()=>onDelete(n.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:600}}>🗑 Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BELL & CONFIRM
// ═══════════════════════════════════════════════════════════════
function Bell({alerts,role,nid}){
  const[open,setOpen]=useState(false);const ref=useRef(null);
  const mine=role==="alonso"?alerts:alerts.filter(a=>a.owner==="notaria"&&a.nid===nid);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(!open)} style={{background:mine.length?"#fef2f2":"#f1f0ed",border:"none",borderRadius:10,width:40,height:40,cursor:"pointer",fontSize:17,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>🔔{mine.length>0&&<span style={{position:"absolute",top:-2,right:-2,width:18,height:18,borderRadius:100,background:"#dc2626",color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{mine.length}</span>}</button>
      {open&&<div style={{position:"absolute",top:46,right:0,width:380,maxHeight:400,background:"#fff",borderRadius:14,border:"1px solid #e8e5df",boxShadow:"0 12px 40px rgba(0,0,0,0.12)",zIndex:100,overflow:"hidden"}}>
        <div style={{padding:"13px 16px",borderBottom:"1px solid #e8e5df",fontSize:14,fontWeight:700}}>Notificaciones ({mine.length})</div>
        <div style={{maxHeight:320,overflowY:"auto"}}>{!mine.length?<div style={{padding:28,textAlign:"center",color:"#8a857c",fontSize:13}}>Sin alertas ✓</div>:mine.map(n=><div key={n.id} style={{padding:"11px 16px",borderBottom:"1px solid #e8e5df",background:n.tipo==="vencida"?"#fef2f2":"#fffbeb"}}><div style={{fontSize:13,fontWeight:600}}>{n.tipo==="vencida"?"🔴":"🟡"} {n.proj}</div><div style={{fontSize:12,color:"#8a857c",marginTop:2}}>{n.etapa} — Vence {fmt(n.v)}{n.respN?` — ${n.respN}`:""}</div></div>)}</div>
      </div>}
    </div>
  );
}
function Cfm({msg,onYes,onNo}){return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}><div style={{background:"#fff",borderRadius:16,padding:30,maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}><div style={{fontSize:15,fontWeight:600,marginBottom:20,lineHeight:1.5}}>{msg}</div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Bt v="g" onClick={onNo}>Cancelar</Bt><Bt v="d" onClick={onYes}>Confirmar</Bt></div></div></div>;}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
const ALONSO_USER={user:"alonso",pass:"Alonso2025!",role:"alonso",label:"Alonso y Cía"};
function Login({onLogin,notarias}){
  const[u,setU]=useState("");const[p,setP]=useState("");const[err,setErr]=useState("");const[show,setShow]=useState(false);
  const go=()=>{
    const ul=u.trim().toLowerCase();
    if(ul===ALONSO_USER.user&&p===ALONSO_USER.pass){setErr("");onLogin({...ALONSO_USER});return;}
    const not=notarias.find(n=>n.username===ul&&n.password===p);
    if(not){setErr("");onLogin({user:not.username,pass:not.password,role:"notaria",label:not.name,notariaId:not.id});return;}
    setErr("Usuario o contraseña incorrectos");
  };
  return(
    <div style={{fontFamily:"'Source Sans 3',sans-serif",background:"#faf9f7",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:430,padding:"50px 42px",background:"#fff",borderRadius:20,border:"1px solid #e8e5df",boxShadow:"0 4px 24px rgba(0,0,0,0.06)"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:60,height:60,borderRadius:16,background:"linear-gradient(135deg,#2563eb,#7c3aed)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:800,color:"#fff",marginBottom:18}}>A</div>
          <div style={{fontSize:24,fontWeight:800}}>Control Notarial</div>
          <div style={{fontSize:14,color:"#8a857c",marginTop:5}}>Alonso y Cía</div>
        </div>
        <div style={{marginBottom:20}}><div style={{fontSize:13,fontWeight:600,color:"#8a857c",marginBottom:7}}>Usuario</div><input style={{...iS,padding:"15px 17px",fontSize:15}} value={u} onChange={e=>{setU(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="Ingresa tu usuario" autoFocus/></div>
        <div style={{marginBottom:26}}><div style={{fontSize:13,fontWeight:600,color:"#8a857c",marginBottom:7}}>Contraseña</div><div style={{position:"relative"}}><input type={show?"text":"password"} style={{...iS,padding:"15px 17px",fontSize:15}} value={p} onChange={e=>{setP(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="••••••••"/><button onClick={()=>setShow(!show)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#8a857c",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>{show?"Ocultar":"Ver"}</button></div></div>
        {err&&<div style={{padding:"11px 15px",borderRadius:10,background:"#fef2f2",color:"#dc2626",fontSize:13,fontWeight:500,marginBottom:18,textAlign:"center"}}>{err}</div>}
        <button onClick={go} style={{width:"100%",padding:"15px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#2563eb,#4f46e5)",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Iniciar sesión</button>
        <div style={{marginTop:22,textAlign:"center",fontSize:11,color:"#b0ad9f"}}>Acceso exclusivo para usuarios autorizados</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
export default function App(){
  const[session,setSession]=useState(null);
  const[notarias,setNotarias]=useState([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const n=await db.getNotarias();setNotarias(n||[]);setLoading(false);})();},[]);
  if(loading)return <div style={{fontFamily:"'Source Sans 3',sans-serif",background:"#faf9f7",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/><div style={{fontSize:14,fontWeight:600,color:"#8a857c"}}>Cargando...</div></div>;
  if(!session)return <Login onLogin={s=>setSession(s)} notarias={notarias}/>;
  return <Dash session={session} notarias={notarias} setNotarias={setNotarias} onLogout={()=>setSession(null)}/>;
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function Dash({session,notarias,setNotarias,onLogout}){
  const role=session.role,nid=session.notariaId||null;
  const[vista,setVista]=useState("dashboard");
  const[ps,setPs]=useState([]);
  const[inh,setInh]=useState([...LFT.map(d=>({...d,id:null,nid:null}))]);
  const[selId,setSelId]=useState(null);
  const[showForm,setShowForm]=useState(false);
  const[filtro,setFiltro]=useState("activos");
  const[filtNot,setFiltNot]=useState("");
  const[search,setSearch]=useState("");
  const[cfm,setCfm]=useState(null);
  const[loading,setLoading]=useState(true);
  const[showConfetti,setShowConfetti]=useState(false);

  const inhFor=useCallback((notariaId)=>inh.filter(d=>!d.nid||d.nid===notariaId),[inh]);

  useEffect(()=>{(async()=>{setLoading(true);const[projects,dias]=await Promise.all([db.getProjects(),db.getDias()]);setPs((projects||[]).map(dbToApp));setInh([...LFT.map(d=>({...d,id:null,nid:null})),...(dias||[]).map(d=>({fecha:d.fecha,motivo:d.motivo,id:d.id,nid:d.notaria_id}))]);setLoading(false);})();},[]);
  useEffect(()=>{const iv=setInterval(async()=>{const[projects,dias]=await Promise.all([db.getProjects(),db.getDias()]);if(projects)setPs(projects.map(dbToApp));if(dias)setInh([...LFT.map(d=>({...d,id:null,nid:null})),...dias.map(d=>({fecha:d.fecha,motivo:d.motivo,id:d.id,nid:d.notaria_id}))]);},30000);return()=>clearInterval(iv);},[]);

  const alerts=useMemo(()=>buildAlerts(ps,inh,inhFor),[ps,inh,inhFor]);

  const save=async(id,upd)=>{
    const d={};
    if("step"in upd)d.step=upd.step;if("etapas"in upd)d.etapas=upd.etapas;if("finished"in upd)d.finished=upd.finished;
    if("finDate"in upd)d.fin_date=upd.finDate;if("factSent"in upd)d.fact_sent=upd.factSent;if("factDate"in upd)d.fact_date=upd.factDate;
    if("pagoMarcado"in upd)d.pago_marcado=upd.pagoMarcado;if("pagoDate"in upd)d.pago_date=upd.pagoDate;if("respNotaria"in upd)d.resp_notaria=upd.respNotaria;
    if("checklist"in upd)d.checklist=upd.checklist;if("preEtapas"in upd)d.pre_etapas=upd.preEtapas;if("preStep"in upd)d.pre_step=upd.preStep;if("preDone"in upd)d.pre_done=upd.preDone;
    if("cliPagoTipo"in upd)d.cli_pago_tipo=upd.cliPagoTipo;if("cliFacturaNum"in upd)d.cli_factura_num=upd.cliFacturaNum;if("cliFacturaMonto"in upd)d.cli_factura_monto=upd.cliFacturaMonto;
    if("cliFacturaConcepto"in upd)d.cli_factura_concepto=upd.cliFacturaConcepto;
    if("cliFacturaEnviarA"in upd)d.cli_factura_enviar_a=upd.cliFacturaEnviarA;
    if("cliFacturaBruto"in upd)d.cli_factura_bruto=upd.cliFacturaBruto;
    if("cliFacturaNeto"in upd)d.cli_factura_neto=upd.cliFacturaNeto;
    if("pagoEfectivo"in upd)d.pago_efectivo=upd.pagoEfectivo;if("numEscritura"in upd)d.num_escritura=upd.numEscritura;
    if("observaciones"in upd)d.observaciones=upd.observaciones;if("notas"in upd)d.notas=upd.notas;if("archivado"in upd)d.archivado=upd.archivado;
    if("name"in upd)d.name=upd.name;if("cliente"in upd)d.cliente=upd.cliente;if("fechaActo"in upd)d.fecha_acto=upd.fechaActo;
    await db.updateProject(id,d);
  };

  // Pre-pipeline advance
  const advancePre=useCallback(async(pid,eid)=>{
    setPs(prev=>prev.map(p=>{
      if(p.id!==pid)return p;
      const h=td();const ne={...p.preEtapas};ne[eid]={...ne[eid],done:true,end:h};
      let nx=p.preStep+1;
      const isDone=nx>=PRE_ETAPAS.length;
      if(!isDone)ne[PRE_ETAPAS[nx].id]={...ne[PRE_ETAPAS[nx].id],start:h};
      // When pre is done, start the main pipeline
      const updates={preEtapas:ne,preStep:nx,preDone:isDone};
      if(isDone){updates.etapas={...p.etapas,proyeccion:{...p.etapas.proyeccion,start:h}};}
      const r={...p,...updates};save(pid,updates);return r;
    }));
  },[]);

  const undoPre=useCallback(async(pid,prefixedEid)=>{
    setPs(prev=>prev.map(p=>{
      if(p.id!==pid)return p;
      const eid=prefixedEid.replace("pre_","");
      const ne={...p.preEtapas};ne[eid]={...ne[eid],done:false,end:null};
      const idx=PRE_ETAPAS.findIndex(e=>e.id===eid);
      const nx=Math.max(0,idx);
      // Reset following start
      if(idx+1<PRE_ETAPAS.length&&ne[PRE_ETAPAS[idx+1].id])ne[PRE_ETAPAS[idx+1].id]={...ne[PRE_ETAPAS[idx+1].id],start:null};
      const r={...p,preEtapas:ne,preStep:nx,preDone:false};save(pid,{preEtapas:ne,preStep:nx,preDone:false});return r;
    }));
  },[]);

  // Main pipeline advance
  const advance=useCallback(async(pid,eid)=>{setPs(prev=>prev.map(p=>{
    if(p.id!==pid)return p;
    const et=getEt(p.tipo),h=td(),ne={...p.etapas};
    ne[eid]={...ne[eid],done:true,end:h};
    let nx=p.step+1;
    // Skip facturacion if pago_efectivo
    if(nx<et.length&&et[nx].id==="facturacion"&&p.pagoEfectivo){nx++;}
    if(nx<et.length&&et[nx].id==="facturacion"&&p.factSent){ne.facturacion={...ne.facturacion,done:true,start:p.factDate,end:p.factDate};nx++;}
    if(nx<et.length&&et[nx].id==="pago"&&p.pagoMarcado){ne.pago={...ne.pago,done:true,start:p.pagoDate,end:p.pagoDate};nx++;}
    if(nx<et.length)ne[et[nx].id]={...ne[et[nx].id],start:h};
    const fin=nx>=et.length;
    const r={...p,etapas:ne,step:nx,finished:fin,finDate:fin?h:null};
    if(fin)setShowConfetti(true);
    save(pid,r);return r;
  }));},[]);

  // Undo any step
  const undo=useCallback(async(pid,eid)=>{setPs(prev=>prev.map(p=>{
    if(p.id!==pid)return p;
    const et=getEt(p.tipo);
    if(eid==="facturacion"){const r={...p,factSent:false,factDate:null};save(pid,{factSent:false,factDate:null});return r;}
    if(eid==="pago"){const r={...p,pagoMarcado:false,pagoDate:null};save(pid,{pagoMarcado:false,pagoDate:null});return r;}
    const idx=et.findIndex(e=>e.id===eid);
    if(idx<0)return p;
    const ne={...p.etapas};
    // Reset this and all following
    for(let i=idx;i<et.length;i++){if(ne[et[i].id])ne[et[i].id]={...ne[et[i].id],done:false,end:null,start:i===idx?ne[et[i].id]?.start:null};}
    ne[et[idx].id]={...ne[et[idx].id],done:false,end:null};
    const r={...p,etapas:ne,step:idx,finished:false,finDate:null};
    save(pid,{etapas:ne,step:idx,finished:false,finDate:null});return r;
  }));},[]);

  const markFact=useCallback(async(pid)=>{const h=td();setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const r={...p,factSent:true,factDate:h};save(pid,r);return r;}));},[]);
  const markPago=useCallback(async(pid)=>{const h=td();setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const r={...p,pagoMarcado:true,pagoDate:h};save(pid,r);return r;}));},[]);
  const setRN=useCallback(async(pid,v)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;save(pid,{respNotaria:v});return{...p,respNotaria:v};}));},[]);

  const editDate=useCallback(async(pid,eid,newDate)=>{
    setPs(prev=>prev.map(p=>{
      if(p.id!==pid)return p;
      // Pre-stage edit
      if(eid.startsWith("pre_")){
        const realEid=eid.replace("pre_","");
        const ne={...p.preEtapas};ne[realEid]={...ne[realEid],end:newDate};
        const idx=PRE_ETAPAS.findIndex(e=>e.id===realEid);
        if(idx>=0&&idx+1<PRE_ETAPAS.length&&ne[PRE_ETAPAS[idx+1].id])ne[PRE_ETAPAS[idx+1].id]={...ne[PRE_ETAPAS[idx+1].id],start:newDate};
        save(pid,{preEtapas:ne});return{...p,preEtapas:ne};
      }
      // Main pipeline edit
      const ne={...p.etapas};ne[eid]={...ne[eid],end:newDate};
      const et=getEt(p.tipo);const idx=et.findIndex(e=>e.id===eid);
      if(idx>=0&&idx+1<et.length&&ne[et[idx+1].id])ne[et[idx+1].id]={...ne[et[idx+1].id],start:newDate};
      save(pid,{etapas:ne});return{...p,etapas:ne};
    }));
  },[]);

  const updateChecklist=useCallback(async(pid,checklist)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;save(pid,{checklist});return{...p,checklist};}));},[]);
  const updatePagoCliente=useCallback(async(pid,upd)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;save(pid,upd);return{...p,...upd};}));},[]);
  const setObs=useCallback(async(pid,eid,texto)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const o={...(p.observaciones||{}),[eid]:{incompleta:true,texto}};save(pid,{observaciones:o});return{...p,observaciones:o};}));},[]);
  const clearObs=useCallback(async(pid,eid)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const o={...(p.observaciones||{})};delete o[eid];save(pid,{observaciones:o});return{...p,observaciones:o};}));},[]);
  const setEscritura=useCallback(async(pid,num)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;save(pid,{numEscritura:num});return{...p,numEscritura:num};}));},[]);
  const togglePagoEfectivo=useCallback(async(pid)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const v=!p.pagoEfectivo;save(pid,{pagoEfectivo:v});return{...p,pagoEfectivo:v};}));},[]);
  const addNota=useCallback(async(pid,nota)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const n=[...(p.notas||[]),nota];save(pid,{notas:n});return{...p,notas:n};}));},[]);
  const toggleArchive=useCallback(async(pid)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const v=!p.archivado;save(pid,{archivado:v});return{...p,archivado:v};}));},[]);

  const create=useCallback(async(f)=>{
    const isPast=f.fecha<td();
    const etapas=isPast?mkEtapasPast(f.tipo,f.fecha):mkEtapas(f.tipo,f.fecha);
    const step=isPast?2:0;
    const checklist=getChecklistTemplate(f.escenario);
    const preEtapas=mkPreEtapas();
    const row=await db.createProject({name:f.nombre,cliente:f.cliente||"",tipo:f.tipo,escenario:f.escenario,step,created:f.fecha,fecha_acto:f.fechaActo||null,etapas,fact_sent:false,pago_marcado:false,resp_notaria:"",finished:false,notaria_id:f.notariaId,checklist,pre_etapas:preEtapas,pre_step:0,pre_done:false,pago_efectivo:false,observaciones:{},notas:[]});
    if(row)setPs(prev=>[dbToApp(row[0]),...prev]);
    setShowForm(false);
  },[]);

  const del=useCallback(async(pid)=>{await db.deleteProject(pid);setPs(prev=>prev.filter(p=>p.id!==pid));setSelId(null);},[]);
  const addInh=useCallback(async(f,m,nidArg)=>{const r=await db.addDia(f,m,nidArg);if(r){const row=Array.isArray(r)?r[0]:r;setInh(prev=>[...prev,{fecha:f,motivo:m,id:row?.id||null,nid:nidArg||null}].sort((a,b)=>a.fecha.localeCompare(b.fecha)));}},[]);
  const delInh=useCallback(async(id)=>{await db.delDia(id);setInh(prev=>prev.filter(d=>d.id!==id));},[]);

  const createNot=useCallback(async(f)=>{const r=await db.createNotaria(f);if(r)setNotarias(prev=>[...prev,...(Array.isArray(r)?r:[r])]);},[]);
  const updateNot=useCallback(async(id,f)=>{await db.updateNotaria(id,f);setNotarias(prev=>prev.map(n=>n.id===id?{...n,...f}:n));},[]);
  const deleteNot=useCallback(async(id)=>{await db.deleteNotaria(id);setNotarias(prev=>prev.filter(n=>n.id!==id));},[]);

  const isMyTurn=(p)=>{
    if(p.archivado)return false;
    if(role==="alonso"&&!p.preDone)return true; // pre-stages always alonso
    if(!p.preDone)return false;
    const et=getEt(p.tipo);if(p.finished||p.step>=et.length)return false;
    return role==="alonso"||et[p.step].owner==="notaria";
  };

  // Notarías only see projects with preDone=true
  const baseVisiblePs=role==="notaria"?ps.filter(p=>p.notariaId===nid&&p.preDone):filtNot?ps.filter(p=>p.notariaId===filtNot):ps;

  const filtered=useMemo(()=>{
    return baseVisiblePs.filter(p=>{
      if(search&&!p.name.toLowerCase().includes(search.toLowerCase())&&!(p.cliente||"").toLowerCase().includes(search.toLowerCase()))return false;
      const et=getEt(p.tipo);
      if(filtro==="activos"&&p.finished)return false;
      if(filtro==="completados"&&!p.finished)return false;
      if(filtro==="mi_turno")return isMyTurn(p);
      if(filtro==="vencidos"){if(p.finished||!p.preDone||p.step>=et.length)return false;return getSt(p,p.step,inhFor(p.notariaId)).s==="over";}
      return true;
    });
  },[baseVisiblePs,filtro,role,inh,search,inhFor]);

  const visiblePs=baseVisiblePs;
  const sel=ps.find(p=>p.id===selId);
  const act=visiblePs.filter(p=>!p.finished).length;
  const mt=visiblePs.filter(p=>isMyTurn(p)).length;
  const ov=visiblePs.filter(p=>{if(!p.preDone)return false;const et=getEt(p.tipo);return!p.finished&&p.step<et.length&&getSt(p,p.step,inhFor(p.notariaId)).s==="over";}).length;
  const comp=visiblePs.filter(p=>p.finished).length;
  const tab=(v,l)=><button key={v} onClick={()=>setVista(v)} style={{padding:"7px 14px",borderRadius:8,border:"none",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:vista===v?"#2563eb":"transparent",color:vista===v?"#fff":"#8a857c"}}>{l}</button>;
  const fS={padding:"8px 13px",borderRadius:8,border:"1px solid #e8e5df",background:"#fff",color:"#1a1714",fontSize:13,outline:"none",cursor:"pointer",fontFamily:"inherit"};

  if(loading)return <div style={{fontFamily:"'Source Sans 3',sans-serif",background:"#faf9f7",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:14,fontWeight:600,color:"#8a857c"}}>Cargando sistema...</div></div>;

  const getNotName=(id)=>notarias.find(n=>n.id===id)?.name||"";

  return(
    <div style={{fontFamily:"'Source Sans 3',sans-serif",background:"#faf9f7",minHeight:"100vh",color:"#1a1714"}}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      {cfm&&<Cfm msg={cfm.msg} onYes={()=>{cfm.action();setCfm(null);}} onNo={()=>setCfm(null)}/>}
      {showConfetti&&<Confetti onDone={()=>setShowConfetti(false)}/>}

      <div style={{padding:"12px 22px",borderBottom:"1px solid #e8e5df",background:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:36,height:36,borderRadius:9,background:role==="alonso"?"#2563eb":"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff"}}>{role==="alonso"?"A":"N"}</div>
          <div><div style={{fontSize:14,fontWeight:700}}>{session.label}</div><div style={{fontSize:10,color:"#8a857c",letterSpacing:"0.05em",textTransform:"uppercase"}}>Control Notarial</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {role==="alonso"&&notarias.length>0&&(
            <select style={fS} value={filtNot} onChange={e=>setFiltNot(e.target.value)}>
              <option value="">Todas las notarías</option>
              {notarias.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          )}
          <button onClick={onLogout} style={{padding:"7px 13px",borderRadius:8,border:"1px solid #e8e5df",background:"transparent",color:"#8a857c",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cerrar sesión</button>
        </div>
        <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap"}}>
          {tab("dashboard","Panel")}{tab("proyectos","Proyectos")}{tab("calendario_p","Calendario")}{tab("efectividad","Efectividad")}{tab("metricas","Métricas")}{tab("dias","Días inhábiles")}
          {role==="alonso"&&tab("notarias","Notarías")}
          <Bell alerts={alerts} role={role} nid={nid}/>
          {role==="alonso"&&<Bt onClick={()=>{setShowForm(true);setVista("proyectos");}} style={{marginLeft:5,fontSize:12,padding:"7px 14px"}}>+ Nuevo</Bt>}
        </div>
      </div>

      <div style={{padding:"22px 26px",maxWidth:1180,margin:"0 auto"}}>
        {vista==="dashboard"&&<>
          <div style={{display:"flex",gap:13,marginBottom:20,flexWrap:"wrap"}}><Stat label="Activos" value={act} icon="📂" accent="#2563eb"/><Stat label="Tu turno" value={mt} icon="👆" accent="#d97706" sub={mt>0?"Acción requerida":""}/><Stat label="Vencidos" value={ov} icon="🔴" accent="#dc2626" sub={ov>0?"Urgente":""}/><Stat label="Completados" value={comp} icon="✅" accent="#16a34a"/></div>
          {(role==="alonso"?alerts:alerts.filter(a=>a.owner==="notaria"&&a.nid===nid)).length>0&&(
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:18,marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>🔔 Alertas</div>
              {(role==="alonso"?alerts:alerts.filter(a=>a.owner==="notaria"&&a.nid===nid)).map(n=>(
                <div key={n.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",borderRadius:10,marginBottom:5,cursor:"pointer",background:n.tipo==="vencida"?"#fef2f2":"#fffbeb"}} onClick={()=>{setSelId(n.pid);setVista("proyectos");}}>
                  <span>{n.tipo==="vencida"?"🔴":"🟡"}</span>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{n.proj}</div><div style={{fontSize:12,color:"#8a857c"}}>{n.etapa} — Vence {fmt(n.v)}{n.respN?` — ${n.respN}`:""}</div></div>
                  <Bg bg={n.tipo==="vencida"?"#fef2f2":"#fffbeb"} color={n.tipo==="vencida"?"#dc2626":"#d97706"}>{n.tipo==="vencida"?"VENCIDA":"POR VENCER"}</Bg>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Tu turno</div>
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",overflow:"hidden"}}>
            {!visiblePs.filter(p=>isMyTurn(p)).length?<div style={{padding:30,textAlign:"center",color:"#8a857c",fontSize:14}}>Sin tareas pendientes 🎉</div>
              :visiblePs.filter(p=>isMyTurn(p)).map(p=>{
                const isPre=!p.preDone;
                const et=isPre?null:getEt(p.tipo);
                const e=isPre?PRE_ETAPAS[p.preStep]:et[p.step];
                const info=isPre?{c:"#7c3aed",l:"Previo"}:getSt(p,p.step,inhFor(p.notariaId));
                return <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 17px",borderBottom:"1px solid #e8e5df",cursor:"pointer"}} onClick={()=>{setSelId(p.id);setVista("proyectos");}} onMouseEnter={ev=>ev.currentTarget.style.background="#f8f7f5"} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}><div><div style={{fontSize:14,fontWeight:600}}>{p.name}{p.cliente&&<span style={{fontSize:12,color:"#8a857c",marginLeft:6}}>— {p.cliente}</span>}</div><div style={{fontSize:12,color:"#8a857c"}}>{e?.label} — {TIPO_L[p.tipo]}{role==="alonso"&&getNotName(p.notariaId)?` — ${getNotName(p.notariaId)}`:""}</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}>{info.v&&<span style={{fontSize:12,color:info.c,fontWeight:600}}>Vence {fmt(info.v)}</span>}<Bg bg={info.c+"15"} color={info.c}>{info.l}</Bg></div></div>;
              })}
          </div>
        </>}

        {vista==="proyectos"&&<>
          {showForm&&role==="alonso"&&<NewForm onCreate={create} onCancel={()=>setShowForm(false)} notarias={notarias}/>}
          {sel&&(
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:24,marginBottom:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
                <div>
                  <div style={{fontSize:18,fontWeight:700}}>{sel.name}</div>
                  {sel.cliente&&<div style={{fontSize:13,color:"#8a857c",marginTop:3}}>Cliente: {sel.cliente}</div>}
                  <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                    <Bg>{TIPO_L[sel.tipo]}</Bg>
                    {sel.escenario&&<Bg bg="#eff6ff" color="#2563eb">{ESCENARIOS[sel.escenario]||sel.escenario}</Bg>}
                    <Bg>Creado {fmt(sel.created)}</Bg>
                    {getNotName(sel.notariaId)&&<Bg bg="#f5f3ff" color="#7c3aed">{getNotName(sel.notariaId)}</Bg>}
                    {sel.numEscritura&&<Bg bg="#eff6ff" color="#2563eb">📜 Esc. {sel.numEscritura}</Bg>}
                    {sel.finished&&<Bg bg="#f0fdf4" color="#16a34a">✓ Entregado {fmt(sel.finDate)}</Bg>}
                  </div>
                  {role==="notaria"&&!sel.finished&&(
                    <div style={{marginTop:11,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:12,fontWeight:600,color:"#8a857c"}}>Responsable:</span>
                      <input value={sel.respNotaria} onChange={e=>setRN(sel.id,e.target.value)} placeholder="Nombre (opcional)" style={{padding:"7px 11px",borderRadius:8,border:"1px solid #e8e5df",fontSize:13,color:"#1a1714",background:"#fff",outline:"none",fontFamily:"inherit",width:220}}/>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:6}}>
                  {role==="alonso"&&<Bt v="d" onClick={()=>setCfm({msg:`¿Eliminar "${sel.name}"?`,action:()=>del(sel.id)})} style={{fontSize:11,padding:"5px 10px"}}>🗑</Bt>}
                  <button onClick={()=>setSelId(null)} style={{background:"#f1f0ed",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,color:"#8a857c",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              </div>

              {/* Pre-pipeline (only alonso) - always visible if not yet started or in progress; collapsible if done */}
              {role==="alonso"&&<PrePipe p={sel} role={role} onAdvance={advancePre} onUndo={undoPre} onEditDate={editDate} onUpdateChecklist={updateChecklist} onUpdatePagoCliente={updatePagoCliente} onSetObs={setObs} onClearObs={clearObs}/>}

              {/* Main pipeline */}
              {sel.preDone&&<Pipe p={sel} inh={inhFor(sel.notariaId)} role={role} onDone={advance} onUndo={undo} onFact={markFact} onPago={markPago} onEditDate={editDate} onSetObs={setObs} onClearObs={clearObs} onSetEscritura={setEscritura} onTogglePagoEfectivo={togglePagoEfectivo}/>}
              {role==="alonso"&&sel.preDone===false&&<div style={{marginTop:14,padding:14,borderRadius:10,background:"#f8f7f5",fontSize:12,color:"#8a857c",textAlign:"center"}}>El flujo con notaría comenzará cuando se complete el flujo previo.</div>}

              <NotasPanel notas={sel.notas} onAdd={(n)=>addNota(sel.id,n)} session={session}/>
            </div>
          )}
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <input style={{...iS,maxWidth:280}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nombre o cliente..."/>
            <select style={fS} value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Todos</option><option value="activos">Activos</option><option value="mi_turno">Mi turno</option><option value="vencidos">Vencidos</option><option value="completados">Completados</option></select>
            <span style={{fontSize:13,color:"#8a857c"}}>{filtered.length} proyecto{filtered.length!==1?"s":""}</span>
          </div>
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:role==="alonso"?"2fr 1fr 1.2fr 1fr 70px":"2.5fr 1.2fr 1fr 70px",padding:"10px 17px",borderBottom:"1px solid #e8e5df",fontSize:11,fontWeight:700,color:"#8a857c",textTransform:"uppercase",letterSpacing:"0.05em"}}>
              <span>Proyecto</span>{role==="alonso"&&<span>Notaría</span>}<span>Etapa</span><span>Turno</span><span style={{textAlign:"center"}}>Estado</span>
            </div>
            {!filtered.length&&<div style={{padding:36,textAlign:"center",color:"#8a857c",fontSize:13}}>Sin proyectos</div>}
            {filtered.map(p=>{
              const isPre=!p.preDone;
              const et=isPre?null:getEt(p.tipo);
              const e=isPre?PRE_ETAPAS[p.preStep]:(p.step<et.length?et[p.step]:null);
              const info=isPre?{c:"#7c3aed",l:"Previo"}:(e?getSt(p,p.step,inhFor(p.notariaId)):{c:"#16a34a",l:"✓"});
              return <div key={p.id} style={{display:"grid",gridTemplateColumns:role==="alonso"?"2fr 1fr 1.2fr 1fr 70px":"2.5fr 1.2fr 1fr 70px",padding:"11px 17px",borderBottom:"1px solid #e8e5df",cursor:"pointer",alignItems:"center",background:selId===p.id?"#dbeafe":"transparent"}} onClick={()=>setSelId(selId===p.id?null:p.id)} onMouseEnter={ev=>{if(selId!==p.id)ev.currentTarget.style.background="#f8f7f5";}} onMouseLeave={ev=>{if(selId!==p.id)ev.currentTarget.style.background="transparent";}}><div><div style={{fontSize:14,fontWeight:600}}>{p.name}</div><div style={{fontSize:12,color:"#8a857c"}}>{p.cliente?`${p.cliente} — `:""}{TIPO_L[p.tipo]}</div></div>{role==="alonso"&&<div style={{fontSize:12,color:"#8a857c"}}>{getNotName(p.notariaId)}</div>}<div>{p.finished?<Bg bg="#f0fdf4" color="#16a34a">✓ Completado</Bg>:<Bg bg={info.c+"15"} color={info.c}>{e?.label}</Bg>}</div><div>{e&&!p.finished?(isPre?<Bg bg="#eff6ff" color="#2563eb">Alonso</Bg>:<OBg o={e.owner}/>):"—"}</div><div style={{textAlign:"center"}}>{p.finished?<Bg bg="#f0fdf4" color="#16a34a">✓</Bg>:<Bg bg={info.c+"15"} color={info.c} style={{fontSize:10}}>{info.l}</Bg>}</div></div>;
            })}
          </div>
        </>}

        {vista==="calendario_p"&&<CalView ps={baseVisiblePs} inh={inh} inhFor={inhFor} onSelect={(id)=>{setSelId(id);setVista("proyectos");}}/>}
        {vista==="efectividad"&&<EffPanel ps={ps} inh={inh} inhFor={inhFor} notarias={notarias} filtNot={role==="notaria"?nid:filtNot}/>}
        {vista==="metricas"&&<MetricsPanel ps={ps} notarias={notarias} filtNot={role==="notaria"?nid:filtNot}/>}
        {vista==="dias"&&<Cal inh={inh} addInh={addInh} delInh={delInh} notarias={notarias} role={role} nid={nid}/>}
        {vista==="notarias"&&role==="alonso"&&<NotAdmin notarias={notarias} onCreate={createNot} onUpdate={updateNot} onDelete={id=>setCfm({msg:"¿Eliminar esta notaría?",action:()=>deleteNot(id)})}/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEW FORM
// ═══════════════════════════════════════════════════════════════
function NewForm({onCreate,onCancel,notarias}){
  const NOMBRES_PRESET=["Acta de Asamblea","Constitución de Sociedad","Compraventa"];
  const[f,setF]=useState({nombrePreset:"Acta de Asamblea",nombreCustom:"",cliente:"",tipo:"sin_registro",escenario:"acta_interno",fecha:td(),fechaActo:"",notariaId:notarias[0]?.id||""});
  const up=(k,v)=>setF(o=>({...o,[k]:v}));
  const isOtro=f.nombrePreset==="Otro";
  const nombre=isOtro?f.nombreCustom:f.nombrePreset;
  const valid=nombre.trim()&&f.cliente.trim()&&f.fecha&&f.notariaId;
  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:24,marginBottom:20}}>
      <div style={{fontSize:16,fontWeight:700,marginBottom:18}}>Nuevo proyecto</div>
      <div style={{display:"grid",gridTemplateColumns:isOtro?"1fr 1fr 1fr":"1fr 1fr",gap:12,marginBottom:12}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Tipo de proyecto</div>
          <select style={iS} value={f.nombrePreset} onChange={e=>up("nombrePreset",e.target.value)}>
            {NOMBRES_PRESET.map(n=><option key={n} value={n}>{n}</option>)}
            <option value="Otro">Otro...</option>
          </select>
        </div>
        {isOtro&&<div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Especificar</div><input style={iS} value={f.nombreCustom} onChange={e=>up("nombreCustom",e.target.value)} placeholder="Nombre del proyecto"/></div>}
        <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Cliente</div><input style={iS} value={f.cliente} onChange={e=>up("cliente",e.target.value)} placeholder="Nombre del cliente"/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Tipo de registro</div><select style={iS} value={f.tipo} onChange={e=>up("tipo",e.target.value)}>{TIPOS.map(t=><option key={t} value={t}>{TIPO_L[t]}</option>)}</select></div>
        <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Notaría</div><select style={iS} value={f.notariaId} onChange={e=>up("notariaId",e.target.value)}>{notarias.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}{!notarias.length&&<option value="">Sin notarías registradas</option>}</select></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Escenario de documentos</div><select style={iS} value={f.escenario} onChange={e=>up("escenario",e.target.value)}>{Object.entries(ESCENARIOS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
        <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Fecha del acto (opcional)</div><input type="date" style={iS} value={f.fechaActo} onChange={e=>up("fechaActo",e.target.value)}/><div style={{fontSize:11,color:"#8a857c",marginTop:4}}>Fecha de la asamblea, compraventa o constitución</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12,marginBottom:18}}>
        <div><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:5}}>Fecha de inicio del proyecto</div><input type="date" style={iS} value={f.fecha} onChange={e=>up("fecha",e.target.value)}/><div style={{fontSize:11,color:"#8a857c",marginTop:4}}>Si es pasada, proyección y envío se completan automáticamente</div></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Bt v="g" onClick={onCancel}>Cancelar</Bt><Bt onClick={()=>{if(valid)onCreate({...f,nombre});}} disabled={!valid}>Crear proyecto</Bt></div>
    </div>
  );
}
