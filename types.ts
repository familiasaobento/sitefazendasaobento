export interface User {
  id: string;
  name: string;
  role: 'admin' | 'member' | 'visitor';
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

export enum Page {
  LOGIN = 'login',
  HOME = 'home',
  RESERVATIONS = 'reservations',
  GALLERY = 'gallery',
  FINANCE = 'finance',
  EVENTS = 'events',
  DOCUMENTS = 'documents',
  PROFILE = 'profile',
  CONTACT = 'contact',
  SHOP = 'shop',
  VISITORS = 'visitors',
  ADMIN_USERS = 'admin_users',
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