import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase.js';
import './styles.css';

const ORDER_TYPES = ['implantation', 'reassort', 'sample', 'other'];
const PHARMACY_STATUSES = ['prospect', 'contacted', 'interested', 'implanted', 'reassort_needed', 'inactive', 'lost'];
const POTENTIALS = ['low', 'medium', 'high', 'priority'];
const AI_TYPES = ['email', 'appointment', 'meeting_note', 'follow_up'];

function money(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v || 0)); }
function date(v) { return v ? new Intl.DateTimeFormat('fr-FR').format(new Date(v)) : '—'; }
function label(v) { return String(v || '').replaceAll('_', ' '); }
function badgeClass(v) {
  if (['implanted', 'confirmed', 'delivered', 'paid', 'done', 'active', 'priority'].includes(v)) return 'badge good';
  if (['lost', 'cancelled', 'overdue', 'inactive'].includes(v)) return 'badge bad';
  if (['draft', 'todo', 'medium', 'prospect'].includes(v)) return 'badge neutral';
  return 'badge warn';
}
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Select({ value, onChange, options, placeholder }) { return <select value={value || ''} onChange={(e) => onChange(e.target.value)}>{placeholder && <option value="">{placeholder}</option>}{options.map((o) => <option key={o.value || o} value={o.value || o}>{o.label || label(o)}</option>)}</select>; }
function Card({ title, action, children, className = '' }) { return <section className={`card ${className}`}><div className="card-head"><h2>{title}</h2>{action}</div>{children}</section>; }
function Empty({ title, text, cta }) { return <div className="empty"><strong>{title}</strong><span>{text}</span>{cta}</div>; }

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
  return <main className="auth-page"><section className="auth-card glass"><div className="brand-mark">PB</div><h1>PharmaBiz</h1><p>Le cockpit commercial pharmacie : relances, rendez-vous, commandes, commissions.</p><div className="auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Connexion</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Créer Agent 001</button></div><form onSubmit={submit} className="stack">{mode === 'signup' && <Field label="Nom"><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></Field>}<Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field><Field label="Mot de passe"><input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field><button className="primary">{mode === 'signup' ? 'Créer mon espace' : 'Entrer dans le cockpit'}</button>{message && <p className="message">{message}</p>}</form></section></main>;
}

function App() {
  const [session, setSession] = useState(null); const [booting, setBooting] = useState(true);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); }); const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s)); return () => data.subscription.unsubscribe(); }, []);
  if (booting) return <div className="loading">Chargement...</div>;
  return session ? <Workspace session={session} /> : <Auth />;
}

function Workspace({ session }) {
  const [tab, setTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [state, setState] = useState({ profile: null, agent: null, brands: [], pharmacies: [], products: [], orders: [], commissions: [], invoices: [], expenses: [], imports: [], followups: [], drafts: [], notes: [], appointments: [], templates: [], rules: [] });

  async function load() {
    setLoading(true); setNotice(''); const uid = session.user.id;
    const calls = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('agents').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('brands').select('*').order('name'),
      supabase.from('pharmacies').select('*').order('updated_at', { ascending: false }),
      supabase.from('products').select('*, brands(name)').order('name'),
      supabase.from('v_orders_summary').select('*').order('created_at', { ascending: false }),
      supabase.from('commissions').select('*, brands(name), orders(order_number), commission_invoices(invoice_number)').order('created_at', { ascending: false }),
      supabase.from('commission_invoices').select('*, brands(name)').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*, brands(name), pharmacies(name)').order('expense_date', { ascending: false }),
      supabase.from('imports').select('*, brands(name)').order('created_at', { ascending: false }),
      supabase.from('follow_up_tasks').select('*, pharmacies(name, city), brands(name)').order('due_at', { ascending: true }),
      supabase.from('email_drafts').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('meeting_notes').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('appointment_requests').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('message_templates').select('*').eq('is_active', true).order('name'),
      supabase.from('commission_rules').select('*, brands(name)').order('rule_code')
    ]);
    const errors = calls.map((r) => r.error).filter(Boolean);
    if (errors.length) setNotice(errors.map((e) => e.message).join(' | '));
    setState({ profile: calls[0].data, agent: calls[1].data, brands: calls[2].data || [], pharmacies: calls[3].data || [], products: calls[4].data || [], orders: calls[5].data || [], commissions: calls[6].data || [], invoices: calls[7].data || [], expenses: calls[8].data || [], imports: calls[9].data || [], followups: calls[10].data || [], drafts: calls[11].data || [], notes: calls[12].data || [], appointments: calls[13].data || [], templates: calls[14].data || [], rules: calls[15].data || [] });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  const tabs = [['today', 'Aujourd’hui'], ['pharmacies', 'Pharmacies'], ['order', 'Commande rapide'], ['money', 'Commissions'], ['ai', 'Actions IA'], ['catalog', 'Catalogue']];
  return <main className="shell"><aside className="rail"><div className="logo"><div className="brand-mark small">PB</div><div><strong>PharmaBiz</strong><span>Copilote terrain</span></div></div><nav>{tabs.map(([key, title]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{title}</button>)}</nav><div className="agent-card"><span>Agent connecté</span><strong>{state.agent?.display_name || state.profile?.full_name || 'Amir'}</strong><small>{state.agent?.sector || 'Agent 001'}</small><button onClick={() => supabase.auth.signOut()}>Déconnexion</button></div></aside><section className="main"><header className="topbar"><div><p className="eyebrow">Agent commercial pharmacie</p><h1>{tabs.find(([k]) => k === tab)?.[1]}</h1></div><div className="top-actions"><button onClick={load}>Rafraîchir</button><button className="primary" onClick={() => setTab('order')}>+ Commande</button></div></header><div className="mobile-tabs">{tabs.map(([key, title]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{title}</button>)}</div>{notice && <div className="alert">{notice}</div>}{loading ? <div className="loading">Chargement des données...</div> : <Screen tab={tab} state={state} reload={load} setTab={setTab} />}</section></main>;
}

function Screen({ tab, state, reload, setTab }) {
  if (tab === 'today') return <Today state={state} setTab={setTab} />;
  if (tab === 'pharmacies') return <Pharmacies state={state} reload={reload} />;
  if (tab === 'order') return <OrderTunnel state={state} reload={reload} />;
  if (tab === 'money') return <Money state={state} />;
  if (tab === 'ai') return <AIActions state={state} reload={reload} />;
  return <Catalog state={state} reload={reload} />;
}

function Today({ state, setTab }) {
  const ca = state.orders.reduce((s, o) => s + Number(o.total_after_discount_ht || 0), 0);
  const due = state.commissions.filter((c) => ['to_invoice', 'approved', 'estimated'].includes(c.status)).reduce((s, c) => s + Number(c.amount_ht || 0), 0);
  const todo = state.followups.filter((f) => f.status === 'todo');
  const hot = state.pharmacies.filter((p) => ['priority', 'high'].includes(p.potential) || ['interested', 'reassort_needed'].includes(p.status)).slice(0, 5);
  return <div className="stack"><section className="hero"><div><span className="pill">Aujourd’hui</span><h2>Ton secteur à piloter</h2><p>Relances, opportunités, commandes et commissions au même endroit.</p></div><div className="hero-actions"><button className="primary" onClick={() => setTab('ai')}>Préparer mes relances</button><button onClick={() => setTab('pharmacies')}>Voir mes pharmacies</button></div></section><section className="kpi-grid"><Kpi title="CA suivi" value={money(ca)} hint={`${state.orders.length} commande(s)`} /><Kpi title="Commissions" value={money(due)} hint="estimées / à facturer" /><Kpi title="Relances" value={todo.length} hint="actions à traiter" /><Kpi title="Pharmacies" value={state.pharmacies.length} hint="base commerciale" /></section><div className="grid two"><Card title="À faire maintenant" action={<button onClick={() => setTab('ai')}>+ Action IA</button>}>{todo.length ? <TaskList rows={todo.slice(0, 6)} /> : <Empty title="Aucune relance active" text="Crée une relance depuis Actions IA ou depuis une pharmacie." />}</Card><Card title="Opportunités chaudes">{hot.length ? <PharmacyCardList pharmacies={hot} compact /> : <Empty title="Aucune opportunité priorisée" text="Ajoute des pharmacies ou marque-les en potentiel fort/prioritaire." />}</Card></div><Card title="Derniers brouillons IA">{state.drafts.length ? <DraftList rows={state.drafts.slice(0, 4)} /> : <Empty title="Aucun brouillon" text="Génère ton premier mail depuis Actions IA." cta={<button onClick={() => setTab('ai')}>Créer un mail</button>} />}</Card></div>;
}
function Kpi({ title, value, hint }) { return <div className="kpi"><span>{title}</span><strong>{value}</strong><small>{hint}</small></div>; }
function TaskList({ rows }) { return <div className="cards-list">{rows.map((t) => <article className="mini-card" key={t.id}><div><strong>{t.title}</strong><span>{t.pharmacies?.name || 'Pharmacie non liée'} · {t.brands?.name || 'Marque non liée'}</span><small>{t.reason}</small></div><span className={badgeClass(t.priority)}>{label(t.priority)}</span></article>)}</div>; }
function DraftList({ rows }) { return <div className="cards-list">{rows.map((d) => <article className="mini-card" key={d.id}><div><strong>{d.subject || d.objective}</strong><span>{d.pharmacies?.name || 'Pharmacie'} · {d.brands?.name || 'Marque'}</span><small>{d.body?.slice(0, 130)}...</small></div><span className={badgeClass(d.status)}>{label(d.status)}</span></article>)}</div>; }

function Pharmacies({ state, reload }) {
  const [form, setForm] = useState({ name: '', city: '', department: '', groupement: '', potential: 'medium', status: 'prospect', email: '', phone: '', contact_name: '', notes: '', next_follow_up_at: '' });
  async function create(e) { e.preventDefault(); if (!state.agent?.id) return alert('Agent non trouvé.'); const { error } = await supabase.from('pharmacies').insert({ ...form, assigned_agent_id: state.agent.id, created_by: state.profile?.id || null, next_follow_up_at: form.next_follow_up_at || null }); if (error) return alert(error.message); setForm({ name: '', city: '', department: '', groupement: '', potential: 'medium', status: 'prospect', email: '', phone: '', contact_name: '', notes: '', next_follow_up_at: '' }); reload(); }
  return <div className="stack"><Card title="Ajouter une pharmacie"><form onSubmit={create} className="form-grid"><Input label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required /><Input label="Ville" value={form.city} onChange={(v) => setForm({ ...form, city: v })} /><Input label="Département" value={form.department} onChange={(v) => setForm({ ...form, department: v })} /><Input label="Groupement" value={form.groupement} onChange={(v) => setForm({ ...form, groupement: v })} /><Field label="Potentiel"><Select value={form.potential} onChange={(v) => setForm({ ...form, potential: v })} options={POTENTIALS} /></Field><Field label="Statut"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={PHARMACY_STATUSES} /></Field><Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} /><Input label="Téléphone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /><Field label="Notes terrain"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field><button className="primary">Créer la pharmacie</button></form></Card><Card title="Fiches pharmacies en cartes">{state.pharmacies.length ? <PharmacyCardList pharmacies={state.pharmacies} /> : <Empty title="Aucune pharmacie" text="Ajoute ta première pharmacie pour commencer à piloter ton secteur." />}</Card></div>;
}
function PharmacyCardList({ pharmacies, compact = false }) { return <div className={compact ? 'cards-list' : 'pharmacy-grid'}>{pharmacies.map((p) => <article className="pharmacy-card" key={p.id}><div className="pharmacy-top"><div><h3>{p.name}</h3><p>{p.city || 'Ville non renseignée'} {p.department ? `· ${p.department}` : ''}</p></div><span className={badgeClass(p.status)}>{label(p.status)}</span></div><div className="badges"><span className={badgeClass(p.potential)}>{label(p.potential)}</span>{p.groupement && <span className="badge neutral">{p.groupement}</span>}</div>{!compact && <div className="pharmacy-actions"><button>Mail IA</button><button>RDV</button><button>Commande</button></div>}</article>)}</div>; }
function Input({ label: title, value, onChange, required, type = 'text' }) { return <Field label={title}><input type={type} required={required} value={value || ''} onChange={(e) => onChange(e.target.value)} /></Field>; }

function OrderTunnel({ state, reload }) {
  const [pharmacyId, setPharmacyId] = useState(''); const [brandId, setBrandId] = useState(''); const [orderType, setOrderType] = useState('implantation'); const [items, setItems] = useState({});
  const brand = state.brands.find((b) => b.id === brandId); const products = state.products.filter((p) => p.brand_id === brandId); const lines = products.map((p) => ({ product: p, qty: Number(items[p.id] || 0) })).filter((l) => l.qty > 0);
  const boxCount = lines.reduce((s, l) => s + l.qty, 0); const total = lines.reduce((s, l) => s + l.qty * Number(l.product.unit_price_ht || 0), 0); const isVK = brand?.name === 'VK Swiss'; const free = isVK ? boxCount >= 24 ? 5 : boxCount >= 12 ? 2 : 0 : 0; const commission = isVK ? boxCount * 2 : 0;
  async function submit(e) { e.preventDefault(); if (!state.agent?.id || !pharmacyId || !brandId || !lines.length) return alert('Complète pharmacie, marque et produits.'); const { data, error } = await supabase.from('orders').insert({ pharmacy_id: pharmacyId, brand_id: brandId, agent_id: state.agent.id, created_by: state.profile?.id || null, order_type: orderType, status: 'draft', notes: isVK ? `${free} boîte(s) gratuite(s) estimée(s). Commission estimée : ${commission}€.` : '' }).select('*').single(); if (error) return alert(error.message); const rows = lines.map(({ product, qty }) => ({ order_id: data.id, product_id: product.id, product_name_snapshot: product.name, reference_snapshot: product.reference, quantity: qty, pcb: product.pcb || 1, unit_price_ht: Number(product.unit_price_ht || 0), discount_rate: 0 })); const { error: itemError } = await supabase.from('order_items').insert(rows); if (itemError) return alert(itemError.message); if (commission > 0) await supabase.from('commissions').insert({ order_id: data.id, agent_id: state.agent.id, brand_id: brandId, base_amount_ht: total, fixed_amount: commission, amount_ht: commission, status: 'estimated' }); setItems({}); setPharmacyId(''); setBrandId(''); reload(); }
  return <div className="order-layout"><Card title="Tunnel de commande rapide" className="order-card"><form onSubmit={submit} className="stack"><div className="steps"><span className={pharmacyId ? 'done' : 'active'}>1 Pharmacie</span><span className={brandId ? 'done' : ''}>2 Marque</span><span className={lines.length ? 'done' : ''}>3 Produits</span><span>4 Résumé</span></div><div className="form-grid"><Field label="Pharmacie"><Select value={pharmacyId} onChange={setPharmacyId} placeholder="Choisir une pharmacie" options={state.pharmacies.map((p) => ({ value: p.id, label: `${p.name} — ${p.city || ''}` }))} /></Field><Field label="Marque"><Select value={brandId} onChange={(v) => { setBrandId(v); setItems({}); }} placeholder="Choisir une marque" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Field label="Type"><Select value={orderType} onChange={setOrderType} options={ORDER_TYPES} /></Field></div>{brandId && <div className="product-grid">{products.map((p) => <article className="product-card" key={p.id}><div><strong>{p.name}</strong><span>{money(p.unit_price_ht)} HT · PCB {p.pcb || 1}</span></div><div className="qty"><button type="button" onClick={() => setItems({ ...items, [p.id]: Math.max(0, Number(items[p.id] || 0) - 1) })}>−</button><input type="number" min="0" value={items[p.id] || 0} onChange={(e) => setItems({ ...items, [p.id]: e.target.value })} /><button type="button" onClick={() => setItems({ ...items, [p.id]: Number(items[p.id] || 0) + 1 })}>+</button></div></article>)}</div>}<button className="primary">Créer le bon de commande</button></form></Card><aside className="summary-panel"><h2>Résumé</h2><Row label="Boîtes" value={boxCount} /><Row label="Total HT" value={money(total)} /><Row label="Gratuités" value={free ? `${free} boîte(s)` : '—'} /><Row label="Port" value={isVK && boxCount >= 24 ? 'Offert' : 'À vérifier'} /><Row label="Commission estimée" value={money(commission)} strong /><p className="muted">VK Swiss : 2€ par boîte. 12+2 et 24+5 appliqués en estimation.</p></aside></div>;
}
function Row({ label, value, strong }) { return <div className="row"><span>{label}</span><strong className={strong ? 'gold' : ''}>{value}</strong></div>; }

function Money({ state }) {
  const vk = state.brands.find((b) => b.name === 'VK Swiss'); const vkOrders = state.orders.filter((o) => o.brand_id === vk?.id || o.brand_name === 'VK Swiss'); const acquisitions = vkOrders.filter((o) => o.order_type === 'implantation').length; const next = acquisitions < 10 ? 10 : acquisitions < 20 ? 20 : null; const progress = next ? Math.round((acquisitions / next) * 100) : 100; const totalCom = state.commissions.reduce((s, c) => s + Number(c.amount_ht || 0), 0); const paid = state.commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount_ht || 0), 0); const vkRules = state.rules.filter((r) => r.brands?.name === 'VK Swiss');
  return <div className="stack"><section className="money-hero"><div><span className="pill">VK Swiss</span><h2>Progression commissions</h2><p>{next ? `Encore ${next - acquisitions} acquisition(s) avant le palier ${next}.` : 'Palier 20 acquisitions atteint.'}</p><div className="progress"><span style={{ width: `${progress}%` }} /></div></div><strong>{acquisitions}/{next || 20}</strong></section><section className="kpi-grid"><Kpi title="Commissions totales" value={money(totalCom)} hint="estimées + validées" /><Kpi title="Payées" value={money(paid)} hint="encaissé" /><Kpi title="À traiter" value={state.commissions.filter((c) => c.status !== 'paid').length} hint="commissions" /><Kpi title="Factures" value={state.invoices.length} hint="créées" /></section><div className="grid two"><Card title="Règles VK Swiss">{vkRules.length ? <div className="cards-list">{vkRules.map((r) => <article className="mini-card" key={r.id}><div><strong>{r.rule_code}</strong><span>{money(r.fixed_amount)} · {r.unit || 'règle'}</span><small>{r.notes}</small></div>{r.retroactive && <span className="badge gold-badge">rétroactif</span>}</article>)}</div> : <Empty title="Aucune règle" text="Les règles de commission VK Swiss ne sont pas chargées." />}</Card><Card title="Commissions enregistrées"><DraftLike rows={state.commissions} /></Card></div></div>;
}
function DraftLike({ rows }) { return rows?.length ? <div className="cards-list">{rows.slice(0, 8).map((r) => <article className="mini-card" key={r.id}><div><strong>{r.orders?.order_number || r.brands?.name || 'Commission'}</strong><span>{money(r.amount_ht)}</span></div><span className={badgeClass(r.status)}>{label(r.status)}</span></article>)}</div> : <Empty title="Aucune commission" text="Crée une commande VK Swiss pour générer une commission estimée." />; }

function AIActions({ state, reload }) {
  const [type, setType] = useState('email'); const [pharmacyId, setPharmacyId] = useState(''); const [brandId, setBrandId] = useState(''); const [objective, setObjective] = useState('Demande de RDV'); const [raw, setRaw] = useState(''); const [result, setResult] = useState('');
  const pharmacy = state.pharmacies.find((p) => p.id === pharmacyId); const brand = state.brands.find((b) => b.id === brandId);
  function build() { const p = pharmacy?.name || 'votre pharmacie'; const b = brand?.name || 'la marque'; if (type === 'meeting_note') return `Résumé : ${raw || 'Échange commercial à qualifier.'}\n\nObjection : à compléter.\nProchaine action : relancer sous 7 jours.\nStatut conseillé : intéressée.`; if (type === 'follow_up') return `Relancer ${p} au sujet de ${b}.\nRaison : ${raw || objective}.\nMessage suggéré : Bonjour, je me permets de revenir vers vous concernant ${b}. Souhaitez-vous que l’on avance sur ce sujet ?`; return `Objet : ${objective} ${b}\n\nBonjour,\n\nJe me permets de revenir vers vous concernant ${b}. ${raw || 'Je serai prochainement sur votre secteur et je peux passer vous présenter rapidement la gamme et les conditions commerciales.'}\n\nAuriez-vous une disponibilité cette semaine ou en début de semaine prochaine ?\n\nBien à vous,\nAmir Ounissi`; }
  async function generate() { const out = build(); setResult(out); if (!state.agent?.id) return alert('Agent non trouvé.'); const { data: action } = await supabase.from('ai_actions').insert({ agent_id: state.agent.id, pharmacy_id: pharmacyId || null, brand_id: brandId || null, action_type: type, objective, input_context: { raw }, output: { text: out }, status: 'ready', created_by: state.profile?.id || null }).select('*').single(); if (type === 'email' || type === 'appointment') await supabase.from('email_drafts').insert({ ai_action_id: action?.id, agent_id: state.agent.id, pharmacy_id: pharmacyId || null, brand_id: brandId || null, objective, subject: out.split('\n')[0].replace('Objet : ', ''), body: out.split('\n').slice(2).join('\n'), status: 'ready', created_by: state.profile?.id || null, recipient_email: pharmacy?.email || null }); if (type === 'appointment') await supabase.from('appointment_requests').insert({ ai_action_id: action?.id, agent_id: state.agent.id, pharmacy_id: pharmacyId || null, brand_id: brandId || null, objective, message: out, proposed_slots: [], status: 'ready', created_by: state.profile?.id || null }); if (type === 'follow_up') await supabase.from('follow_up_tasks').insert({ ai_action_id: action?.id, agent_id: state.agent.id, pharmacy_id: pharmacyId || null, brand_id: brandId || null, title: `Relancer ${pharmacy?.name || 'pharmacie'}`, reason: objective, suggested_message: out, priority: 'high', status: 'todo', created_by: state.profile?.id || null }); if (type === 'meeting_note') await supabase.from('meeting_notes').insert({ ai_action_id: action?.id, agent_id: state.agent.id, pharmacy_id: pharmacyId || null, brand_id: brandId || null, raw_note: raw || objective, summary: out, next_action: 'Relance à prévoir', status: 'ready', created_by: state.profile?.id || null }); reload(); }
  return <div className="grid two"><Card title="Copilote IA commercial"><div className="stack"><div className="form-grid"><Field label="Action"><Select value={type} onChange={setType} options={AI_TYPES} /></Field><Field label="Pharmacie"><Select value={pharmacyId} onChange={setPharmacyId} placeholder="Choisir" options={state.pharmacies.map((p) => ({ value: p.id, label: p.name }))} /></Field><Field label="Marque"><Select value={brandId} onChange={setBrandId} placeholder="Choisir" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Input label="Objectif" value={objective} onChange={setObjective} /></div><Field label="Contexte terrain"><textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Ex : titulaire intéressé VK Swiss, veut voir les conditions, potentiel para fort..." /></Field><button className="primary" onClick={generate}>Générer et enregistrer</button>{result && <pre className="result">{result}</pre>}</div></Card><div className="stack"><Card title="Brouillons de mails"><DraftList rows={state.drafts.slice(0, 5)} /></Card><Card title="Relances IA"><TaskList rows={state.followups.slice(0, 5)} /></Card><Card title="Comptes rendus RDV">{state.notes.length ? <div className="cards-list">{state.notes.slice(0, 4).map((n) => <article className="mini-card" key={n.id}><div><strong>{n.pharmacies?.name || 'RDV'}</strong><small>{n.summary}</small></div></article>)}</div> : <Empty title="Aucun compte rendu" text="Dicte une note brute et PharmaBiz la structure." />}</Card></div></div>;
}

function Catalog({ state, reload }) {
  const [form, setForm] = useState({ brand_id: '', name: '', reference: '', pcb: 1, unit_price_ht: 0, category: '' });
  async function create(e) { e.preventDefault(); const { error } = await supabase.from('products').insert({ ...form, pcb: Number(form.pcb || 1), unit_price_ht: Number(form.unit_price_ht || 0) }); if (error) return alert(error.message); setForm({ brand_id: '', name: '', reference: '', pcb: 1, unit_price_ht: 0, category: '' }); reload(); }
  return <div className="grid two"><Card title="Ajouter produit"><form onSubmit={create} className="form-grid"><Field label="Marque"><Select value={form.brand_id} onChange={(v) => setForm({ ...form, brand_id: v })} placeholder="Choisir" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Input label="Produit" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required /><Input label="Référence" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })} /><Input label="Prix HT" type="number" value={form.unit_price_ht} onChange={(v) => setForm({ ...form, unit_price_ht: v })} /><Input label="PCB" type="number" value={form.pcb} onChange={(v) => setForm({ ...form, pcb: v })} /><button className="primary">Créer produit</button></form></Card><Card title="Produits en cartes">{state.products.length ? <div className="product-grid">{state.products.map((p) => <article className="product-card" key={p.id}><div><strong>{p.name}</strong><span>{p.brands?.name} · {p.reference || 'sans réf.'}</span></div><b>{money(p.unit_price_ht)}</b></article>)}</div> : <Empty title="Aucun produit" text="Les produits VK Swiss sont normalement déjà importés." />}</Card></div>;
}

createRoot(document.getElementById('root')).render(<App />);
