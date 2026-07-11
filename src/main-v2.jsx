import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase.js';
import Workspace from './features/workspace/Workspace.jsx';
import BrandWorkspace from './features/brand/BrandWorkspace.jsx';
import './app-v2.css';
import './field-missions.css';
import './brand-portal.css';

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
        <div><span className="pb-eyebrow">Field performance</span><h1>Le centre de commandement de l’exécution terrain en pharmacie.</h1><p>Chaque utilisateur accède uniquement à l’espace correspondant à son rôle.</p></div>
        <div className="pb-auth-feature-list"><span><i />Espace agent commercial</span><span><i />Cockpit marque</span><span><i />Portail prestataires terrain</span></div>
      </section>
      <section className="pb-auth-form-side">
        <form className="pb-auth-form" onSubmit={submit}>
          <div><span className="pb-eyebrow">Connexion sécurisée</span><h2>Bienvenue</h2><p>PharmaBiz ouvre automatiquement votre espace de travail.</p></div>
          <label className="pb-field"><span>Email professionnel</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label className="pb-field"><span>Mot de passe</span><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {message && <div className="pb-alert pb-auth-alert">{message}</div>}
          <button className="pb-button pb-button-primary pb-auth-submit" disabled={submitting} type="submit">{submitting ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </section>
    </main>
  );
}

function resolveRole(profile, session) {
  const raw = profile?.role || profile?.user_type || profile?.account_type || session?.user?.app_metadata?.role || session?.user?.user_metadata?.role || 'agent';
  const role = String(raw).toLowerCase();
  if (['brand', 'marque', 'brand_user'].includes(role)) return 'brand';
  if (['admin', 'admin_pharmabiz', 'pharmabiz'].includes(role)) return 'admin';
  if (['animator', 'animateur', 'trainer', 'formateur', 'provider', 'prestataire'].includes(role)) return 'provider';
  return 'agent';
}

function RoleRouter({ session }) {
  const [role, setRole] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (active) setRole(resolveRole(data, session));
    });
    return () => { active = false; };
  }, [session]);

  if (!role) return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Ouverture de votre espace…</strong><span>Vérification de vos autorisations.</span></main>;
  if (role === 'brand') return <BrandWorkspace session={session} />;
  if (role === 'provider') return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Espace prestataire</strong><span>Le portail animateur et formateur sera activé prochainement.</span><button className="pb-button pb-button-secondary" onClick={() => supabase.auth.signOut()} type="button">Se déconnecter</button></main>;
  return <Workspace session={session} />;
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
  return session ? <RoleRouter session={session} /> : <Auth />;
}

createRoot(document.getElementById('root')).render(<App />);
