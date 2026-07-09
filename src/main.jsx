import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase.js';
import './styles.css';

const ORDER_STATUSES = ['draft', 'sent_to_brand', 'confirmed', 'delivered', 'invoiced', 'commissionable', 'commission_invoiced', 'commission_paid', 'cancelled'];
const ORDER_TYPES = ['implantation', 'reassort', 'sample', 'other'];
const PHARMACY_STATUSES = ['prospect', 'contacted', 'interested', 'implanted', 'reassort_needed', 'inactive', 'lost'];
const POTENTIALS = ['low', 'medium', 'high', 'priority'];
const EXPENSE_KINDS = ['reimbursable', 'personal', 'included', 'advanced'];
const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'reimbursed', 'rejected', 'paid'];
const COMMISSION_STATUSES = ['estimated', 'approved', 'to_invoice', 'invoiced', 'paid', 'cancelled'];
const INVOICE_STATUSES = ['draft', 'sent', 'awaiting_payment', 'paid', 'overdue', 'cancelled'];

function fmtMoney(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}
function fmtDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(value));
}
function label(value) {
  return String(value || '').replaceAll('_', ' ');
}
function statusClass(status) {
  if (['paid', 'delivered', 'confirmed', 'active', 'implanted'].includes(status)) return 'status good';
  if (['cancelled', 'lost', 'rejected', 'overdue', 'inactive'].includes(status)) return 'status bad';
  if (['draft', 'pending', 'test', 'submitted'].includes(status)) return 'status neutral';
  return 'status warn';
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function Select({ value, onChange, options, placeholder }) {
  return <select value={value || ''} onChange={(e) => onChange(e.target.value)}>{placeholder && <option value="">{placeholder}</option>}{options.map((opt) => <option key={opt.value || opt} value={opt.value || opt}>{opt.label || label(opt)}</option>)}</select>;
}
function Card({ title, children }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}
function Table({ rows, columns }) {
  if (!rows?.length) return <p className="muted">Aucune donnée.</p>;
  return <div className="table-wrap"><table><thead><tr>{columns.map(([, title]) => <th key={title}>{title}</th>)}</tr></thead><tbody>{rows.map((row, idx) => <tr key={row.id || idx}>{columns.map(([key, , render]) => <td key={key}>{render ? render(row[key], row) : row[key] ?? '—'}</td>)}</tr>)}</tbody></table></div>;
}

function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('amir.ounissi69@gmail.com');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('Amir Ounissi');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const payload = { email, password };
    const { error } = mode === 'signup'
      ? await supabase.auth.signUp({ ...payload, options: { data: { full_name: fullName } } })
      : await supabase.auth.signInWithPassword(payload);
    setLoading(false);
    setMessage(error ? error.message : mode === 'signup' ? 'Compte créé. Vérifie tes emails si confirmation requise.' : 'Connexion réussie.');
  }

  return <main className="auth-page"><section className="auth-card"><div className="brand-mark">PB</div><h1>PharmaBiz</h1><p>Cockpit commercial terrain : pharmacies, commandes, commissions et frais.</p><div className="auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Connexion</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Créer Agent 001</button></div><form onSubmit={submit} className="stack">{mode === 'signup' && <Field label="Nom complet"><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></Field>}<Field label="Email"><input value={email} type="email" onChange={(e) => setEmail(e.target.value)} required /></Field><Field label="Mot de passe"><input value={password} type="password" minLength={6} onChange={(e) => setPassword(e.target.value)} required /></Field><button className="primary" disabled={loading}>{loading ? 'Traitement...' : mode === 'signup' ? 'Créer le compte' : 'Se connecter'}</button>{message && <p className="message">{message}</p>}</form></section></main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);
  if (booting) return <div className="loading">Chargement...</div>;
  if (!session) return <Auth />;
  return <Workspace session={session} />;
}

function Workspace({ session }) {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [state, setState] = useState({ profile: null, agent: null, brands: [], pharmacies: [], products: [], orders: [], commissions: [], invoices: [], expenses: [], imports: [], monthlyRevenue: [], commissionsToInvoice: [], monthlyExpenses: [] });

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
      supabase.from('commissions').select('*, brands(name), orders(order_number), commission_invoices(invoice_number)').order('created_at', { ascending: false }),
      supabase.from('commission_invoices').select('*, brands(name)').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*, brands(name), pharmacies(name)').order('expense_date', { ascending: false }),
      supabase.from('imports').select('*, brands(name)').order('created_at', { ascending: false }),
      supabase.from('v_agent_monthly_revenue').select('*').order('month', { ascending: false }),
      supabase.from('v_commissions_to_invoice').select('*').order('created_at', { ascending: false }),
      supabase.from('v_agent_monthly_expenses').select('*').order('month', { ascending: false })
    ]);
    const errors = calls.map((r) => r.error).filter(Boolean);
    if (errors.length) setNotice(errors.map((e) => e.message).join(' | '));
    setState({ profile: calls[0].data, agent: calls[1].data, brands: calls[2].data || [], pharmacies: calls[3].data || [], products: calls[4].data || [], orders: calls[5].data || [], commissions: calls[6].data || [], invoices: calls[7].data || [], expenses: calls[8].data || [], imports: calls[9].data || [], monthlyRevenue: calls[10].data || [], commissionsToInvoice: calls[11].data || [], monthlyExpenses: calls[12].data || [] });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const tabs = [['dashboard', 'Dashboard'], ['pharmacies', 'Pharmacies'], ['products', 'Produits'], ['orders', 'Commandes'], ['finance', 'Commissions'], ['expenses', 'Frais'], ['imports', 'Imports']];

  return <main className="app-shell"><aside className="sidebar"><div className="logo"><div className="brand-mark small">PB</div><div><strong>PharmaBiz</strong><span>Agent 001 cockpit</span></div></div><nav>{tabs.map(([key, title]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{title}</button>)}</nav><div className="sidebar-footer"><span>{state.profile?.full_name || session.user.email}</span><button onClick={() => supabase.auth.signOut()}>Déconnexion</button></div></aside><section className="content"><header className="topbar"><div><h1>{tabs.find(([key]) => key === tab)?.[1]}</h1><p>{state.agent?.display_name || 'Agent en attente'} · {state.profile?.role || 'profil'}</p></div><button onClick={load}>Rafraîchir</button></header>{notice && <div className="alert">{notice}</div>}{loading ? <div className="loading">Chargement des données...</div> : <Screen tab={tab} state={state} reload={load} session={session} />}</section></main>;
}

function Screen({ tab, state, reload, session }) {
  if (tab === 'dashboard') return <Dashboard state={state} />;
  if (tab === 'pharmacies') return <Pharmacies state={state} reload={reload} />;
  if (tab === 'products') return <Products state={state} reload={reload} />;
  if (tab === 'orders') return <Orders state={state} reload={reload} />;
  if (tab === 'finance') return <Finance state={state} reload={reload} />;
  if (tab === 'expenses') return <Expenses state={state} reload={reload} />;
  return <Imports state={state} reload={reload} session={session} />;
}

function Dashboard({ state }) {
  const revenue = state.orders.reduce((sum, o) => sum + Number(o.total_after_discount_ht || 0), 0);
  const due = state.commissionsToInvoice.reduce((sum, c) => sum + Number(c.amount_ht || 0), 0);
  const expenses = state.expenses.reduce((sum, e) => sum + Number(e.amount_ttc || 0), 0);
  const followUps = state.pharmacies.filter((p) => p.next_follow_up_at && new Date(p.next_follow_up_at) <= new Date());
  return <div className="stack"><section className="kpi-grid"><Kpi label="CA suivi" value={fmtMoney(revenue)} hint={`${state.orders.length} commande(s)`} /><Kpi label="Commissions à facturer" value={fmtMoney(due)} hint="validées / à facturer" /><Kpi label="Frais" value={fmtMoney(expenses)} hint="TTC" /><Kpi label="Relances dues" value={followUps.length} hint="pharmacies" /></section><div className="grid two"><Card title="Dernières commandes"><OrdersTable rows={state.orders.slice(0, 8)} /></Card><Card title="Relances"><Table rows={followUps.slice(0, 8)} columns={[["name", "Pharmacie"], ["city", "Ville"], ["status", "Statut", (v) => <span className={statusClass(v)}>{label(v)}</span>], ["next_follow_up_at", "Relance", fmtDate]]} /></Card></div><Card title="CA mensuel"><Table rows={state.monthlyRevenue} columns={[["month", "Mois", fmtDate], ["brand_name", "Marque"], ["order_count", "Commandes"], ["revenue_ht", "CA HT", fmtMoney]]} /></Card></div>;
}
function Kpi({ label, value, hint }) { return <div className="kpi"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function OrdersTable({ rows }) { return <Table rows={rows} columns={[["order_number", "N°"], ["pharmacy_name", "Pharmacie"], ["brand_name", "Marque"], ["total_after_discount_ht", "HT", fmtMoney], ["status", "Statut", (v) => <span className={statusClass(v)}>{label(v)}</span>]]} />; }

function Pharmacies({ state, reload }) {
  const [form, setForm] = useState({ name: '', city: '', department: '', groupement: '', potential: 'medium', status: 'prospect', email: '', phone: '', contact_name: '', next_follow_up_at: '', notes: '' });
  async function submit(e) { e.preventDefault(); if (!state.agent?.id) return alert('Agent non trouvé.'); const { error } = await supabase.from('pharmacies').insert({ ...form, assigned_agent_id: state.agent.id, created_by: state.profile?.id || null, next_follow_up_at: form.next_follow_up_at || null }); if (error) return alert(error.message); setForm({ name: '', city: '', department: '', groupement: '', potential: 'medium', status: 'prospect', email: '', phone: '', contact_name: '', next_follow_up_at: '', notes: '' }); reload(); }
  return <div className="grid two"><Card title="Nouvelle pharmacie"><form onSubmit={submit} className="form-grid"><Input label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required /><Input label="Ville" value={form.city} onChange={(v) => setForm({ ...form, city: v })} /><Input label="Département" value={form.department} onChange={(v) => setForm({ ...form, department: v })} /><Input label="Groupement" value={form.groupement} onChange={(v) => setForm({ ...form, groupement: v })} /><Field label="Potentiel"><Select value={form.potential} onChange={(v) => setForm({ ...form, potential: v })} options={POTENTIALS} /></Field><Field label="Statut"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={PHARMACY_STATUSES} /></Field><Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} /><Input label="Téléphone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /><Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field><button className="primary">Créer</button></form></Card><Card title="Base pharmacies"><Table rows={state.pharmacies} columns={[["name", "Pharmacie"], ["city", "Ville"], ["groupement", "Groupement"], ["potential", "Potentiel", label], ["status", "Statut", (v) => <span className={statusClass(v)}>{label(v)}</span>]]} /></Card></div>;
}

function Input({ label: title, value, onChange, required, type = 'text' }) { return <Field label={title}><input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} /></Field>; }

function Products({ state, reload }) {
  const [form, setForm] = useState({ brand_id: '', name: '', reference: '', category: '', pcb: 1, unit_price_ht: 0, public_price_ttc: '', vat_rate: 20 });
  async function submit(e) { e.preventDefault(); const { error } = await supabase.from('products').insert({ ...form, pcb: Number(form.pcb || 1), unit_price_ht: Number(form.unit_price_ht || 0), public_price_ttc: form.public_price_ttc === '' ? null : Number(form.public_price_ttc), vat_rate: Number(form.vat_rate || 20) }); if (error) return alert(error.message); setForm({ brand_id: '', name: '', reference: '', category: '', pcb: 1, unit_price_ht: 0, public_price_ttc: '', vat_rate: 20 }); reload(); }
  return <div className="grid two"><Card title="Créer produit"><form onSubmit={submit} className="form-grid"><Field label="Marque"><Select value={form.brand_id} onChange={(v) => setForm({ ...form, brand_id: v })} placeholder="Choisir" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Input label="Produit" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required /><Input label="Référence" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })} /><Input label="Catégorie" value={form.category} onChange={(v) => setForm({ ...form, category: v })} /><Input label="PCB" type="number" value={form.pcb} onChange={(v) => setForm({ ...form, pcb: v })} /><Input label="Prix HT" type="number" value={form.unit_price_ht} onChange={(v) => setForm({ ...form, unit_price_ht: v })} /><button className="primary">Ajouter</button></form></Card><Card title="Catalogue"><Table rows={state.products} columns={[["name", "Produit"], ["brands", "Marque", (_v, r) => r.brands?.name], ["reference", "Réf."], ["pcb", "PCB"], ["unit_price_ht", "HT", fmtMoney]]} /></Card></div>;
}

function Orders({ state, reload }) {
  const [order, setOrder] = useState({ pharmacy_id: '', brand_id: '', order_type: 'reassort', status: 'draft', discount_rate: 0, notes: '' });
  const [items, setItems] = useState([{ product_id: '', quantity: 1, discount_rate: 0 }]);
  const products = useMemo(() => state.products.filter((p) => p.brand_id === order.brand_id), [state.products, order.brand_id]);
  async function submit(e) { e.preventDefault(); if (!state.agent?.id) return alert('Agent non trouvé.'); const { data, error } = await supabase.from('orders').insert({ ...order, agent_id: state.agent.id, created_by: state.profile?.id || null, discount_rate: Number(order.discount_rate || 0) }).select('*').single(); if (error) return alert(error.message); const rows = items.filter((i) => i.product_id && Number(i.quantity) > 0).map((i) => { const p = state.products.find((x) => x.id === i.product_id); return { order_id: data.id, product_id: p.id, product_name_snapshot: p.name, reference_snapshot: p.reference, quantity: Number(i.quantity), pcb: p.pcb, unit_price_ht: Number(p.unit_price_ht || 0), discount_rate: Number(i.discount_rate || 0) }; }); if (rows.length) { const { error: itemError } = await supabase.from('order_items').insert(rows); if (itemError) return alert(itemError.message); } setOrder({ pharmacy_id: '', brand_id: '', order_type: 'reassort', status: 'draft', discount_rate: 0, notes: '' }); setItems([{ product_id: '', quantity: 1, discount_rate: 0 }]); reload(); }
  return <div className="stack"><Card title="Créer bon de commande"><form onSubmit={submit} className="stack"><div className="form-grid"><Field label="Pharmacie"><Select value={order.pharmacy_id} onChange={(v) => setOrder({ ...order, pharmacy_id: v })} placeholder="Choisir" options={state.pharmacies.map((p) => ({ value: p.id, label: `${p.name} — ${p.city || ''}` }))} /></Field><Field label="Marque"><Select value={order.brand_id} onChange={(v) => setOrder({ ...order, brand_id: v })} placeholder="Choisir" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Field label="Type"><Select value={order.order_type} onChange={(v) => setOrder({ ...order, order_type: v })} options={ORDER_TYPES} /></Field><Field label="Statut"><Select value={order.status} onChange={(v) => setOrder({ ...order, status: v })} options={ORDER_STATUSES} /></Field></div>{items.map((item, idx) => <div className="line-item" key={idx}><Select value={item.product_id} onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, product_id: v } : x))} placeholder="Produit" options={products.map((p) => ({ value: p.id, label: `${p.name} — ${fmtMoney(p.unit_price_ht)}` }))} /><input type="number" value={item.quantity} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} /><input type="number" value={item.discount_rate} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, discount_rate: e.target.value } : x))} placeholder="Remise %" /><button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}>Supprimer</button></div>)}<button type="button" onClick={() => setItems([...items, { product_id: '', quantity: 1, discount_rate: 0 }])}>+ ligne</button><button className="primary">Créer commande</button></form></Card><Card title="Commandes"><OrdersTable rows={state.orders} /></Card></div>;
}

function Finance({ state, reload }) {
  const [commission, setCommission] = useState({ order_id: '', base_amount_ht: 0, commission_rate: 0.15, fixed_amount: '', status: 'to_invoice' });
  const [invoice, setInvoice] = useState({ brand_id: '', period_start: '', period_end: '', due_date: '', total_ht: 0, vat_rate: 0, status: 'draft' });
  async function addCommission(e) { e.preventDefault(); if (!state.agent?.id) return alert('Agent non trouvé.'); const order = state.orders.find((o) => o.id === commission.order_id); const base = Number(commission.base_amount_ht || order?.total_after_discount_ht || 0); const fixed = commission.fixed_amount === '' ? null : Number(commission.fixed_amount); const rate = fixed !== null ? null : Number(commission.commission_rate || 0); const amount = fixed !== null ? fixed : Math.round(base * rate * 100) / 100; const { error } = await supabase.from('commissions').insert({ order_id: order.id, agent_id: state.agent.id, brand_id: order.brand_id, base_amount_ht: base, commission_rate: rate, fixed_amount: fixed, amount_ht: amount, status: commission.status }); if (error) return alert(error.message); reload(); }
  async function addInvoice(e) { e.preventDefault(); const totalHt = Number(invoice.total_ht || 0); const vatRate = Number(invoice.vat_rate || 0); const vat = Math.round(totalHt * vatRate) / 100; const { error } = await supabase.from('commission_invoices').insert({ ...invoice, agent_id: state.agent.id, brand_id: invoice.brand_id || null, total_ht: totalHt, vat_rate: vatRate, vat_amount: vat, total_ttc: totalHt + vat }); if (error) return alert(error.message); reload(); }
  return <div className="stack"><div className="grid two"><Card title="Créer commission"><form onSubmit={addCommission} className="form-grid"><Field label="Commande"><Select value={commission.order_id} onChange={(v) => { const o = state.orders.find((x) => x.id === v); setCommission({ ...commission, order_id: v, base_amount_ht: o?.total_after_discount_ht || 0 }); }} placeholder="Choisir" options={state.orders.map((o) => ({ value: o.id, label: `${o.order_number} — ${o.pharmacy_name}` }))} /></Field><Input label="Base HT" type="number" value={commission.base_amount_ht} onChange={(v) => setCommission({ ...commission, base_amount_ht: v })} /><Input label="Taux" type="number" value={commission.commission_rate} onChange={(v) => setCommission({ ...commission, commission_rate: v })} /><Input label="Fixe" type="number" value={commission.fixed_amount} onChange={(v) => setCommission({ ...commission, fixed_amount: v })} /><Field label="Statut"><Select value={commission.status} onChange={(v) => setCommission({ ...commission, status: v })} options={COMMISSION_STATUSES} /></Field><button className="primary">Créer</button></form></Card><Card title="Créer facture"><form onSubmit={addInvoice} className="form-grid"><Field label="Marque"><Select value={invoice.brand_id} onChange={(v) => setInvoice({ ...invoice, brand_id: v })} placeholder="Choisir" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Input label="Total HT" type="number" value={invoice.total_ht} onChange={(v) => setInvoice({ ...invoice, total_ht: v })} /><Input label="TVA %" type="number" value={invoice.vat_rate} onChange={(v) => setInvoice({ ...invoice, vat_rate: v })} /><Field label="Statut"><Select value={invoice.status} onChange={(v) => setInvoice({ ...invoice, status: v })} options={INVOICE_STATUSES} /></Field><button className="primary">Créer facture</button></form></Card></div><Card title="Commissions"><Table rows={state.commissions} columns={[["orders", "Commande", (_v, r) => r.orders?.order_number], ["brands", "Marque", (_v, r) => r.brands?.name], ["base_amount_ht", "Base", fmtMoney], ["amount_ht", "Commission", fmtMoney], ["status", "Statut", (v) => <span className={statusClass(v)}>{label(v)}</span>]]} /></Card><Card title="Factures"><Table rows={state.invoices} columns={[["invoice_number", "N°"], ["brands", "Marque", (_v, r) => r.brands?.name], ["total_ht", "HT", fmtMoney], ["total_ttc", "TTC", fmtMoney], ["status", "Statut", (v) => <span className={statusClass(v)}>{label(v)}</span>]]} /></Card></div>;
}

function Expenses({ state, reload }) {
  const [form, setForm] = useState({ brand_id: '', pharmacy_id: '', expense_date: new Date().toISOString().slice(0, 10), category: 'Carburant', description: '', amount_ht: 0, vat_amount: 0, amount_ttc: 0, expense_kind: 'personal', status: 'draft' });
  async function submit(e) { e.preventDefault(); if (!state.agent?.id) return alert('Agent non trouvé.'); const { error } = await supabase.from('expenses').insert({ ...form, agent_id: state.agent.id, created_by: state.profile?.id || null, brand_id: form.brand_id || null, pharmacy_id: form.pharmacy_id || null, amount_ht: Number(form.amount_ht), vat_amount: Number(form.vat_amount), amount_ttc: Number(form.amount_ttc) }); if (error) return alert(error.message); reload(); }
  return <div className="grid two"><Card title="Ajouter frais"><form onSubmit={submit} className="form-grid"><Field label="Marque"><Select value={form.brand_id} onChange={(v) => setForm({ ...form, brand_id: v })} placeholder="Aucune" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Field label="Pharmacie"><Select value={form.pharmacy_id} onChange={(v) => setForm({ ...form, pharmacy_id: v })} placeholder="Aucune" options={state.pharmacies.map((p) => ({ value: p.id, label: p.name }))} /></Field><Input label="Catégorie" value={form.category} onChange={(v) => setForm({ ...form, category: v })} /><Input label="TTC" type="number" value={form.amount_ttc} onChange={(v) => setForm({ ...form, amount_ttc: v })} /><Field label="Type"><Select value={form.expense_kind} onChange={(v) => setForm({ ...form, expense_kind: v })} options={EXPENSE_KINDS} /></Field><Field label="Statut"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={EXPENSE_STATUSES} /></Field><button className="primary">Créer frais</button></form></Card><Card title="Frais"><Table rows={state.expenses} columns={[["expense_date", "Date", fmtDate], ["category", "Catégorie"], ["amount_ttc", "TTC", fmtMoney], ["expense_kind", "Type", label], ["status", "Statut", (v) => <span className={statusClass(v)}>{label(v)}</span>]]} /></Card></div>;
}

function Imports({ state, reload, session }) {
  const [form, setForm] = useState({ import_type: 'customers', source: 'excel', brand_id: '', file: null });
  async function submit(e) { e.preventDefault(); if (!form.file) return alert('Ajoute un fichier.'); const path = `${session.user.id}/${Date.now()}-${form.file.name}`; const { error: uploadError } = await supabase.storage.from('imports').upload(path, form.file); if (uploadError) return alert(uploadError.message); const { data } = supabase.storage.from('imports').getPublicUrl(path); const { error } = await supabase.from('imports').insert({ import_type: form.import_type, source: form.source, brand_id: form.brand_id || null, uploaded_by: session.user.id, file_name: form.file.name, file_url: data.publicUrl, status: 'pending', summary: { note: 'Analyse automatique à brancher en V2.' } }); if (error) return alert(error.message); reload(); }
  return <div className="grid two"><Card title="Importer"><form onSubmit={submit} className="form-grid"><Field label="Type"><Select value={form.import_type} onChange={(v) => setForm({ ...form, import_type: v })} options={['customers', 'products', 'orders', 'expenses', 'other']} /></Field><Field label="Source"><Select value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={['csv', 'excel', 'pdf', 'gmail', 'manual']} /></Field><Field label="Marque"><Select value={form.brand_id} onChange={(v) => setForm({ ...form, brand_id: v })} placeholder="Aucune" options={state.brands.map((b) => ({ value: b.id, label: b.name }))} /></Field><Field label="Fichier"><input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} /></Field><button className="primary">Importer</button></form></Card><Card title="Imports à valider"><Table rows={state.imports} columns={[["file_name", "Fichier"], ["import_type", "Type", label], ["source", "Source", label], ["status", "Statut", (v) => <span className={statusClass(v)}>{label(v)}</span>]]} /></Card></div>;
}

createRoot(document.getElementById('root')).render(<App />);
