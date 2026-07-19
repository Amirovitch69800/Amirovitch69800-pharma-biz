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
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('agent');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  function switchMode(next) {
    setMode(next);
    setMessage('');
    setPassword('');
    setConfirm('');
    setRole('agent');
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === 'signup') {
        if (password !== confirm) {
          setMessage('Les mots de passe ne correspondent pas.');
          setMessageType('error');
          setSubmitting(false);
          return;
        }
        const { error } = await supabase.auth.signUp({ email: normalizedEmail, password });
        if (error) { setMessage(readableAuthError(error)); setMessageType('error'); }
        else {
          if (role === 'intervenant') {
            try { localStorage.setItem('pharma_pending_role', JSON.stringify({ email: normalizedEmail, role: 'intervenant' })); } catch (_) {}
          }
          setMessage('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.'); setMessageType('ok');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) { setMessage(readableAuthError(error)); setMessageType('error'); }
      }
    } catch (error) {
      setMessage(readableAuthError(error) || 'Le service d\'authentification ne répond pas.');
      setMessageType('error');
    }
    setSubmitting(false);
  }

  async function requestPasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage('Renseigne ton email professionnel, puis clique sur mot de passe oublié.');
      setMessageType('error');
      return;
    }
    setResetting(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: window.location.origin });
      if (error) { setMessage(readableAuthError(error)); setMessageType('error'); }
      else { setMessage('Email de réinitialisation envoyé. Ouvre le lien reçu pour définir un nouveau mot de passe.'); setMessageType('ok'); }
    } catch (error) {
      setMessage(readableAuthError(error) || 'Impossible d\'envoyer l\'email de réinitialisation.');
      setMessageType('error');
    }
    setResetting(false);
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
          <div className="pb-auth-tabs">
            <button className={`pb-auth-tab${mode === 'login' ? ' is-active' : ''}`} onClick={() => switchMode('login')} type="button">Se connecter</button>
            <button className={`pb-auth-tab${mode === 'signup' ? ' is-active' : ''}`} onClick={() => switchMode('signup')} type="button">Créer un compte</button>
          </div>
          <div className="pb-auth-form-header">
            <span className="pb-eyebrow">{mode === 'signup' ? 'Nouvel espace' : 'Espace agent'}</span>
            <h2>{mode === 'signup' ? 'Rejoins PharmaBiz' : 'Bienvenue'}</h2>
            <p>{mode === 'signup' ? 'Crée ton accès et commence à piloter ton terrain.' : 'Connecte-toi à ton espace de travail PharmaBiz.'}</p>
          </div>
          <label className="pb-field"><span>Email professionnel</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label className="pb-field"><span>Mot de passe</span><input autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {mode === 'signup' && (
            <label className="pb-field"><span>Confirmer le mot de passe</span><input autoComplete="new-password" onChange={(event) => setConfirm(event.target.value)} required type="password" value={confirm} /></label>
          )}
          {mode === 'signup' && (
            <div className="pb-auth-roles">
              <span className="pb-eyebrow">Mon rôle terrain</span>
              <div className="pb-auth-role-grid">
                <button className={`pb-auth-role-card${role === 'agent' ? ' is-active' : ''}`} onClick={() => setRole('agent')} type="button">
                  <strong>Agent commercial</strong>
                  <em>Gestion de portefeuille pharmacies, commandes, visites et suivi des ventes.</em>
                </button>
                <button className={`pb-auth-role-card${role === 'intervenant' ? ' is-active' : ''}`} onClick={() => setRole('intervenant')} type="button">
                  <strong>Animateur / Formateur</strong>
                  <em>Missions d'animation terrain et sessions de formation en officine.</em>
                </button>
              </div>
            </div>
          )}
          {mode === 'login' && (
            <button className="pb-auth-reset" disabled={resetting || submitting} onClick={requestPasswordReset} type="button">{resetting ? 'Envoi du lien…' : 'Mot de passe oublié ?'}</button>
          )}
          {message && <div className={`pb-auth-alert${messageType === 'ok' ? ' pb-auth-alert-ok' : ''}`}>{message}</div>}
          <button className="pb-auth-submit" disabled={submitting} type="submit">
            {submitting ? (mode === 'signup' ? 'Création…' : 'Connexion…') : (mode === 'signup' ? 'Créer mon compte' : 'Se connecter')}
          </button>
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
      const userEmail = session.user.email?.toLowerCase() || '';

      // Apply pending role from signup if present
      try {
        const pending = JSON.parse(localStorage.getItem('pharma_pending_role') || 'null');
        if (pending?.role === 'intervenant' && pending?.email === userEmail) {
          const { data: existing } = await supabase.from('field_animators').select('id').eq('user_id', userId).maybeSingle();
          if (!existing) {
            await supabase.from('field_animators').insert({ user_id: userId, full_name: userEmail, email: userEmail, status: 'active' });
          }
          localStorage.removeItem('pharma_pending_role');
        }
      } catch (_) {}

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
  return <Workspace preferredRole={context.role} session={session} />;
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
