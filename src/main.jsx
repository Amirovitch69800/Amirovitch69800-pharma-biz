import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase.js';
import './styles.css';
import PharmacyPortfolio from './PharmacyPortfolioMulti.jsx';

const REPO_URL = 'https://amirovitch69800-pharma-biz.vercel.app';
const WEBHOOK_BASE = 'https://mfgstfazcrpvwxydczrd.functions.supabase.co/twilio-whatsapp-webhook';
const PHARMACY_STATUSES = ['prospect', 'contacted', 'interested', 'implanted', 'reassort_needed', 'inactive', 'lost'];
const POTENTIALS = ['low', 'medium', 'high', 'priority'];
const AI_TYPES = ['email', 'appointment', 'meeting_note', 'follow_up'];

function money(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v || 0)); }
function date(v) { return v ? new Intl.DateTimeFormat('fr-FR').format(new Date(v)) : '—'; }
function label(v) { return String(v || '').replaceAll('_', ' '); }
function badgeClass(v) {
  if (['implanted', 'confirmed', 'delivered', 'paid', 'done', 'active', 'priority', 'processed'].includes(v)) return 'badge good';
  if (['lost', 'cancelled', 'overdue', 'inactive', 'error'].includes(v)) return 'badge bad';
  if (['draft', 'todo', 'medium', 'prospect', 'pending', 'sandbox'].includes(v)) return 'badge neutral';
  return 'badge warn';
}
function getBrand(state, id) { return state.brands.find((b) => b.id === id); }
function vkBrand(state) { return state.brands.find((b) => /vk swiss/i.test(b.name)); }
function todayIso() { return new Date().toISOString().slice(0, 10); }

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Select({ value, onChange, options = [], placeholder }) {
  return <select value={value || ''} onChange={(e) => onChange(e.target.value)}>{placeholder && <option value="">{placeholder}</option>}{options.map((o) => <option key={o.value || o} value={o.value || o}>{o.label || label(o)}</option>)}</select>;
}
function Card({ title, action, children, className = '' }) { return <section className={`card ${className}`}><div className="card-head"><h2>{title}</h2>{action}</div>{children}</section>; }
function Empty({ title, text, cta }) { return <div className="empty"><strong>{title}</strong><span>{text}</span>{cta}</div>; }
function Kpi({ label, value, hint }) { return <div className="kpi"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }

function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('amir.ounissi69@gmail.com');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('Amir Ounissi');
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault(); setMessage('');
    const payload = { email, password };
    const { error } = mode === 'signup'
      ? await supabase.auth.signUp({ ...payload, options: { data: { full_name: fullName } } })
      : await supabase.auth.signInWithPassword(payload);
    setMessage(error ? error.message : mode === 'signup' ? 'Compte créé. Connecte-toi après confirmation email si nécessaire.' : 'Connexion réussie.');
  }
  return <main className="auth-page"><section className="auth-card glass"><div className="brand-mark">PB</div><h1>PharmaBiz</h1><p>Le cockpit commercial pharmacie : relances, rendez-vous, commandes, commissions et WhatsApp IA.</p><div className="auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Connexion</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Créer Agent 001</button></div><form onSubmit={submit} className="stack">{mode === 'signup' && <Field label="Nom"><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></Field>}<Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field><Field label="Mot de passe"><input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field><button className="primary">{mode === 'signup' ? 'Créer mon espace' : 'Entrer dans le cockpit'}</button>{message && <p className="message">{message}</p>}</form></section></main>;
}

function App() {
  const [session, setSession] = useState(null); const [booting, setBooting] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (booting) return <div className="loading">Chargement...</div>;
  return session ? <Workspace session={session} /> : <Auth />;
}

function Workspace({ session }) {
  const [tab, setTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [state, setState] = useState({ profile: null, agent: null, brands: [], pharmacies: [], products: [], orders: [], commissions: [], invoices: [], expenses: [], aiActions: [], emailDrafts: [], appointments: [], meetingNotes: [], followUps: [], whatsappConnections: [], whatsappMessages: [] });

  async function load() {
    setLoading(true); setNotice('');
    const userId = session.user.id;
    const calls = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('agents').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('brands').select('*').order('name'),
      supabase.from('pharmacies').select('*').order('updated_at', { ascending: false }),
      supabase.from('products').select('*, brands(name)').order('name'),
      supabase.from('v_orders_summary').select('*').order('created_at', { ascending: false }),
      supabase.from('commissions').select('*, brands(name), orders(order_number)').order('created_at', { ascending: false }),
      supabase.from('commission_invoices').select('*, brands(name)').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*, brands(name), pharmacies(name)').order('expense_date', { ascending: false }),
      supabase.from('ai_actions').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('email_drafts').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('appointment_requests').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('meeting_notes').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('follow_up_tasks').select('*, pharmacies(name), brands(name)').order('due_at', { ascending: true }),
      supabase.from('whatsapp_connections').select('*').order('created_at', { ascending: false }),
      supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    const errors = calls.map((r) => r.error).filter(Boolean);
    if (errors.length) setNotice(errors.map((e) => e.message).join(' | '));
    setState({ profile: calls[0].data, agent: calls[1].data, brands: calls[2].data || [], pharmacies: calls[3].data || [], products: calls[4].data || [], orders: calls[5].data || [], commissions: calls[6].data || [], invoices: calls[7].data || [], expenses: calls[8].data || [], aiActions: calls[9].data || [], emailDrafts: calls[10].data || [], appointments: calls[11].data || [], meetingNotes: calls[12].data || [], followUps: calls[13].data || [], whatsappConnections: calls[14].data || [], whatsappMessages: calls[15].data || [] });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  const tabs = [['today', 'Aujourd’hui'], ['pharmacies', 'Pharmacies'], ['order', 'Commande rapide'], ['commissions', 'Commissions'], ['ai', 'Actions IA'], ['whatsapp', 'WhatsApp'], ['catalog', 'Catalogue']];
  const title = tabs.find(([k]) => k === tab)?.[1];
  return <main className="app-shell"><aside className="sidebar"><div className="logo"><div className="brand-mark small">PB</div><div><strong>PharmaBiz</strong><span>Agent 001 · terrain</span></div></div><nav>{tabs.map(([key, text]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{text}</button>)}</nav><div className="sidebar-footer"><span>{state.profile?.full_name || session.user.email}</span><button onClick={() => supabase.auth.signOut()}>Déconnexion</button></div></aside><section className="content"><header className="topbar"><div><p className="eyebrow">Cockpit commercial pharmacie</p><h1>{title}</h1><p>{state.agent?.display_name || 'Agent en attente'} · {state.profile?.role || 'profil'}</p></div><button onClick={load}>Rafraîchir</button></header>{notice && <div className="alert">{notice}</div>}{loading ? <div className="loading">Chargement des données...</div> : <Screen tab={tab} state={state} reload={load} />}</section></main>;
}

function Screen({ tab, state, reload }) {
  if (tab === 'today') return <Today state={state} />;
  if (tab === 'pharmacies') return <PharmacyPortfolio state={state} reload={reload} />;
  if (tab === 'order') return <QuickOrder state={state} reload={reload} />;
  if (tab === 'commissions') return <Commissions state={state} />;
  if (tab === 'ai') return <AiActions state={state} reload={reload} />;
  if (tab === 'whatsapp') return <WhatsApp state={state} />;
  return <Catalog state={state} reload={reload} />;
}

function Today({ state }) {
  const revenue = state.orders.reduce((s, o) => s + Number(o.total_after_discount_ht || 0), 0);
  const dueCom = state.commissions.filter((c) => ['approved', 'to_invoice'].includes(c.status)).reduce((s, c) => s + Number(c.amount_ht || 0), 0);
  const todo = state.followUps.filter((f) => f.status === 'todo');
  const wa = state.whatsappMessages.filter((m) => m.ai_action_status === 'processed');
  return <div className="stack"><section className="hero-card"><div><p className="eyebrow">Bonjour Amir</p><h2>Aujourd’hui, ton secteur à piloter.</h2><p>Priorise les relances, transforme tes notes WhatsApp en actions et sécurise tes commissions VK Swiss.</p></div><div className="hero-actions"><span className="badge good">AG-001 actif</span><span className="badge warn">VK Swiss connecté</span></div></section><section className="kpi-grid"><Kpi label="CA suivi" value={money(revenue)} hint={`${state.orders.length} commandes`} /><Kpi label="Commissions à facturer" value={money(dueCom)} hint="validées / à facturer" /><Kpi label="Relances ouvertes" value={todo.length} hint="actions à traiter" /><Kpi label="WhatsApp IA" value={wa.length} hint="messages classés" /></section><div className="grid two"><Card title="À faire aujourd’hui">{todo.length ? <div className="list">{todo.slice(0, 6).map((t) => <div className="list-row" key={t.id}><div><strong>{t.title}</strong><span>{t.reason || 'Relance à effectuer'}</span></div><span className={badgeClass(t.priority)}>{label(t.priority)}</span></div>)}</div> : <Empty title="Aucune relance ouverte" text="Ajoute une relance depuis Actions IA ou depuis WhatsApp." />}</Card><Card title="Derniers messages WhatsApp">{state.whatsappMessages.length ? <MessageList messages={state.whatsappMessages.slice(0, 5)} /> : <Empty title="Aucun message WhatsApp" text="Connecte le sandbox Twilio puis envoie une note terrain à PharmaBiz." />}</Card></div></div>;
}

function Pharmacies({ state, reload }) {
  const [form, setForm] = useState({ name: '', city: '', department: '', groupement: '', potential: 'medium', status: 'prospect', email: '', phone: '', contact_name: '', notes: '' });
  async function submit(e) {
    e.preventDefault();
    if (!state.agent?.id) return alert('Agent non trouvé.');
    const { error } = await supabase.from('pharmacies').insert({ ...form, assigned_agent_id: state.agent.id, created_by: state.profile?.id || null });
    if (error) return alert(error.message);
    setForm({ name: '', city: '', department: '', groupement: '', potential: 'medium', status: 'prospect', email: '', phone: '', contact_name: '', notes: '' }); reload();
  }
  return <div className="stack"><Card title="Nouvelle pharmacie"><form onSubmit={submit} className="form-grid"><Field label="Nom"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field><Field label="Ville"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field><Field label="Département"><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field><Field label="Groupement"><input value={form.groupement} onChange={(e) => setForm({ ...form, groupement: e.target.value })} /></Field><Field label="Potentiel"><Select value={form.potential} onChange={(v) => setForm({ ...form, potential: v })} options={POTENTIALS} /></Field><Field label="Statut"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={PHARMACY_STATUSES} /></Field><Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Téléphone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><button className="primary">Créer la pharmacie</button></form></Card><Card title="Fiches pharmacies en cartes">{state.pharmacies.length ? <div className="card-grid">{state.pharmacies.map((p) => <article className="pharmacy-card" key={p.id}><div><h3>{p.name}</h3><p>{p.city || 'Ville non renseignée'} · {p.groupement || 'Sans groupement'}</p></div><div className="badges"><span className={badgeClass(p.potential)}>{label(p.potential)}</span><span className={badgeClass(p.status)}>{label(p.status)}</span></div><p className="muted">{p.notes || 'Aucune note terrain.'}</p></article>)}</div> : <Empty title="Aucune pharmacie" text="Crée ta première fiche terrain ou importe une base client." />}</Card></div>;
}

function QuickOrder({ state, reload }) {
  const [form, setForm] = useState({ pharmacy_id: '', brand_id: vkBrand(state)?.id || '', order_type: 'implantation', status: 'draft', notes: '' });
  const [lines, setLines] = useState([{ product_id: '', quantity: 1 }]);
  const products = useMemo(() => state.products.filter((p) => !form.brand_id || p.brand_id === form.brand_id), [state.products, form.brand_id]);
  const selectedBrand = getBrand(state, form.brand_id);
  const isVk = /vk swiss/i.test(selectedBrand?.name || '');
  const totals = lines.reduce((acc, l) => { const p = state.products.find((x) => x.id === l.product_id); const q = Number(l.quantity || 0); acc.boxes += q; acc.ht += q * Number(p?.unit_price_ht || 0); return acc; }, { boxes: 0, ht: 0 });
  const freebies = isVk ? totals.boxes >= 24 ? 5 : totals.boxes >= 12 ? 2 : 0 : 0;
  const commission = isVk ? totals.boxes * 2 : 0;
  async function submit(e) {
    e.preventDefault(); if (!state.agent?.id) return alert('Agent non trouvé.');
    const { data: order, error } = await supabase.from('orders').insert({ pharmacy_id: form.pharmacy_id, brand_id: form.brand_id, agent_id: state.agent.id, status: form.status, order_type: form.order_type, order_date: todayIso(), notes: form.notes, created_by: state.profile?.id || null }).select('*').single();
    if (error) return alert(error.message);
    const rows = lines.filter((l) => l.product_id && Number(l.quantity) > 0).map((l) => { const p = state.products.find((x) => x.id === l.product_id); return { order_id: order.id, product_id: p.id, product_name_snapshot: p.name, reference_snapshot: p.reference, quantity: Number(l.quantity), pcb: p.pcb || 1, unit_price_ht: Number(p.unit_price_ht || 0), discount_rate: 0 }; });
    if (rows.length) { const { error: itemError } = await supabase.from('order_items').insert(rows); if (itemError) return alert(itemError.message); }
    if (isVk && commission > 0) await supabase.from('commissions').insert({ order_id: order.id, agent_id: state.agent.id, brand_id: form.brand_id, commission_type: 'fixed', fixed_amount: 2, base_amount_ht: totals.ht, amount_ht: commission, status: 'estimated' });
    setLines([{ product_id: '', quantity: 1 }]); reload();
  }
  return <div className="grid two"><Card title="Tunnel de commande rapide"><form onSubmit={submit} className="stack"><div className="form-grid"><Field label="Pharmacie"><Select value={form.pharmacy_id} onChange={(v) => setForm({ ...form, pharmacy_id: v })} placeholder="Choisir" options={state.pharmacies.map((p) => ({ value: p.id, label: `${p.name} · ${p.city || ''}` }))} /></Field><Field label="Marque"><Select value={form.brand_id} onChange={(v) => setForm({ ...form, brand_id: v })} placeholder="Choisir" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field></div>{lines.map((l, idx) => <div className="line-item" key={idx}><Select value={l.product_id} onChange={(v) => setLines(lines.map((x, i) => i === idx ? { ...x, product_id: v } : x))} placeholder="Produit" options={products.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.unit_price_ht)}` }))} /><input type="number" min="1" value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} /><button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>Supprimer</button></div>)}<button type="button" onClick={() => setLines([...lines, { product_id: '', quantity: 1 }])}>+ Ajouter une ligne</button><button className="primary">Créer la commande</button></form></Card><Card title="Résumé intelligent"> <div className="summary"><Kpi label="Total HT" value={money(totals.ht)} hint={`${totals.boxes} boîte(s)`} /><Kpi label="Gratuités" value={freebies} hint={isVk ? 'VK Swiss 12+2 / 24+5' : 'Non applicable'} /><Kpi label="Commission estimée" value={money(commission)} hint={isVk ? '2 € par boîte' : 'Règle non configurée'} /><Kpi label="Frais de port" value={isVk && totals.boxes >= 24 ? 'Offerts' : 'À vérifier'} hint="VK Swiss dès 24 boîtes" /></div></Card></div>;
}

function Commissions({ state }) {
  const vk = vkBrand(state); const vkOrders = state.orders.filter((o) => o.brand_id === vk?.id && o.order_type === 'implantation'); const paid = state.commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount_ht || 0), 0); const estimated = state.commissions.filter((c) => c.status !== 'paid').reduce((s, c) => s + Number(c.amount_ht || 0), 0);
  return <div className="stack"><section className="kpi-grid"><Kpi label="Commissions estimées" value={money(estimated)} hint="à valider / facturer" /><Kpi label="Commissions payées" value={money(paid)} hint="encaissées" /><Kpi label="Acquisitions VK Swiss" value={`${vkOrders.length}/10`} hint="palier 400 € rétroactif" /><Kpi label="Palier suivant" value={Math.max(0, 10 - vkOrders.length)} hint="acquisitions restantes" /></section><Card title="Règles VK Swiss"><div className="rules"><span>2 € / boîte sur première commande</span><span>2 € / boîte sur recommande dans les 6 mois</span><span>300 € par acquisition</span><span>400 € rétroactif dès 10 acquisitions</span><span>500 € rétroactif dès 20 acquisitions</span><span>Animation 280 € / jour · Formation 210 €</span></div></Card><Card title="Commissions enregistrées">{state.commissions.length ? <div className="list">{state.commissions.map((c) => <div className="list-row" key={c.id}><div><strong>{c.brands?.name || 'Marque'}</strong><span>{c.orders?.order_number || 'Sans commande'} · {money(c.amount_ht)}</span></div><span className={badgeClass(c.status)}>{label(c.status)}</span></div>)}</div> : <Empty title="Aucune commission" text="Les commissions VK Swiss seront créées depuis Commande rapide." />}</Card></div>;
}

function buildAiDraft(type, objective, pharmacy, brand) {
  const ph = pharmacy?.name || 'la pharmacie'; const br = brand?.name || 'la marque';
  if (type === 'appointment') return { subject: `Proposition de rendez-vous ${br}`, body: `Bonjour,\n\nJe me permets de revenir vers vous concernant ${br}. Je serai prochainement sur votre secteur et je peux passer vous présenter rapidement la gamme ainsi que les conditions d’implantation pharmacie.\n\nAuriez-vous une disponibilité cette semaine ou en début de semaine prochaine ?\n\nBien à vous,\nAmir Ounissi` };
  if (type === 'follow_up') return { subject: `Relance ${br}`, body: `Bonjour,\n\nJe me permets de revenir vers vous suite à notre précédent échange concernant ${br}.\n\n${objective || 'Souhaitez-vous que je vous renvoie les conditions ou que nous regardions ensemble une implantation adaptée à votre officine ?'}\n\nBien à vous,\nAmir Ounissi` };
  if (type === 'meeting_note') return { subject: `Compte rendu ${ph}`, body: `Compte rendu terrain — ${ph}\n\nObjectif : ${objective || 'à qualifier'}\nMarque : ${br}\nProchaine action : à programmer.` };
  return { subject: `Information ${br}`, body: `Bonjour,\n\nJe me permets de vous transmettre les éléments concernant ${br}.\n\n${objective || ''}\n\nBien à vous,\nAmir Ounissi` };
}

function AiActions({ state, reload }) {
  const [form, setForm] = useState({ action_type: 'email', pharmacy_id: '', brand_id: '', objective: '', tone: 'court / pro / direct' });
  async function submit(e) {
    e.preventDefault(); if (!state.agent?.id) return alert('Agent non trouvé.');
    const pharmacy = state.pharmacies.find((p) => p.id === form.pharmacy_id); const brand = state.brands.find((b) => b.id === form.brand_id); const draft = buildAiDraft(form.action_type, form.objective, pharmacy, brand);
    const { data: action, error } = await supabase.from('ai_actions').insert({ agent_id: state.agent.id, pharmacy_id: form.pharmacy_id || null, brand_id: form.brand_id || null, action_type: form.action_type, objective: form.objective, input_context: { tone: form.tone, pharmacy, brand }, output: draft, status: 'ready', created_by: state.profile?.id || null }).select('*').single();
    if (error) return alert(error.message);
    if (form.action_type === 'email') await supabase.from('email_drafts').insert({ ai_action_id: action.id, agent_id: state.agent.id, pharmacy_id: form.pharmacy_id || null, brand_id: form.brand_id || null, channel: 'email', objective: form.objective, tone: form.tone, recipient_email: pharmacy?.email || null, subject: draft.subject, body: draft.body, status: 'draft', created_by: state.profile?.id || null });
    if (form.action_type === 'appointment') await supabase.from('appointment_requests').insert({ ai_action_id: action.id, agent_id: state.agent.id, pharmacy_id: form.pharmacy_id || null, brand_id: form.brand_id || null, objective: form.objective, proposed_slots: [], message: draft.body, status: 'draft', created_by: state.profile?.id || null });
    if (form.action_type === 'follow_up') await supabase.from('follow_up_tasks').insert({ ai_action_id: action.id, agent_id: state.agent.id, pharmacy_id: form.pharmacy_id || null, brand_id: form.brand_id || null, title: `Relance ${brand?.name || ''}`, reason: form.objective, suggested_message: draft.body, due_at: new Date(Date.now() + 3 * 86400000).toISOString(), priority: 'medium', status: 'todo', created_by: state.profile?.id || null });
    if (form.action_type === 'meeting_note') await supabase.from('meeting_notes').insert({ ai_action_id: action.id, agent_id: state.agent.id, pharmacy_id: form.pharmacy_id || null, brand_id: form.brand_id || null, raw_note: form.objective, summary: draft.body, next_action: 'Programmer la suite', status: 'draft', created_by: state.profile?.id || null });
    setForm({ action_type: 'email', pharmacy_id: '', brand_id: '', objective: '', tone: 'court / pro / direct' }); reload();
  }
  return <div className="grid two"><Card title="Créer une action IA"><form onSubmit={submit} className="stack"><div className="form-grid"><Field label="Type"><Select value={form.action_type} onChange={(v) => setForm({ ...form, action_type: v })} options={AI_TYPES} /></Field><Field label="Pharmacie"><Select value={form.pharmacy_id} onChange={(v) => setForm({ ...form, pharmacy_id: v })} placeholder="Aucune" options={state.pharmacies.map((p) => ({ value: p.id, label: p.name }))} /></Field><Field label="Marque"><Select value={form.brand_id} onChange={(v) => setForm({ ...form, brand_id: v })} placeholder="Aucune" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Field label="Ton"><input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} /></Field></div><Field label="Objectif / note brute"><textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Ex : proposer un RDV VK Swiss, relancer après envoi des conditions, structurer un compte rendu..." /></Field><button className="primary">Générer et enregistrer</button></form></Card><Card title="Dernières actions IA">{state.aiActions.length ? <div className="list">{state.aiActions.slice(0, 10).map((a) => <div className="list-row" key={a.id}><div><strong>{label(a.action_type)}</strong><span>{a.objective || a.output?.subject || 'Action créée'}</span></div><span className={badgeClass(a.status)}>{label(a.status)}</span></div>)}</div> : <Empty title="Aucune action IA" text="Génère une première relance, demande de RDV ou note terrain." />}</Card></div>;
}

function MessageList({ messages }) { return <div className="list">{messages.map((m) => <div className="message-card" key={m.id}><div className="message-top"><strong>{m.from_number || 'WhatsApp'}</strong><span className={badgeClass(m.ai_action_status)}>{label(m.ai_intent || m.ai_action_status)}</span></div><p>{m.body || 'Message sans texte'}</p><small>{m.ai_summary || 'Non analysé'} · {date(m.created_at)}</small></div>)}</div>; }

function WhatsApp({ state }) {
  const connection = state.whatsappConnections[0];
  const webhookWithToken = `${WEBHOOK_BASE}?token=TON_SECRET`;
  return <div className="stack"><section className="hero-card whatsapp-hero"><div><p className="eyebrow">Canal WhatsApp · Twilio</p><h2>Envoie tes notes terrain à l’IA depuis WhatsApp.</h2><p>Messages, notes de RDV, relances et commandes dictées sont reçus par le webhook puis classés dans PharmaBiz.</p></div><div className="hero-actions"><span className={badgeClass(connection?.status || 'sandbox')}>{connection?.status || 'sandbox'}</span><span className="badge warn">Token requis</span></div></section><div className="grid two"><Card title="Configuration Twilio"><div className="setup"><Field label="Webhook à mettre dans Twilio"><input readOnly value={webhookWithToken} onFocus={(e) => e.target.select()} /></Field><div className="steps"><strong>Étapes</strong><span>1. Créer / ouvrir Twilio WhatsApp Sandbox.</span><span>2. Configurer “When a message comes in” avec l’URL ci-dessus.</span><span>3. Remplacer TON_SECRET par la valeur du secret Supabase `TWILIO_WEBHOOK_TOKEN`.</span><span>4. Depuis WhatsApp, envoyer le code join au numéro sandbox Twilio.</span><span>5. Envoyer une note terrain à PharmaBiz.</span></div><div className="mini-grid"><Kpi label="Sandbox Twilio" value={connection?.sandbox_number || '+14155238886'} hint="numéro de test" /><Kpi label="Messages reçus" value={state.whatsappMessages.length} hint="50 derniers" /></div></div></Card><Card title="Exemples à envoyer"><div className="examples"><p>“Pharmacie Prado Marseille, titulaire intéressé VK Swiss, veut 12 boîtes Shilajit + Ashwagandha. Relancer mardi.”</p><p>“Commande Pharmacie Lafayette : 6 Shilajit, 6 Ashwagandha, 6 Curcuma, 6 Bacopa.”</p><p>“Après RDV : objection prix, potentiel fort, envoyer offre 24+5.”</p></div></Card></div><Card title="Messages WhatsApp reçus">{state.whatsappMessages.length ? <MessageList messages={state.whatsappMessages} /> : <Empty title="Aucun message reçu" text="Le webhook est prêt. Il faut encore configurer le token côté Supabase puis coller l’URL dans Twilio." />}</Card></div>;
}

function Catalog({ state, reload }) {
  const [form, setForm] = useState({ brand_id: '', name: '', reference: '', category: '', pcb: 1, unit_price_ht: 0 });
  async function submit(e) { e.preventDefault(); const { error } = await supabase.from('products').insert({ ...form, pcb: Number(form.pcb || 1), unit_price_ht: Number(form.unit_price_ht || 0) }); if (error) return alert(error.message); setForm({ brand_id: '', name: '', reference: '', category: '', pcb: 1, unit_price_ht: 0 }); reload(); }
  return <div className="grid two"><Card title="Ajouter produit"><form onSubmit={submit} className="form-grid"><Field label="Marque"><Select value={form.brand_id} onChange={(v) => setForm({ ...form, brand_id: v })} placeholder="Choisir" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Field label="Produit"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Référence"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field><Field label="Prix HT"><input type="number" value={form.unit_price_ht} onChange={(e) => setForm({ ...form, unit_price_ht: e.target.value })} /></Field><button className="primary">Ajouter</button></form></Card><Card title="Catalogue produits">{state.products.length ? <div className="list">{state.products.map((p) => <div className="list-row" key={p.id}><div><strong>{p.name}</strong><span>{p.brands?.name || 'Marque'} · PCB {p.pcb || 1}</span></div><span>{money(p.unit_price_ht)}</span></div>)}</div> : <Empty title="Aucun produit" text="Les produits VK Swiss sont déjà disponibles si l’import contrat est passé." />}</Card></div>;
}

createRoot(document.getElementById('root')).render(<App />);
