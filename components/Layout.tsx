import React, { useState } from 'react';
import { Page } from '../types';
import { IconHome, IconCalendar, IconImage, IconChart, IconUser, IconMail, IconMenu, IconFileText, IconShoppingCart, IconZap, IconPackage, IconCheck } from './Icons';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  userRole: 'admin' | 'site_admin' | 'finance_manager' | 'finance' | 'accounting' | 'member' | 'visitor' | 'pdv';
  isAdmin?: boolean;
  isVisitor?: boolean;
  userName?: string;
  fullWidth?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, onLogout, userRole, isAdmin, isVisitor, userName, fullWidth = false }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  let filteredNavItems: { page: Page; label: string; icon: any }[] = [];

  const visitorItems = [
    { page: Page.HOME, label: 'Início', icon: IconHome },
    { page: Page.VISITOR_PROFILE, label: 'Meu Cadastro', icon: IconUser },
    { page: Page.RESERVATIONS, label: 'Reservas', icon: IconCalendar },
    { page: Page.SHOP, label: 'Produtos', icon: IconShoppingCart },
  ];

  const sosoItems = [
    { page: Page.HOME, label: 'Início dos Sócios', icon: IconHome },
    { page: Page.EVENTS, label: 'Agenda de Eventos', icon: IconCalendar },
    { page: Page.GALLERY, label: 'Álbum de Fotos', icon: IconImage },
    { page: Page.DOCUMENTS, label: 'Documentos', icon: IconFileText },
    { page: Page.SHOP, label: 'Produtos', icon: IconShoppingCart },
    { page: Page.FINANCE, label: 'Painel Financeiro', icon: IconChart },
    { page: Page.RESERVATIONS, label: 'Reservas', icon: IconCalendar },
    { page: Page.PROFILE, label: 'Meu Cadastro', icon: IconUser },
    { page: Page.CONTACT, label: 'Contato e Sugestões', icon: IconMail },
  ];

  const commonFinanceItems = [
    { page: Page.HOME, label: 'Início', icon: IconHome },
    { page: Page.EVENTS, label: 'Agenda de Eventos', icon: IconCalendar },
    { page: Page.CASH_FLOW, label: 'Lançamento de Transações', icon: IconMenu },
    { page: Page.SUPPLIES, label: 'Suprimentos', icon: IconPackage },
    { page: Page.PDV, label: 'PDV / Consumo', icon: IconShoppingCart },
  ];

  const peopleManagementItems = [
    { page: Page.ADMIN_USERS, label: 'Controle de Acesso', icon: IconUser },
    { page: Page.MEMBERS, label: 'Cadastro de Sócios', icon: IconUser },
    { page: Page.VISITORS, label: 'Cadastro de Visitantes', icon: IconUser },
  ];

  if (userRole === 'visitor') {
    filteredNavItems = visitorItems;
  } else if (userRole === 'pdv') {
    filteredNavItems = [
      { page: Page.HOME, label: 'Início', icon: IconHome },
      { page: Page.PDV, label: 'PDV / Consumo', icon: IconShoppingCart },
    ];
  } else if (userRole === 'member') {
    filteredNavItems = sosoItems;
  } else if (userRole === 'accounting') {
    filteredNavItems = [
      { page: Page.FINANCE, label: 'Painel Financeiro', icon: IconChart },
      { page: Page.CASH_FLOW, label: 'Relatórios e Fluxo', icon: IconChart },
    ];
  } else if (userRole === 'finance') {
    filteredNavItems = [
      { page: Page.RESERVATIONS, label: 'Ocupação e Reservas', icon: IconCalendar },
      ...commonFinanceItems.filter(i => i.page !== Page.HOME && i.page !== Page.EVENTS),
      ...peopleManagementItems.filter(i => i.page !== Page.ADMIN_USERS)
    ];
  } else if (userRole === 'finance_manager') {
    filteredNavItems = [
      ...commonFinanceItems,
      ...peopleManagementItems.filter(i => i.page !== Page.ADMIN_USERS),
      { page: Page.RESERVATIONS, label: 'Ocupação e Reservas', icon: IconCalendar },
      { page: Page.PRICING_RULES, label: 'Config. de Tarifas', icon: IconMenu },
      { page: Page.COST_CATEGORIES, label: 'Categorias de Custos', icon: IconMenu },
      { page: Page.PDV_CONFIG, label: 'Configuração PDVs', icon: IconMenu },
    ];
  } else if (userRole === 'site_admin') {
    filteredNavItems = [
      ...sosoItems.filter(i => i.page !== Page.RESERVATIONS),
      { page: Page.RESERVATIONS, label: 'Ocupação e Reservas', icon: IconCalendar },
      ...peopleManagementItems,
    ];
  } else if (userRole === 'admin') {
    // Gerente Geral: Acesso a tudo
    filteredNavItems = [
      ...sosoItems.filter(i => i.page !== Page.RESERVATIONS),
      { page: Page.RESERVATIONS, label: 'Ocupação e Reservas', icon: IconCalendar },
      ...commonFinanceItems.filter(i => !sosoItems.find(s => s.page === i.page)),
      ...peopleManagementItems,
      { page: Page.PRICING_RULES, label: 'Config. de Tarifas', icon: IconMenu },
      { page: Page.COST_CATEGORIES, label: 'Categorias de Custos', icon: IconMenu },
      { page: Page.PDV_CONFIG, label: 'Configuração PDVs', icon: IconMenu },
    ];
  }

  const roleLabels: Record<string, string> = {
    'admin': 'Administrador',
    'site_admin': 'Gerente do Site',
    'finance_manager': 'Gerente Financeiro',
    'finance': 'Financeiro',
    'member': 'Sócio da Família',
    'visitor': 'Visitante/Convidado',
    'pdv': 'Operador de PDV',
    'accounting': 'Contabilidade',
  };

  const displayRole = roleLabels[userRole] || 'Usuário';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-farm-800 text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Família São Bento" className="h-10 w-auto rounded-sm brightness-110" />
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          <IconMenu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Navigation */}
      {/* Backdrop for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[50] md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        bg-farm-900 text-farm-50 flex-shrink-0 transition-transform duration-300 ease-in-out z-[60]
        fixed top-0 left-0 h-screen w-64
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0
      `}>
        <div className="flex flex-col h-full max-h-screen">
          {/* Logo Section */}
          <div className="p-6 border-b border-farm-800/50 flex flex-col items-center flex-shrink-0">
            <div className="bg-white p-2 rounded-xl shadow-inner mb-4 w-full">
              <img src="/logo.jpg" alt="Logo" className="w-full h-auto object-contain" />
            </div>
            {userName && (
              <div className="w-full text-center mt-2 bg-farm-800/50 p-3 rounded-xl">
                <p className="text-white font-bold truncate text-sm px-1" title={userName}>{userName}</p>
                <p className="text-[10px] font-medium text-farm-300 uppercase tracking-widest mt-1">{displayRole}</p>
              </div>
            )}
          </div>

          {/* Scrollable Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              return (
                <button
                  key={item.page}
                  onClick={() => {
                    onNavigate(item.page);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 ${isActive
                    ? 'bg-farm-700 text-white shadow-md'
                    : 'text-farm-200 hover:bg-farm-800 hover:text-white'
                    }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Fixed Footer */}
          <div className="p-4 border-t border-farm-800 bg-farm-900 flex-shrink-0">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-farm-600 rounded-lg text-farm-300 hover:bg-farm-800 hover:text-white transition-colors"
            >
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 p-4 sm:p-6 md:p-8 lg:p-10 min-h-screen min-w-0">
        <div className={fullWidth ? "w-full" : "w-full max-w-[1400px] mx-auto"}>
          {children}
        </div>
      </main>
    </div>
  );
};