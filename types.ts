export interface User {
  id: string;
  name: string;
  role: 'admin' | 'site_admin' | 'finance_manager' | 'finance' | 'accounting' | 'member' | 'visitor' | 'pdv';
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  content: string;
  category: 'Importante' | 'Manutenção' | 'Social';
}

export interface EventItem {
  id: string;
  title: string;
  date: string;
  description: string;
}

export interface FinanceData {
  month: string;
  receita: number;
  despesa: number;
  [key: string]: any;
}

export interface ExpenseCategory {
  name: string;
  value: number;
  [key: string]: any;
}

export interface PricingRule {
  id: string;
  name: string;
  season: 'Alta' | 'Baixa' | 'Feriado' | 'Ano Todo';
  category: 'Hospedagem' | 'Refeição' | 'Day Use' | 'Especial' | 'Produto';
  audience: 'Sócio' | 'Visitante' | 'Morador' | 'Todos';
  location: 'Sede' | 'Chalé' | 'Casa de Sócio' | 'N/A';
  price: number;
  mandatory_meals: boolean;
  active: boolean;
  created_at?: string;
}

export interface PricingSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  season_type: 'Alta' | 'Baixa' | 'Feriado';
  created_at?: string;
}

export enum Page {
  LOGIN = 'login',
  HOME = 'home',
  RESERVATIONS = 'reservations',
  GALLERY = 'gallery',
  FINANCE = 'finance',
  EVENTS = 'events',
  DOCUMENTS = 'documents',
  PROFILE = 'profile',
  MEMBERS = 'members',
  CONTACT = 'contact',
  SHOP = 'shop',
  VISITORS = 'visitors',
  ADMIN_USERS = 'admin_users',
  ACTIVE_STAYS = 'active_stays',
  PDV = 'pdv',
  CONSUMPTION_REVIEW = 'consumption_review',
  SUPPLIES = 'supplies',
  INVENTORY_MANAGEMENT = 'inventory_management',
  CASH_FLOW = 'cash_flow',
  PRICING_RULES = 'pricing_rules',
  COST_CATEGORIES = 'cost_categories',
  PDV_CONFIG = 'pdv_config',
  VISITOR_PROFILE = 'visitor_profile',
  HISTORY = 'history',
  HARDWARE = 'hardware',
}

export interface Document {
  id: string;
  title: string;
  category: string;
  file_path: string;
  file_type: string;
  file_size: string;
  created_at: string;
}