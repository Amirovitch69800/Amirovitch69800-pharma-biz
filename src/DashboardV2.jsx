import React from 'react';

function money(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return 'Sans échéance';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function brandSummary(state, brand) {
  if (!brand) return { accounts: 0, clients: 0, prospects: 0, actions: 0 };
  const relations = (state.pharmacyBrands || []).filter((row) => row.brand_id === brand.id);
  const actions = (state.followUps || []).filter((row) => row.brand_id === brand.id && row.status === 'todo').length;
  return {
    accounts: relations.length,
    clients: relations.filter((row) => ['active_client', 'implanted'].includes(row.status)).length,
    prospects: relations.filter((row) => ['prospect', 'contacted', 'interested'].includes(row.status)).length,
    actions,
  };
}

export default function DashboardV2({ state }) {
  const todo = (state.followUps || []).filter((row) => row.status === 'todo');
  const overdue = todo.filter((row) => row.due_at && new Date(row.due_at) < new Date());
  const orders = (state.orders || []).filter((row) => !['delivered', 'cancelled'].includes(row.status));
  const commissions = (state.commissions || []).filter((row) => ['approved', 'to_invoice'].includes(row.status));
  const commissionAmount = commissions.reduce((sum, row) => sum + Number(row.amount_ht || 0), 0);
  const brands = state.brands || [];
  const naali = brands.find((brand) => /naali/i.test(brand.name));
  const vk = brands.find((brand) => /vk swiss/i.test(brand.name));
  const brandRows = [naali, vk].filter(Boolean).map((brand) => ({ brand, ...brandSummary(state, brand) }));

  return (
    <div className="ops-dashboard">
      <section className="ops-summary">
        <div><span>À traiter</span><strong>{todo.length}</strong><small>actions ouvertes</small></div>
        <div><span>En retard</span><strong>{overdue.length}</strong><small>actions à reprendre</small></div>
        <div><span>Commandes</span><strong>{orders.length}</strong><small>en cours</small></div>
        <div><span>Commissions</span><strong>{money(commissionAmount)}</strong><small>à facturer</small></div>
      </section>

      <section className="ops-grid">
        <div className="ops-panel">
          <header><h2>Activités prioritaires</h2><span>{todo.length} ouvertes</span></header>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Action</th><th>Compte</th><th>Marque</th><th>Échéance</th></tr></thead>
              <tbody>
                {todo.slice(0, 8).map((task) => (
                  <tr key={task.id}>
                    <td><strong>{task.title}</strong><small>{task.reason || 'Suivi commercial'}</small></td>
                    <td>{task.pharmacies?.name || 'Compte non renseigné'}</td>
                    <td>{task.brands?.name || 'Toutes marques'}</td>
                    <td>{shortDate(task.due_at)}</td>
                  </tr>
                ))}
                {!todo.length && <tr><td colSpan="4" className="ops-empty">Aucune action ouverte.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ops-panel">
          <header><h2>Portefeuilles marques</h2><span>{brands.length} marques</span></header>
          <div className="brand-ledger">
            {brandRows.map(({ brand, accounts, clients, prospects, actions }) => (
              <div className="brand-ledger-row" key={brand.id}>
                <div><strong>{brand.name}</strong><span>{accounts} comptes suivis</span></div>
                <div><strong>{clients}</strong><span>clients</span></div>
                <div><strong>{prospects}</strong><span>prospects</span></div>
                <div><strong>{actions}</strong><span>actions</span></div>
              </div>
            ))}
            {!brandRows.length && <div className="ops-empty">Aucune marque configurée.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
