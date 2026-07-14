import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase.js';
import Workspace from './features/workspace/Workspace.jsx';
import AdminWorkspace from './features/admin/AdminWorkspace.jsx';
import BrandWorkspace from './features/brand/BrandWorkspace.jsx';
import ProviderWorkspace from './features/provider/ProviderWorkspace.jsx';
import { resolveRole } from './lib/roles.js';
import './app-v2.css';
import './field-missions.css';
import './brand-portal.css';

function readableAuthError(error) {
  if (!error) return 'Connexion impossible. Vérifie ton email et ton mot de passe.';
  const message = error.message || error.error_description || error.name;
  if (message && message !== '{}') return message;
  if (error.status) return `Connexion impossible (${error.status}). Vérifie ton email et ton mot de passe.`;
  return 'Connexion impossible. Vérifie ton email, ton mot de passe ou la configuration Supabase.';
}

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        setMessage(readableAuthError(error));
      }
    } catch (error) {
      setMessage(readableAuthError(error) || 'Connexion impossible. Le service d’authentification ne répond pas.');
    }
    setSubmitting(false);
  }

  async function requestPasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage('Renseigne ton email professionnel, puis clique sur mot de passe oublié.');
      return;
    }

    setResetting(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: window.location.origin,
      });
      if (error) setMessage(readableAuthError(error));
      else setMessage('Email de réinitialisation envoyé. Ouvre le lien reçu pour définir un nouveau mot de passe.');
    } catch (error) {
      setMessage(readableAuthError(error) || 'Impossible d’envoyer l’email de réinitialisation.');
    }
    setResetting(false);
  }

  return (
    <main className="pb-auth">
      <section className="pb-auth-side">
        <div className="pb-auth-brand"><span className="pb-brand-mark">PB</span><strong>PharmaBiz</strong></div>
        <div><span className="pb-eyebrow">Field CRM</span><h1>Le cockpit commercial des équipes pharmacie.</h1><p>Comptes, opportunités, visites et réassorts dans une seule vue de travail.</p></div>
        <div className="pb-auth-feature-list"><span><i />Un compte, plusieurs marques</span><span><i />Des priorités terrain, pas des tableaux décoratifs</span><span><i />Une vision opérationnelle du portefeuille</span></div>
      </section>
      <section className="pb-auth-form-side">
        <form className="pb-auth-form" onSubmit={submit}>
          <div><span className="pb-eyebrow">Espace agent</span><h2>Bienvenue</h2><p>Connecte-toi à ton espace de travail PharmaBiz.</p></div>
          <label className="pb-field"><span>Email professionnel</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label className="pb-field"><span>Mot de passe</span><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <button className="pb-auth-reset" disabled={resetting || submitting} onClick={requestPasswordReset} type="button">{resetting ? 'Envoi du lien…' : 'Mot de passe oublié ?'}</button>
          {message && <div className="pb-alert pb-auth-alert">{message}</div>}
          <button className="pb-button pb-button-primary pb-auth-submit" disabled={submitting} type="submit">{submitting ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </section>
    </main>
  );
}

function PasswordRecovery({ onDone }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setMessage(readableAuthError(error));
      else {
        setMessage('Mot de passe mis à jour. Tu peux continuer vers PharmaBiz.');
        window.setTimeout(onDone, 600);
      }
    } catch (error) {
      setMessage(readableAuthError(error) || 'Impossible de mettre à jour le mot de passe.');
    }
    setSubmitting(false);
  }

  return (
    <main className="pb-auth">
      <section className="pb-auth-side">
        <div className="pb-auth-brand"><span className="pb-brand-mark">PB</span><strong>PharmaBiz</strong></div>
        <div><span className="pb-eyebrow">Sécurité compte</span><h1>Définis ton nouveau mot de passe.</h1><p>Choisis un mot de passe solide pour rouvrir ton cockpit terrain.</p></div>
        <div className="pb-auth-feature-list"><span><i />Lien sécurisé Supabase</span><span><i />Session protégée</span><span><i />Accès agent conservé</span></div>
      </section>
      <section className="pb-auth-form-side">
        <form className="pb-auth-form" onSubmit={submit}>
          <div><span className="pb-eyebrow">Réinitialisation</span><h2>Nouveau mot de passe</h2><p>Entre ton nouveau mot de passe puis valide.</p></div>
          <label className="pb-field"><span>Nouveau mot de passe</span><input autoComplete="new-password" minLength="8" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {message && <div className="pb-alert pb-auth-alert">{message}</div>}
          <button className="pb-button pb-button-primary pb-auth-submit" disabled={submitting} type="submit">{submitting ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}</button>
        </form>
      </section>
    </main>
  );
}

function RoleRouter({ session }) {
  const [context, setContext] = useState({ animator: null, loading: true, profile: null, role: 'agent' });

  useEffect(() => {
    let mounted = true;
    async function loadRole() {
      const userId = session.user.id;
      const [profileResponse, animatorResponse] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('field_animators').select('id,status').eq('user_id', userId).maybeSingle(),
      ]);
      const profile = profileResponse.data || null;
      const animator = animatorResponse.data || null;
      const role = resolveRole({ animator, profile, session });
      if (mounted) setContext({ animator, loading: false, profile, role });
    }
    loadRole();
    return () => { mounted = false; };
  }, [session]);

  if (context.loading) return <div className="pb-boot">Ouverture du bon espace PharmaBiz…</div>;
  if (context.role === 'admin') return <AdminWorkspace session={session} />;
  if (context.role === 'brand') return <BrandWorkspace session={session} />;
  if (context.role === 'provider') return <ProviderWorkspace session={session} />;
  return <Workspace session={session} />;
}

function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (booting) return <div className="pb-boot">Préparation de PharmaBiz…</div>;
  if (recoveryMode) return <PasswordRecovery onDone={() => setRecoveryMode(false)} />;
  return session ? <RoleRouter session={session} /> : <Auth />;
}

createRoot(document.getElementById('root')).render(<App />);
