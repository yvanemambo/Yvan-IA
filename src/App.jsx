import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, LogOut, Menu, MessageSquarePlus, Sparkles, X } from 'lucide-react';
import { supabase } from './lib/supabase';

const welcome = 'Bonjour ! Je suis Yvan.IA. Une idée, une question ou un projet ? On le construit ensemble.';
const makeConversation = () => ({ id: crypto.randomUUID(), title: 'Nouvelle conversation', messages: [{ id: crypto.randomUUID(), role: 'assistant', content: welcome, created_at: new Date().toISOString() }], updated_at: new Date().toISOString() });
const initialConversation = makeConversation();

function friendlyError(error) {
  const message = error?.message || 'Une erreur est survenue.';
  if (message.includes('Invalid login credentials')) return 'Adresse e-mail ou mot de passe incorrect.';
  if (message.includes('Email not confirmed')) return 'Confirme ton adresse e-mail depuis le message reçu.';
  return message;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [conversations, setConversations] = useState([initialConversation]);
  const [activeId, setActiveId] = useState(initialConversation.id);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);
  const activeConversation = useMemo(() => conversations.find(c => c.id === activeId) || conversations[0], [conversations, activeId]);
  const messages = activeConversation?.messages || [];

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('chat_history').select('messages').eq('user_id', session.user.id).maybeSingle();
      if (!active) return;
      if (error) { setNotice('Impossible de charger les conversations.'); return; }
      const saved = data?.messages;
      if (Array.isArray(saved) && saved.length) {
        // Migration douce de l'ancien format (une liste de messages) vers plusieurs conversations.
        const restored = saved[0]?.messages ? saved : [{ id: crypto.randomUUID(), title: 'Conversation précédente', messages: saved, updated_at: new Date().toISOString() }];
        setConversations(restored);
        setActiveId(restored[0].id);
      }
    })();
    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  async function handleAuth(event) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setAuthError('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setAuthError('Compte créé. Vérifie ta boîte e-mail pour confirmer ton adresse, puis connecte-toi.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) { setAuthError(friendlyError(error)); }
    finally { setAuthBusy(false); }
  }

  async function persist(nextConversations) {
    if (!session || !supabase) return;
    const { error } = await supabase.from('chat_history').upsert({
      user_id: session.user.id, messages: nextConversations, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) setNotice('Réponse reçue, mais sauvegarde de l’historique impossible. Réessaie.');
    else setNotice('');
  }

  async function newChat() {
    const fresh = makeConversation();
    const next = [fresh, ...conversations];
    setConversations(next); setActiveId(fresh.id); setInput(''); setNotice('');
    await persist(next);
    setSidebarOpen(false);
  }

  async function openConversation(id) {
    setActiveId(id); setInput(''); setNotice(''); setSidebarOpen(false);
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy || !session || !supabase || !activeConversation) return;
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: prompt, created_at: new Date().toISOString() };
    const current = { ...activeConversation, title: activeConversation.title === 'Nouvelle conversation' ? prompt.slice(0, 42) : activeConversation.title, messages: [...messages.filter(m => m.id !== 'welcome'), userMessage], updated_at: new Date().toISOString() };
    const optimistic = conversations.map(c => c.id === activeId ? current : c);
    setConversations(optimistic); setInput(''); setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.functions.invoke('yvan-chat', {
        body: { messages: current.messages.slice(-24).map(({ role, content }) => ({ role, content })) }
      });
      if (error) throw error;
      if (!data?.reply) throw new Error(data?.error || 'Gemini n’a pas renvoyé de réponse.');
      const completed = { ...current, messages: [...current.messages, { id: crypto.randomUUID(), role: 'assistant', content: data.reply, created_at: new Date().toISOString() }], updated_at: new Date().toISOString() };
      const next = optimistic.map(c => c.id === activeId ? completed : c);
      setConversations(next);
      await persist(next);
    } catch (error) {
      setNotice(friendlyError(error).includes('Failed to fetch') ? 'Le service IA est indisponible. Vérifie que la fonction Gemini est déployée.' : friendlyError(error));
    } finally { setBusy(false); }
  }

  if (!supabase) return <main className="setup-screen"><div className="auth-card"><div className="brand-mark"><Sparkles /></div><h1>Yvan<span>.IA</span></h1><p>La configuration Supabase manque. Ajoute VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans les variables d’environnement.</p></div></main>;

  if (!session) return (
    <main className="auth-screen"><div className="auth-glow glow-one" /><div className="auth-glow glow-two" />
      <section className="auth-card"><div className="brand-mark"><Sparkles size={25} /></div><div className="eyebrow">VOTRE ESPACE INTELLIGENT</div><h1>Yvan<span>.IA</span></h1>
        <p className="auth-subtitle">Les idées prennent vie quand on les construit ensemble.</p>
        <div className="auth-tabs"><button className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Connexion</button><button className={authMode === 'signup' ? 'active' : ''} onClick={() => { setAuthMode('signup'); setAuthError(''); }}>Créer un compte</button></div>
        <form onSubmit={handleAuth} className="auth-form">
          <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" /></label>
          <label>Mot de passe<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" /></label>
          {authError && <p className="error-text">{authError}</p>}<button className="primary-button" disabled={authBusy}>{authBusy ? 'Patiente…' : authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
        </form><p className="secure-note">🔒 Vos conversations restent privées et liées à votre compte.</p>
      </section>
    </main>
  );

  const displayName = session.user.email?.split('@')[0] || 'Utilisateur';
  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" aria-label="Fermer le menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
      <div className="sidebar-brand"><div className="mini-mark"><Sparkles size={18} /></div><span>Yvan<span>.IA</span></span><button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
      <button className="new-chat" onClick={newChat}><MessageSquarePlus size={17} /> Nouvelle conversation</button>
      <div className="side-caption">HISTORIQUE PRIVÉ</div>
      <div className="history-list">{conversations.map(c => <button key={c.id} className={'history-item ' + (c.id === activeId ? 'selected' : '')} onClick={() => openConversation(c.id)}><MessageSquarePlus size={14} /><span>{c.title}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="user-chip"><div className="user-avatar">{displayName.slice(0,1).toUpperCase()}</div><div className="user-details"><strong>{displayName}</strong><small>Compte personnel</small></div><button className="icon-button" title="Déconnexion" onClick={() => supabase.auth.signOut()}><LogOut size={17} /></button></div></div>
    </aside>
    <main className="chat-main">
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="topbar-status"><span className="status-dot" /> Yvan.IA <span className="model-tag">GEMINI</span></div><button className="top-new" onClick={newChat}><MessageSquarePlus size={16} /><span>Nouveau</span></button></header>
      <section className="conversation">
        {messages.length <= 1 ? <div className="welcome"><div className="assistant-orb"><div className="orb-core"><Bot size={37} /></div><span className="orb-spark spark-a">✦</span><span className="orb-spark spark-b">✧</span></div><div className="eyebrow">UN ESPACE POUR IMAGINER</div><h2>Bonjour, {displayName}.<br /><span>On crée quelque chose de grand ?</span></h2><p>Je suis Yvan.IA, ton assistant créatif. Pose-moi une question ou partage ton prochain projet.</p><div className="suggestions"><button onClick={() => setInput('Aide-moi à lancer un projet innovant.')}>💡 Lancer un projet</button><button onClick={() => setInput('Explique-moi un sujet simplement.')}>📚 Apprendre quelque chose</button><button onClick={() => setInput('Aide-moi à écrire un texte professionnel.')}>✍️ Écrire un texte</button></div></div>
        : <div className="message-list">{messages.map(message => <article className={'message-row ' + message.role} key={message.id}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={16} /> : displayName.slice(0,1).toUpperCase()}</div><div className="message-content"><div className="message-author">{message.role === 'assistant' ? 'Yvan.IA' : 'Vous'}</div><p>{message.content}</p></div></article>)}{busy && <div className="message-row assistant"><div className="message-avatar"><Sparkles size={16} /></div><div className="typing"><i /><i /><i /></div></div>}<div ref={bottomRef} /></div>}
      </section>
      <div className="composer-wrap"><form className="composer" onSubmit={sendMessage}><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Écris ton message à Yvan.IA…" rows={1} disabled={busy} /><button className="send-button" type="submit" disabled={!input.trim() || busy} aria-label="Envoyer"><ArrowUp size={19} /></button></form><div className="composer-foot">{notice ? <span className="notice">{notice}</span> : <span>Yvan.IA peut faire des erreurs. Vérifie les informations importantes.</span>}<span>Entrée pour envoyer · Maj + Entrée pour une ligne</span></div></div>
    </main>
  </div>;
}