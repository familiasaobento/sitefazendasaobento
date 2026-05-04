import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { PublicGuestReservation } from './components/PublicGuestReservation';
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
import { VisitorsPage } from './pages/Visitors';
import { PDVPage } from './pages/PDV';
import { ConsumptionReviewPage } from './pages/ConsumptionReview';
import { SuppliesPage } from './pages/Supplies';
import { InventoryManagementPage } from './pages/InventoryManagement';
import { CashFlowPage } from './pages/CashFlow';
import { PricingRulesPage } from './pages/PricingRules';
import { CostCategoriesPage } from './pages/CostCategories';
import { PdvConfigPage } from './pages/PdvConfig';
import { HistoryPage } from './pages/History';
import { HardwarePage } from './pages/Hardware';
import { TimeTrackingPage } from './pages/TimeTracking';
import { EmployeesPage } from './pages/Employees';
import { Page, NewsItem } from './types';
import { IconLock, IconCheck, IconInstagram, IconWhatsapp } from './components/Icons';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

// --- Components ---

const LoginPage = ({ onAuthChange }: { onAuthChange: () => void }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'visitor'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [hostMember, setHostMember] = useState('');
  const [isReservationSubmitted, setIsReservationSubmitted] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'register' || mode === 'visitor') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: mode === 'visitor' ? 'visitor' : 'member',
              ...(mode === 'visitor' && { host_member: hostMember })
            }
          }
        });
        if (error) throw error;
        setMessage(mode === 'visitor' ? 'Cadastro de visitante realizado! Seu acesso será liberado em breve.' : 'Cadastro realizado! Aguarde a aprovação manual da administração para acessar o portal.');
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
          <h1 className="text-3xl font-bold text-gray-900 font-serif tracking-tight">Portal Família São Bento</h1>
          <p className="text-gray-600 mt-3 text-sm font-medium">
            {mode === 'visitor' ? 'Solicite sua Reserva de Convidado' : mode === 'register' ? 'Solicite seu acesso ao portal' : 'Área restrita de acesso aos Sócios'}
          </p>
        </div>

        {isReservationSubmitted ? (
          <div className="bg-blue-50 border border-blue-200 p-8 rounded-3xl text-center space-y-6 animate-fade-in">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-lg">
                <IconCheck className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-blue-900 font-serif mb-2">Solicitação Recebida!</h3>
              <p className="text-blue-800 text-sm leading-relaxed">
                Sua reserva e cadastro foram enviados para a administração da Fazenda São Bento. <br/><br/>
                <strong>O que acontece agora?</strong><br/> 
                Assim que sua reserva for aprovada, você receberá um **voucher por e-mail** com o link para definir sua senha e acessar seus QR Codes de entrada.
              </p>
            </div>
            <button 
              onClick={() => { setMode('login'); setIsReservationSubmitted(false); }}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold font-sans shadow-xl hover:bg-blue-700 transition-all uppercase tracking-widest text-xs"
            >
              Voltar ao Início
            </button>
          </div>
        ) : mode === 'visitor' ? (
          <PublicGuestReservation 
            onBack={() => setMode('login')} 
            onSuccess={() => setIsReservationSubmitted(true)}
          />
        ) : message ? (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6 text-sm">
            {message}
            <button onClick={() => { setMode('login'); setMessage(''); }} className="block mt-2 font-bold underline">Voltar para login</button>
          </div>
        ) : (
          <form onSubmit={handleAuth} className="space-y-4">
            {(mode === 'register' || mode === 'visitor') && (
              <div className="space-y-4">
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

                {mode === 'visitor' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quem é o sócio que convidou?</label>
                    <input
                      type="text"
                      required
                      placeholder="Nome do Sócio"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                      value={hostMember}
                      onChange={(e) => setHostMember(e.target.value)}
                    />
                  </div>
                )}
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
              {loading ? 'Carregando...' : mode === 'login' ? 'Entrar' : 'Solicitar Cadastro'}
            </button>

            <div className="flex flex-col gap-3 text-center mt-4 text-sm">
              <button
                type="button"
                className="text-farm-700 font-medium hover:underline"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              >
                {mode === 'login' ? 'É sócio e não tem cadastro? Cadastre aqui.' : 'Já tem conta? Faça login'}
              </button>

              {mode === 'login' && (
                <button
                  type="button"
                  className="text-farm-700 font-medium hover:underline"
                  onClick={() => { setMode('visitor'); setError(''); }}
                >
                  É convidado? Faça seu pedido de reserva aqui.
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const PasswordSetupModal = ({ onComplete }: { onComplete: () => void }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full animate-fade-in">
        <div className="text-center mb-6">
          <div className="bg-farm-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-farm-200">
            <IconLock className="w-8 h-8 text-farm-700" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 font-serif">Defina sua Senha</h2>
          <p className="text-gray-600 mt-2 text-sm">Bem-vindo à Fazenda São Bento! Para sua segurança, defina uma senha de acesso ao portal.</p>
        </div>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirme a Senha</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-farm-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-farm-800 transition-colors shadow-lg disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Definir Senha e Acessar'}
          </button>
        </form>
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
  const [userRole, setUserRole] = useState<'admin' | 'site_admin' | 'finance_manager' | 'finance' | 'accounting' | 'member' | 'visitor' | 'pdv' | 'employee' | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<Page>(Page.HOME);
  const [loading, setLoading] = useState(true);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);

  // Sync currentPage with URL hash for navigation persistence and back button support
  useEffect(() => {
    if (session) {
      const pageHash = currentPage.toLowerCase();
      if (window.location.hash.replace('#', '') !== pageHash) {
        window.location.hash = pageHash;
      }
      localStorage.setItem('portal_last_page', currentPage);
    }
  }, [currentPage, session]);

  // Listen for hash changes (e.g. browser back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').toUpperCase();
      if (Object.values(Page).includes(hash as Page)) {
        setCurrentPage(hash as Page);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Initial load from hash or localStorage
  useEffect(() => {
    const hash = window.location.hash.replace('#', '').toUpperCase();
    if (hash && Object.values(Page).includes(hash as Page)) {
      setCurrentPage(hash as Page);
    } else {
      const savedPage = localStorage.getItem('portal_last_page');
      if (savedPage && Object.values(Page).includes(savedPage as Page)) {
        setCurrentPage(savedPage as Page);
      }
    }
  }, []);

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

     // Check for recovery link in URL on mount
    const hash = window.location.hash;
    if (hash && (hash.includes('type=recovery') || hash.includes('type=invite'))) {
      setShowPasswordSetup(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        if (event === 'SIGNED_IN' && !localStorage.getItem('portal_last_page')) {
          setCurrentPage(Page.HOME);
        }
        if (event === 'PASSWORD_RECOVERY') {
          setShowPasswordSetup(true);
        }
        checkUserInfo(session.user.id);
      } else {
        setIsApproved(null);
        setUserRole(null);
        setUserName('');
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
        .select('approved, role, full_name, member_status')
        .eq('id', userId);

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      const isSuperAdmin = email === 'admin@familiasaobento.com';

      if (data && data.length > 0) {
        let role = data[0].role;
        // Se for sócio mas estiver inativo ou de licença, atua como visitante
        if (role === 'member' && (data[0].member_status === 'Inativo' || data[0].member_status === 'Licença')) {
          role = 'visitor';
        }
        setIsApproved(data[0].approved === true || isSuperAdmin);
        setUserRole(isSuperAdmin ? 'admin' : role);
        setUserName(data[0].full_name || email.split('@')[0] || 'Usuário');
      } else {
        setIsApproved(isSuperAdmin);
        setUserRole(isSuperAdmin ? 'admin' : 'member');
        setUserName(email.split('@')[0] || 'Novo Usuário');
      }
    } catch (err) {
      console.error('Error checking user info:', err);
      // Fallback radical: se der erro de rede, mas for o email do admin, libera.
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'admin@familiasaobento.com') {
        setIsApproved(true);
        setUserRole('admin');
        setUserName('Administrador Mestre');
      } else {
        setIsApproved(false);
        setUserRole('member');
        setUserName('Visitante');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('portal_last_page');
    supabase.auth.signOut();
  };

  const isAdmin = userRole === 'admin';
  const isSiteAdmin = userRole === 'site_admin';
  const isFinanceManager = userRole === 'finance_manager';
  const isFinance = userRole === 'finance';
  const isVisitor = userRole === 'visitor';
  const isMember = userRole === 'member';
  const isPDV = userRole === 'pdv';
  const isAccounting = userRole === 'accounting';

  // Management broadly includes anyone who isn't just a visitor or standard member
  const isManagement = isAdmin || isSiteAdmin || isFinanceManager || isFinance || isAccounting;

  // Specific permission flags based on requirements
  const canEditContent = isAdmin || isSiteAdmin;
  const canApproveTransactions = isAdmin || isFinanceManager;

  // Specific logic to redirect PDV and Financeiro to their main tool
  useEffect(() => {
    if (isPDV && currentPage === Page.HOME) {
      setCurrentPage(Page.PDV);
    }
    if (isFinance && currentPage === Page.HOME) {
      setCurrentPage(Page.RESERVATIONS);
    }
    if (isAccounting && currentPage === Page.HOME) {
      setCurrentPage(Page.FINANCE);
    }
  }, [isPDV, isFinance, isAccounting, currentPage]);

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

  if (isApproved === false && userRole !== 'admin') {
    return <ApprovalPending onSignOut={handleSignOut} />;
  }

  const renderContent = () => {
    switch (currentPage) {
      case Page.HOME:
        return <HomePage isManagement={isManagement} canEditNews={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.RESERVATIONS:
        return <ReservationsPage isAdmin={isAdmin || isSiteAdmin || isFinanceManager || isFinance} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.EVENTS:
        return (isVisitor) ? <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} /> : <EventsPage isAdmin={canEditContent} />;
      case Page.DOCUMENTS:
        return (isVisitor) ? <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} /> : <DocumentsPage isManagement={canEditContent} />;
      case Page.GALLERY:
        return (isVisitor) ? <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} /> : <GalleryPage isAdmin={canEditContent} />;
      case Page.SHOP:
        return <ShopPage isAdmin={canEditContent} isVisitor={isVisitor} />;
      case Page.PROFILE:
      case Page.VISITOR_PROFILE:
        // MEU CADASTRO para todos os usuários logados
        return <ProfilePage />;
      case Page.MEMBERS:
        // LISTAGEM DE SÓCIOS para Admin, Site Admin e Financeiro
        return (isAdmin || isSiteAdmin || isFinance || isFinanceManager)
          ? <MembersPage />
          : <HomePage isManagement={isManagement} canEditNews={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.CONTACT:
        return <ContactPage isAdmin={isAdmin || isSiteAdmin} />;
      case Page.ADMIN_USERS:
        return (isAdmin || isSiteAdmin) ? <AdminUsersPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.HISTORY:
        return (!isVisitor) ? <HistoryPage userRole={userRole || 'member'} /> : <HomePage isManagement={isManagement} canEditNews={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;

      // FINANCEIRO (Grupo 3 e 4)
      case Page.FINANCE: // Painel Financeiro
        return (isAdmin || isMember || isSiteAdmin || isFinanceManager || isAccounting) ? <FinancePage isAdmin={isAdmin || isFinanceManager} userRole={userRole || 'member'} onNavigate={setCurrentPage} /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.CASH_FLOW: // Transações
        return (isManagement || isAccounting) ? <CashFlowPage canApprove={canApproveTransactions} isViewOnly={isAccounting} /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.CONSUMPTION_REVIEW: // Conferência e aprovação
        return (canApproveTransactions) ? <ConsumptionReviewPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;

      // OPERACONAL
      case Page.VISITORS:
        return (isManagement || isSiteAdmin) ? <VisitorsPage canEdit={isManagement || isSiteAdmin} /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.ACTIVE_STAYS:
        return <ReservationsPage isAdmin={isAdmin || isSiteAdmin || isFinanceManager || isFinance} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.PDV:
        return (isManagement || isPDV) ? <PDVPage /> : <HomePage isManagement={isManagement} canEditNews={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.SUPPLIES:
        return (isManagement) ? <SuppliesPage isAdmin={canApproveTransactions} /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.INVENTORY_MANAGEMENT:
        return (isAdmin || isFinanceManager) ? <InventoryManagementPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;

      case Page.PRICING_RULES:
        return (isAdmin || isFinanceManager) ? <PricingRulesPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.COST_CATEGORIES:
        return (isAdmin || isFinanceManager || isSiteAdmin) ? <CostCategoriesPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.PDV_CONFIG:
        return (isAdmin || isFinanceManager) ? <PdvConfigPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.HARDWARE:
        return (isAdmin || isFinanceManager) ? <HardwarePage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.TIME_TRACKING:
        return (isManagement) ? <TimeTrackingPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
      case Page.EMPLOYEES:
        return (isManagement) ? <EmployeesPage /> : <HomePage isManagement={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;

      default:
        return <HomePage isManagement={isManagement} canEditNews={canEditContent} isVisitor={isVisitor} onNavigate={setCurrentPage} />;
    }
  };

  return (
     <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      onLogout={handleSignOut}
      isAdmin={isAdmin}
      isVisitor={isVisitor}
      userName={userName}
      userRole={userRole || 'member'}
      fullWidth={currentPage === Page.RESERVATIONS || currentPage === Page.ACTIVE_STAYS || currentPage === Page.ADMIN_USERS || currentPage === Page.MEMBERS || currentPage === Page.VISITORS || currentPage === Page.HARDWARE || currentPage === Page.TIME_TRACKING || currentPage === Page.EMPLOYEES}
    >
      {renderContent()}
      {showPasswordSetup && <PasswordSetupModal onComplete={() => setShowPasswordSetup(false)} />}
    </Layout>
  );
};

export default App;