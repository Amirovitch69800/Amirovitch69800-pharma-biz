import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase.js';
import PharmacyPortfolio from './PharmacyPortfolioMulti.jsx';
import './app-v2.css';

const NAV = [
  ['dashboard', 'Dashboard'],
  ['accounts', 'Comptes'],
  ['activities', 'Activités'],
  ['orders', 'Commandes'],
  ['commissions', 'Commissions'],
  ['brands', 'Marques'],
  ['assistant', 'Assistant IA'],
  ['settings', 'Paramètres'],
];

const money = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
const date = (v) => v ? new Intl.DateTimeFormat('fr-FR').format(new Date(v)) : '—';
const label = (v) => String(v || '').replaceAll('_', ' ');

function Auth() {
  const [email, setEmail] = useState('amir.ounissi69@gmail.com');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault();
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }
  return <main className="v2-auth"><section className="v2-auth-card"><div className="v2-logo"><div className="v2-logo-mark">PB</div><span>PharmaBiz</span></div><h1>Connexion</h1><p>CRM terrain multimarques pour la pharmacie.</p><form className="v2-form" onSubmit={submit}><label className="v2-field"><span>Email</span><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label><label className="v2-field"><span>Mot de passe</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} /></label><button className="v2-primary">Se connecter</button>{message && <div className="v2-error">{message}</div>}</form></section></main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  if (booting) return <div className="v2-loading">Chargement…</div>;
  return session ? <Workspace session={session} /> : <Auth />;
}

function Workspace({ session }) {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [state, setState] = useState({ profile:null, agent:null, brands:[], pharmacies:[], relations:[], orders:[], commissions:[], followUps:[], appointments:[], whatsappMessages:[], aiActions:[] });

  async function load() {
    setLoading(true); setNotice('');
    const userId = session.user.id;
    const calls = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('agents').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('brands').select('*').order('name'),
      supabase.from('pharmacies').select('*').order('name'),
      supabase.from('pharmacy_brand_relations').select('*, brands(name), pharmacies(name, city)').order('updated_at', { ascending:false }),
      supabase.from('v_orders_summary').select('*').order('created_at', { ascending:false }),
      supabase.from('commissions').select('*, brands(name), orders(order_number), pharmacies(name)').order('created_at', { ascending:false }),
      supabase.from('follow_up_tasks').select('*, pharmacies(name), brands(name)').order('due_at', { ascending:true }),
      supabase.from('appointment_requests').select('*, pharmacies(name), brands(name)').order('created_at', { ascending:false }),
      supabase.from('whatsapp_messages').select('*').order('created_at', { ascending:false }).limit(20),
      supabase.from('ai_actions').select('*, pharmacies(name), brands(name)').order('created_at', { ascending:false }).limit(20),
    ]);
    const errors = calls.map(r=>r.error).filter(Boolean);
    if (errors.length) setNotice(errors.map(e=>e.message).join(' | '));
    setState({ profile:calls[0].data, agent:calls[1].data, brands:calls[2].data||[], pharmacies:calls[3].data||[], relations:calls[4].data||[], orders:calls[5].data||[], commissions:calls[6].data||[], followUps:calls[7].data||[], appointments:calls[8].data||[], whatsappMessages:calls[9].data||[], aiActions:calls[10].data||[] });
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);
  const title = NAV.find(([k])=>k===tab)?.[1] || 'PharmaBiz';
  return <main className="v2-shell"><aside className="v2-sidebar"><div className="v2-logo"><div className="v2-logo-mark">PB</div><span>PharmaBiz</span></div><nav className="v2-nav">{NAV.map(([key,text])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{text}</button>)}</nav><div className="v2-sidebar-foot"><strong>{state.profile?.full_name || session.user.email}</strong><span>{state.agent?.display_name || 'Agent commercial'}</span><button className="v2-secondary" onClick={()=>supabase.auth.signOut()}>Déconnexion</button></div></aside><section className="v2-main"><header className="v2-topbar"><h1>{title}</h1><div className="v2-topbar-actions"><button className="v2-secondary" onClick={load}>Rafraîchir</button><button className="v2-primary" onClick={()=>setTab('activities')}>+ Ajouter</button></div></header><div className="v2-content">{notice && <div className="v2-error">{notice}</div>}{loading ? <div className="v2-loading">Chargement des données…</div> : <Screen tab={tab} state={state} reload={load} />}</div></section></main>;
}

function Screen({ tab, state, reload }) {
  if (tab === 'dashboard') return <Dashboard state={state} />;
  if (tab === 'accounts') return <PharmacyPortfolio state={state} reload={reload} />;
  if (tab === 'activities') return <Activities state={state} reload={reload} />;
  if (tab === 'orders') return <Orders state={state} />;
  if (tab === 'commissions') return <Commissions state={state} />;
  if (tab === 'brands') return <Brands state={state} />;
  if (tab === 'assistant') return <Assistant state={state} />;
  return <Settings state={state} />;
}

function Dashboard({ state }) {
  const openTasks = state.followUps.filter(t=>t.status==='todo');
  const overdue = openTasks.filter(t=>t.due_at && new Date(t.due_at)<new Date());
  const today = openTasks.filter(t=>t.due_at && new Date(t.due_at).toDateString()===new Date().toDateString());
  const dueCom = state.commissions.filter(c=>['approved','to_invoice','estimated'].includes(c.status)).reduce((s,c)=>s+Number(c.amount_ht||0),0);
  const revenue = state.orders.reduce((s,o)=>s+Number(o.total_after_discount_ht||0),0);
  const brandStats = state.brands.map(b=>({ brand:b, relations:state.relations.filter(r=>r.brand_id===b.id), tasks:openTasks.filter(t=>t.brand_id===b.id) }));
  return <div><div className="v2-page-head"><div><h2>Aujourd’hui</h2><p>Ce qui demande ton attention maintenant.</p></div></div><section className="v2-stats"><div className="v2-stat"><span>Tâches ouvertes</span><strong>{openTasks.length}</strong><small>{today.length} aujourd’hui</small></div><div className="v2-stat"><span>En retard</span><strong>{overdue.length}</strong><small>à traiter en priorité</small></div><div className="v2-stat"><span>CA suivi</span><strong>{money(revenue)}</strong><small>{state.orders.length} commandes</small></div><div className="v2-stat"><span>Commissions à traiter</span><strong>{money(dueCom)}</strong><small>estimées / à facturer</small></div></section><div className="v2-grid"><section className="v2-panel"><div className="v2-panel-head"><h3>À faire</h3><span className="v2-pill">{openTasks.length}</span></div>{openTasks.length?<div className="v2-list">{openTasks.slice(0,8).map(t=><div className="v2-row" key={t.id}><div><strong>{t.title}</strong><span>{t.pharmacies?.name || 'Compte'} · {t.brands?.name || 'Sans marque'} · {date(t.due_at)}</span></div><span className={t.due_at&&new Date(t.due_at)<new Date()?'v2-pill red':'v2-pill'}>{label(t.priority)}</span></div>)}</div>:<div className="v2-empty">Aucune tâche ouverte.</div>}</section><section className="v2-panel"><div className="v2-panel-head"><h3>Portefeuille par marque</h3></div><div className="v2-list">{brandStats.map(({brand,relations,tasks})=><div className="v2-row" key={brand.id}><div><strong>{brand.name}</strong><span>{relations.length} comptes · {tasks.length} actions ouvertes</span></div><span className="v2-pill green">Actif</span></div>)}</div></section></div></div>;
}

function Activities({ state, reload }) {
  const [filter,setFilter]=useState('open');
  const [form,setForm]=useState({ pharmacy_id:'', brand_id:'', title:'', due_at:'', priority:'medium' });
  const rows=state.followUps.filter(t=>filter==='all'||(filter==='open'&&t.status==='todo')||(filter==='late'&&t.status==='todo'&&t.due_at&&new Date(t.due_at)<new Date())||(filter==='done'&&t.status==='done'));
  async function submit(e){e.preventDefault();if(!state.agent?.id)return;const{error}=await supabase.from('follow_up_tasks').insert({agent_id:state.agent.id,pharmacy_id:form.pharmacy_id||null,brand_id:form.brand_id||null,title:form.title,due_at:form.due_at?new Date(form.due_at).toISOString():null,priority:form.priority,status:'todo',created_by:state.profile?.id||null});if(error)return alert(error.message);setForm({pharmacy_id:'',brand_id:'',title:'',due_at:'',priority:'medium'});reload();}
  async function done(id){await supabase.from('follow_up_tasks').update({status:'done'}).eq('id',id);reload();}
  return <div><div className="v2-page-head"><div><h2>Activités</h2><p>Tâches, relances et rendez-vous à exécuter.</p></div></div><form className="v2-panel" onSubmit={submit} style={{padding:18,marginBottom:18}}><div className="v2-toolbar"><input placeholder="Nouvelle tâche" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/><select value={form.pharmacy_id} onChange={e=>setForm({...form,pharmacy_id:e.target.value})}><option value="">Compte</option>{state.pharmacies.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={form.brand_id} onChange={e=>setForm({...form,brand_id:e.target.value})}><option value="">Marque</option>{state.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><input type="datetime-local" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})}/></div><button className="v2-primary">Créer la tâche</button></form><div className="v2-activity-tabs">{[['open','Ouvertes'],['late','En retard'],['done','Terminées'],['all','Toutes']].map(([k,t])=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{t}</button>)}</div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Tâche</th><th>Compte</th><th>Marque</th><th>Échéance</th><th>Priorité</th><th></th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td><strong>{t.title}</strong><small>{t.reason||''}</small></td><td>{t.pharmacies?.name||'—'}</td><td>{t.brands?.name||'—'}</td><td>{date(t.due_at)}</td><td><span className="v2-pill">{label(t.priority)}</span></td><td>{t.status==='todo'&&<button className="v2-secondary" onClick={()=>done(t.id)}>Terminer</button>}</td></tr>)}</tbody></table></div></div>;
}

function Orders({ state }) { return <div><div className="v2-page-head"><div><h2>Commandes</h2><p>Suivi consolidé par pharmacie et par marque.</p></div></div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>N°</th><th>Pharmacie</th><th>Marque</th><th>Type</th><th>Montant HT</th><th>Statut</th><th>Date</th></tr></thead><tbody>{state.orders.map(o=><tr key={o.id||o.order_number}><td>{o.order_number||'—'}</td><td>{o.pharmacy_name||'—'}</td><td>{o.brand_name||'—'}</td><td>{label(o.order_type)}</td><td>{money(o.total_after_discount_ht)}</td><td><span className="v2-pill">{label(o.status)}</span></td><td>{date(o.created_at||o.order_date)}</td></tr>)}</tbody></table></div></div>; }

function Commissions({ state }) { const total=state.commissions.reduce((s,c)=>s+Number(c.amount_ht||0),0); const paid=state.commissions.filter(c=>c.status==='paid').reduce((s,c)=>s+Number(c.amount_ht||0),0); return <div><div className="v2-page-head"><div><h2>Commissions</h2><p>Montants estimés, facturés et payés.</p></div></div><section className="v2-stats"><div className="v2-stat"><span>Total enregistré</span><strong>{money(total)}</strong><small>{state.commissions.length} lignes</small></div><div className="v2-stat"><span>Payé</span><strong>{money(paid)}</strong><small>encaissé</small></div><div className="v2-stat"><span>Restant</span><strong>{money(total-paid)}</strong><small>à valider / facturer</small></div><div className="v2-stat"><span>Marques</span><strong>{new Set(state.commissions.map(c=>c.brand_id)).size}</strong><small>concernées</small></div></section><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Marque</th><th>Pharmacie</th><th>Commande</th><th>Montant</th><th>Statut</th></tr></thead><tbody>{state.commissions.map(c=><tr key={c.id}><td>{c.brands?.name||'—'}</td><td>{c.pharmacies?.name||'—'}</td><td>{c.orders?.order_number||'—'}</td><td>{money(c.amount_ht)}</td><td><span className="v2-pill">{label(c.status)}</span></td></tr>)}</tbody></table></div></div>; }

function Brands({ state }) { return <div><div className="v2-page-head"><div><h2>Marques</h2><p>Lecture du portefeuille et du pipeline par laboratoire.</p></div></div><div className="v2-brand-blocks">{state.brands.map(b=>{const rel=state.relations.filter(r=>r.brand_id===b.id);const clients=rel.filter(r=>['client_active','implanted','active'].includes(r.status)).length;const prospects=rel.filter(r=>['prospect','interested'].includes(r.status)).length;const orders=state.orders.filter(o=>o.brand_id===b.id);return <section className="v2-brand-card" key={b.id}><h3>{b.name}</h3><p>{rel.length} comptes rattachés</p><div className="v2-brand-metrics"><div><span>Clients</span><strong>{clients}</strong></div><div><span>Prospects</span><strong>{prospects}</strong></div><div><span>Commandes</span><strong>{orders.length}</strong></div></div></section>})}</div></div>; }

function Assistant({ state }) { return <div><div className="v2-page-head"><div><h2>Assistant IA</h2><p>Dernières actions créées depuis WhatsApp et les notes terrain.</p></div></div><div className="v2-grid"><section className="v2-panel"><div className="v2-panel-head"><h3>Actions IA</h3></div><div className="v2-list">{state.aiActions.map(a=><div className="v2-row" key={a.id}><div><strong>{a.output?.subject||label(a.action_type)}</strong><span>{a.pharmacies?.name||'Sans compte'} · {a.brands?.name||'Sans marque'}</span></div><span className="v2-pill">{label(a.status)}</span></div>)}</div></section><section className="v2-panel"><div className="v2-panel-head"><h3>WhatsApp</h3></div><div className="v2-list">{state.whatsappMessages.slice(0,8).map(m=><div className="v2-row" key={m.id}><div><strong>{m.media_transcription||m.body||'Message sans texte'}</strong><span>{date(m.created_at)}</span></div><span className="v2-pill">{label(m.ai_action_status)}</span></div>)}</div></section></div></div>; }

function Settings({ state }) { return <div><div className="v2-page-head"><div><h2>Paramètres</h2><p>Configuration du compte et état des connexions.</p></div></div><section className="v2-panel"><div className="v2-row"><div><strong>Compte agent</strong><span>{state.agent?.display_name||'Non configuré'}</span></div><span className="v2-pill green">Actif</span></div><div className="v2-row"><div><strong>Supabase</strong><span>Données synchronisées</span></div><span className="v2-pill green">Connecté</span></div><div className="v2-row"><div><strong>WhatsApp IA</strong><span>Transcription et analyse disponibles</span></div><span className="v2-pill green">Connecté</span></div></section></div>; }

createRoot(document.getElementById('root')).render(<App />);
