import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase.js';
import Workspace from './features/workspace/Workspace.jsx';
import './app-v2.css';

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setSubmitting(false);
  }

  return (
    <main className="pb-auth">
      <section className="pb-auth-side">
        <div className="pb-auth-brand"><span className="pb-brand-mark">PB</span><strong>PharmaBiz</strong></div>
        <div>
          <span className="pb-eyebrow">Field CRM</span>
          <h1>Le cockpit commercial des équipes pharmacie.</h1>
          <p>Comptes, opportunités, visites et réassorts dans une seule vue de travail.</p>
        </div>
        <div className="pb-auth-feature-list">
          <span><i />Un compte, plusieurs marques</span>
          <span><i />Des priorités terrain, pas des tableaux décoratifs</span>
          <span><i />Une vision opérationnelle du portefeuille</span>
        </div>
      </section>
      <section className="pb-auth-form-side">
        <form className="pb-auth-form" onSubmit={submit}>
          <div><span className="pb-eyebrow">Espace agent</span><h2>Bienvenue</h2><p>Connecte-toi à ton espace de travail PharmaBiz.</p></div>
          <label className="pb-field"><span>Email professionnel</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label className="pb-field"><span>Mot de passe</span><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {message && <div className="pb-alert pb-auth-alert">{message}</div>}
          <button className="pb-button pb-button-primary pb-auth-submit" disabled={submitting} type="submit">{submitting ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  if (booting) return <div className="pb-boot">Préparation de PharmaBiz…</div>;
  return session ? <Workspace session={session} /> : <Auth />;
}

createRoot(document.getElementById('root')).render(<App />);
