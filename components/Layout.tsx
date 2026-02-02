import React, { useState } from 'react';
import { Page } from '../types';
import { IconHome, IconCalendar, IconImage, IconChart, IconUser, IconMail, IconMenu, IconFileText, IconShoppingCart } from './Icons';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  isVisitor?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, onLogout, isAdmin, isVisitor }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { page: Page.HOME, label: 'Início & Notícias', icon: IconHome },
    { page: Page.RESERVATIONS, label: 'Reservas', icon: IconCalendar },
    { page: Page.EVENTS, label: 'Agenda de Eventos', icon: IconCalendar },
    { page: Page.DOCUMENTS, label: 'Documentos', icon: IconFileText },
    { page: Page.GALLERY, label: 'Álbum de Fotos', icon: IconImage },
    { page: Page.FINANCE, label: 'Financeiro', icon: IconChart },
    { page: Page.SHOP, label: 'Produtos da Fazenda', icon: IconShoppingCart },
    { page: Page.PROFILE, label: 'Meu Cadastro', icon: IconUser },
    { page: Page.CONTACT, label: 'Contato e Sugestões', icon: IconMail },
  ];

  let filteredNavItems = [...navItems];

  if (isVisitor) {
    filteredNavItems = navItems.filter(item =>
      item.page === Page.HOME || item.page === Page.RESERVATIONS || item.page === Page.SHOP
    );
  }

  if (isAdmin) {
    // Rename Profile to "Cadastros dos Sócios"
    const profileItem = filteredNavItems.find(item => item.page === Page.PROFILE);
    if (profileItem) {
      profileItem.label = 'Cadastros dos Sócios';
    }
    // Rename Contact to "Mensagens Recebidas"
    const contactItem = filteredNavItems.find(item => item.page === Page.CONTACT);
    if (contactItem) {
      contactItem.label = 'Mensagens Recebidas';
    }
    // Admin specific items
    filteredNavItems.push({ page: Page.VISITORS, label: 'Visitantes Cadastrados', icon: IconUser });
    filteredNavItems.push({ page: Page.ADMIN_USERS, label: 'Controle de Acessos', icon: IconUser });
  }

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
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        bg-farm-900 text-farm-50 w-full md:w-64 flex-shrink-0 transition-all duration-300 ease-in-out
        ${isMobileMenuOpen ? 'block' : 'hidden'} md:block
        md:fixed md:top-0 md:left-0 md:h-screen z-50
      `}>
        <div className="flex flex-col h-full max-h-screen">
          {/* Logo Section */}
          <div className="p-6 border-b border-farm-800/50 flex flex-col items-center flex-shrink-0">
            <div className="bg-white p-2 rounded-xl shadow-inner mb-4 w-full">
              <img src="/logo.jpg" alt="Logo" className="w-full h-auto object-contain" />
            </div>
            <p className="text-sm font-medium text-farm-300">Portal do Sócio</p>
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
      <main className="flex-1 md:ml-64 p-4 sm:p-6 md:p-8 lg:p-12 min-h-screen">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};