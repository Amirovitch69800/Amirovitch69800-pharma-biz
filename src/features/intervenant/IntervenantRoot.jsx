import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useIntervenantData } from './useIntervenantData.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft: 'Brouillon', proposed: 'Proposee', accepted: 'Acceptee', refused: 'Refusee',
  assigned: 'Assignee', confirmed: 'Confirmee', scheduled: 'Planifiee',
  in_progress: 'En cours', report_submitted: 'CR soumis', under_review: 'En revision',
  completed: 'Terminee', validated: 'Validee', payable: 'Facturable', paid: 'Payee',
  submitted: 'Soumis', cancelled: 'Annulee',
};

const STATUS_COLOR = {
  proposed: 'amber', accepted: 'blue', confirmed: 'orange', scheduled: 'blue',
  in_progress: 'blue', report_submitted: 'orange', under_review: 'orange',
  submitted: 'orange', completed: 'green', validated: 'green', payable: 'orange',
  paid: 'green', refused: 'muted', cancelled: 'muted', draft: 'muted',
};

const NEEDS_REPORT = new Set(['accepted', 'confirmed', 'scheduled', 'in_progress']);
const IS_BILLABLE = new Set(['validated', 'payable', 'paid']);

const PIPELINE_STAGES = [
  { label: 'Proposee', statuses: ['proposed'] },
  { label: 'Confirmee', statuses: ['accepted', 'confirmed', 'scheduled'] },
  { label: 'A realiser', statuses: ['in_progress'] },
  { label: 'CR requis', statuses: ['report_submitted', 'under_review'] },
  { label: 'Validee', statuses: ['completed', 'validated', 'payable'] },
  { label: 'Payee', statuses: ['paid'] },
];

const NAV = [
  { key: 'today', icon: '\u25ce', label: "Aujourd'hui" },
  { key: 'animations', icon: '\u25c9', label: 'Missions animation' },
  { key: 'formations', icon: '\u25a3', label: 'Sessions formation' },
  { key: 'planning', icon: '\u25a1', label: 'Planning & disponibilites' },
  { key: 'rapports', icon: '\u2713', label: 'Comptes rendus' },
  { key: 'documents', icon: '\u25a4', label: 'Documents' },
  { key: 'paiements', icon: '\u20ac', label: 'Factures & paiements' },
  { key: 'profil', icon: '\u25cf', label: 'Profil & competences' },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return 'IV';
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function fmtDate(value) {
  if (!value) return '\u2014';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateLong(value) {
  if (!value) return '\u2014';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// ─── Shared components ────────────────────────────────────────────────────────

function Badge({ status, label }) {
  const color = STATUS_COLOR[status] || 'muted';
  const text = label || STATUS_LABELS[status] || status;
  return <span className={`iv-badge iv-badge-${color}`}>{text}</span>;
}

function TypeBadge({ type }) {
  const isForm = type === 'formation';
  return <span className={`iv-badge ${isForm ? 'iv-badge-amber' : 'iv-badge-blue'}`}>{isForm ? 'Formation' : 'Animation'}</span>;
}

function Pipeline({ missions }) {
  return (
    <div className="iv-pipeline">
      {PIPELINE_STAGES.map(({ label, statuses }) => {
        const count = missions.filter((m) => statuses.includes(m.status)).length;
        return (
          <div className="iv-pipe" key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
            <i />
          </div>
        );
      })}
    </div>
  );
}

function ReportModal({ mission, onSubmit, onClose }) {
  const [unitsSold, setUnitsSold] = useState('');
  const [revenueHt, setRevenueHt] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const result = await onSubmit({ missionId: mission.id, unitsSold: Number(unitsSold), revenueHt: Number(revenueHt), comment });
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    onClose();
  }

  const isForm = mission.mission_type === 'formation';

  return (
    <div className="iv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="iv-modal">
        <div className="iv-modal-head">
          <div>
            <p>{isForm ? 'Bilan formation' : 'Compte rendu animation'}</p>
            <h3>{mission.title}</h3>
          </div>
          <button className="iv-close" onClick={onClose} type="button">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="iv-modal-body">
            <div className="iv-form-grid">
              {!isForm && (
                <div className="iv-field">
                  <label>Unites vendues</label>
                  <input min="0" onChange={(e) => setUnitsSold(e.target.value)} placeholder="0" type="number" value={unitsSold} />
                </div>
              )}
              <div className="iv-field">
                <label>{isForm ? 'Participants presents' : 'CA realise HT (EUR)'}</label>
                <input min="0" onChange={(e) => setRevenueHt(e.target.value)} placeholder="0" type="number" value={revenueHt} />
              </div>
            </div>
            <div className="iv-field">
              <label>Commentaire terrain</label>
              <textarea onChange={(e) => setComment(e.target.value)} placeholder={isForm ? 'Bilan de la session, taux de comprehension, points de suivi...' : 'Deroulement, retours pharmacie, points de vigilance...'} rows={4} value={comment} />
            </div>
            {error && <div className="iv-notice-error">{error}</div>}
          </div>
          <div className="iv-modal-foot">
            <button className="iv-btn" onClick={onClose} type="button">Annuler</button>
            <button className="iv-btn primary" disabled={submitting} type="submit">{submitting ? 'Envoi...' : (isForm ? 'Soumettre le bilan' : 'Soumettre le CR')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────────

function TodayView({ missions, reports, onSetView, onReport }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const reportedIds = useMemo(() => new Set(reports.map((r) => r.mission_id)), [reports]);
  const proposed = missions.filter((m) => m.status === 'proposed');
  const needsCr = missions.filter((m) => NEEDS_REPORT.has(m.status) && !reportedIds.has(m.id));
  const upcoming = missions.filter((m) => m.starts_at && new Date(m.starts_at) >= now && !['refused', 'cancelled'].includes(m.status)).slice(0, 8);
  const tasks = [
    ...proposed.map((m) => ({ type: 'warn', icon: '!', title: 'Reponse requise : ' + m.title, detail: (m.pharmacies?.name || '') + ' \u00b7 ' + fmtDate(m.starts_at), mission: m })),
    ...needsCr.map((m) => ({ type: 'ok', icon: '\u2713', title: 'CR a soumettre : ' + m.title, detail: (m.pharmacies?.name || '') + ' \u00b7 ' + fmtDate(m.starts_at), mission: m })),
  ];

  const thisMonthMissions = missions.filter((m) => m.starts_at && new Date(m.starts_at) >= monthStart);
  const totalUnits = reports.reduce((s, r) => s + Number(r.payload?.units_sold || 0), 0);
  const totalParticipants = missions.filter((m) => m.mission_type === 'formation' && IS_BILLABLE.has(m.status)).reduce((s) => s, 0);
  const totalBillable = missions.filter((m) => IS_BILLABLE.has(m.status) && m.status !== 'paid').reduce((s, m) => s + Number(m.fee_ht || 0), 0);
  const totalPaid = missions.filter((m) => m.status === 'paid').reduce((s, m) => s + Number(m.fee_ht || 0), 0);

  const animCount = thisMonthMissions.filter((m) => !m.mission_type || m.mission_type === 'animation').length;
  const formCount = thisMonthMissions.filter((m) => m.mission_type === 'formation').length;

  const nextMission = upcoming[0] || null;
  const isNextForm = nextMission?.mission_type === 'formation';

  return (
    <div className="iv-page">
      <div className="iv-page-title">
        <div>
          <span className="iv-eyebrow">{fmtDateLong(now)}</span>
          <h1>Bonjour.</h1>
        </div>
        <p>Votre planning rassemble vos deux metiers. Chaque intervention garde son brief, son compte rendu et sa remuneration propres.</p>
      </div>

      <div className="iv-hero">
        <div>
          <span className="iv-eyebrow">Une seule journee, deux metiers</span>
          <h2>Tout ce qui doit etre prepare, realise ou facture.</h2>
          <p>Les missions d'animation et les sessions de formation partagent votre agenda et vos disponibilites. PharmaBiz evite les doublons, detecte les conflits et centralise vos justificatifs.</p>
        </div>
        <div className="iv-hero-actions">
          {nextMission && (
            <button className="iv-btn primary" onClick={() => onSetView(isNextForm ? 'formations' : 'animations')} type="button">Demarrer la prochaine intervention</button>
          )}
          <button className="iv-btn" onClick={() => onSetView('planning')} type="button">Voir mon planning</button>
        </div>
      </div>

      <div className="iv-kpis">
        <div className="iv-kpi">
          <span>Interventions {now.toLocaleDateString('fr-FR', { month: 'long' })}</span>
          <strong>{thisMonthMissions.length}</strong>
          <small>{animCount} animations \u00b7 {formCount} formations</small>
        </div>
        <div className={`iv-kpi${totalUnits > 0 ? ' anim' : ''}`}>
          <span>Unites vendues</span>
          <strong>{totalUnits}</strong>
          <small>Animation uniquement</small>
        </div>
        <div className="iv-kpi train">
          <span>Personnes formees</span>
          <strong>{totalParticipants}</strong>
          <small>Formation uniquement</small>
        </div>
        <div className={`iv-kpi${needsCr.length > 0 ? ' orange' : ''}`}>
          <span>CR a remettre</span>
          <strong>{needsCr.length}</strong>
          <small>{needsCr.length > 0 ? 'Bloque la facturation' : 'Tous a jour'}</small>
        </div>
        <div className="iv-kpi finance">
          <span>A facturer</span>
          <strong>{fmtMoney(totalBillable)}</strong>
          <small>Prestations validees</small>
        </div>
        <div className="iv-kpi finance">
          <span>Paiements recus</span>
          <strong>{fmtMoney(totalPaid)}</strong>
          <small>Depuis le debut</small>
        </div>
      </div>

      <div className="iv-grid">
        <article className="iv-panel">
          <div className="iv-panel-head">
            <div><p>Planning unifie</p><h3>Ma journee</h3></div>
            <button className="iv-btn small" onClick={() => onSetView('planning')} type="button">Voir tout</button>
          </div>
          <div className="iv-timeline">
            {upcoming.length === 0 && <p className="iv-empty" style={{ padding: '16px 13px' }}>Aucune mission a venir.</p>}
            {upcoming.map((m) => {
              const isForm = m.mission_type === 'formation';
              return (
                <div className="iv-timeline-item" key={m.id}>
                  <time>{fmtDate(m.starts_at)}</time>
                  <div className={`iv-type-dot ${isForm ? 'form' : 'anim'}`}>{isForm ? '\u25a3' : '\u25c9'}</div>
                  <div>
                    <strong>{m.title}</strong>
                    <small>{m.pharmacies?.name || '\u2014'} \u00b7 {m.pharmacies?.city || ''} \u00b7 {m.brands?.name || ''}</small>
                    <Badge status={m.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {nextMission ? (
          <aside className={`iv-next-card${isNextForm ? ' form-type' : ''}`}>
            <div className="iv-next-top">
              <span className="iv-eyebrow">Prochaine intervention</span>
              <TypeBadge type={nextMission.mission_type} />
            </div>
            <h3>{nextMission.pharmacies?.name || nextMission.title}</h3>
            <p>{nextMission.title} \u00b7 {nextMission.pharmacies?.city || ''}</p>
            <div className="iv-mini-grid">
              <div className="iv-mini"><span>Date</span><strong>{fmtDate(nextMission.starts_at)}</strong></div>
              <div className="iv-mini"><span>Statut</span><strong>{STATUS_LABELS[nextMission.status] || nextMission.status}</strong></div>
              <div className="iv-mini"><span>Marque</span><strong>{nextMission.brands?.name || '\u2014'}</strong></div>
              <div className="iv-mini"><span>Honoraires</span><strong>{nextMission.fee_ht > 0 ? fmtMoney(nextMission.fee_ht) : '\u2014'}</strong></div>
            </div>
            <div className="iv-next-actions">
              {nextMission.status === 'proposed' && (
                <>
                  <button className="iv-btn primary" onClick={() => onReport({ type: 'accept', mission: nextMission })} type="button">Accepter</button>
                  <button className="iv-btn danger" onClick={() => onReport({ type: 'refuse', mission: nextMission })} type="button">Refuser</button>
                </>
              )}
              {NEEDS_REPORT.has(nextMission.status) && (
                <button className="iv-btn primary" onClick={() => onReport({ type: 'cr', mission: nextMission })} type="button">+ Soumettre le CR</button>
              )}
            </div>
          </aside>
        ) : (
          <aside className="iv-next-card">
            <div className="iv-next-top">
              <span className="iv-eyebrow">Prochaine intervention</span>
            </div>
            <h3 style={{ marginTop: 13 }}>Aucune mission</h3>
            <p>Aucune intervention planifiee pour le moment.</p>
          </aside>
        )}
      </div>

      <div className="iv-grid iv-grid-equal">
        <article className="iv-panel">
          <div className="iv-panel-head"><div><p>A traiter</p><h3>Actions prioritaires</h3></div></div>
          <div className="iv-task-list">
            {tasks.length === 0 && <p className="iv-empty" style={{ padding: '16px 13px' }}>Aucune action requise.</p>}
            {tasks.map((t, i) => (
              <div className={`iv-task${t.type === 'warn' ? ' warn' : ''}`} key={i}>
                <div className="iv-task-icon">{t.icon}</div>
                <div><strong>{t.title}</strong><small>{t.detail}</small></div>
              </div>
            ))}
          </div>
        </article>

        <article className="iv-panel">
          <div className="iv-panel-head">
            <div><p>Remuneration</p><h3>A facturer et a encaisser</h3></div>
            <button className="iv-btn small" onClick={() => onSetView('paiements')} type="button">Voir le detail</button>
          </div>
          <div className="iv-fin-summary">
            <div className="iv-fin-row"><span>A facturer</span><strong style={{ color: 'var(--az-orange)' }}>{fmtMoney(totalBillable)}</strong></div>
            <div className="iv-fin-row"><span>Bloque (CR manquant)</span><strong>{fmtMoney(missions.filter((m) => NEEDS_REPORT.has(m.status)).reduce((s, m) => s + Number(m.fee_ht || 0), 0))}</strong></div>
            <div className="iv-fin-row"><span>Deja encaisse</span><strong style={{ color: 'var(--az-green)' }}>{fmtMoney(totalPaid)}</strong></div>
          </div>
        </article>
      </div>
    </div>
  );
}

function MissionTable({ missions, reports, onOpenReport, onAccept, onRefuse, type }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const reportedIds = useMemo(() => new Set(reports.map((r) => r.mission_id)), [reports]);

  const filtered = missions.filter((m) => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || [m.title, m.pharmacies?.name, m.pharmacies?.city, m.brands?.name].some((v) => v?.toLowerCase().includes(q));
  });

  const headings = type === 'formation'
    ? ['Session', 'Pharmacie', 'Date', 'Support', 'Remuneration', 'Statut', 'Action']
    : ['Mission', 'Pharmacie', 'Date', 'Objectif', 'Remuneration', 'Statut', 'Action'];

  return (
    <div className="iv-panel">
      <div className="iv-panel-head">
        <div>
          <p>{type === 'formation' ? 'Planning pedagogique' : 'Portefeuille de missions'}</p>
          <h3>{type === 'formation' ? 'Formations confiees via PharmaBiz' : 'Animations confiees via PharmaBiz'}</h3>
        </div>
      </div>
      <div className="iv-panel-body">
        <div className="iv-filters">
          <input onChange={(e) => setSearch(e.target.value)} placeholder={type === 'formation' ? 'Pharmacie, theme ou marque...' : 'Pharmacie, ville ou marque...'} value={search} />
          <select onChange={(e) => setStatusFilter(e.target.value)} value={statusFilter}>
            <option value="all">Tous statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="iv-table-wrap">
        <table className="iv-table">
          <thead><tr>{headings.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td className="iv-empty" colSpan={7}>Aucune mission correspondante.</td></tr>
            )}
            {filtered.map((m) => {
              const needsCr = NEEDS_REPORT.has(m.status) && !reportedIds.has(m.id);
              return (
                <tr key={m.id}>
                  <td>
                    <strong>{m.title}</strong>
                    <small>{m.brands?.name || '\u2014'}</small>
                  </td>
                  <td>
                    <strong>{m.pharmacies?.name || '\u2014'}</strong>
                    <small>{m.pharmacies?.city || ''}</small>
                  </td>
                  <td>{fmtDate(m.starts_at)}</td>
                  <td>{type === 'formation' ? '\u2014' : (m.target_units > 0 ? m.target_units + ' unites' : '\u2014')}</td>
                  <td>{m.fee_ht > 0 ? fmtMoney(m.fee_ht) : '\u2014'}</td>
                  <td><Badge status={m.status} /></td>
                  <td style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {m.status === 'proposed' && (
                      <>
                        <button className="iv-btn small primary" onClick={() => onAccept(m.id)} type="button">Accepter</button>
                        <button className="iv-btn small danger" onClick={() => onRefuse(m.id)} type="button">Refuser</button>
                      </>
                    )}
                    {needsCr && (
                      <button className="iv-btn small" onClick={() => onOpenReport(m)} type="button">+ CR</button>
                    )}
                    {!needsCr && m.status !== 'proposed' && (
                      <button className="iv-btn small" onClick={() => onOpenReport(m)} type="button">Ouvrir</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnimationsView({ missions, reports, onReport, onAccept, onRefuse }) {
  const animMissions = useMemo(() => missions.filter((m) => !m.mission_type || m.mission_type === 'animation'), [missions]);
  const [reportMission, setReportMission] = useState(null);

  return (
    <div className="iv-page">
      {reportMission && <ReportModal mission={reportMission} onClose={() => setReportMission(null)} onSubmit={onReport} />}
      <div className="iv-page-title">
        <div><span className="iv-eyebrow">Role animateur</span><h1>Missions animation</h1></div>
        <p>Acceptez les propositions, preparez votre intervention, renseignez les ventes et transmettez les preuves attendues.</p>
        <div className="iv-title-actions">
          <button className="iv-btn" type="button">Mes disponibilites</button>
          <button className="iv-btn primary" onClick={() => { const m = animMissions.find((x) => NEEDS_REPORT.has(x.status) && !reports.some((r) => r.mission_id === x.id)); if (m) setReportMission(m); }} type="button">+ Compte rendu animation</button>
        </div>
      </div>
      <Pipeline missions={animMissions} />
      <MissionTable missions={animMissions} onAccept={onAccept} onOpenReport={setReportMission} onRefuse={onRefuse} reports={reports} type="animation" />
    </div>
  );
}

function FormationsView({ missions, reports, onReport, onAccept, onRefuse }) {
  const formMissions = useMemo(() => missions.filter((m) => m.mission_type === 'formation'), [missions]);
  const [reportMission, setReportMission] = useState(null);

  return (
    <div className="iv-page">
      {reportMission && <ReportModal mission={reportMission} onClose={() => setReportMission(null)} onSubmit={onReport} />}
      <div className="iv-page-title">
        <div><span className="iv-eyebrow">Role formateur</span><h1>Sessions formation</h1></div>
        <p>Preparez les supports, gerez les participants, evaluez la comprehension et programmez le suivi post-formation.</p>
        <div className="iv-title-actions">
          <button className="iv-btn" type="button">Supports disponibles</button>
          <button className="iv-btn amber" onClick={() => { const m = formMissions.find((x) => NEEDS_REPORT.has(x.status) && !reports.some((r) => r.mission_id === x.id)); if (m) setReportMission(m); }} type="button">+ Bilan formation</button>
        </div>
      </div>
      {formMissions.length > 0 ? (
        <>
          <Pipeline missions={formMissions} />
          <MissionTable missions={formMissions} onAccept={onAccept} onOpenReport={setReportMission} onRefuse={onRefuse} reports={reports} type="formation" />
        </>
      ) : (
        <div className="iv-panel"><div className="iv-panel-body"><p className="iv-empty">Aucune session de formation assignee pour l'instant.</p></div></div>
      )}
    </div>
  );
}

function PlanningView({ missions }) {
  const now = new Date();
  const upcoming = missions
    .filter((m) => m.starts_at && !['refused', 'cancelled'].includes(m.status))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = missions
    .filter((m) => m.starts_at && new Date(m.starts_at) < now && !['refused', 'cancelled'].includes(m.status))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

  return (
    <div className="iv-page">
      <div className="iv-page-title">
        <div><span className="iv-eyebrow">Agenda partage</span><h1>Planning &amp; disponibilites</h1></div>
        <p>Un seul calendrier pour vos animations, formations et indisponibilites. Les conflits entre vos deux roles sont detectes automatiquement.</p>
        <div className="iv-title-actions">
          <button className="iv-btn primary" type="button">+ Indisponibilite</button>
        </div>
      </div>

      <div className="iv-panel" style={{ marginBottom: 16 }}>
        <div className="iv-panel-head">
          <div><p>A venir</p><h3>Prochaines interventions</h3></div>
          <div style={{ display: 'flex', gap: 7 }}>
            <span className="iv-badge iv-badge-orange">Animation</span>
            <span className="iv-badge iv-badge-amber">Formation</span>
          </div>
        </div>
        <div className="iv-timeline">
          {upcoming.length === 0 && <p className="iv-empty" style={{ padding: '16px 13px' }}>Aucune intervention a venir.</p>}
          {upcoming.map((m) => {
            const isForm = m.mission_type === 'formation';
            return (
              <div className="iv-timeline-item" key={m.id}>
                <time>{fmtDate(m.starts_at)}</time>
                <div className={`iv-type-dot ${isForm ? 'form' : 'anim'}`}>{isForm ? '\u25a3' : '\u25c9'}</div>
                <div>
                  <strong>{m.title}</strong>
                  <small>{m.pharmacies?.name || '\u2014'} \u00b7 {m.pharmacies?.city || ''}</small>
                  <Badge status={m.status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {past.length > 0 && (
        <div className="iv-panel">
          <div className="iv-panel-head"><div><p>Historique</p><h3>Interventions passees</h3></div></div>
          <div className="iv-timeline">
            {past.slice(0, 10).map((m) => {
              const isForm = m.mission_type === 'formation';
              return (
                <div className="iv-timeline-item" key={m.id} style={{ opacity: .7 }}>
                  <time>{fmtDate(m.starts_at)}</time>
                  <div className={`iv-type-dot ${isForm ? 'form' : 'anim'}`}>{isForm ? '\u25a3' : '\u25c9'}</div>
                  <div>
                    <strong>{m.title}</strong>
                    <small>{m.pharmacies?.name || '\u2014'} \u00b7 {m.pharmacies?.city || ''}</small>
                    <Badge status={m.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RapportsView({ missions, reports, onSubmit }) {
  const [reportMission, setReportMission] = useState(null);
  const reportedIds = useMemo(() => new Set(reports.map((r) => r.mission_id)), [reports]);
  const needsCr = missions.filter((m) => NEEDS_REPORT.has(m.status) && !reportedIds.has(m.id));
  const validatedCount = reports.filter((r) => r.status === 'validated').length;
  const totalUnits = reports.reduce((s, r) => s + Number(r.payload?.units_sold || 0), 0);

  // Build report cards combining reports with their missions
  const reportCards = reports.map((r) => {
    const m = missions.find((x) => x.id === r.mission_id);
    return { report: r, mission: m };
  });
  // Add missions needing CR as "to complete" cards
  const pendingCards = needsCr.map((m) => ({ report: null, mission: m }));

  return (
    <div className="iv-page">
      {reportMission && <ReportModal mission={reportMission} onClose={() => setReportMission(null)} onSubmit={onSubmit} />}
      <div className="iv-page-title">
        <div><span className="iv-eyebrow">Preuves terrain</span><h1>Comptes rendus</h1></div>
        <p>Deux formulaires adaptes a vos metiers : ventes et photos pour l'animation, participants et evaluation pour la formation.</p>
        <div className="iv-title-actions">
          <button className="iv-btn primary" onClick={() => needsCr[0] && setReportMission(needsCr[0])} type="button">+ CR animation</button>
          <button className="iv-btn amber" onClick={() => { const m = needsCr.find((x) => x.mission_type === 'formation'); if (m) setReportMission(m); }} type="button">+ Bilan formation</button>
        </div>
      </div>

      <div className="iv-kpis">
        <div className={`iv-kpi${needsCr.length > 0 ? ' orange' : ''}`}>
          <span>A completer</span>
          <strong>{needsCr.length}</strong>
          <small>{needsCr.length > 0 ? 'Facturation bloquee' : 'Tous a jour'}</small>
        </div>
        <div className="iv-kpi finance">
          <span>Valides</span>
          <strong>{validatedCount}</strong>
          <small>{validatedCount > 0 ? 'Prets ou deja payes' : '\u2014'}</small>
        </div>
        <div className="iv-kpi anim">
          <span>Ventes declarees</span>
          <strong>{totalUnits}</strong>
          <small>Unites animation</small>
        </div>
        <div className="iv-kpi">
          <span>CR soumis</span>
          <strong>{reports.length}</strong>
          <small>Toutes missions</small>
        </div>
        <div className="iv-kpi">
          <span>En attente</span>
          <strong>{reports.length - validatedCount}</strong>
          <small>Validation en cours</small>
        </div>
        <div className="iv-kpi">
          <span>Total missions</span>
          <strong>{missions.length}</strong>
          <small>Portefeuille global</small>
        </div>
      </div>

      {(pendingCards.length > 0 || reportCards.length > 0) && (
        <div className="iv-report-cards">
          {pendingCards.map(({ mission: m }) => (
            <div className="iv-report-card" key={m.id}>
              <div className="iv-report-card-top">
                <TypeBadge type={m.mission_type} />
                <Badge status="report_submitted" label={m.mission_type === 'formation' ? 'Bilan requis' : 'Compte rendu requis'} />
              </div>
              <h4>{m.pharmacies?.name || m.title}</h4>
              <p>{fmtDate(m.starts_at)} \u00b7 {m.brands?.name || '\u2014'}</p>
              <div className="iv-report-metrics">
                <div className="iv-report-metric"><span>Resultat</span><strong>A saisir</strong></div>
                <div className="iv-report-metric"><span>Preuve</span><strong>A joindre</strong></div>
              </div>
              <button className="iv-btn primary" onClick={() => setReportMission(m)} type="button">Completer</button>
            </div>
          ))}
          {reportCards.map(({ report: r, mission: m }) => (
            <div className="iv-report-card" key={r.id}>
              <div className="iv-report-card-top">
                <TypeBadge type={m?.mission_type} />
                <Badge status={r.status || 'submitted'} />
              </div>
              <h4>{m?.pharmacies?.name || m?.title || 'Mission'}</h4>
              <p>{fmtDate(r.submitted_at || r.created_at)} \u00b7 {m?.brands?.name || '\u2014'}</p>
              <div className="iv-report-metrics">
                <div className="iv-report-metric">
                  <span>Resultat</span>
                  <strong>{r.payload?.units_sold > 0 ? r.payload.units_sold + ' unites' : '\u2014'}</strong>
                </div>
                <div className="iv-report-metric">
                  <span>CA HT</span>
                  <strong>{r.payload?.revenue_ht > 0 ? fmtMoney(r.payload.revenue_ht) : '\u2014'}</strong>
                </div>
              </div>
              <button className="iv-btn" type="button">Consulter</button>
            </div>
          ))}
        </div>
      )}
      {pendingCards.length === 0 && reportCards.length === 0 && (
        <div className="iv-panel"><div className="iv-panel-body"><p className="iv-empty">Aucun compte rendu pour le moment.</p></div></div>
      )}
    </div>
  );
}

function DocumentsView() {
  const DOCS = [
    { id: 1, type: 'Brief', name: 'Brief animation Plein Sud', detail: 'Objectifs, produits prioritaires et contact pharmacie.', date: '11/07/2026', format: 'PDF' },
    { id: 2, type: 'Support', name: 'Argumentaire gamme', detail: 'Benefices, objections et recommandations associees.', date: '08/07/2026', format: 'PDF' },
    { id: 3, type: 'Administratif', name: 'Attestation RC professionnelle', detail: "Valide jusqu'au 31/12/2026.", date: '02/01/2026', format: 'PDF' },
    { id: 4, type: 'Administratif', name: 'RIB professionnel', detail: 'Compte utilise pour les paiements PharmaBiz.', date: '03/06/2026', format: 'PDF' },
  ];
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? DOCS : DOCS.filter((d) => d.type === filter);

  return (
    <div className="iv-page">
      <div className="iv-page-title">
        <div><span className="iv-eyebrow">Bibliotheque professionnelle</span><h1>Documents</h1></div>
        <p>Supports de marque, briefs d'intervention, documents administratifs et certifications dans un seul espace.</p>
        <div className="iv-title-actions">
          <button className="iv-btn primary" type="button">Telecharger le dossier</button>
        </div>
      </div>
      <div className="iv-filters" style={{ marginBottom: 16 }}>
        <select onChange={(e) => setFilter(e.target.value)} value={filter}>
          <option value="all">Tous les documents</option>
          <option value="Brief">Briefs</option>
          <option value="Support">Supports</option>
          <option value="Administratif">Administratif</option>
          <option value="Certification">Certifications</option>
        </select>
      </div>
      <div className="iv-doc-grid">
        {filtered.map((d) => (
          <div className="iv-doc" key={d.id}>
            <div className="iv-doc-icon">{d.format}</div>
            <h4>{d.name}</h4>
            <p>{d.detail}</p>
            <div className="iv-doc-foot">
              <small>{d.type} \u00b7 {d.date}</small>
              <button className="iv-btn small" type="button">Telecharger</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaiementsView({ missions }) {
  const totalAll = missions.reduce((s, m) => s + Number(m.fee_ht || 0), 0);
  const totalPaid = missions.filter((m) => m.status === 'paid').reduce((s, m) => s + Number(m.fee_ht || 0), 0);
  const totalBillable = missions.filter((m) => IS_BILLABLE.has(m.status) && m.status !== 'paid').reduce((s, m) => s + Number(m.fee_ht || 0), 0);
  const totalBlocked = missions.filter((m) => NEEDS_REPORT.has(m.status)).reduce((s, m) => s + Number(m.fee_ht || 0), 0);
  const billable = missions.filter((m) => m.fee_ht > 0 && !['refused', 'cancelled', 'draft'].includes(m.status))
    .sort((a, b) => new Date(b.starts_at || 0) - new Date(a.starts_at || 0));

  return (
    <div className="iv-page">
      <div className="iv-page-title">
        <div><span className="iv-eyebrow">Suivi financier</span><h1>Factures &amp; paiements</h1></div>
        <p>Les prestations validees deviennent facturables. Les revenus animation et formation restent separes, mais sont reunis dans votre suivi global.</p>
        <div className="iv-title-actions">
          <button className="iv-btn" type="button">Exporter CSV</button>
          <button className="iv-btn primary" type="button">+ Creer une facture</button>
        </div>
      </div>

      <div className="iv-finance-grid">
        <div className="iv-finance-card">
          <span>Revenus suivis</span>
          <strong>{fmtMoney(totalAll)}</strong>
          <small>Animations + formations</small>
        </div>
        <div className="iv-finance-card paid">
          <span>Deja paye</span>
          <strong>{fmtMoney(totalPaid)}</strong>
          <small>Verse sur votre compte</small>
        </div>
        <div className="iv-finance-card due">
          <span>A facturer</span>
          <strong>{fmtMoney(totalBillable)}</strong>
          <small>Prestations validees</small>
        </div>
        <div className="iv-finance-card">
          <span>Bloque</span>
          <strong>{fmtMoney(totalBlocked)}</strong>
          <small>Compte rendu requis</small>
        </div>
      </div>

      <div className="iv-panel">
        <div className="iv-panel-head"><div><p>Historique financier</p><h3>Prestations et factures</h3></div></div>
        {billable.length === 0 ? (
          <p className="iv-empty" style={{ padding: '13px' }}>Aucune prestation avec honoraires enregistres.</p>
        ) : (
          <div className="iv-table-wrap">
            <table className="iv-table">
              <thead>
                <tr><th>Reference</th><th>Prestation</th><th>Type</th><th>Date</th><th>Montant</th><th>Facture</th><th>Paiement</th></tr>
              </thead>
              <tbody>
                {billable.map((m) => {
                  const payLabel = m.status === 'paid' ? 'Paye' : IS_BILLABLE.has(m.status) ? 'Facturable' : 'CR requis';
                  const payColor = m.status === 'paid' ? 'green' : IS_BILLABLE.has(m.status) ? 'orange' : 'amber';
                  return (
                    <tr key={m.id}>
                      <td><strong>{m.id?.slice(0, 8).toUpperCase()}</strong><small>{m.brands?.name || '\u2014'}</small></td>
                      <td><strong>{m.title}</strong><small>{m.pharmacies?.name || '\u2014'}</small></td>
                      <td><TypeBadge type={m.mission_type} /></td>
                      <td>{fmtDate(m.starts_at)}</td>
                      <td><strong>{fmtMoney(m.fee_ht)}</strong></td>
                      <td>{m.status === 'paid' ? 'Emise' : IS_BILLABLE.has(m.status) ? 'A creer' : 'Bloquee'}</td>
                      <td><span className={`iv-badge iv-badge-${payColor}`}>{payLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfilView({ animator, profile, onSignOut }) {
  const ini = initials(animator?.full_name || profile?.full_name);
  const hasFormation = animator?.animator_type === 'formation' || animator?.animator_type === 'both';

  if (!animator) {
    return (
      <div className="iv-page">
        <p className="iv-empty">Profil intervenant non trouve.</p>
        <button className="iv-btn danger" onClick={onSignOut} style={{ marginTop: 12 }} type="button">Se deconnecter</button>
      </div>
    );
  }

  return (
    <div className="iv-page">
      <div className="iv-page-title">
        <div><span className="iv-eyebrow">Compte intervenant unique</span><h1>Profil &amp; competences</h1></div>
        <p>Une personne peut cumuler plusieurs roles. Les competences, zones, disponibilites et documents sont partages, tandis que chaque role conserve ses propres habilitations.</p>
        <div className="iv-title-actions">
          <button className="iv-btn primary" type="button">Enregistrer les modifications</button>
        </div>
      </div>

      <div className="iv-profile-grid">
        <div className="iv-identity-card">
          <div className="iv-identity-top">
            <div className="iv-identity-avatar">{ini}</div>
            <div>
              <h3>{animator.full_name || 'Intervenant'}</h3>
              <p>Prestataire terrain {animator.zones?.length > 0 ? '\u00b7 ' + animator.zones.join(', ') : ''}</p>
              <span className="iv-badge iv-badge-good" style={{ marginTop: 7 }}>Profil verifie</span>
            </div>
          </div>
          <div className="iv-role-block">
            <span className="iv-eyebrow">Roles actifs</span>
            <div className="iv-role-line anim">
              <span className="iv-status-dot" />
              <div><strong>Animateur terrain</strong><small>Animations, merchandising, ventes et photos.</small></div>
              <span className="iv-badge iv-badge-good">Actif</span>
            </div>
            {hasFormation && (
              <div className="iv-role-line form">
                <span className="iv-status-dot" />
                <div><strong>Formateur officinal</strong><small>Sessions, presence, quiz et suivi pedagogique.</small></div>
                <span className="iv-badge iv-badge-good">Actif</span>
              </div>
            )}
          </div>
          <div className="iv-notice-box" style={{ marginTop: 15 }}>
            La marque suit vos missions, validations et paiements, mais les echanges passent par des workflows PharmaBiz structures.
          </div>
        </div>

        <div className="iv-panel">
          <div className="iv-panel-head"><div><p>Informations professionnelles</p><h3>Profil partage entre vos deux roles</h3></div></div>
          <div className="iv-panel-body">
            <div className="iv-form-grid">
              <div className="iv-field"><label>Nom complet</label><input defaultValue={animator.full_name || ''} readOnly /></div>
              <div className="iv-field"><label>Statut</label><input defaultValue={animator.status || '\u2014'} readOnly /></div>
              {animator.email && <div className="iv-field"><label>Email</label><input defaultValue={animator.email} readOnly /></div>}
              {animator.phone && <div className="iv-field"><label>Telephone</label><input defaultValue={animator.phone} readOnly /></div>}
              {animator.zones?.length > 0 && <div className="iv-field"><label>Zones d'intervention</label><input defaultValue={animator.zones.join(', ')} readOnly /></div>}
              {animator.daily_rate_ht > 0 && <div className="iv-field"><label>TJM HT</label><input defaultValue={fmtMoney(animator.daily_rate_ht) + ' / jour'} readOnly /></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function IntervenantRoot({ session }) {
  const { acceptMission, error, lastSyncedAt, loading, refuseMission, reload, state, submitReport } = useIntervenantData(session);
  const [activeView, setActiveView] = useState('today');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  function showToast(msg) {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2800);
  }

  async function handleAccept(missionId) {
    const result = await acceptMission(missionId);
    showToast(result.error || 'Mission acceptee.');
  }

  async function handleRefuse(missionId) {
    const result = await refuseMission(missionId);
    showToast(result.error || 'Mission refusee.');
  }

  async function handleReport(params) {
    // Called from today next-card quick actions
    if (params.type === 'accept') { await handleAccept(params.mission.id); return; }
    if (params.type === 'refuse') { await handleRefuse(params.mission.id); return; }
    const result = await submitReport(params);
    if (!result.error) showToast('Compte rendu soumis.');
    return result;
  }

  async function handleSubmitReport(params) {
    const result = await submitReport(params);
    if (!result.error) showToast('Compte rendu soumis avec succes.');
    return result;
  }

  if (loading && !lastSyncedAt) {
    return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Chargement de ton espace...</strong></main>;
  }

  const animatorName = state.animator?.full_name || session?.user?.email || 'Intervenant';
  const ini = initials(animatorName);
  const proposed = state.missions.filter((m) => m.status === 'proposed').length;
  const reportedIds = new Set(state.reports.map((r) => r.mission_id));
  const needsCrCount = state.missions.filter((m) => NEEDS_REPORT.has(m.status) && !reportedIds.has(m.id)).length;
  const hasAnimations = state.missions.some((m) => !m.mission_type || m.mission_type === 'animation');
  const hasFormations = state.missions.some((m) => m.mission_type === 'formation');

  function navBadge(key) {
    if (key === 'today') return proposed + needsCrCount;
    if (key === 'animations') return proposed;
    if (key === 'rapports') return needsCrCount;
    return 0;
  }

  return (
    <div className="iv-app">

      {/* Sidebar */}
      <aside className="iv-side">
        <div className="iv-brand">
          <div className="iv-brand-mark">+</div>
          <span className="iv-brand-text">
            <strong>PharmaBiz</strong>
            <small>Espace intervenant</small>
          </span>
        </div>

        <div className="iv-profile-card">
          <div className="iv-profile-main">
            <div className="iv-avatar">{ini}</div>
            <div>
              <strong>{animatorName}</strong>
              <small>Prestataire terrain{state.animator?.zones?.length > 0 ? ' \u00b7 ' + state.animator.zones.slice(0, 2).join(', ') : ''}</small>
            </div>
          </div>
          <div className="iv-role-badges">
            {hasAnimations && <span className="iv-role-badge anim">Animateur actif</span>}
            {hasFormations && <span className="iv-role-badge form">Formateur actif</span>}
          </div>
        </div>

        <nav className="iv-nav">
          {NAV.map(({ key, icon, label }) => {
            const badge = navBadge(key);
            return (
              <button className={activeView === key ? 'is-active' : ''} key={key} onClick={() => setActiveView(key)} type="button">
                <i>{icon}</i>
                {label}
                {badge > 0 && <b>{badge}</b>}
              </button>
            );
          })}
        </nav>

        <div className="iv-side-bottom">
          <button className="iv-side-link" onClick={() => supabase.auth.signOut()} type="button">Se deconnecter</button>
        </div>
      </aside>

      {/* Main */}
      <main className="iv-main">
        <header className="iv-top">
          <div className="iv-top-name">
            <strong>{animatorName.split(' ')[0]}</strong>
            {lastSyncedAt && <small>Donnees synchronisees</small>}
          </div>
          <div className="iv-spacer" />
          {error && <span style={{ fontSize: 9, color: 'var(--az-red)', fontWeight: 850 }}>Erreur de sync</span>}
          <button className="iv-top-btn" onClick={reload} type="button">&#8635; Actualiser</button>
        </header>

        {activeView === 'today' && <TodayView missions={state.missions} onReport={handleReport} onSetView={setActiveView} reports={state.reports} />}
        {activeView === 'animations' && <AnimationsView missions={state.missions} onAccept={handleAccept} onRefuse={handleRefuse} onReport={handleSubmitReport} reports={state.reports} />}
        {activeView === 'formations' && <FormationsView missions={state.missions} onAccept={handleAccept} onRefuse={handleRefuse} onReport={handleSubmitReport} reports={state.reports} />}
        {activeView === 'planning' && <PlanningView missions={state.missions} />}
        {activeView === 'rapports' && <RapportsView missions={state.missions} onSubmit={handleSubmitReport} reports={state.reports} />}
        {activeView === 'documents' && <DocumentsView />}
        {activeView === 'paiements' && <PaiementsView missions={state.missions} />}
        {activeView === 'profil' && <ProfilView animator={state.animator} onSignOut={() => supabase.auth.signOut()} profile={state.profile} />}
      </main>

      <div className={`iv-toast${toastVisible ? ' show' : ''}`}>{toast}</div>
    </div>
  );
}
