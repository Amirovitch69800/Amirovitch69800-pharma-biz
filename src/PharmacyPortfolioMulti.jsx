import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import './pharmacy-multibrand.css';

const RELATION_STATUSES = ['prospect','contacted','interested','active','inactive','lost'];
const SEGMENTS = ['Prioritaires','Secondaires','Non Prioritaires'];

function fmtDate(v){return v?new Intl.DateTimeFormat('fr-FR').format(new Date(v)):'—';}
function fmtMoney(v){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v||0));}
function statusLabel(v){return ({prospect:'Prospect',contacted:'Contactée',interested:'Intéressée',active:'Client actif',inactive:'Inactive',lost:'Perdue'})[v]||v;}
function relationFor(relations,pharmacyId,brandId){return relations.find(r=>r.pharmacy_id===pharmacyId&&r.brand_id===brandId);}

export default function PharmacyPortfolioMulti({state,reload}){
  const [relations,setRelations]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [brandFilter,setBrandFilter]=useState('all');
  const [selectedId,setSelectedId]=useState(null);
  const [selectedBrandId,setSelectedBrandId]=useState('');
  const [notice,setNotice]=useState('');

  async function loadRelations(){
    setLoading(true);
    const {data,error}=await supabase.from('pharmacy_brand_relations').select('*').order('updated_at',{ascending:false});
    setLoading(false);
    if(error){setNotice(error.message);return;}
    setRelations(data||[]);
  }
  useEffect(()=>{loadRelations();},[]);

  const pharmacies=state.pharmacies||[];
  const brands=state.brands||[];
  const selected=pharmacies.find(p=>p.id===selectedId)||null;
  const selectedRelations=selected?relations.filter(r=>r.pharmacy_id===selected.id):[];
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return pharmacies.filter(p=>{
      const matchText=!q||[p.name,p.city,p.postal_code,p.groupement,p.contact_name,p.titular_name].filter(Boolean).join(' ').toLowerCase().includes(q);
      const matchBrand=brandFilter==='all'||relations.some(r=>r.pharmacy_id===p.id&&r.brand_id===brandFilter);
      return matchText&&matchBrand;
    }).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  },[pharmacies,relations,search,brandFilter]);

  const brandCounts=useMemo(()=>brands.map(b=>({brand:b,count:new Set(relations.filter(r=>r.brand_id===b.id).map(r=>r.pharmacy_id)).size})),[brands,relations]);

  async function addBrand(pharmacyId,brandId){
    if(!brandId)return;
    const existing=relationFor(relations,pharmacyId,brandId);
    if(existing){setSelectedBrandId(brandId);return;}
    const {error}=await supabase.from('pharmacy_brand_relations').insert({
      pharmacy_id:pharmacyId,brand_id:brandId,agent_id:state.agent?.id||null,
      status:'prospect',segment:null,potential:'medium',created_by:state.profile?.id||null
    });
    if(error){setNotice(error.message);return;}
    setNotice('Marque ajoutée au compte pharmacie.');
    setSelectedBrandId(brandId);
    await loadRelations();
  }

  async function updateRelation(id,patch){
    const {error}=await supabase.from('pharmacy_brand_relations').update(patch).eq('id',id);
    if(error){setNotice(error.message);return;}
    await loadRelations();
  }

  async function createFollowUp(pharmacy,relation){
    const brand=brands.find(b=>b.id===relation.brand_id);
    const dueAt=new Date(Date.now()+3*86400000).toISOString();
    const {error}=await supabase.from('follow_up_tasks').insert({
      agent_id:state.agent?.id||null,pharmacy_id:pharmacy.id,brand_id:relation.brand_id,
      title:`Relance ${brand?.name||'marque'} — ${pharmacy.name}`,
      reason:'Relance créée depuis la fiche multimarques.',due_at:dueAt,
      priority:relation.potential==='priority'?'high':'medium',status:'todo',created_by:state.profile?.id||null
    });
    if(error){setNotice(error.message);return;}
    await updateRelation(relation.id,{next_action_at:dueAt});
    setNotice('Relance créée.');
    await reload();
  }

  const activeRelation=selectedRelations.find(r=>r.brand_id===selectedBrandId)||selectedRelations[0]||null;
  const activeBrand=activeRelation?brands.find(b=>b.id===activeRelation.brand_id):null;
  const openTasks=activeRelation?(state.followUps||[]).filter(t=>t.pharmacy_id===selected?.id&&t.brand_id===activeRelation.brand_id&&t.status==='todo'):[];

  return <div className="mb-page">
    <header className="mb-header"><div><h2>Comptes pharmacies</h2><p>Un compte officine, plusieurs marques, plusieurs pipelines.</p></div><strong>{pharmacies.length} comptes</strong></header>
    {notice&&<div className="mb-notice">{notice}</div>}
    <div className="mb-brand-tabs">
      <button className={brandFilter==='all'?'active':''} onClick={()=>setBrandFilter('all')}>Toutes <b>{pharmacies.length}</b></button>
      {brandCounts.map(({brand,count})=><button key={brand.id} className={brandFilter===brand.id?'active':''} onClick={()=>setBrandFilter(brand.id)}>{brand.name} <b>{count}</b></button>)}
    </div>
    <div className="mb-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher une pharmacie, une ville, un groupement…"/><span>{filtered.length} résultat(s)</span></div>
    <div className={selected?'mb-layout open':'mb-layout'}>
      <section className="mb-list">
        {loading?<p>Chargement…</p>:<table><thead><tr><th>Pharmacie</th><th>Ville</th><th>Marques actives</th><th>Prochaine action</th></tr></thead><tbody>
          {filtered.map(p=>{const rels=relations.filter(r=>r.pharmacy_id===p.id);const next=rels.map(r=>r.next_action_at).filter(Boolean).sort()[0];return <tr key={p.id} onClick={()=>{setSelectedId(p.id);setSelectedBrandId(rels[0]?.brand_id||'');}} className={selectedId===p.id?'selected':''}>
            <td><strong>{p.name}</strong><small>{p.groupement||'Sans groupement'}</small></td><td>{p.city||'—'}</td>
            <td><div className="mb-brand-pills">{rels.map(r=>{const b=brands.find(x=>x.id===r.brand_id);return <span key={r.id} className={`st-${r.status}`}>{b?.name||'Marque'}</span>})}</div></td>
            <td>{fmtDate(next)}</td>
          </tr>})}
        </tbody></table>}
      </section>
      {selected&&<aside className="mb-detail">
        <button className="mb-close" onClick={()=>setSelectedId(null)}>×</button>
        <h3>{selected.name}</h3><p>{[selected.address_line1,selected.postal_code,selected.city].filter(Boolean).join(' · ')||'Adresse non renseignée'}</p>
        <div className="mb-contact"><span>{selected.contact_name||selected.titular_name||'Contact non renseigné'}</span><span>{selected.phone||selected.email||'Aucune coordonnée'}</span></div>
        <div className="mb-relation-tabs">
          {selectedRelations.map(r=>{const b=brands.find(x=>x.id===r.brand_id);return <button key={r.id} className={activeRelation?.id===r.id?'active':''} onClick={()=>setSelectedBrandId(r.brand_id)}>{b?.name}</button>})}
          <select value="" onChange={e=>addBrand(selected.id,e.target.value)}><option value="">+ Ajouter une marque</option>{brands.filter(b=>!selectedRelations.some(r=>r.brand_id===b.id)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </div>
        {activeRelation?<div className="mb-relation-card">
          <div className="mb-relation-title"><div><span>Relation commerciale</span><h4>{activeBrand?.name}</h4></div><button onClick={()=>createFollowUp(selected,activeRelation)}>Créer une relance</button></div>
          <label>Statut<select value={activeRelation.status} onChange={e=>updateRelation(activeRelation.id,{status:e.target.value})}>{RELATION_STATUSES.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
          <label>Segment<input value={activeRelation.segment||''} onChange={e=>updateRelation(activeRelation.id,{segment:e.target.value||null})} placeholder="Ex : Ambassadeur, Premium, À développer"/></label>
          <div className="mb-metrics"><div><span>CA annuel</span><strong>{fmtMoney(activeRelation.annual_revenue_ht)}</strong></div><div><span>Dernière commande</span><strong>{fmtDate(activeRelation.last_order_at)}</strong></div><div><span>Prochaine action</span><strong>{fmtDate(activeRelation.next_action_at)}</strong></div></div>
          <label>Notes marque<textarea value={activeRelation.notes||''} onChange={e=>updateRelation(activeRelation.id,{notes:e.target.value||null})} placeholder={`Notes spécifiques ${activeBrand?.name||''}`}/></label>
          <div className="mb-tasks"><span>Actions ouvertes</span>{openTasks.length?openTasks.map(t=><div key={t.id}><strong>{t.title}</strong><small>{fmtDate(t.due_at)}</small></div>):<p>Aucune action ouverte pour cette marque.</p>}</div>
        </div>:<p>Aucune marque rattachée à ce compte.</p>}
      </aside>}
    </div>
  </div>;
}
