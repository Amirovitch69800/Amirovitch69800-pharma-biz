import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import './field-missions.css';

const STATUS = {
  draft: 'Brouillon', proposed: 'Proposée', assigned: 'Affectée', accepted: 'Acceptée',
  completed: 'Réalisée', validated: 'Validée', cancelled: 'Annulée'
};
const money = (v) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v||0));
const fmt = (v) => v ? new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)) : '—';

export default function FieldMissions({ state }) {
  const [animators,setAnimators]=useState([]);
  const [missions,setMissions]=useState([]);
  const [tab,setTab]=useState('missions');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [animatorForm,setAnimatorForm]=useState({full_name:'',email:'',phone:'',zones:'',daily_rate_ht:''});
  const [missionForm,setMissionForm]=useState({title:'',mission_type:'animation',pharmacy_id:'',brand_id:'',animator_id:'',starts_at:'',ends_at:'',fee_ht:'',objective:'',brief:''});

  async function load(){
    setLoading(true); setNotice('');
    const [a,m]=await Promise.all([
      supabase.from('field_animators').select('*').order('full_name'),
      supabase.from('field_missions').select('*, field_animators(full_name), pharmacies(name,city), brands(name)').order('starts_at',{ascending:false})
    ]);
    const errors=[a.error,m.error].filter(Boolean);
    if(errors.length) setNotice('Le module nécessite la migration Supabase field_missions_v1.sql. '+errors.map(e=>e.message).join(' | '));
    setAnimators(a.data||[]); setMissions(m.data||[]); setLoading(false);
  }
  useEffect(()=>{load();},[]);

  async function createAnimator(e){
    e.preventDefault();
    const payload={...animatorForm,daily_rate_ht:Number(animatorForm.daily_rate_ht||0),zones:animatorForm.zones.split(',').map(x=>x.trim()).filter(Boolean),status:'active',created_by:state.profile?.id||null};
    const {error}=await supabase.from('field_animators').insert(payload);
    if(error) return setNotice(error.message);
    setAnimatorForm({full_name:'',email:'',phone:'',zones:'',daily_rate_ht:''}); load();
  }

  async function createMission(e){
    e.preventDefault();
    const payload={
      ...missionForm,
      pharmacy_id:missionForm.pharmacy_id||null, brand_id:missionForm.brand_id||null,
      animator_id:missionForm.animator_id||null, fee_ht:Number(missionForm.fee_ht||0),
      starts_at:missionForm.starts_at?new Date(missionForm.starts_at).toISOString():null,
      ends_at:missionForm.ends_at?new Date(missionForm.ends_at).toISOString():null,
      status:missionForm.animator_id?'assigned':'draft', created_by:state.profile?.id||null
    };
    const {error}=await supabase.from('field_missions').insert(payload);
    if(error) return setNotice(error.message);
    setMissionForm({title:'',mission_type:'animation',pharmacy_id:'',brand_id:'',animator_id:'',starts_at:'',ends_at:'',fee_ht:'',objective:'',brief:''}); load();
  }

  async function setStatus(id,status){
    const patch={status};
    if(status==='completed') patch.completed_at=new Date().toISOString();
    if(status==='validated') patch.validated_at=new Date().toISOString();
    const {error}=await supabase.from('field_missions').update(patch).eq('id',id);
    if(error) setNotice(error.message); else load();
  }

  async function saveReport(id,units_sold,revenue_ht,report){
    const {error}=await supabase.from('field_missions').update({units_sold:Number(units_sold||0),revenue_ht:Number(revenue_ht||0),report,status:'completed',completed_at:new Date().toISOString()}).eq('id',id);
    if(error) setNotice(error.message); else load();
  }

  const stats=useMemo(()=>({
    upcoming:missions.filter(m=>['assigned','accepted'].includes(m.status)).length,
    completed:missions.filter(m=>['completed','validated'].includes(m.status)).length,
    fees:missions.filter(m=>m.status==='validated').reduce((s,m)=>s+Number(m.fee_ht||0),0),
    revenue:missions.reduce((s,m)=>s+Number(m.revenue_ht||0),0)
  }),[missions]);

  return <div className="fm-page">
    <div className="v2-page-head"><div><h2>Réseau terrain</h2><p>Anime, affecte et mesure chaque mission en pharmacie.</p></div><button className="v2-secondary" onClick={load}>Actualiser</button></div>
    {notice&&<div className="v2-error">{notice}</div>}
    <section className="v2-stats">
      <div className="v2-stat"><span>Animateurs actifs</span><strong>{animators.filter(a=>a.status==='active').length}</strong><small>réseau disponible</small></div>
      <div className="v2-stat"><span>Missions à venir</span><strong>{stats.upcoming}</strong><small>affectées / acceptées</small></div>
      <div className="v2-stat"><span>Missions réalisées</span><strong>{stats.completed}</strong><small>terminées / validées</small></div>
      <div className="v2-stat"><span>CA sell-out déclaré</span><strong>{money(stats.revenue)}</strong><small>{money(stats.fees)} à payer</small></div>
    </section>
    <div className="v2-activity-tabs"><button className={tab==='missions'?'active':''} onClick={()=>setTab('missions')}>Missions</button><button className={tab==='animators'?'active':''} onClick={()=>setTab('animators')}>Animateurs</button></div>
    {loading?<div className="v2-loading">Chargement…</div>:tab==='missions'?<>
      <form className="v2-panel fm-form" onSubmit={createMission}>
        <h3>Créer une mission</h3>
        <div className="fm-fields">
          <input required placeholder="Titre de la mission" value={missionForm.title} onChange={e=>setMissionForm({...missionForm,title:e.target.value})}/>
          <select value={missionForm.mission_type} onChange={e=>setMissionForm({...missionForm,mission_type:e.target.value})}><option value="animation">Animation</option><option value="formation">Formation</option><option value="merchandising">Merchandising</option><option value="audit">Audit rayon</option></select>
          <select required value={missionForm.pharmacy_id} onChange={e=>setMissionForm({...missionForm,pharmacy_id:e.target.value})}><option value="">Pharmacie</option>{state.pharmacies.map(p=><option key={p.id} value={p.id}>{p.name} — {p.city}</option>)}</select>
          <select required value={missionForm.brand_id} onChange={e=>setMissionForm({...missionForm,brand_id:e.target.value})}><option value="">Marque</option>{state.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select value={missionForm.animator_id} onChange={e=>setMissionForm({...missionForm,animator_id:e.target.value})}><option value="">À affecter plus tard</option>{animators.filter(a=>a.status==='active').map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}</select>
          <input type="datetime-local" required value={missionForm.starts_at} onChange={e=>setMissionForm({...missionForm,starts_at:e.target.value})}/>
          <input type="datetime-local" value={missionForm.ends_at} onChange={e=>setMissionForm({...missionForm,ends_at:e.target.value})}/>
          <input type="number" min="0" step="0.01" placeholder="Rémunération HT" value={missionForm.fee_ht} onChange={e=>setMissionForm({...missionForm,fee_ht:e.target.value})}/>
          <input placeholder="Objectif (ex : 25 ventes)" value={missionForm.objective} onChange={e=>setMissionForm({...missionForm,objective:e.target.value})}/>
          <textarea placeholder="Brief de mission" value={missionForm.brief} onChange={e=>setMissionForm({...missionForm,brief:e.target.value})}/>
        </div><button className="v2-primary">Créer la mission</button>
      </form>
      <div className="fm-cards">{missions.map(m=><MissionCard key={m.id} mission={m} onStatus={setStatus} onReport={saveReport}/>)}</div>
    </>:<>
      <form className="v2-panel fm-form" onSubmit={createAnimator}><h3>Ajouter un animateur indépendant</h3><div className="fm-fields">
        <input required placeholder="Nom complet" value={animatorForm.full_name} onChange={e=>setAnimatorForm({...animatorForm,full_name:e.target.value})}/>
        <input type="email" placeholder="E-mail" value={animatorForm.email} onChange={e=>setAnimatorForm({...animatorForm,email:e.target.value})}/>
        <input placeholder="Téléphone" value={animatorForm.phone} onChange={e=>setAnimatorForm({...animatorForm,phone:e.target.value})}/>
        <input placeholder="Zones : 13, 84, Marseille" value={animatorForm.zones} onChange={e=>setAnimatorForm({...animatorForm,zones:e.target.value})}/>
        <input type="number" min="0" step="0.01" placeholder="Tarif jour HT" value={animatorForm.daily_rate_ht} onChange={e=>setAnimatorForm({...animatorForm,daily_rate_ht:e.target.value})}/>
      </div><button className="v2-primary">Ajouter au réseau</button></form>
      <div className="fm-animators">{animators.map(a=><article className="v2-panel" key={a.id}><div><strong>{a.full_name}</strong><span>{a.email||a.phone||'Coordonnées à compléter'}</span></div><p>{(a.zones||[]).join(' · ')||'Zone non renseignée'}</p><div><span className="v2-pill green">{a.status}</span><b>{money(a.daily_rate_ht)}/jour</b></div></article>)}</div>
    </>}
  </div>;
}

function MissionCard({mission,onStatus,onReport}){
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({units_sold:mission.units_sold||'',revenue_ht:mission.revenue_ht||'',report:mission.report||''});
  return <article className="v2-panel fm-mission">
    <header><div><span>{mission.brands?.name||'Sans marque'} · {mission.mission_type}</span><h3>{mission.title}</h3><p>{mission.pharmacies?.name||'Pharmacie'} · {mission.pharmacies?.city||''}</p></div><span className={`v2-pill fm-${mission.status}`}>{STATUS[mission.status]||mission.status}</span></header>
    <div className="fm-meta"><span><b>Date</b>{fmt(mission.starts_at)}</span><span><b>Animateur</b>{mission.field_animators?.full_name||'Non affecté'}</span><span><b>Rémunération</b>{money(mission.fee_ht)}</span><span><b>Résultat</b>{mission.units_sold||0} ventes · {money(mission.revenue_ht)}</span></div>
    {mission.objective&&<p className="fm-objective"><b>Objectif :</b> {mission.objective}</p>}
    {editing?<div className="fm-report"><input type="number" placeholder="Unités vendues" value={form.units_sold} onChange={e=>setForm({...form,units_sold:e.target.value})}/><input type="number" step="0.01" placeholder="CA réalisé HT" value={form.revenue_ht} onChange={e=>setForm({...form,revenue_ht:e.target.value})}/><textarea placeholder="Compte rendu" value={form.report} onChange={e=>setForm({...form,report:e.target.value})}/><button className="v2-primary" onClick={()=>{onReport(mission.id,form.units_sold,form.revenue_ht,form.report);setEditing(false)}}>Enregistrer le compte rendu</button></div>:mission.report&&<p className="fm-report-text">{mission.report}</p>}
    <footer>{['assigned','accepted'].includes(mission.status)&&<button className="v2-secondary" onClick={()=>setEditing(true)}>Saisir les résultats</button>}{mission.status==='assigned'&&<button className="v2-secondary" onClick={()=>onStatus(mission.id,'accepted')}>Marquer acceptée</button>}{mission.status==='completed'&&<button className="v2-primary" onClick={()=>onStatus(mission.id,'validated')}>Valider la mission</button>}</footer>
  </article>;
}
