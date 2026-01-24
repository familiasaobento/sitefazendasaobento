import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { FinancePage } from './pages/Finance';
import { ReservationsPage } from './pages/Reservations';
import { EventsPage } from './pages/Events';
import { DocumentsPage } from './pages/Documents';
import { ProfilePage } from './pages/Profile';
import { ContactPage } from './pages/Contact';
import { HomePage } from './pages/Home';
import { GalleryPage } from './pages/Gallery';
import { ShopPage } from './pages/Shop';
import { AdminUsersPage } from './pages/AdminUsers';
import { MembersPage } from './pages/Members';
import { Page, NewsItem } from './types';
import { IconLock, IconInstagram, IconWhatsapp } from './components/Icons';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

// --- Components ---

const LoginPage = ({ onAuthChange }: { onAuthChange: () => void }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName }
          }
        });
        if (error) throw error;
        setMessage('Cadastro realizado! Aguarde a aprovação manual da administração para acessar o portal.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center flex items-center justify-center p-4" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(/login-bg.jpg)' }}>
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <div className="bg-farm-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconLock className="w-8 h-8 text-farm-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 font-serif">Portal Família São Bento</h1>
          <p className="text-gray-500 mt-2">
            {isRegister ? 'Solicite seu acesso ao portal' : 'Área restrita para sócios e familiares'}
          </p>
        </div>

        {message ? (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6 text-sm">
            {message}
            <button onClick={() => { setIsRegister(false); setMessage(''); }} className="block mt-2 font-bold underline">Voltar para login</button>
          </div>
        ) : (
          <form onSubmit={handleAuth} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-farm-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-farm-800 transition-colors shadow-lg disabled:opacity-50"
            >
              {loading ? 'Carregando...' : isRegister ? 'Solicitar Cadastro' : 'Entrar'}
            </button>

            <div className="text-center mt-4 text-sm">
              <button
                type="button"
                className="text-farm-700 font-medium hover:underline"
                onClick={() => { setIsRegister(!isRegister); setError(''); }}
              >
                {isRegister ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const ApprovalPending = ({ onSignOut }: { onSignOut: () => void }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
      <div className="bg-yellow-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
        <IconLock className="w-8 h-8 text-yellow-700" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Acesso Pendente</h2>
      <p className="text-gray-600 mb-6">
        Seu cadastro foi recebido com sucesso! Para sua segurança, o acesso é liberado manualmente pela administração.
        Você receberá um aviso assim que for aprovado.
      </p>
      <button
        onClick={onSignOut}
        className="text-gray-500 hover:text-gray-800 font-medium underline"
      >
        Sair da conta
      </button>
    </div>
  </div>
);

// --- Main App Component ---


// --- Main App Component ---

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const savedPage = localStorage.getItem('portal_last_page');
    return (savedPage as Page) || Page.HOME;
  });
  const [loading, setLoading] = useState(true);

  // Persistence effect
  useEffect(() => {
    if (session) {
      localStorage.setItem('portal_last_page', currentPage);
    }
  }, [currentPage, session]);

  // Inactivity Timer (30 minutes)
  useEffect(() => {
    if (!session) return;

    let timer: any;
    const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutes

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        handleSignOut();
      }, INACTIVITY_LIMIT);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkUserInfo(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        if (event === 'SIGNED_IN' && !localStorage.getItem('portal_last_page')) {
          setCurrentPage(Page.HOME);
        }
        checkUserInfo(session.user.id);
      } else {
        setIsApproved(null);
        setIsAdmin(false);
        setCurrentPage(Page.HOME);
        localStorage.removeItem('portal_last_page');
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserInfo = async (userId: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      // Try to fetch the profile. We use limit(1) instead of single() 
      // to avoid throwing an error if nothing is found (it just returns an empty array).
      const { data, error } = await supabase
        .from('profiles')
        .select('approved, role')
        .eq('id', userId);

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      const isSuperAdmin = user?.email === 'admin@familiasaobento.com';

      if (data && data.length > 0) {
        setIsApproved(data[0].approved === true || isSuperAdmin);
        setIsAdmin(data[0].role === 'admin' || isSuperAdmin);
      } else {
        setIsApproved(isSuperAdmin);
        setIsAdmin(isSuperAdmin);
      }
    } catch (err) {
      console.error('Error checking user info:', err);
      // Fallback radical: se der erro de rede, mas for o email do admin, libera.
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'admin@familiasaobento.com') {
        setIsApproved(true);
        setIsAdmin(true);
      } else {
        setIsApproved(false);
        setIsAdmin(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('portal_last_page');
    supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-farm-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-farm-700"></div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onAuthChange={() => { }} />;
  }

  if (isApproved === false && !isAdmin) {
    return <ApprovalPending onSignOut={handleSignOut} />;
  }

  const renderContent = () => {
    switch (currentPage) {
      case Page.HOME:
        return <HomePage isAdmin={isAdmin} />;
      case Page.FINANCE:
        return <FinancePage />;
      case Page.RESERVATIONS:
        return <ReservationsPage isAdmin={isAdmin} />;
      case Page.EVENTS:
        return <EventsPage />;
      case Page.DOCUMENTS:
        return <DocumentsPage />;
      case Page.GALLERY:
        return <GalleryPage />;
      case Page.PROFILE:
        return isAdmin ? <MembersPage /> : <ProfilePage />;
      case Page.CONTACT:
        return <ContactPage isAdmin={isAdmin} />;
      case Page.SHOP:
        return <ShopPage isAdmin={isAdmin} />;
      case Page.ADMIN_USERS:
        return isAdmin ? <AdminUsersPage /> : <HomePage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      onLogout={handleSignOut}
      isAdmin={isAdmin}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;