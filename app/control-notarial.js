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
// PIPELINE MODEL
// ═══════════════════════════════════════════════════════════════
const TIPOS = ["sin_registro","comercio","propiedad","personas_juridicas"];
const TIPO_L = {sin_registro:"Sin inscripción",comercio:"Comercio",propiedad:"Propiedad",personas_juridicas:"Personas Jurídicas"};
const BI = [
  {id:"proyeccion",label:"Proyección de documentos",owner:"alonso",plazo:0,desc:"Proyectar documentos y armar expediente"},
  {id:"envio",label:"Envío de expediente",owner:"alonso",plazo:0,desc:"Enviar expediente a notaría"},
  {id:"folios",label:"Proyecto en folios",owner:"notaria",plazo:3,desc:"Preparar proyecto en folios — 3 días hábiles"},
  {id:"firma",label:"Firma en notaría",owner:"alonso",plazo:2,desc:"Acudir a firmar — 2 días hábiles"},
];
const BF = [
  {id:"facturacion",label:"Facturación",owner:"notaria",plazo:0,desc:"Emitir factura a Alonso y Cía"},
  {id:"pago",label:"Pago a notaría",owner:"alonso",plazo:2,desc:"Pagar dentro de 2 días háb. desde factura"},
];
function getEt(tipo){
  if(tipo==="sin_registro") return [...BI,{id:"entregables",label:"Entregables",owner:"notaria",plazo:2,desc:"Copia certificada + testimonio — 2 días háb."},{id:"envio_cliente",label:"Envío a cliente",owner:"alonso",plazo:2,desc:"Enviar copia certificada y testimonio — 2 días háb."},...BF];
  if(tipo==="comercio") return [...BI,{id:"entregables",label:"Entregables",owner:"notaria",plazo:3,desc:"Copia cert. + testimonio + boleta registral — 3 días háb."},{id:"envio_cliente",label:"Envío a cliente",owner:"alonso",plazo:2,desc:"Enviar copia certificada y testimonio — 2 días háb."},...BF];
  return [...BI,{id:"entregables",label:"Entregables",owner:"notaria",plazo:2,desc:"Ingreso solicitud + comprobante + copia cert. — 2 días háb."},{id:"envio_cc",label:"Envío copia certificada a cliente",owner:"alonso",plazo:2,desc:"Enviar copia certificada — 2 días háb."},{id:"envio_test",label:"Envío testimonio con boleta a cliente",owner:"alonso",plazo:2,desc:"Enviar testimonio con boleta de inscripción — 2 días háb."},...BF];
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
  // Auto-complete proyeccion and envio with the past date
  const et=getEt(tipo),st={};
  et.forEach((e,i)=>{
    if(i<=1) st[e.id]={done:true,start:date,end:date};
    else if(i===2) st[e.id]={done:false,start:date,end:null};
    else st[e.id]={done:false,start:null,end:null};
  });
  return st;
}

function dbToApp(r){
  return{id:r.id,name:r.name,tipo:r.tipo,step:r.step,created:r.created,factSent:r.fact_sent,factDate:r.fact_date,
    pagoMarcado:r.pago_marcado,pagoDate:r.pago_date,respNotaria:r.resp_notaria||"",etapas:r.etapas,
    finished:r.finished,finDate:r.fin_date,notariaId:r.notaria_id};
}

// ═══════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════
function buildAlerts(ps,inh,inhFor){
  const a=[];
  ps.forEach(p=>{const et=getEt(p.tipo),pInh=inhFor?inhFor(p.notariaId):inh;if(p.finished||p.step>=et.length)return;const e=et[p.step],info=getSt(p,p.step,pInh);
    if(info.s==="over"||info.s==="soon")a.push({id:`${p.id}-${e.id}-${info.s}`,tipo:info.s==="over"?"vencida":"por_vencer",proj:p.name,pid:p.id,etapa:e.label,owner:e.owner,v:info.v,respN:p.respNotaria,nid:p.notariaId});
    if(p.factSent&&!p.pagoMarcado){const pv=addBD(p.factDate,2,pInh);if(pv){const h=td();if(h>pv)a.push({id:`${p.id}-pago-over`,tipo:"vencida",proj:p.name,pid:p.id,etapa:"Pago a notaría",owner:"alonso",v:pv,respN:p.respNotaria,nid:p.notariaId});else if(bdBtw(h,pv,pInh)<=1)a.push({id:`${p.id}-pago-soon`,tipo:"por_vencer",proj:p.name,pid:p.id,etapa:"Pago a notaría",owner:"alonso",v:pv,respN:p.respNotaria,nid:p.notariaId});}}
  });
  return a;
}

// ═══════════════════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════════════════
function Bg({children,bg,color,style:s}){return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:100,fontSize:11,fontWeight:600,background:bg||"#f1f0ed",color:color||"#8a857c",whiteSpace:"nowrap",...s}}>{children}</span>;}
function OBg({o}){return o==="notaria"?<Bg bg="#f5f3ff" color="#7c3aed">Notaría</Bg>:<Bg bg="#eff6ff" color="#2563eb">Alonso y Cía</Bg>;}
function Bt({children,onClick,v="p",disabled,style:s}){
  const vs={p:{background:"#2563eb",color:"#fff"},g:{background:"transparent",color:"#8a857c",border:"1px solid #e8e5df"},n:{background:"#7c3aed",color:"#fff"},d:{background:"#fef2f2",color:"#dc2626"},w:{background:"#fffbeb",color:"#d97706"}};
  return <button onClick={onClick} disabled={disabled} style={{borderRadius:8,padding:"7px 16px",fontSize:12,fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,fontFamily:"inherit",border:"none",...vs[v],...s}}>{children}</button>;
}
function Stat({label,value,icon,accent,sub}){
  return <div style={{background:"#fff",borderRadius:14,padding:"18px 20px",border:"1px solid #e8e5df",flex:1,minWidth:130,display:"flex",gap:14,alignItems:"center"}}><div style={{width:44,height:44,borderRadius:12,background:accent+"14",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div><div><div style={{fontSize:26,fontWeight:800,lineHeight:1}}>{value}</div><div style={{fontSize:11,color:"#8a857c",marginTop:3,fontWeight:500}}>{label}</div>{sub&&<div style={{fontSize:10,color:accent,fontWeight:700,marginTop:1}}>{sub}</div>}</div></div>;
}
const iS={width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #e8e5df",fontSize:13,color:"#1a1714",background:"#fff",outline:"none",fontFamily:"inherit",boxSizing:"border-box"};

// ═══════════════════════════════════════════════════════════════
// PIPELINE COMPONENT
// ═══════════════════════════════════════════════════════════════
function Pipe({p,inh,role,onDone,onUndo,onFact,onPago,onEditDate}){
  const etapas=getEt(p.tipo),envDone=p.etapas.envio?.done;
  const [editingDate,setEditingDate]=useState(null);
  const [dateVal,setDateVal]=useState("");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {etapas.map((e,i)=>{
        const d=p.etapas[e.id],info=getSt(p,i,inh);
        const isAct=i===p.step&&!p.finished;
        const canAct=isAct&&(role==="alonso"||e.owner==="notaria");
        const isFact=e.id==="facturacion",isPago=e.id==="pago";
        let dI=info;
        if(isFact&&envDone&&!p.factSent&&info.s==="wait")dI={s:"active",c:"#7c3aed",l:"Disponible"};
        if(isFact&&p.factSent)dI={s:"done",c:"#16a34a",l:"Completada"};
        let pagoVenc=null;
        if(isPago&&p.factSent&&!p.pagoMarcado){pagoVenc=addBD(p.factDate,2,inh);const h=td();if(h>pagoVenc)dI={s:"over",c:"#dc2626",l:"Vencida"};else if(bdBtw(h,pagoVenc,inh)<=1)dI={s:"soon",c:"#d97706",l:"Por vencer"};else dI={s:"active",c:"#2563eb",l:"En curso"};}
        else if(isPago&&p.factSent&&!p.pagoMarcado)dI={s:"active",c:"#2563eb",l:"Disponible"};
        if(isPago&&p.pagoMarcado)dI={s:"done",c:"#16a34a",l:"Completada"};
        const rowHL=(isFact&&envDone&&!p.factSent)||(isPago&&p.factSent&&!p.pagoMarcado);
        const isEditing=editingDate===e.id;
        return(
          <div key={e.id}>
            <div style={{display:"grid",gridTemplateColumns:"36px 1fr auto",gap:12,alignItems:"center",padding:"11px 14px",borderRadius:12,background:isAct?(dI.s==="over"?"#fef2f2":dI.s==="soon"?"#fffbeb":"#f8f7f5"):rowHL?(isFact?"#f5f3ff":"#eff6ff"):"transparent",border:isAct?`1px solid ${dI.c}25`:rowHL?`1px solid ${dI.c}20`:"1px solid transparent"}}>
              <div style={{width:30,height:30,borderRadius:9,background:dI.s==="done"?"#16a34a18":dI.s==="wait"?"#f1f0ed":dI.c+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:dI.c,border:`2px solid ${dI.s==="wait"?"#e8e5df":dI.c}40`}}>
                {dI.s==="done"?"✓":dI.s==="wait"?(i+1):dI.s==="over"?"!":dI.s==="soon"?"⏰":"●"}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:dI.s==="wait"?"#8a857c":"#1a1714",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{e.label} <OBg o={e.owner}/></div>
                <div style={{fontSize:11,color:"#8a857c",marginTop:2}}>{e.desc}</div>
                <div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap",fontSize:11,color:"#8a857c"}}>
                  {e.plazo>0&&!isPago&&<span>Plazo: {e.plazo} días háb.</span>}
                  {isPago&&<span>Plazo: 2 días háb. desde factura</span>}
                  {isPago&&p.factSent&&<span>Factura: {fmt(p.factDate)}</span>}
                  {isPago&&pagoVenc&&!p.pagoMarcado&&<span style={{color:dI.c,fontWeight:700}}>Vence: {fmt(pagoVenc)}</span>}
                  {isPago&&p.pagoMarcado&&<span style={{color:"#16a34a",fontWeight:600}}>✓ Pagado: {fmt(p.pagoDate)}</span>}
                  {!isPago&&d?.start&&<span>Inicio: {fmt(d.start)}</span>}
                  {!isPago&&d?.end&&!isEditing&&<span style={{color:"#16a34a",fontWeight:600}}>✓ {fmt(d.end)}</span>}
                  {!isPago&&info.v&&!d?.done&&<span style={{color:info.c,fontWeight:700}}>Vence: {fmt(info.v)}</span>}
                  {/* Edit date button - only alonso, only completed steps */}
                  {!isPago&&!isFact&&d?.done&&role==="alonso"&&!isEditing&&(
                    <button onClick={()=>{setEditingDate(e.id);setDateVal(d.end||"");}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600,padding:0}}>✏️ editar fecha</button>
                  )}
                  {isEditing&&role==="alonso"&&(
                    <span style={{display:"inline-flex",gap:4,alignItems:"center"}}>
                      <input type="date" value={dateVal} onChange={ev=>setDateVal(ev.target.value)} style={{padding:"2px 6px",borderRadius:6,border:"1px solid #e8e5df",fontSize:11,fontFamily:"inherit"}}/>
                      <button onClick={()=>{if(dateVal){onEditDate(p.id,e.id,dateVal);setEditingDate(null);}}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✓</button>
                      <button onClick={()=>setEditingDate(null)} style={{background:"#f1f0ed",color:"#8a857c",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                    </span>
                  )}
                </div>
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                {d?.done&&!p.finished&&i===p.step-1&&!isFact&&!isPago&&<Bt v="w" onClick={()=>onUndo(p.id)} style={{fontSize:11,padding:"5px 10px"}}>↩ Deshacer</Bt>}
                {isFact&&!p.factSent&&envDone&&<Bt v={role==="notaria"?"n":"p"} onClick={()=>onFact(p.id)}>📄 Factura enviada</Bt>}
                {isFact&&p.factSent&&<Bg bg="#f0fdf4" color="#16a34a">✓ Factura {fmt(p.factDate)}</Bg>}
                {isPago&&p.factSent&&!p.pagoMarcado&&role==="alonso"&&<Bt v="p" onClick={()=>onPago(p.id)}>💰 Marcar pago</Bt>}
                {isPago&&!p.factSent&&<Bg bg="#f1f0ed" color="#8a857c">Requiere factura</Bg>}
                {isPago&&p.factSent&&!p.pagoMarcado&&role==="notaria"&&<Bg bg="#fffbeb" color="#d97706">⏳ Esperando pago</Bg>}
                {isPago&&p.pagoMarcado&&<Bg bg="#f0fdf4" color="#16a34a">✓ Pagado {fmt(p.pagoDate)}</Bg>}
                {canAct&&!isFact&&!isPago&&<Bt v={e.owner==="notaria"?"n":"p"} onClick={()=>onDone(p.id,e.id)}>Completar ✓</Bt>}
                {isAct&&!canAct&&!isFact&&!isPago&&role==="notaria"&&<Bg bg="#eff6ff" color="#2563eb">Esperando Alonso y Cía</Bg>}
              </div>
            </div>
            {i<etapas.length-1&&<div style={{marginLeft:29,height:5,borderLeft:`2px ${i<p.step?"solid":"dashed"} ${i<p.step?"#16a34a":"#e8e5df"}`}}/>}
          </div>
        );
      })}
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
      et.forEach(e=>{if(e.owner!==owner)return;const d=p.etapas[e.id];const pInh=inhFor?inhFor(p.notariaId):inh;const start=(e.id==="pago"&&p.factDate)?p.factDate:d?.start;const end=(e.id==="pago"&&p.pagoDate)?p.pagoDate:d?.end;const plazo=e.id==="pago"?2:e.plazo;if(plazo>0&&start&&end){const real=bdBtw(start,end,pInh),sc=real<=plazo?100:Math.max(0,100-(real-plazo)*25);ps2+=sc;pc++;ts+=sc;tc++;}});
      return{name:p.name,score:pc>0?Math.round(ps2/pc):100,date:p.finDate};
    });
    return{global:tc>0?Math.round(ts/tc):100,details};
  };
  const a=calc("alonso"),n=calc("notaria"),sc=s=>s>=90?"#16a34a":s>=70?"#d97706":"#dc2626";
  const Blk=({label,icon,data})=>(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:22,flex:1,minWidth:280}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><div style={{fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>{icon} {label}</div><div style={{fontSize:11,color:"#8a857c",marginTop:2}}>Cumplimiento de plazos</div></div>
        <div style={{width:60,height:60,borderRadius:16,background:sc(data.global)+"14",border:`3px solid ${sc(data.global)}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:sc(data.global)}}>{data.global}</div>
      </div>
      {data.details.map((d,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderRadius:10,background:"#f8f7f5",marginBottom:5}}><div><span style={{fontSize:12,fontWeight:600}}>{d.name}</span> <span style={{fontSize:11,color:"#8a857c"}}>{fmt(d.date)}</span></div><div style={{width:40,height:26,borderRadius:8,background:sc(d.score)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:sc(d.score)}}>{d.score}</div></div>)}
    </div>
  );
  const notName=filtNot?notarias.find(n=>n.id===filtNot)?.name||"Notaría":"Todas las notarías";
  return <div><div style={{fontSize:15,fontWeight:700,marginBottom:4}}>📊 Efectividad — {notName}</div><div style={{fontSize:12,color:"#8a857c",marginBottom:18}}>Calificación 0–100. Cada día hábil de retraso descuenta 25 pts.</div><div style={{display:"flex",gap:16,flexWrap:"wrap"}}><Blk label="Alonso y Cía" icon="⚖️" data={a}/><Blk label={notName} icon="📜" data={n}/></div></div>;
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════
function Cal({inh,addInh,delInh,notarias,role,nid}){
  const[nd,setNd]=useState("");const[nm,setNm]=useState("");
  const[selNot,setSelNot]=useState(role==="notaria"?nid:(notarias[0]?.id||""));
  const lftS=new Set(LFT.map(d=>d.fecha));
  const lft=inh.filter(d=>lftS.has(d.fecha)&&!d.nid);
  // General custom (no notaría) + for selected notaría
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
      <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>📅 Días inhábiles</div>
      <div style={{fontSize:12,color:"#8a857c",marginBottom:18}}>Sábados, domingos y festivos LFT excluidos automáticamente. Agrega días generales o específicos por notaría.</div>

      {/* Notaría selector */}
      {role==="alonso"&&notarias.length>0&&(
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Ver días de notaría:</div>
          <select style={{...iS,width:"auto"}} value={selNot} onChange={e=>setSelNot(e.target.value)}>
            {notarias.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      )}

      {/* Add form */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Fecha</div><input type="date" value={nd} onChange={e=>setNd(e.target.value)} style={{...iS,width:"auto"}}/></div>
        <div style={{flex:1,minWidth:180}}><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Motivo</div><input value={nm} onChange={e=>setNm(e.target.value)} placeholder="Vacaciones, cierre RPPC…" style={iS}/></div>
        {role==="alonso"&&<Bt v="g" onClick={()=>add(false)} disabled={!nd}>+ General</Bt>}
        {selNot&&<Bt onClick={()=>add(true)} disabled={!nd}>+ {selNotName||"Notaría"}</Bt>}
      </div>

      {/* LFT */}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Festivos LFT ({lft.length})</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {lft.map(d=><div key={d.fecha} style={{padding:"4px 10px",borderRadius:8,background:"#f8f7f5",fontSize:11}}>{fmt(d.fecha)} — {d.motivo}</div>)}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {/* General custom */}
        {role==="alonso"&&(
          <div>
            <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Generales ({generalCustom.length})</div>
            <div style={{fontSize:10,color:"#8a857c",marginBottom:6}}>Aplican para todas las notarías</div>
            {!generalCustom.length?<div style={{fontSize:12,color:"#8a857c",padding:16,textAlign:"center",background:"#f8f7f5",borderRadius:10}}>Sin días generales</div>:
            <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:250,overflowY:"auto"}}>
              {generalCustom.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 10px",borderRadius:8,background:"#eff6ff",fontSize:12}}>
                <span>{fmt(d.fecha)} — <span style={{color:"#8a857c"}}>{d.motivo}</span></span>
                <button onClick={()=>delInh(d.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>✕</button>
              </div>)}
            </div>}
          </div>
        )}

        {/* Notaría-specific */}
        <div>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>{selNotName||"Notaría"} ({notCustom.length})</div>
          <div style={{fontSize:10,color:"#8a857c",marginBottom:6}}>Solo aplican para esta notaría</div>
          {!notCustom.length?<div style={{fontSize:12,color:"#8a857c",padding:16,textAlign:"center",background:"#f8f7f5",borderRadius:10}}>Sin días específicos</div>:
          <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:250,overflowY:"auto"}}>
            {notCustom.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 10px",borderRadius:8,background:"#f5f3ff",fontSize:12}}>
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
// NOTARIAS ADMIN (only alonso)
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
        <div><div style={{fontSize:15,fontWeight:700}}>📜 Administrar notarías</div><div style={{fontSize:12,color:"#8a857c",marginTop:2}}>Agrega, edita o elimina notarías del sistema</div></div>
        <Bt onClick={()=>{setShow(!show);setEditing(null);setF({name:"",username:"",password:""});}}>+ Agregar notaría</Bt>
      </div>
      {(show||editing)&&(
        <div style={{padding:18,borderRadius:12,background:"#f8f7f5",marginBottom:18}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{editing?"Editar notaría":"Nueva notaría"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
            <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Nombre</div><input style={iS} value={f.name} onChange={e=>up("name",e.target.value)} placeholder="Notaría XX de..."/></div>
            <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Usuario</div><input style={iS} value={f.username} onChange={e=>up("username",e.target.value)} placeholder="notariaXX"/></div>
            <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Contraseña</div><input style={iS} value={f.password} onChange={e=>up("password",e.target.value)} placeholder="Contraseña"/></div>
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
            <div key={n.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderRadius:10,background:"#f8f7f5"}}>
              <div><div style={{fontSize:13,fontWeight:600}}>{n.name}</div><div style={{fontSize:11,color:"#8a857c"}}>Usuario: {n.username}</div></div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{setEditing(n.id);setF({name:n.name,username:n.username,password:n.password});setShow(false);}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>✏️ Editar</button>
                <button onClick={()=>onDelete(n.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>🗑 Eliminar</button>
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
      <button onClick={()=>setOpen(!open)} style={{background:mine.length?"#fef2f2":"#f1f0ed",border:"none",borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:16,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>🔔{mine.length>0&&<span style={{position:"absolute",top:-2,right:-2,width:16,height:16,borderRadius:100,background:"#dc2626",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{mine.length}</span>}</button>
      {open&&<div style={{position:"absolute",top:44,right:0,width:360,maxHeight:380,background:"#fff",borderRadius:14,border:"1px solid #e8e5df",boxShadow:"0 12px 40px rgba(0,0,0,0.12)",zIndex:100,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #e8e5df",fontSize:13,fontWeight:700}}>Notificaciones ({mine.length})</div>
        <div style={{maxHeight:300,overflowY:"auto"}}>{!mine.length?<div style={{padding:28,textAlign:"center",color:"#8a857c",fontSize:13}}>Sin alertas ✓</div>:mine.map(n=><div key={n.id} style={{padding:"10px 16px",borderBottom:"1px solid #e8e5df",background:n.tipo==="vencida"?"#fef2f2":"#fffbeb"}}><div style={{fontSize:12,fontWeight:600}}>{n.tipo==="vencida"?"🔴":"🟡"} {n.proj}</div><div style={{fontSize:11,color:"#8a857c",marginTop:1}}>{n.etapa} — Vence {fmt(n.v)}{n.respN?` — ${n.respN}`:""}</div></div>)}</div>
      </div>}
    </div>
  );
}
function Cfm({msg,onYes,onNo}){return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}><div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}><div style={{fontSize:14,fontWeight:600,marginBottom:18,lineHeight:1.5}}>{msg}</div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Bt v="g" onClick={onNo}>Cancelar</Bt><Bt v="d" onClick={onYes}>Confirmar</Bt></div></div></div>;}

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
      <div style={{width:"100%",maxWidth:420,padding:"48px 40px",background:"#fff",borderRadius:20,border:"1px solid #e8e5df",boxShadow:"0 4px 24px rgba(0,0,0,0.06)"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#2563eb,#7c3aed)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:"#fff",marginBottom:16}}>A</div>
          <div style={{fontSize:22,fontWeight:800}}>Control Notarial</div>
          <div style={{fontSize:13,color:"#8a857c",marginTop:4}}>Alonso y Cía</div>
        </div>
        <div style={{marginBottom:18}}><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:6}}>Usuario</div><input style={{...iS,padding:"14px 16px",fontSize:14}} value={u} onChange={e=>{setU(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="Ingresa tu usuario" autoFocus/></div>
        <div style={{marginBottom:24}}><div style={{fontSize:12,fontWeight:600,color:"#8a857c",marginBottom:6}}>Contraseña</div><div style={{position:"relative"}}><input type={show?"text":"password"} style={{...iS,padding:"14px 16px",fontSize:14}} value={p} onChange={e=>{setP(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="••••••••"/><button onClick={()=>setShow(!show)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#8a857c",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>{show?"Ocultar":"Ver"}</button></div></div>
        {err&&<div style={{padding:"10px 14px",borderRadius:10,background:"#fef2f2",color:"#dc2626",fontSize:13,fontWeight:500,marginBottom:18,textAlign:"center"}}>{err}</div>}
        <button onClick={go} style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#2563eb,#4f46e5)",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Iniciar sesión</button>
        <div style={{marginTop:20,textAlign:"center",fontSize:11,color:"#b0ad9f"}}>Acceso exclusivo para usuarios autorizados</div>
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

  // Get inhábiles for a specific notaría: LFT + generales (nid=null) + de esa notaría
  const inhFor=(notariaId)=>inh.filter(d=>!d.nid||d.nid===notariaId);
  const[selId,setSelId]=useState(null);
  const[showForm,setShowForm]=useState(false);
  const[filtro,setFiltro]=useState("todos");
  const[filtNot,setFiltNot]=useState("");
  const[cfm,setCfm]=useState(null);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{setLoading(true);const[projects,dias]=await Promise.all([db.getProjects(),db.getDias()]);setPs((projects||[]).map(dbToApp));setInh([...LFT.map(d=>({...d,id:null,nid:null})),...(dias||[]).map(d=>({fecha:d.fecha,motivo:d.motivo,id:d.id,nid:d.notaria_id}))]);setLoading(false);})();},[]);
  useEffect(()=>{const iv=setInterval(async()=>{const[projects,dias]=await Promise.all([db.getProjects(),db.getDias()]);if(projects)setPs(projects.map(dbToApp));if(dias)setInh([...LFT.map(d=>({...d,id:null,nid:null})),...dias.map(d=>({fecha:d.fecha,motivo:d.motivo,id:d.id,nid:d.notaria_id}))]);},30000);return()=>clearInterval(iv);},[]);

  const alerts=useMemo(()=>buildAlerts(ps,inh,inhFor),[ps,inh]);

  const save=async(id,upd)=>{
    const d={};
    if("step"in upd)d.step=upd.step;if("etapas"in upd)d.etapas=upd.etapas;if("finished"in upd)d.finished=upd.finished;
    if("finDate"in upd)d.fin_date=upd.finDate;if("factSent"in upd)d.fact_sent=upd.factSent;if("factDate"in upd)d.fact_date=upd.factDate;
    if("pagoMarcado"in upd)d.pago_marcado=upd.pagoMarcado;if("pagoDate"in upd)d.pago_date=upd.pagoDate;if("respNotaria"in upd)d.resp_notaria=upd.respNotaria;
    await db.updateProject(id,d);
  };

  const advance=useCallback(async(pid,eid)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const et=getEt(p.tipo),h=td(),ne={...p.etapas};ne[eid]={...ne[eid],done:true,end:h};let nx=p.step+1;if(nx<et.length&&et[nx].id==="facturacion"&&p.factSent){ne.facturacion={...ne.facturacion,done:true,start:p.factDate,end:p.factDate};nx++;}if(nx<et.length&&et[nx].id==="pago"&&p.pagoMarcado){ne.pago={...ne.pago,done:true,start:p.pagoDate,end:p.pagoDate};nx++;}if(nx<et.length)ne[et[nx].id]={...ne[et[nx].id],start:h};const fin=nx>=et.length;const r={...p,etapas:ne,step:nx,finished:fin,finDate:fin?h:null};save(pid,r);return r;}));},[]);

  const undo=useCallback(async(pid)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid||p.step<=0)return p;const et=getEt(p.tipo),pr=p.step-1,ne={...p.etapas};ne[et[pr].id]={...ne[et[pr].id],done:false,end:null};if(p.step<et.length)ne[et[p.step].id]={...ne[et[p.step].id],start:null};const r={...p,etapas:ne,step:pr,finished:false,finDate:null};save(pid,r);return r;}));},[]);

  const markFact=useCallback(async(pid)=>{const h=td();setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const r={...p,factSent:true,factDate:h};save(pid,r);return r;}));},[]);
  const markPago=useCallback(async(pid)=>{const h=td();setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;const r={...p,pagoMarcado:true,pagoDate:h};save(pid,r);return r;}));},[]);
  const setRN=useCallback(async(pid,v)=>{setPs(prev=>prev.map(p=>{if(p.id!==pid)return p;save(pid,{respNotaria:v});return{...p,respNotaria:v};}));},[]);

  const editDate=useCallback(async(pid,eid,newDate)=>{
    setPs(prev=>prev.map(p=>{
      if(p.id!==pid)return p;
      const ne={...p.etapas};ne[eid]={...ne[eid],end:newDate};
      // Also update next step's start date
      const et=getEt(p.tipo);const idx=et.findIndex(e=>e.id===eid);
      if(idx>=0&&idx+1<et.length&&ne[et[idx+1].id]){ne[et[idx+1].id]={...ne[et[idx+1].id],start:newDate};}
      const r={...p,etapas:ne};save(pid,{etapas:ne});return r;
    }));
  },[]);

  const create=useCallback(async(f)=>{
    const isPast=f.fecha<td();
    const etapas=isPast?mkEtapasPast(f.tipo,f.fecha):mkEtapas(f.tipo,f.fecha);
    const step=isPast?2:0;
    const row=await db.createProject({name:f.nombre,tipo:f.tipo,step,created:f.fecha,etapas,fact_sent:false,pago_marcado:false,resp_notaria:"",finished:false,notaria_id:f.notariaId});
    if(row)setPs(prev=>[dbToApp(row[0]),...prev]);
    setShowForm(false);
  },[]);

  const del=useCallback(async(pid)=>{await db.deleteProject(pid);setPs(prev=>prev.filter(p=>p.id!==pid));setSelId(null);},[]);
  const addInh=useCallback(async(f,m,nid)=>{const r=await db.addDia(f,m,nid);if(r){const row=Array.isArray(r)?r[0]:r;setInh(prev=>[...prev,{fecha:f,motivo:m,id:row?.id||null,nid:nid||null}].sort((a,b)=>a.fecha.localeCompare(b.fecha)));}},[]);
  const delInh=useCallback(async(id)=>{await db.delDia(id);setInh(prev=>prev.filter(d=>d.id!==id));},[]);

  // Notaria CRUD
  const createNot=useCallback(async(f)=>{const r=await db.createNotaria(f);if(r)setNotarias(prev=>[...prev,...(Array.isArray(r)?r:[r])]);},[]);
  const updateNot=useCallback(async(id,f)=>{await db.updateNotaria(id,f);setNotarias(prev=>prev.map(n=>n.id===id?{...n,...f}:n));},[]);
  const deleteNot=useCallback(async(id)=>{await db.deleteNotaria(id);setNotarias(prev=>prev.filter(n=>n.id!==id));},[]);

  const isMyTurn=(p)=>{const et=getEt(p.tipo);if(p.finished||p.step>=et.length)return false;return role==="alonso"||et[p.step].owner==="notaria";};

  // Filter by notaria for notaria users
  const visiblePs=role==="notaria"?ps.filter(p=>p.notariaId===nid):filtNot?ps.filter(p=>p.notariaId===filtNot):ps;

  const filtered=useMemo(()=>{
    return visiblePs.filter(p=>{const et=getEt(p.tipo);
      if(filtro==="activos"&&p.finished)return false;if(filtro==="completados"&&!p.finished)return false;
      if(filtro==="mi_turno")return isMyTurn(p);
      if(filtro==="vencidos"){if(p.finished||p.step>=et.length)return false;return getSt(p,p.step,inhFor(p.notariaId)).s==="over";}
      return true;
    });
  },[visiblePs,filtro,role,inh]);

  const sel=ps.find(p=>p.id===selId);
  const act=visiblePs.filter(p=>!p.finished).length;
  const mt=visiblePs.filter(p=>isMyTurn(p)).length;
  const ov=visiblePs.filter(p=>{const et=getEt(p.tipo);return!p.finished&&p.step<et.length&&getSt(p,p.step,inhFor(p.notariaId)).s==="over";}).length;
  const comp=visiblePs.filter(p=>p.finished).length;
  const tab=(v,l)=><button key={v} onClick={()=>setVista(v)} style={{padding:"6px 13px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:vista===v?"#2563eb":"transparent",color:vista===v?"#fff":"#8a857c"}}>{l}</button>;
  const fS={padding:"7px 12px",borderRadius:8,border:"1px solid #e8e5df",background:"#fff",color:"#1a1714",fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit"};

  if(loading)return <div style={{fontFamily:"'Source Sans 3',sans-serif",background:"#faf9f7",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:14,fontWeight:600,color:"#8a857c"}}>Cargando sistema...</div></div>;

  const getNotName=(id)=>notarias.find(n=>n.id===id)?.name||"";

  return(
    <div style={{fontFamily:"'Source Sans 3',sans-serif",background:"#faf9f7",minHeight:"100vh",color:"#1a1714"}}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      {cfm&&<Cfm msg={cfm.msg} onYes={()=>{cfm.action();setCfm(null);}} onNo={()=>setCfm(null)}/>}

      {/* HEADER */}
      <div style={{padding:"10px 20px",borderBottom:"1px solid #e8e5df",background:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:role==="alonso"?"#2563eb":"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff"}}>{role==="alonso"?"A":"N"}</div>
          <div><div style={{fontSize:13,fontWeight:700}}>{session.label}</div><div style={{fontSize:9,color:"#8a857c",letterSpacing:"0.05em",textTransform:"uppercase"}}>Control Notarial</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {role==="alonso"&&notarias.length>0&&(
            <select style={fS} value={filtNot} onChange={e=>setFiltNot(e.target.value)}>
              <option value="">Todas las notarías</option>
              {notarias.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          )}
          <button onClick={onLogout} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #e8e5df",background:"transparent",color:"#8a857c",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cerrar sesión</button>
        </div>
        <div style={{display:"flex",gap:2,alignItems:"center"}}>
          {tab("dashboard","Panel")}{tab("proyectos","Proyectos")}{tab("efectividad","Efectividad")}{tab("calendario","Calendario")}
          {role==="alonso"&&tab("notarias","Notarías")}
          <Bell alerts={alerts} role={role} nid={nid}/>
          {role==="alonso"&&<Bt onClick={()=>{setShowForm(true);setVista("proyectos");}} style={{marginLeft:4,fontSize:11,padding:"6px 12px"}}>+ Nuevo</Bt>}
        </div>
      </div>

      <div style={{padding:"20px 24px",maxWidth:1100,margin:"0 auto"}}>
        {/* DASHBOARD */}
        {vista==="dashboard"&&<>
          <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap"}}><Stat label="Activos" value={act} icon="📂" accent="#2563eb"/><Stat label="Tu turno" value={mt} icon="👆" accent="#d97706" sub={mt>0?"Acción requerida":""}/><Stat label="Vencidos" value={ov} icon="🔴" accent="#dc2626" sub={ov>0?"Urgente":""}/><Stat label="Completados" value={comp} icon="✅" accent="#16a34a"/></div>
          {(role==="alonso"?alerts:alerts.filter(a=>a.owner==="notaria"&&a.nid===nid)).length>0&&(
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:16,marginBottom:18}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>🔔 Alertas</div>
              {(role==="alonso"?alerts:alerts.filter(a=>a.owner==="notaria"&&a.nid===nid)).map(n=>(
                <div key={n.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,marginBottom:5,cursor:"pointer",background:n.tipo==="vencida"?"#fef2f2":"#fffbeb"}} onClick={()=>{setSelId(n.pid);setVista("proyectos");}}>
                  <span>{n.tipo==="vencida"?"🔴":"🟡"}</span>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{n.proj}</div><div style={{fontSize:11,color:"#8a857c"}}>{n.etapa} — Vence {fmt(n.v)}{n.respN?` — ${n.respN}`:""}</div></div>
                  <Bg bg={n.tipo==="vencida"?"#fef2f2":"#fffbeb"} color={n.tipo==="vencida"?"#dc2626":"#d97706"}>{n.tipo==="vencida"?"VENCIDA":"POR VENCER"}</Bg>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Tu turno</div>
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",overflow:"hidden"}}>
            {!visiblePs.filter(p=>isMyTurn(p)).length?<div style={{padding:28,textAlign:"center",color:"#8a857c",fontSize:13}}>Sin tareas pendientes 🎉</div>
              :visiblePs.filter(p=>isMyTurn(p)).map(p=>{const et=getEt(p.tipo),e=et[p.step],info=getSt(p,p.step,inhFor(p.notariaId));return(
                <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:"1px solid #e8e5df",cursor:"pointer"}} onClick={()=>{setSelId(p.id);setVista("proyectos");}} onMouseEnter={ev=>ev.currentTarget.style.background="#f8f7f5"} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                  <div><div style={{fontSize:13,fontWeight:600}}>{p.name}</div><div style={{fontSize:11,color:"#8a857c"}}>{e.label} — {TIPO_L[p.tipo]}{role==="alonso"&&getNotName(p.notariaId)?` — ${getNotName(p.notariaId)}`:""}{p.respNotaria?` — ${p.respNotaria}`:""}</div></div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>{info.v&&<span style={{fontSize:11,color:info.c,fontWeight:600}}>Vence {fmt(info.v)}</span>}<Bg bg={info.c+"15"} color={info.c}>{info.l}</Bg></div>
                </div>
              );})}
          </div>
        </>}

        {/* PROYECTOS */}
        {vista==="proyectos"&&<>
          {showForm&&role==="alonso"&&<NewForm onCreate={create} onCancel={()=>setShowForm(false)} notarias={notarias}/>}
          {sel&&(
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:22,marginBottom:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700}}>{sel.name}</div>
                  <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                    <Bg>{TIPO_L[sel.tipo]}</Bg><Bg>Creado {fmt(sel.created)}</Bg>
                    {getNotName(sel.notariaId)&&<Bg bg="#f5f3ff" color="#7c3aed">{getNotName(sel.notariaId)}</Bg>}
                    {sel.finished&&<Bg bg="#f0fdf4" color="#16a34a">✓ Entregado {fmt(sel.finDate)}</Bg>}
                    {sel.respNotaria&&<Bg bg="#f5f3ff" color="#7c3aed">📜 {sel.respNotaria}</Bg>}
                  </div>
                  {role==="notaria"&&!sel.finished&&(
                    <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,fontWeight:600,color:"#8a857c"}}>Responsable:</span>
                      <input value={sel.respNotaria} onChange={e=>setRN(sel.id,e.target.value)} placeholder="Nombre (opcional)" style={{padding:"6px 10px",borderRadius:8,border:"1px solid #e8e5df",fontSize:12,color:"#1a1714",background:"#fff",outline:"none",fontFamily:"inherit",width:200}}/>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:6}}>
                  {role==="alonso"&&<Bt v="d" onClick={()=>setCfm({msg:`¿Eliminar "${sel.name}"?`,action:()=>del(sel.id)})} style={{fontSize:11,padding:"5px 10px"}}>🗑</Bt>}
                  <button onClick={()=>setSelId(null)} style={{background:"#f1f0ed",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#8a857c",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              </div>
              <Pipe p={sel} inh={inhFor(sel.notariaId)} role={role} onDone={advance} onUndo={pid=>setCfm({msg:"¿Deshacer la última etapa?",action:()=>undo(pid)})} onFact={markFact} onPago={markPago} onEditDate={editDate}/>
            </div>
          )}
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <select style={fS} value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Todos</option><option value="activos">Activos</option><option value="mi_turno">Mi turno</option><option value="vencidos">Vencidos</option><option value="completados">Completados</option></select>
            <span style={{fontSize:12,color:"#8a857c"}}>{filtered.length} proyecto{filtered.length!==1?"s":""}</span>
          </div>
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:role==="alonso"?"2fr 1fr 1.2fr 1fr 70px":"2.5fr 1.2fr 1fr 70px",padding:"9px 16px",borderBottom:"1px solid #e8e5df",fontSize:10,fontWeight:700,color:"#8a857c",textTransform:"uppercase",letterSpacing:"0.05em"}}>
              <span>Proyecto</span>{role==="alonso"&&<span>Notaría</span>}<span>Etapa</span><span>Turno</span><span style={{textAlign:"center"}}>Estado</span>
            </div>
            {!filtered.length&&<div style={{padding:36,textAlign:"center",color:"#8a857c",fontSize:13}}>Sin proyectos</div>}
            {filtered.map(p=>{const et=getEt(p.tipo),e=p.step<et.length?et[p.step]:null,info=e?getSt(p,p.step,inhFor(p.notariaId)):{c:"#16a34a",l:"✓"};return(
              <div key={p.id} style={{display:"grid",gridTemplateColumns:role==="alonso"?"2fr 1fr 1.2fr 1fr 70px":"2.5fr 1.2fr 1fr 70px",padding:"10px 16px",borderBottom:"1px solid #e8e5df",cursor:"pointer",alignItems:"center",background:selId===p.id?"#dbeafe":"transparent"}} onClick={()=>setSelId(selId===p.id?null:p.id)} onMouseEnter={ev=>{if(selId!==p.id)ev.currentTarget.style.background="#f8f7f5";}} onMouseLeave={ev=>{if(selId!==p.id)ev.currentTarget.style.background="transparent";}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{p.name}</div><div style={{fontSize:11,color:"#8a857c"}}>{TIPO_L[p.tipo]}{p.respNotaria?` — ${p.respNotaria}`:""}</div></div>
                {role==="alonso"&&<div style={{fontSize:12,color:"#8a857c"}}>{getNotName(p.notariaId)}</div>}
                <div>{p.finished?<Bg bg="#f0fdf4" color="#16a34a">✓ Completado</Bg>:<Bg bg={info.c+"15"} color={info.c}>{e?.label}</Bg>}</div>
                <div>{e&&!p.finished?<OBg o={e.owner}/>:"—"}</div>
                <div style={{textAlign:"center"}}>{p.finished?<Bg bg="#f0fdf4" color="#16a34a">✓</Bg>:<Bg bg={info.c+"15"} color={info.c} style={{fontSize:10}}>{info.l}</Bg>}</div>
              </div>
            );})}
          </div>
        </>}

        {vista==="efectividad"&&<EffPanel ps={ps} inh={inh} inhFor={inhFor} notarias={notarias} filtNot={role==="notaria"?nid:filtNot}/>}
        {vista==="calendario"&&<Cal inh={inh} addInh={addInh} delInh={delInh} notarias={notarias} role={role} nid={nid}/>}
        {vista==="notarias"&&role==="alonso"&&<NotAdmin notarias={notarias} onCreate={createNot} onUpdate={updateNot} onDelete={id=>setCfm({msg:"¿Eliminar esta notaría?",action:()=>deleteNot(id)})}/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEW FORM
// ═══════════════════════════════════════════════════════════════
function NewForm({onCreate,onCancel,notarias}){
  const[f,setF]=useState({nombre:"",tipo:"sin_registro",fecha:td(),notariaId:notarias[0]?.id||""});
  const up=(k,v)=>setF(o=>({...o,[k]:v}));
  return(
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8e5df",padding:22,marginBottom:18}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Nuevo proyecto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Nombre del proyecto</div><input style={iS} value={f.nombre} onChange={e=>up("nombre",e.target.value)} placeholder="Ej: Constitución XYZ SA de CV"/></div>
        <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Notaría</div><select style={iS} value={f.notariaId} onChange={e=>up("notariaId",e.target.value)}>{notarias.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}{!notarias.length&&<option value="">Sin notarías registradas</option>}</select></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Tipo de registro</div><select style={iS} value={f.tipo} onChange={e=>up("tipo",e.target.value)}>{TIPOS.map(t=><option key={t} value={t}>{TIPO_L[t]}</option>)}</select></div>
        <div><div style={{fontSize:11,fontWeight:600,color:"#8a857c",marginBottom:4}}>Fecha de inicio</div><input type="date" style={iS} value={f.fecha} onChange={e=>up("fecha",e.target.value)}/><div style={{fontSize:10,color:"#8a857c",marginTop:4}}>Si es fecha pasada, proyección y envío se completan automáticamente</div></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Bt v="g" onClick={onCancel}>Cancelar</Bt><Bt onClick={()=>{if(f.nombre.trim()&&f.fecha&&f.notariaId)onCreate(f);}} disabled={!f.nombre.trim()||!f.fecha||!f.notariaId}>Crear proyecto</Bt></div>
    </div>
  );
}
