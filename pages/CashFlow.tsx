import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { IconLoader, IconCheck, IconPlus, IconFileText, IconTrash, IconUser, IconRefresh } from '../components/Icons';
import { BankReconciliation } from '../components/BankReconciliation';
import { ReconciliationSessions } from '../components/ReconciliationSessions';
import { predictTransactionData } from '../lib/categorization';

// Pencil/Edit icon inline since it may not be in Icons.tsx
const IconEdit = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);

interface CashFlowEntry {
    id: number;
    tipo: 'entrada' | 'saida';
    categoria: string;
    valor: number;
    data_pagamento: string;
    descricao: string;
    cnpj_fornecedor: string;
    documento_anexo_url: string | null;
    meio_pagamento: 'Dinheiro' | 'Banco';
    conta_origem: string;
    forma_pagamento?: string;
    observacoes?: string;
    data_documento?: string | null;
    data_vencimento?: string | null;
    tags?: string | null;
    projeto?: string | null;
    parcela_atual?: number;
    total_parcelas?: number;
    status?: string;
    data_aprovacao?: string | null;
    is_recurrence?: boolean;
    recurrence_period?: string | null;
}

interface FinanceProject {
    id: number;
    nome: string;
    descricao?: string;
}

interface FinanceContact {
    identificador: string;
    nome: string;
    nome_fantasia?: string;
    banco: string;
    agencia: string;
    conta: string;
    tipo_conta: string;
    chave_pix: string;
    categoria_padrao?: string;
}

interface FinanceTag {
    id: number;
    nome: string;
}

interface FinanceAccount {
    id: number;
    nome: string;
    tipo: 'Banco' | 'Dinheiro';
    banco?: string;
    agencia?: string;
    conta?: string;
}

interface CatGroup { groupName: string; items: string[]; }

const FALLBACK_GROUPS: CatGroup[] = [{ groupName: 'Geral', items: ['Geral', 'Outros'] }];

const normalizeWord = (w: string) => 
    w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const matchCategoryName = (dbName: string, inputName: string): boolean => {
    const cleanDb = dbName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cleanInput = inputName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // Verificação simples exata ou de inclusão
    if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
        return true;
    }

    // Decomposição em palavras significativas (tamanho > 2 e não conectivo comum)
    const getWords = (str: string) => 
        str.split(/\s+/).map(normalizeWord).filter(w => w.length > 2 && !['com', 'para', 'dos', 'das', 'uma', 'sob'].includes(w));

    const dbWords = getWords(cleanDb);
    const inputWords = getWords(cleanInput);

    if (dbWords.length === 0 || inputWords.length === 0) return false;

    // Verifica se um conjunto de palavras é subconjunto ou coincide parcialmente com o outro
    const isSubset = (listA: string[], listB: string[]) => 
        listA.every(wa => listB.some(wb => wb.includes(wa) || wa.includes(wb)));

    return isSubset(dbWords, inputWords) || isSubset(inputWords, dbWords);
};

export const matchCategory = (
    csvCategory: string | null,
    desc: string,
    tipoArg: string,
    categoriesList: { id: number; nome: string; tipo: string }[]
): string => {
    // Normaliza o tipo vindo da transação ('entrada'/'saida') para o tipo cadastrado na categoria ('receita'/'despesa')
    const tipo = tipoArg === 'entrada' ? 'receita' : (tipoArg === 'saida' ? 'despesa' : tipoArg);

    // 1. Tentar correspondência exata ou parcial com a categoria do CSV
    if (csvCategory) {
        const found = categoriesList.find(c => 
            c.tipo === tipo && matchCategoryName(c.nome, csvCategory)
        );
        if (found) return found.nome;
    }

    // 2. Tentar correspondência por palavras-chave na descrição
    const cleanDesc = desc.toLowerCase();
    
    // Regras específicas de despesas
    if (tipo === 'despesa') {
        const rules = [
            { keywords: ['energia', 'luz', 'enel', 'equatorial', 'cpfl', 'eletropaulo', 'cemig'], category: 'Energia Elétrica' },
            { keywords: ['internet', 'telefone', 'wifi', 'claro', 'vivo', 'tim', 'telecom', 'link'], category: 'Internet e Telefone' },
            { keywords: ['mercado', 'supermercado', 'açougue', 'acougue', 'padaria', 'pão', 'alimentação', 'horti', 'carrefour', 'pao de', 'comida', 'assai', 'atacad', 'hortifruti'], category: 'Supermercado' },
            { keywords: ['combustivel', 'gasolina', 'diesel', 'etanol', 'posto', 'br', 'ipiranga', 'shell'], category: 'Combustível' },
            { keywords: ['salario', 'folha', 'adiantamento', 'décimo', 'rescisão', 'contra-cheque', 'ferias', 'férias', '13º'], category: 'Salários' },
            { keywords: ['tarifa', 'mensalidade conta', 'banco', 'ted', 'doc', 'pix', 'manutenção de conta', 'deb.tar.', 'tar.banc'], category: 'Tarifa manutenção de conta' },
            { keywords: ['contabilidade', 'contabil', 'escritório contábil'], category: 'Contabilidade' },
            { keywords: ['software', 'site', 'hospedagem', 'nuvem', 'aws', 'mensalidade sistema', 'sistema', 'licença', 'licenca', 'controlid', 'api'], category: 'Despesa com softwares' },
            { keywords: ['imposto', 'das', 'simples', 'darf', 'tributo', 'gps', 'fgts', 'inss', 'irrf', 'iss', 'pis', 'cofins'], category: 'Impostos e taxas' },
            { keywords: ['ração', 'racao', 'gado', 'veterinario', 'vacina', 'medicamento animal', 'boi', 'bezerro'], category: 'Ração e Alimentação Animal' },
            { keywords: ['cimento', 'tinta', 'construção', 'reforma', 'ferragem', 'civil', 'pedreiro', 'telha', 'tijolo', 'areia', 'brita', 'madeira'], category: 'Material de construção' },
            { keywords: ['piscina', 'cloro', 'limpeza piscina', 'hth'], category: 'Piscina e Lazer' },
            { keywords: ['jardim', 'grama', 'roçada', 'rocada', 'muda', 'planta', 'adubo', 'fertilizante', 'veneno'], category: 'Jardinagem e Área Verde' },
            { keywords: ['manutenção', 'reparo', 'conserto', 'assistência', 'instal', 'chaves', 'cadeado', 'revisão'], category: 'Conservação e Reparos' },
            { keywords: ['copa', 'cozinha', 'limpeza', 'desinfetante', 'detergente', 'sabão', 'higiene', 'papel hig', 'amaciante'], category: 'Cozinha e Alimentação' },
            { keywords: ['refeição', 'almoço', 'janta', 'restaurante', 'churrascaria', 'pizzaria'], category: 'Alimentos e Bebidas' }
        ];

        for (const rule of rules) {
            if (rule.keywords.some(k => cleanDesc.includes(k))) {
                const found = categoriesList.find(c => c.tipo === tipo && c.nome === rule.category);
                if (found) return found.nome;
            }
        }
    } else {
        // Regras específicas de receitas
        const rules = [
            { keywords: ['hospedagem', 'diária', 'reserva', 'chalé', 'aluguel', 'sede', 'estadia'], category: 'Receitas de Hospedagem' },
            { keywords: ['mensalidade', 'sócio', 'socio', 'taxa condomínio', 'condomínio', 'condominio', 'contribuição', 'titulo', 'título'], category: 'Mensalidade Sócio' },
            { keywords: ['day use', 'dayuse', 'lazer dia'], category: 'Day Use' },
            { keywords: ['consumo', 'bebida', 'pdv', 'restaurante', 'queijo', 'doce', 'sorvete', 'cerveja', 'refrigerante'], category: 'PDV / Consumo' },
            { keywords: ['evento', 'festa', 'casamento', 'aniversário', 'ingresso', 'bilheteria'], category: 'Receitas com Eventos' }
        ];

        for (const rule of rules) {
            if (rule.keywords.some(k => cleanDesc.includes(k))) {
                const found = categoriesList.find(c => c.tipo === tipo && c.nome === rule.category);
                if (found) return found.nome;
            }
        }
    }

    // Fallback para uma categoria existente no banco compatível com o tipo
    const defaultCat = tipo === 'receita' ? 'Outras Receitas' : 'Outras despesas';
    const hasDefault = categoriesList.find(c => c.tipo === tipo && c.nome === defaultCat);
    if (hasDefault) return hasDefault.nome;

    const firstActive = categoriesList.find(c => c.tipo === tipo);
    return firstActive ? firstActive.nome : 'Geral';
};

export const CashFlowPage: React.FC<{ canApprove?: boolean; isViewOnly?: boolean }> = ({ canApprove, isViewOnly }) => {
    const [entries, setEntries] = useState<CashFlowEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingEntry, setEditingEntry] = useState<CashFlowEntry | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [stats, setStats] = useState({ totalEntradas: 0, totalSaidas: 0 });
    const [groupsReceita, setGroupsReceita] = useState<CatGroup[]>(FALLBACK_GROUPS);
    const [groupsDespesa, setGroupsDespesa] = useState<CatGroup[]>(FALLBACK_GROUPS);
    const [flatCategories, setFlatCategories] = useState<any[]>([]);
    const [contacts, setContacts] = useState<Record<string, FinanceContact>>({});
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [activeBankInfo, setActiveBankInfo] = useState<FinanceContact | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [entryMode, setEntryMode] = useState<'manual' | 'ocr'>('manual');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);
    const [reconciliationView, setReconciliationView] = useState<'none' | 'sessions' | 'active'>('none');
    const [activeReconciliationId, setActiveReconciliationId] = useState<number | null>(null);

    // Contact Management
    const [showContactManager, setShowContactManager] = useState(false);
    const [newContact, setNewContact] = useState<Partial<FinanceContact>>({
        identificador: '', nome: '', nome_fantasia: '', banco: '', agencia: '', conta: '', tipo_conta: 'Corrente', chave_pix: '', categoria_padrao: ''
    });
    const [isSavingContact, setIsSavingContact] = useState(false);

    // Account Management
    const [showAccountManager, setShowAccountManager] = useState(false);
    const [newAccount, setNewAccount] = useState<Partial<FinanceAccount>>({
        nome: '', tipo: 'Banco', banco: '', agencia: '', conta: ''
    });
    const [isSavingAccount, setIsSavingAccount] = useState(false);

    // CSV Import
    const [isImportingCsv, setIsImportingCsv] = useState(false);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const [activeTab, setActiveTab] = useState<'flow' | 'contacts' | 'accounts' | 'reports' | 'tags' | 'audit'>(isViewOnly ? 'reports' : 'flow');
    const [reportFilters, setReportFilters] = useState({
        origem: 'all',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        tag: '',
        projeto: '',
        flowType: 'all' as 'all' | 'entrada' | 'saida',
        categoria: 'all',
        isYtd: false
    });
    const [selectedReportType, setSelectedReportType] = useState<'financial' | 'consumption'>('financial');
    const [consumptionData, setConsumptionData] = useState<any[]>([]);
    const [fetchingConsumption, setFetchingConsumption] = useState(false);

    // Consumption Manual Entry States
    const [showManualConsumptionModal, setShowManualConsumptionModal] = useState(false);
    const [isSavingManualConsumption, setIsSavingManualConsumption] = useState(false);
    const [manualConsumptionForm, setManualConsumptionForm] = useState<{
        item_id: number | 'custom' | '';
        custom_name: string;
        quantidade: number;
        valor_unitario_aplicado: number;
        date: string;
        observacoes: string;
    }>({
        item_id: '',
        custom_name: '',
        quantidade: 1,
        valor_unitario_aplicado: 0,
        date: new Date().toISOString().split('T')[0],
        observacoes: 'Lançamento manual do sistema antigo'
    });
    const [productsList, setProductsList] = useState<any[]>([]);
    const [viewFilters, setViewFilters] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        tipo: 'all' as 'all' | 'entrada' | 'saida'
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [flowSearchTerm, setFlowSearchTerm] = useState('');

    const defaultFormData = {
        tipo: 'saida' as 'entrada' | 'saida',
        categoria: 'Geral',
        valor: '',
        data_pagamento: new Date().toISOString().split('T')[0],
        descricao: '',
        cnpj_fornecedor: '',
        meio_pagamento: 'Banco' as 'Dinheiro' | 'Banco',
        conta_origem: '',
        forma_pagamento: 'PIX',
        observacoes: '',
        data_documento: '',
        data_vencimento: '',
        tags: '',
        projeto: '',
        is_parcelado: false,
        parcelas: 1,
        frequency_mode: 'unico' as 'unico' | 'parcelado' | 'recorrente',
        recurrence_period: 'mensal' as 'mensal' | 'semestral' | 'anual'
    };

    const [formData, setFormData] = useState(defaultFormData);
    const [submitting, setSubmitting] = useState(false);
    const [saveToContacts, setSaveToContacts] = useState(false);
    const [tempContact, setTempContact] = useState<Partial<FinanceContact>>({
        nome: '', identificador: '', banco: '', agencia: '', conta: '', chave_pix: '', categoria_padrao: ''
    });

    const [registeredTags, setRegisteredTags] = useState<FinanceTag[]>([]);
    const [newTag, setNewTag] = useState('');

    const [isPredicting, setIsPredicting] = useState(false);

    // Motor de Aprendizado para o formulário manual
    useEffect(() => {
        if (!formData.descricao || formData.descricao.length < 4 || editingEntry) return;

        const timer = setTimeout(async () => {
            setIsPredicting(true);
            const pred = await predictTransactionData(formData.descricao, formData.tipo);
            if (pred) {
                setFormData(prev => ({
                    ...prev,
                    categoria: prev.categoria === 'Geral' || !prev.categoria ? (pred.categoria || prev.categoria) : prev.categoria,
                    cnpj_fornecedor: !prev.cnpj_fornecedor ? (pred.cnpj_fornecedor || prev.cnpj_fornecedor) : prev.cnpj_fornecedor,
                    projeto: !prev.projeto ? (pred.projeto || prev.projeto) : prev.projeto,
                    tags: !prev.tags ? (pred.tags || prev.tags) : prev.tags
                }));
            }
            setIsPredicting(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [formData.descricao, formData.tipo, editingEntry]);

    const [registeredProjects, setRegisteredProjects] = useState<FinanceProject[]>([]);
    const [newProject, setNewProject] = useState({ nome: '', descricao: '' });

    const exportToExcel = async (data: CashFlowEntry[], filename: string) => {
        const formatted = data.map(e => ({
            'Data': new Date(e.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR'),
            'Tipo': e.tipo.toUpperCase(),
            'Descrição': e.descricao,
            'Categoria': e.categoria,
            'Valor': e.valor,
            'Conta': e.conta_origem,
            'Meio': e.meio_pagamento,
            'Projeto': e.projeto || '-',
            'Tag': e.tags || '-',
            'Status': e.status.toUpperCase()
        }));
        
        if (formatted.length === 0) {
            alert('Não há dados para exportar.');
            return;
        }

        const csv = [
            Object.keys(formatted[0]).join(';'),
            ...formatted.map(row => Object.values(row).map(v => typeof v === 'string' ? `"${v}"` : v).join(';'))
        ].join('\n');

        const csvContent = "\ufeff" + csv;

        // Try modern File System Access API (Save As dialog)
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: `${filename}.csv`,
                    types: [{
                        description: 'CSV File',
                        accept: {'text/csv': ['.csv']},
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(csvContent);
                await writable.close();
                return;
            } catch (err: any) {
                if (err.name === 'AbortError') return; // User cancelled
                console.error('Error with Save Picker:', err);
                // Fallback to traditional download if something fails
            }
        }

        // Traditional Download Fallback
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const exportConsumptionToExcel = (meals: any[], products: any[], filename: string) => {
        const formattedMeals = meals.map(m => ({
            'Refeição': m.name,
            'Quantidade Servida': m.quantidade,
            'Valor Total Cobrado': m.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        }));

        const formattedProducts = products.map(p => ({
            'Produto': p.name,
            'Quantidade Vendida': p.quantidade,
            'Valor Total Vendas': p.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        }));

        const rows = [
            ['RELATORIO DE CONSUMO - FAZENDA SAO BENTO'],
            [`Periodo: ${reportFilters.month}/${reportFilters.year} (Acumulado YTD: ${reportFilters.isYtd ? 'Sim' : 'Nao'})`],
            [],
            ['REFEICOES SERVIDAS'],
            ['Refeicao', 'Quantidade Servida', 'Valor Total Cobrado']
        ];

        formattedMeals.forEach(m => {
            rows.push([m['Refeição'], String(m['Quantidade Servida']), m['Valor Total Cobrado']]);
        });

        rows.push([]);
        rows.push(['PRODUTOS VENDIDOS']);
        rows.push(['Produto', 'Quantidade Vendida', 'Valor Total Vendas']);

        formattedProducts.forEach(p => {
            rows.push([p['Produto'], String(p['Quantidade Vendida']), p['Valor Total Vendas']]);
        });

        const csvContent = "\ufeff" + rows.map(r => r.map(v => `"${v}"`).join(';')).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        fetchCashFlow(viewFilters.month, viewFilters.year);
        fetchCategories();
        fetchContacts();
        fetchAccounts();
        fetchTags();
        fetchProjects();
    }, [viewFilters.month, viewFilters.year]);

    useEffect(() => {
        if (activeTab === 'reports') {
            fetchConsumptionData(reportFilters.month, reportFilters.year, reportFilters.isYtd);
        }
    }, [reportFilters.month, reportFilters.year, reportFilters.isYtd, activeTab]);

    const fetchProjects = async () => {
        const { data } = await supabase.from('finance_projects').select('*').eq('ativo', true).order('nome');
        if (data) setRegisteredProjects(data);
    };

    const fetchTags = async () => {
        const { data } = await supabase.from('finance_tags').select('*').order('nome');
        if (data) setRegisteredTags(data);
    };

    const fetchContacts = async () => {
        const { data } = await supabase.from('finance_contacts').select('*');
        if (data) {
            const contactMap = data.reduce((acc, c) => ({ ...acc, [c.identificador]: c }), {});
            setContacts(contactMap);
        }
    };

    const fetchAccounts = async () => {
        const { data } = await supabase.from('finance_accounts').select('*').eq('ativo', true).order('nome');
        if (data) {
            setAccounts(data);
            // Default to first bank account for new entries
            if (!editingEntry && formData.conta_origem === '') {
                const firstBank = data.find(a => a.tipo === 'Banco');
                if (firstBank) {
                    setFormData(prev => ({ ...prev, conta_origem: firstBank.nome, meio_pagamento: 'Banco' }));
                }
            }
        }
    };

    const fetchCategories = async () => {
        try {
            const { data } = await supabase
                .from('categorias_financeiras')
                .select('id, nome, tipo, parent_id, ativo')
                .eq('ativo', true)
                .order('display_order', { ascending: true })
                .order('nome', { ascending: true });

            if (data) {
                setFlatCategories(data);
                const buildGroups = (tipo: string): CatGroup[] => {
                    const parents = data.filter(c => c.tipo === tipo && c.parent_id === null);
                    return parents.map(p => ({
                        groupName: p.nome,
                        items: data.filter(c => c.parent_id === p.id).map(c => c.nome)
                    })).filter(g => g.items.length > 0);
                };
                const rGroups = buildGroups('receita');
                const dGroups = buildGroups('despesa');
                if (rGroups.length) setGroupsReceita(rGroups);
                if (dGroups.length) setGroupsDespesa(dGroups);
            }
        } catch (err) {
            console.error('Could not load categories:', err);
        }
    };

    const fetchCashFlow = async (month?: number, year?: number) => {
        const m = month || viewFilters.month;
        const y = year || viewFilters.year;
        
        setLoading(true);
        try {
            const startDate = `${y}-01-01`;
            const endDate = `${y}-12-31`;

            const { data, error } = await supabase
                .from('fluxo_caixa')
                .select('*')
                .gte('data_pagamento', startDate)
                .lte('data_pagamento', endDate)
                .order('data_pagamento', { ascending: false });

            if (error) throw error;
            setEntries(data || []);

            const totals = (data || []).reduce((acc, curr) => {
                if (curr.status === 'cancelado') return acc; // Ignora apenas cancelados
                const d = new Date(curr.data_pagamento + 'T12:00:00');
                if (d.getMonth() + 1 !== m) return acc;
                if (curr.tipo === 'entrada') acc.totalEntradas += Number(curr.valor);
                else acc.totalSaidas += Number(curr.valor);
                return acc;
            }, { totalEntradas: 0, totalSaidas: 0 });
            setStats(totals);
        } catch (err) {
            console.error('Error fetching cash flow:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchConsumptionData = async (m: number, y: number, isYtd: boolean) => {
        setFetchingConsumption(true);
        try {
            const startStr = isYtd ? `${y}-01-01T00:00:00Z` : `${y}-${String(m).padStart(2, '0')}-01T00:00:00Z`;
            const lastDay = new Date(y, m, 0).getDate();
            const endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59Z`;

            const { data, error } = await supabase
                .from('lancamentos_consumo')
                .select('*, item:item_id(name)')
                .gte('created_at', startStr)
                .lte('created_at', endStr);

            if (error) throw error;
            setConsumptionData(data || []);
        } catch (err) {
            console.error('Error fetching consumption for report:', err);
        } finally {
            setFetchingConsumption(false);
        }
    };

    const fetchProductsList = async () => {
        try {
            const { data } = await supabase
                .from('products')
                .select('id, name, price, category')
                .eq('is_active', true)
                .order('name');
            if (data) setProductsList(data);
        } catch (err) {
            console.error('Error fetching products list:', err);
        }
    };

    const handleOpenManualConsumption = async () => {
        setManualConsumptionForm({
            item_id: '',
            custom_name: '',
            quantidade: 1,
            valor_unitario_aplicado: 0,
            date: new Date().toISOString().split('T')[0],
            observacoes: 'Lançamento manual do sistema antigo'
        });
        setShowManualConsumptionModal(true);

        if (productsList.length === 0) {
            const { data } = await supabase
                .from('products')
                .select('id, name, price, category')
                .eq('is_active', true)
                .order('name');
            if (data) setProductsList(data);
        }
    };

    const handleSaveManualConsumption = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingManualConsumption(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const itemId = manualConsumptionForm.item_id === 'custom' || !manualConsumptionForm.item_id ? null : manualConsumptionForm.item_id;
            
            let finalName = manualConsumptionForm.custom_name;
            if (itemId) {
                const product = productsList.find(p => p.id === itemId);
                if (product) finalName = product.name;
            }

            const payload = {
                estadia_id: null,
                item_id: itemId,
                nome_item_snapshot: finalName,
                quantidade: manualConsumptionForm.quantidade,
                valor_unitario_aplicado: manualConsumptionForm.valor_unitario_aplicado,
                pago: true,
                aprovado_admin: true,
                criado_por: user?.id || null,
                created_at: manualConsumptionForm.date ? `${manualConsumptionForm.date}T12:00:00Z` : new Date().toISOString(),
                observacoes: manualConsumptionForm.observacoes || 'Lançamento manual do sistema antigo'
            };

            const { error } = await supabase.from('lancamentos_consumo').insert([payload]);
            if (error) throw error;

            alert('Consumo lançado manualmente com sucesso!');
            setShowManualConsumptionModal(false);
            
            // Reload data
            fetchConsumptionData(reportFilters.month, reportFilters.year, reportFilters.isYtd);
        } catch (err: any) {
            console.error('Error saving manual consumption:', err);
            alert('Erro ao salvar lançamento manual: ' + err.message);
        } finally {
            setIsSavingManualConsumption(false);
        }
    };

    const handleEditEntry = (entry: CashFlowEntry) => {
        setEditingEntry(entry);
        setFormData({
            tipo: entry.tipo,
            categoria: entry.categoria || 'Geral',
            valor: entry.valor.toString(),
            data_pagamento: entry.data_pagamento,
            descricao: entry.descricao || '',
            cnpj_fornecedor: entry.cnpj_fornecedor || '',
            meio_pagamento: entry.meio_pagamento || 'Banco',
            conta_origem: entry.conta_origem || '',
            forma_pagamento: entry.forma_pagamento || 'PIX',
            observacoes: entry.observacoes || '',
            data_documento: entry.data_documento || '',
            data_vencimento: entry.data_vencimento || '',
            tags: entry.tags || '',
            projeto: entry.projeto || '',
            is_parcelado: false,
            parcelas: 1,
            frequency_mode: entry.is_recurrence ? 'recorrente' : (entry.parcela_atual ? 'parcelado' : 'unico') as any,
            recurrence_period: (entry.recurrence_period as any) || 'mensal'
        });
        setShowForm(true);
        setEntryMode('manual');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setIsImportingCsv(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            // Removido encoding fixo para evitar quebrar o que já funcionava
            complete: async (results) => {
                try {
                    const rows: any[] = results.data;
                    const payloads: any[] = [];
                    let validCount = 0;

                    if (rows.length > 0) {
                        const headers = Object.keys(rows[0]);
                        console.log('Colunas identificadas:', headers);
                        
                        if (headers.length === 1 && headers[0].includes(';')) {
                            alert('Erro: Sua planilha usa ";" como separador. Salve como CSV padrão ou tente outro formato.');
                            setIsImportingCsv(false);
                            return;
                        }
                    }

                    const usedIds = new Set<string>();

                    for (const row of rows) {
                        const getVal = (colNames: string[]) => {
                            const keys = Object.keys(row);
                            for (const name of colNames) {
                                const exactKey = keys.find(k => k.trim().toLowerCase() === name.trim().toLowerCase());
                                if (exactKey) return row[exactKey];
                            }
                            const fuzzyKey = keys.find(k => colNames.some(c => k.toLowerCase().includes(c)));
                            return fuzzyKey ? row[fuzzyKey] : '';
                        };

                        const tipoStr = String(getVal(['tipo']));
                        const conclusaoStr = String(getVal(['conclusão', 'pago', 'status']));
                        const contaStr = String(getVal(['conta', 'caixa', 'banco']));
                        const formaStr = String(getVal(['forma', 'pagamento', 'tipo pg']));
                        const descStr = String(getVal(['descrição', 'descricao', 'historico', 'detalhe']));
                        const vencStr = String(getVal(['vencimento', 'vcto', 'vencto', 'data_venc']));
                        const valorStr = String(getVal(['valor', 'montante', 'preço', 'total']));
                        const criadoStr = String(getVal(['criado em', 'data', 'pagamento', 'atualizadoem', 'lançado']));
                        const empresaStr = String(getVal(['empres', 'socio', 'visitante', 'convidado', 'cliente', 'fornecedor', 'nome', 'contato']));
                        const categoriaCsvStr = String(getVal(['categoria', 'classe', 'classificação', 'classificacao', 'natureza', 'grupo', 'plano']));
                        const idCsvStr = String(getVal(['id', 'código', 'codigo', 'referência', 'referencia', 'nº doc', 'nº documento', 'numero_documento', 'documento', 'transação', 'transacao', 'ref']));

                        if (!valorStr && !descStr) continue;

                        const parseDate = (d: any) => {
                            if (!d) return null;
                            const dsRaw = String(d).trim();
                            if(!dsRaw || dsRaw.length < 5) return null;
                            
                            // Tradução de meses por extenso
                            const monthsMap: { [key: string]: string } = {
                                'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
                                'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
                                'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
                            };

                            // Caso 1: Data por extenso (ex: 01 de janeiro de 2026)
                            if (dsRaw.toLowerCase().includes(' de ')) {
                                const parts = dsRaw.toLowerCase().split(' de ');
                                if (parts.length === 3) {
                                    const day = parts[0].trim().padStart(2, '0');
                                    const month = monthsMap[parts[1].trim()];
                                    const year = parts[2].trim();
                                    if (day && month && year.length === 4) return `${year}-${month}-${day}`;
                                }
                            }

                            // Caso 2: Data numérica (DD/MM/YYYY etc)
                            let ds = dsRaw.split(' ')[0].replace(/[^0-9/\-.]/g, '');
                            const sep = ds.includes('/') ? '/' : (ds.includes('-') ? '-' : (ds.includes('.') ? '.' : null));
                            
                            if (sep) {
                                const parts = ds.split(sep);
                                if (parts.length === 3) {
                                    let y, m, day;
                                    if (parts[2].length === 4 || (parts[2].length === 2 && parts[0].length <= 2)) { 
                                        y = parts[2]; m = parts[1]; day = parts[0];
                                    } else if (parts[0].length === 4) {
                                        y = parts[0]; m = parts[1]; day = parts[2];
                                    } else return null;

                                    if (y.length === 2) y = "20" + y;
                                    const finalDate = `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                    if (!isNaN(Date.parse(finalDate))) return finalDate;
                                }
                            }

                            return null;
                        };

                        const dtVenc = parseDate(vencStr);
                        const dtPg = parseDate(criadoStr);

                        if (validCount === 0) {
                            console.log('Debug 1a linha:', { descStr, vencStr, valorStr, dtVenc, dtPg });
                        }

                        let tipo = 'saida';
                        if (tipoStr.toLowerCase().includes('receita') || tipoStr.toLowerCase().includes('entrada')) tipo = 'entrada';

                        let status = 'pendente';
                        let data_aprovacao = null;
                        if (conclusaoStr.toLowerCase().includes('pago') || conclusaoStr.toLowerCase().includes('conclu')) {
                            status = 'aprovado';
                            data_aprovacao = dtPg || dtVenc || new Date().toISOString().split('T')[0];
                        }

                        let meio_pagamento = 'Banco';
                        if (contaStr.toLowerCase().includes('caixa') || contaStr.toLowerCase().includes('dinheiro')) meio_pagamento = 'Dinheiro';

                        let v = valorStr.replace(/[R$\s]/g, '').trim();
                        if (v.includes(',') && v.includes('.')) {
                            v = v.replace(/\./g, '').replace(',', '.');
                        } else if (v.includes(',')) {
                            v = v.replace(',', '.');
                        }
                        const valorNum = Math.abs(parseFloat(v) || 0);

                        // Categorização Inteligente
                        const finalCategory = matchCategory(categoriaCsvStr, descStr || 'Sem descrição', tipo, flatCategories);

                        // Determinação do external_id único
                        let external_id = idCsvStr ? idCsvStr.trim() : null;
                        if (external_id) {
                            if (usedIds.has(external_id)) {
                                console.warn(`ID explícito duplicado no CSV: ${external_id}. Ignorando linha.`);
                                continue;
                            }
                            usedIds.add(external_id);
                        } else {
                            // Assinatura baseada em dados chave se não houver ID explícito
                            const cleanDescSignature = (descStr || 'sem_descricao').trim().toLowerCase().substring(0, 30).replace(/[^a-z0-9]/g, '_');
                            const baseId = `${tipo}_${dtVenc || dtPg || 'nodate'}_${valorNum}_${cleanDescSignature}`;
                            let candidateId = baseId;
                            let suffix = 1;
                            while (usedIds.has(candidateId)) {
                                candidateId = `${baseId}_${suffix}`;
                                suffix++;
                            }
                            external_id = candidateId;
                            usedIds.add(external_id);
                        }

                        payloads.push({
                            tipo,
                            categoria: finalCategory,
                            valor: valorNum,
                            data_pagamento: dtVenc || dtPg || new Date().toISOString().split('T')[0], // Prioriza vencimento se o usuário quer usar essa data
                            data_vencimento: dtVenc,
                            descricao: descStr || 'Sem descrição',
                            meio_pagamento,
                            conta_origem: meio_pagamento === 'Banco' ? (accounts.find(a => a.tipo === 'Banco')?.nome || 'Banco Padrão') : (accounts.find(a => a.tipo === 'Dinheiro')?.nome || 'Caixa Central'),
                            forma_pagamento: formaStr || 'Outros',
                            status,
                            data_aprovacao,
                            observacoes: `Importado do sistema anterior. Ref: ${empresaStr}`,
                            projeto: empresaStr ? empresaStr.substring(0, 50) : null,
                            external_id
                        });
                        validCount++;
                    }

                    if (validCount === 0) {
                        alert('Nenhum dado válido encontrado no CSV.');
                        setIsImportingCsv(false);
                        return;
                    }

                    if (!window.confirm(`Planilha lida! Foram encontrados ${validCount} registros. Deseja iniciar a importação/reconciliação para o sistema?`)) {
                        setIsImportingCsv(false);
                        return;
                    }

                    // --- Mesclagem e Upsert Inteligente ---
                    const externalIds = payloads.map(p => p.external_id).filter(Boolean);
                    const existingMap: Record<string, any> = {};

                    if (externalIds.length > 0) {
                        for (let i = 0; i < externalIds.length; i += 500) {
                            const chunkIds = externalIds.slice(i, i + 500);
                            const { data: existingData, error: existingError } = await supabase
                                .from('fluxo_caixa')
                                .select('id, external_id, status, data_aprovacao, categoria')
                                .in('external_id', chunkIds);
                            
                            if (existingError) {
                                console.error('Erro ao buscar transações existentes:', existingError);
                                throw existingError;
                            }
                            if (existingData) {
                                existingData.forEach(row => {
                                    existingMap[row.external_id] = row;
                                });
                            }
                        }
                    }

                    const finalPayloads = payloads.filter(payload => {
                        const existing = existingMap[payload.external_id];
                        // Se já existe, pula (não importa, mantém os dados atuais do sistema)
                        return !existing;
                    });

                    // Gravar os dados em lotes via insert (apenas os novos)
                    let successCount = 0;
                    for (let i = 0; i < finalPayloads.length; i += 50) {
                        const chunk = finalPayloads.slice(i, i + 50);
                        const { error } = await supabase
                            .from('fluxo_caixa')
                            .insert(chunk);
                        
                        if (error) {
                            alert('Erro ao importar parte dos dados: ' + error.message);
                            break;
                        }
                        successCount += chunk.length;
                    }
                    
                    alert(`Importação concluída! ${successCount} lançamentos foram importados ou atualizados com sucesso.`);
                    fetchCashFlow();
                    setActiveTab('flow');
                    
                } catch (err: any) {
                    alert('Erro na leitura/gravação: ' + err.message);
                } finally {
                    setIsImportingCsv(false);
                    if (e.target) e.target.value = '';
                }
            },
            error: (err) => {
                alert('Erro ao analisar o CSV: ' + err.message);
                setIsImportingCsv(false);
                if (e.target) e.target.value = '';
            }
        });
    };

    const handleToggleForm = () => {
        if (showForm) {
            handleCancelForm();
        } else {
            setEditingEntry(null);
            const defaultCat = groupsDespesa[0]?.items[0] || 'Outras despesas';
            setFormData({
                ...defaultFormData,
                tipo: 'saida',
                categoria: defaultCat
            });
            setShowForm(true);
        }
    };

    const handleCancelForm = () => {
        setShowForm(false);
        setEditingEntry(null);
        setFormData(defaultFormData);
        setSelectedFile(null);
        setPreviewUrl(null);
        setSaveToContacts(false);
        setTempContact({ nome: '', identificador: '', banco: '', agencia: '', conta: '', chave_pix: '' });
    };

    const handleSaveTag = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTag.trim()) return;
        try {
            const { error } = await supabase.from('finance_tags').insert({ nome: newTag.trim() });
            if (error) throw error;
            setNewTag('');
            fetchTags();
        } catch (err: any) { alert(err.message); }
    };

    const handleDeleteTag = async (id: number) => {
        if (!window.confirm('Excluir esta tag? Ela não sumirá dos lançamentos passados, mas não poderá ser usada em novos.')) return;
        try {
            const { error } = await supabase.from('finance_tags').delete().eq('id', id);
            if (error) throw error;
            fetchTags();
        } catch (err: any) { alert(err.message); }
    };

    const handleSaveProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProject.nome.trim()) return;
        try {
            const { error } = await supabase.from('finance_projects').insert([newProject]);
            if (error) throw error;
            setNewProject({ nome: '', descricao: '' });
            fetchProjects();
        } catch (err: any) { alert(err.message); }
    };

    const handleDeleteProject = async (id: number) => {
        if (!window.confirm('Excluir este projeto?')) return;
        try {
            const { error } = await supabase.from('finance_projects').delete().eq('id', id);
            if (error) throw error;
            fetchProjects();
        } catch (err: any) { alert(err.message); }
    };

    const handleDelete = async (id: number) => {
        try {
            const { error } = await supabase.from('fluxo_caixa').delete().eq('id', id);
            if (error) throw error;
            setConfirmDeleteId(null);
            fetchCashFlow();
        } catch (err: any) {
            alert('Erro ao excluir: ' + err.message);
        }
    };

    const handleApprove = async (entry: CashFlowEntry) => {
        try {
            const dataAtual = new Date().toISOString().split('T')[0];
            const { error } = await supabase
                .from('fluxo_caixa')
                .update({ status: 'aprovado', data_aprovacao: dataAtual })
                .eq('id', entry.id);
            if (error) throw error;
            
            if (entry.is_recurrence) {
                if (window.confirm('Pagamento consolidado! Deseja agendar/clonar a fatura do próximo período para o contas a pagar?')) {
                    let nextDate = new Date(entry.data_pagamento + 'T12:00:00');
                    let nextVc = entry.data_vencimento ? new Date(entry.data_vencimento + 'T12:00:00') : null;

                    if (entry.recurrence_period === 'mensal') {
                        nextDate.setMonth(nextDate.getMonth() + 1);
                        if (nextVc) nextVc.setMonth(nextVc.getMonth() + 1);
                    } else if (entry.recurrence_period === 'semestral') {
                        nextDate.setMonth(nextDate.getMonth() + 6);
                        if (nextVc) nextVc.setMonth(nextVc.getMonth() + 6);
                    } else if (entry.recurrence_period === 'anual') {
                        nextDate.setFullYear(nextDate.getFullYear() + 1);
                        if (nextVc) nextVc.setFullYear(nextVc.getFullYear() + 1);
                    }

                    const { id, created_at, status, data_aprovacao, is_recurrence, recurrence_period, ...restProps } = entry as any;
                    const nextPayload = {
                       ...restProps,
                       is_recurrence: true,
                       recurrence_period: entry.recurrence_period,
                       data_pagamento: nextDate.toISOString().split('T')[0],
                       data_vencimento: nextVc ? nextVc.toISOString().split('T')[0] : null,
                       status: 'pendente'
                    };
                    
                    await supabase.from('fluxo_caixa').insert(nextPayload);
                    alert('Conta futura projetada na agenda!');
                }
            }
            
            fetchCashFlow();
        } catch (err: any) {
            alert('Erro ao processar: ' + err.message);
        }
    };

    const handleToggleSelect = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleSelectAll = (visibleItems: CashFlowEntry[]) => {
        if (selectedIds.length === visibleItems.length && visibleItems.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(visibleItems.map(e => e.id));
        }
    };

    const handleBulkApprove = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Deseja aprovar os ${selectedIds.length} itens selecionados?`)) return;

        setLoading(true);
        try {
            const dataAtual = new Date().toISOString().split('T')[0];
            const { error } = await supabase
                .from('fluxo_caixa')
                .update({ status: 'aprovado', data_aprovacao: dataAtual })
                .in('id', selectedIds);
            if (error) throw error;
            alert('Lançamentos aprovados!');
            setSelectedIds([]);
            fetchCashFlow();
        } catch (err: any) { alert('Erro ao aprovar: ' + err.message); }
        finally { setLoading(true); fetchCashFlow(); } // Use true to reset state
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`AVISO: Deseja EXCLUIR DEFINITIVAMENTE os ${selectedIds.length} itens selecionados? Esta ação não pode ser desfeita.`)) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('fluxo_caixa')
                .delete()
                .in('id', selectedIds);
            if (error) throw error;
            alert('Lançamentos excluídos!');
            setSelectedIds([]);
            fetchCashFlow();
        } catch (err: any) { alert('Erro ao excluir: ' + err.message); }
        finally { setLoading(false); }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setSelectedFile(file);

        if (file.type.startsWith('image/')) {
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            setPreviewUrl(null);
        }

        if (entryMode === 'ocr') {
            setIsOcrProcessing(true);
            setTimeout(() => {
                setFormData(prev => ({
                    ...prev,
                    descricao: 'MOCK NOTA FISCAL: Mercado SuperFarm',
                    valor: '235.50',
                    cnpj_fornecedor: '12.345.678/0001-90',
                    data_pagamento: new Date().toISOString().split('T')[0],
                    tipo: 'saida',
                    categoria: 'Alimentação'
                }));
                setIsOcrProcessing(false);
                alert('Leitura da Nota Fiscal concluída! Verifique os dados preenchidos.');
            }, 3000);
        }
    };

    const handleSaveContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingContact(true);
        try {
            const { id, ...contactToSave } = newContact as any;
            const { error } = await supabase
                .from('finance_contacts')
                .upsert(contactToSave, { onConflict: 'identificador' });

            if (error) throw error;
            alert('Contato financeiro salvo com sucesso!');
            setNewContact({ identificador: '', nome: '', nome_fantasia: '', banco: '', agencia: '', conta: '', tipo_conta: 'Corrente', chave_pix: '' });
            fetchContacts();
        } catch (err: any) {
            alert('Erro ao salvar contato: ' + err.message);
        } finally {
            setIsSavingContact(false);
        }
    };

    const handleSaveAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingAccount(true);
        try {
            const { error } = await supabase
                .from('finance_accounts')
                .upsert(newAccount);

            if (error) throw error;
            alert('Conta salva com sucesso!');
            setNewAccount({ nome: '', tipo: 'Banco', banco: '', agencia: '', conta: '' });
            setShowAccountManager(false);
            fetchAccounts();
        } catch (err: any) {
            alert('Erro ao salvar conta: ' + err.message);
        } finally {
            setIsSavingAccount(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            let documento_anexo_url = editingEntry?.documento_anexo_url || null;
            let finalCnpj = formData.cnpj_fornecedor;

            if (formData.cnpj_fornecedor === 'NEW_MANUAL') {
                finalCnpj = tempContact.identificador || '';
                if (saveToContacts && tempContact.nome && tempContact.identificador) {
                    const { id, ...contactToSave } = tempContact as any;
                    const { error: contactError } = await supabase
                        .from('finance_contacts')
                        .upsert({
                            ...contactToSave,
                            tipo_conta: 'Corrente'
                        }, { onConflict: 'identificador' });

                    if (contactError) {
                        console.warn('Could not save contact, but continuing with transaction:', contactError);
                    } else {
                        await fetchContacts();
                    }
                }
            }

            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `comprovantes/${fileName}`;
                const { error: uploadError } = await supabase.storage
                    .from('financeiro')
                    .upload(filePath, selectedFile);

                if (uploadError) {
                    console.error('Upload Error Details:', uploadError);
                } else {
                    const { data: { publicUrl } } = supabase.storage
                        .from('financeiro')
                        .getPublicUrl(filePath);
                    documento_anexo_url = publicUrl;
                }
            }

            const basePayload = {
                tipo: formData.tipo,
                categoria: formData.categoria,
                data_pagamento: formData.data_pagamento,
                descricao: formData.descricao,
                cnpj_fornecedor: finalCnpj === 'NEW_MANUAL' ? '' : (finalCnpj || null),
                documento_anexo_url,
                meio_pagamento: formData.meio_pagamento,
                conta_origem: formData.conta_origem,
                forma_pagamento: formData.forma_pagamento,
                observacoes: formData.observacoes,
                data_documento: formData.data_documento || null,
                data_vencimento: formData.data_vencimento || null,
                tags: formData.tags || null,
                projeto: formData.projeto || null,
                is_recurrence: formData.frequency_mode === 'recorrente',
                recurrence_period: formData.frequency_mode === 'recorrente' ? formData.recurrence_period : null,
                status: editingEntry ? editingEntry.status : (canApprove ? 'aprovado' : 'pendente'),
                data_aprovacao: editingEntry ? editingEntry.data_aprovacao : (canApprove ? new Date().toISOString().split('T')[0] : null)
            };

            const payloads = [];
            if (!editingEntry && formData.frequency_mode === 'parcelado' && formData.parcelas > 1) {
                const baseValue = parseFloat(formData.valor.toString().replace(',', '.')) / formData.parcelas;
                let currentDate = new Date(formData.data_pagamento + 'T12:00:00');
                let currentVc = formData.data_vencimento ? new Date(formData.data_vencimento + 'T12:00:00') : null;
                
                for (let i = 1; i <= formData.parcelas; i++) {
                    payloads.push({
                        ...basePayload,
                        valor: baseValue,
                        descricao: `${formData.descricao} (Parcela ${i}/${formData.parcelas})`,
                        parcela_atual: i,
                        total_parcelas: formData.parcelas,
                        data_pagamento: currentDate.toISOString().split('T')[0],
                        data_vencimento: currentVc ? currentVc.toISOString().split('T')[0] : null
                    });
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    if (currentVc) currentVc.setMonth(currentVc.getMonth() + 1);
                }
            } else {
                payloads.push({
                    ...basePayload,
                    valor: parseFloat(formData.valor.toString().replace(',', '.')),
                    parcela_atual: editingEntry?.parcela_atual || 1,
                    total_parcelas: editingEntry?.total_parcelas || 1
                });
            }

            if (editingEntry) {
                const { error } = await supabase
                    .from('fluxo_caixa')
                    .update(payloads[0])
                    .eq('id', editingEntry.id);
                if (error) throw error;
                alert('Lançamento atualizado com sucesso!');
            } else {
                const { error } = await supabase.from('fluxo_caixa').insert(payloads);
                if (error) throw error;
            }

            handleCancelForm();
            fetchCashFlow();
        } catch (err: any) {
            alert('Erro ao salvar: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const visibleEntries = entries.filter(e => {
        const d = new Date(e.data_pagamento + 'T12:00:00');
        const matchMonth = d.getMonth() + 1 === viewFilters.month;
        const matchTipo = viewFilters.tipo === 'all' || e.tipo === viewFilters.tipo;
        const matchSearch = !flowSearchTerm || 
            e.descricao.toLowerCase().includes(flowSearchTerm.toLowerCase()) || 
            e.categoria.toLowerCase().includes(flowSearchTerm.toLowerCase()) ||
            (e.conta_origem || '').toLowerCase().includes(flowSearchTerm.toLowerCase()) ||
            (e.valor.toString().includes(flowSearchTerm)) ||
            (e.tags || '').toLowerCase().includes(flowSearchTerm.toLowerCase());
            
        return matchMonth && matchTipo && matchSearch;
    });

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 no-print">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Fluxo de Caixa</h1>
                    <p className="text-gray-500 mt-2 text-lg">Gerenciamento completo de entradas e saídas.</p>
                </div>
                {!isViewOnly && activeTab === 'flow' && (
                    <div className="flex gap-4 w-full md:w-auto">
                        <button onClick={() => document.getElementById('csvFileInput')?.click()} disabled={isImportingCsv} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-farm-700 border-2 border-farm-100 font-bold px-6 py-3 rounded-xl hover:bg-farm-50 transition-colors">
                            {isImportingCsv ? <IconLoader className="w-5 h-5 animate-spin" /> : <IconFileText className="w-5 h-5" />} {isImportingCsv ? 'Importando...' : 'Importar CSV'}
                        </button>
                        <input type="file" id="csvFileInput" accept=".csv" className="hidden" onChange={handleCsvImport} disabled={isImportingCsv} />
                        <button onClick={() => setReconciliationView('sessions')} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-farm-700 border-2 border-farm-100 font-bold px-6 py-3 rounded-xl hover:bg-farm-50 transition-colors">
                            <IconRefresh className="w-5 h-5" /> Conciliar Extrato
                        </button>
                        <button onClick={handleToggleForm} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-farm-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-farm-700 transition-colors shadow-lg shadow-farm-200">
                            {showForm ? 'Cancelar' : <><IconPlus className="w-5 h-5" /> Novo Lançamento</>}
                        </button>
                    </div>
                )}
            </div>

            <div className="flex border-b border-gray-200 no-print">
                <button onClick={() => setActiveTab('flow')} className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'flow' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}>
                    Lançamentos
                    {activeTab === 'flow' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button onClick={() => setActiveTab('accounts')} className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'accounts' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}>
                    Contas e Caixas
                    {activeTab === 'accounts' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button onClick={() => setActiveTab('contacts')} className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'contacts' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}>
                    Contatos
                    {activeTab === 'contacts' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button onClick={() => setActiveTab('reports')} className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'reports' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}>
                    📊 Relatórios
                    {activeTab === 'reports' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button onClick={() => setActiveTab('tags')} className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'tags' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}>
                    Projetos / Tags
                    {activeTab === 'tags' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                {canApprove && (
                    <button onClick={() => setActiveTab('audit')} className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'audit' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}>
                        Auditoria (Aprovações)
                        {activeTab === 'audit' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                        {entries.filter(e => e.status === 'pendente').length > 0 && (
                            <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{entries.filter(e => e.status === 'pendente').length}</span>
                        )}
                    </button>
                )}
            </div>

            {activeTab === 'flow' ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Entradas</span>
                            <span className="text-3xl font-black text-green-600">R$ {stats.totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Saídas</span>
                            <span className="text-3xl font-black text-red-500">R$ {stats.totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-farm-800 p-6 rounded-2xl shadow-xl text-white flex flex-col">
                            <span className="text-xs font-bold text-farm-300 uppercase tracking-widest mb-1">Saldo Líquido</span>
                            <span className="text-3xl font-black">R$ {(stats.totalEntradas - stats.totalSaidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {showForm && (
                        <div className={`bg-white p-8 rounded-3xl shadow-lg border animate-fade-in relative overflow-hidden no-print ${editingEntry ? 'border-amber-200' : 'border-farm-100'}`}>
                            <div className={`absolute top-0 left-0 w-2 h-full ${editingEntry ? 'bg-amber-400' : 'bg-farm-500'}`}></div>
                            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                {editingEntry ? (<><span className="bg-amber-100 p-2 rounded-lg text-amber-700"><IconEdit className="w-5 h-5" /></span>Editando Lançamento</>) : (<><span className="bg-farm-100 p-2 rounded-lg text-farm-700"><IconPlus className="w-5 h-5" /></span>Novo Lançamento</>)}
                            </h3>

                            <div className="mb-8 p-1 bg-gray-100 rounded-2xl flex max-w-md w-full shadow-inner">
                                <button onClick={() => { setEntryMode('manual'); }} className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${entryMode === 'manual' ? 'bg-white text-gray-800 shadow-md' : 'text-gray-500'}`}>Manual</button>
                                <button onClick={() => { setEntryMode('ocr'); }} className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${entryMode === 'ocr' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-500'}`}>Leitor OCR (Nota Fiscal)</button>
                            </div>

                            <div className="mb-8">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Anexar Comprovante (Opcional)</label>
                                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-all relative overflow-hidden ${isOcrProcessing ? 'bg-gray-50 border-gray-200' : selectedFile ? 'bg-gray-50 border-gray-300' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                                    {previewUrl && <img src={previewUrl} className="absolute inset-0 w-full h-full object-cover opacity-20 filter blur-sm" alt="Preview" />}
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                                        {isOcrProcessing ? (<><IconLoader className="w-10 h-10 text-gray-600 animate-spin mb-3" /><span className="text-gray-700 font-bold">Processando OCR...</span></>) : selectedFile ? (<span className="text-gray-700 font-bold flex flex-col items-center gap-2"><IconCheck className="w-8 h-8 bg-gray-200 rounded-full p-1 shadow-sm" />{selectedFile.name}</span>) : (<><p className="mb-1 text-sm text-gray-500"><span className="font-semibold text-gray-700">Clique para selecionar arquivo</span></p></>)}
                                    </div>
                                    <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileChange} />
                                </label>
                            </div>

                            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="md:col-span-2 lg:col-span-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Descrição <span className="text-red-500">*</span></label>
                                    <textarea required value={formData.descricao} onChange={e => setFormData({ ...formData, descricao: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none resize-y min-h-[80px]" placeholder="Ex: Reforma da Cerca, Compra de Insumos..." />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Tipo</label>
                                    <div className="flex bg-gray-100 p-1 rounded-xl">
                                        <button type="button" onClick={() => {
                                            const defaultCat = groupsReceita[0]?.items[0] || 'Outras Receitas';
                                            setFormData({ ...formData, tipo: 'entrada', categoria: defaultCat });
                                        }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.tipo === 'entrada' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}>Entrada</button>
                                        <button type="button" onClick={() => {
                                            const defaultCat = groupsDespesa[0]?.items[0] || 'Outras despesas';
                                            setFormData({ ...formData, tipo: 'saida', categoria: defaultCat });
                                        }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>Saída</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Forma</label>
                                    <select required value={formData.forma_pagamento} onChange={e => {
                                        const val = e.target.value;
                                        const isDin = val === 'Dinheiro';
                                        const accs = accounts.filter(a => isDin ? a.tipo === 'Dinheiro' : a.tipo === 'Banco');
                                        const firstAcc = accs.length > 0 ? accs[0].nome : '';
                                        setFormData({
                                            ...formData,
                                            forma_pagamento: val,
                                            meio_pagamento: isDin ? 'Dinheiro' : 'Banco',
                                            conta_origem: firstAcc
                                        });
                                    }} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none bg-white font-medium">
                                        <option value="PIX">PIX</option>
                                        <option value="Transferência">Transferência Bancária</option>
                                        <option value="Boleto">Boleto</option>
                                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                                        <option value="Cartão de Débito">Cartão de Débito</option>
                                        <option value="Dinheiro">Dinheiro Físico / Caixa</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                                <div className="lg:col-span-1">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Conta / Caixa</label>
                                    <select required value={formData.conta_origem} onChange={e => {
                                        const acc = accounts.find(a => a.nome === e.target.value);
                                        setFormData({ ...formData, conta_origem: e.target.value, meio_pagamento: acc?.tipo || 'Banco' });
                                    }} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none bg-white font-medium">
                                        <option value="">Selecione...</option>
                                        {accounts.filter(a => formData.forma_pagamento === 'Dinheiro' ? a.tipo === 'Dinheiro' : a.tipo === 'Banco').map(acc => (
                                            <option key={acc.id} value={acc.nome}>{acc.tipo === 'Banco' ? '🏦' : '💵'} {acc.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Categoria</label>
                                    <select value={formData.categoria} onChange={e => setFormData({ ...formData, categoria: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none bg-white">
                                        {(formData.tipo === 'entrada' ? groupsReceita : groupsDespesa).map(g => (
                                            <optgroup key={g.groupName} label={g.groupName}>
                                                {g.items.map(i => <option key={i} value={i}>{i}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Valor (R$)</label>
                                    <input type="number" step="0.01" required value={formData.valor} onChange={e => setFormData({ ...formData, valor: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none font-mono text-lg text-farm-800 focus:ring-2 focus:ring-farm-500 transition-all" placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Data de Lançamento</label>
                                    <input type="date" required value={formData.data_pagamento} onChange={e => setFormData({ ...formData, data_pagamento: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-500 transition-all" />
                                </div>
                                <div className="md:col-span-2 lg:col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Fornecedor / Origem</label>
                                    <select 
                                        value={formData.cnpj_fornecedor === 'NEW_MANUAL' ? 'outro' : (formData.cnpj_fornecedor || '')} 
                                        onChange={e => {
                                            const val = e.target.value;
                                            const newCnpj = val === 'outro' ? 'NEW_MANUAL' : val;
                                            const contact = contacts[val];
                                            if (contact && contact.categoria_padrao) {
                                                setFormData({ ...formData, cnpj_fornecedor: newCnpj, categoria: contact.categoria_padrao });
                                            } else {
                                                setFormData({ ...formData, cnpj_fornecedor: newCnpj });
                                            }
                                        }} 
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none bg-white font-medium focus:ring-2 focus:ring-farm-500 transition-all"
                                    >
                                        <option value="">NÃO INFORMADO</option>
                                        {Object.values(contacts).map((contact: any) => (<option key={contact.identificador} value={contact.identificador}>{contact.nome_fantasia || contact.nome}</option>))}
                                        <option value="outro">+ OUTRO (DIGITAR MANUAL)</option>
                                    </select>
                                </div>

                                {formData.cnpj_fornecedor === 'NEW_MANUAL' && (
                                    <div className="md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50 p-4 rounded-2xl border border-amber-100 animate-fade-in">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-amber-700 mb-1 tracking-widest">Nome do Novo Fornecedor</label>
                                            <input type="text" required value={tempContact.nome} onChange={e => setTempContact({...tempContact, nome: e.target.value})} className="w-full px-4 py-2 border border-amber-200 rounded-xl outline-none bg-white shadow-sm" placeholder="Ex: Mercado local" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-amber-700 mb-1 tracking-widest">CPF / CNPJ</label>
                                            <input type="text" value={tempContact.identificador} onChange={e => setTempContact({...tempContact, identificador: e.target.value})} className="w-full px-4 py-2 border border-amber-200 rounded-xl outline-none bg-white shadow-sm" placeholder="00.000.000/0001-00" />
                                        </div>
                                        <div className="md:col-span-2 flex items-center gap-2">
                                            <input type="checkbox" id="saveContact" checked={saveToContacts} onChange={e => setSaveToContacts(e.target.checked)} className="rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                                            <label htmlFor="saveContact" className="text-xs font-bold text-amber-800 cursor-pointer">Salvar na lista de contatos para usar depois?</label>
                                        </div>
                                    </div>
                                )}

                                <div className="md:col-span-2 lg:col-span-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Comentários Adicionais / Observações</label>
                                    <textarea value={formData.observacoes} onChange={e => setFormData({ ...formData, observacoes: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none resize-y min-h-[80px]" placeholder="Detalhes extras, referências, justificativas..." />
                                </div>

                                <div className="md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                    <div className="md:col-span-2 lg:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Projeto Especial</label>
                                        <select value={formData.projeto || ''} onChange={e => setFormData({ ...formData, projeto: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none bg-white font-medium focus:ring-2 focus:ring-farm-500 transition-all">
                                            <option value="">-- NENHUM PROJETO ESPECÍFICO --</option>
                                            {registeredProjects.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Área / Departamento (Tag)</label>
                                        <select value={formData.tags || ''} onChange={e => setFormData({ ...formData, tags: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none bg-white font-medium focus:ring-2 focus:ring-farm-500 transition-all">
                                            <option value="">-- GERAL (NENHUMA ÁREA) --</option>
                                            {registeredTags.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Data do Vencimento</label>
                                        <input type="date" value={formData.data_vencimento} onChange={e => setFormData({ ...formData, data_vencimento: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-500 transition-all" />
                                    </div>
                                </div>

                                {!editingEntry && (
                                    <div className="md:col-span-2 lg:col-span-4 bg-sky-50 border border-sky-200 rounded-2xl p-6 mt-2">
                                        <label className="block text-sm font-bold text-sky-900 mb-3 uppercase tracking-widest">Frequência da Transação</label>
                                        <div className="flex bg-white rounded-xl shadow-inner border border-sky-100 p-1 mb-4 flex-wrap gap-2">
                                            <button type="button" onClick={() => setFormData({ ...formData, frequency_mode: 'unico' })} className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all min-w-[140px] ${formData.frequency_mode === 'unico' ? 'bg-sky-600 text-white shadow-md' : 'text-sky-700 hover:bg-sky-50'}`}>🟢 Único (Padrão)</button>
                                            <button type="button" onClick={() => setFormData({ ...formData, frequency_mode: 'parcelado' })} className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all min-w-[140px] ${formData.frequency_mode === 'parcelado' ? 'bg-amber-500 text-white shadow-md' : 'text-sky-700 hover:bg-sky-50'}`}>💳 Parcelado</button>
                                            <button type="button" onClick={() => setFormData({ ...formData, frequency_mode: 'recorrente' })} className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all min-w-[140px] ${formData.frequency_mode === 'recorrente' ? 'bg-purple-600 text-white shadow-md' : 'text-sky-700 hover:bg-sky-50'}`}>🔁 Recorrente</button>
                                        </div>

                                        {formData.frequency_mode === 'parcelado' && (
                                            <div className="animate-fade-in bg-white border border-amber-200 p-4 rounded-xl flex items-center gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-amber-800 mb-1">Total de Parcelas</label>
                                                    <input type="number" min="2" max="60" value={formData.parcelas} onChange={e => setFormData({ ...formData, parcelas: parseInt(e.target.value) || 1 })} className="w-24 px-3 py-2 border border-amber-300 rounded-lg outline-none text-center font-bold text-amber-900" />
                                                </div>
                                                <p className="text-sm text-amber-700 leading-tight">O sistema criará {formData.parcelas} faturas separadas, dividindo o valor.</p>
                                            </div>
                                        )}

                                        {formData.frequency_mode === 'recorrente' && (
                                            <div className="animate-fade-in bg-white border border-purple-200 p-4 rounded-xl flex items-center gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-purple-800 mb-1">Intervalo</label>
                                                    <select value={formData.recurrence_period} onChange={e => setFormData({ ...formData, recurrence_period: e.target.value as any })} className="w-36 px-3 py-2 border border-purple-300 rounded-lg outline-none text-center font-bold text-purple-900">
                                                        <option value="mensal">Mensalmente</option>
                                                        <option value="semestral">A cada 6 meses</option>
                                                        <option value="anual">Anualmente</option>
                                                    </select>
                                                </div>
                                                <p className="text-sm text-purple-700 leading-tight">Será lançada apenas a primeira fatura agora.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="md:col-span-2 lg:col-span-4 flex justify-end gap-4 pt-6 mt-4 border-t border-gray-100">
                                    <button type="button" onClick={handleCancelForm} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancelar</button>
                                    <button type="submit" disabled={submitting} className="font-bold py-3 px-8 rounded-xl bg-farm-800 text-white shadow-md hover:bg-farm-900 disabled:opacity-50 transition-all">Salvar Lançamento</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {!loading && (
                        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/50 no-print">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-gray-500 uppercase tracking-widest hidden lg:inline">Período:</span>
                                        <select 
                                            value={viewFilters.month} 
                                            onChange={e => setViewFilters({...viewFilters, month: parseInt(e.target.value)})}
                                            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-farm-200"
                                        >
                                            {Array.from({length: 12}).map((_, i) => (
                                                <option key={i+1} value={i+1}>{new Date(2000, i, 1).toLocaleDateString('pt-BR', {month: 'long'}).toUpperCase()}</option>
                                        ))}
                                    </select>
                                    <select 
                                        value={viewFilters.year} 
                                        onChange={e => setViewFilters({...viewFilters, year: parseInt(e.target.value)})}
                                        className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-farm-200"
                                    >
                                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <select 
                                        value={viewFilters.tipo} 
                                        onChange={e => setViewFilters({...viewFilters, tipo: e.target.value as any})}
                                        className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-farm-200"
                                    >
                                        <option value="all">TODOS OS LANÇAMENTOS</option>
                                        <option value="entrada">RECEITAS (ENTRADAS)</option>
                                        <option value="saida">DESPESAS (SAÍDAS)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                <input 
                                    type="text" 
                                    placeholder="Buscar lançamentos..." 
                                    value={flowSearchTerm}
                                    onChange={e => setFlowSearchTerm(e.target.value)}
                                    className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-farm-200 w-48 shadow-sm"
                                />
                                {canApprove && selectedIds.length > 0 && (
                                        <div className="flex gap-2 animate-fade-in bg-amber-50 p-1 rounded-xl border border-amber-100">
                                            <button 
                                                onClick={handleBulkApprove}
                                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-[10px] shadow-sm"
                                            >
                                                Aprovar ({selectedIds.length})
                                            </button>
                                            <button 
                                                onClick={handleBulkDelete}
                                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-[10px] shadow-sm"
                                            >
                                                Excluir ({selectedIds.length})
                                            </button>
                                        </div>
                                    )}
                                    <button 
                                        onClick={() => exportToExcel(visibleEntries, 'lancamentos_filtrados')}
                                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-green-700 border border-green-200 font-bold px-4 py-2 rounded-xl hover:bg-green-50 transition-colors text-xs shadow-sm"
                                    >
                                        Excel (Filtrado)
                                    </button>
                                    <button 
                                        onClick={() => window.print()}
                                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-800 text-white font-bold px-4 py-2 rounded-xl hover:bg-black transition-colors text-xs shadow-sm"
                                    >
                                        Imprimir PDF
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4 no-print">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-gray-300 text-farm-600 focus:ring-farm-500 w-4 h-4 cursor-pointer"
                                                    checked={selectedIds.length === visibleEntries.length && visibleEntries.length > 0}
                                                    onChange={() => handleSelectAll(visibleEntries)}
                                                />
                                            </th>
                                            <th className="px-6 py-4 font-semibold">Data</th>
                                            <th className="px-6 py-4 font-semibold">Descrição</th>
                                            <th className="px-6 py-4 font-semibold">Origem / Categoria</th>
                                            <th className="px-6 py-4 font-semibold text-right">Valor</th>
                                            <th className="px-6 py-4 font-semibold text-center no-print">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {visibleEntries.map((entry) => (
                                            <tr key={entry.id} className={`hover:bg-gray-50 transition-colors group ${selectedIds.includes(entry.id) ? 'bg-farm-50/50' : ''}`}>
                                                <td className="px-6 py-5 no-print">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-gray-300 text-farm-600 focus:ring-farm-500 w-4 h-4 cursor-pointer"
                                                        checked={selectedIds.includes(entry.id)}
                                                        onChange={() => handleToggleSelect(entry.id)}
                                                    />
                                                </td>
                                                <td className="px-6 py-5 text-sm">
                                                    <div>{new Date(entry.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                                                    {entry.status === 'pendente' && <span className="px-2 py-0.5 mt-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded block w-fit">PENDENTE APROVAÇÃO</span>}
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="font-bold text-gray-800">{entry.descricao}</div>
                                                    {entry.cnpj_fornecedor && <div className="text-xs text-gray-400 font-mono mt-0.5">{entry.cnpj_fornecedor}</div>}
                                                    <div className="flex gap-2 mt-2">
                                                        {entry.projeto && <span className="text-[9px] px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded font-black uppercase">🏗️ {entry.projeto}</span>}
                                                        {entry.tags && <span className="text-[9px] px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded font-black uppercase">📌 {entry.tags}</span>}
                                                    </div>
                                                    {entry.observacoes && <div className="text-xs text-farm-600 mt-1.5 line-clamp-2 max-w-xs">{entry.observacoes}</div>}
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`text-[10px] font-black uppercase w-fit px-1.5 py-0.5 rounded ${entry.meio_pagamento === 'Dinheiro' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {entry.meio_pagamento === 'Dinheiro' ? '💵 ' : '🏦 '}{entry.conta_origem}
                                                        </span>
                                                        <span className="px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-[9px] font-bold text-gray-600 w-fit uppercase">{entry.forma_pagamento || 'N/I'}</span>
                                                        <span className="px-2 py-0.5 bg-gray-50 rounded text-xs font-bold text-farm-700 w-fit">{entry.categoria}</span>
                                                    </div>
                                                </td>
                                                <td className={`px-6 py-5 text-right font-black whitespace-nowrap ${entry.tipo === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>{entry.tipo === 'entrada' ? '+' : '-'} R$ {entry.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-5 flex items-center justify-center gap-1 flex-wrap no-print">
                                                    {entry.documento_anexo_url && (<a href={entry.documento_anexo_url} target="_blank" className="p-2 text-farm-600"><IconFileText className="w-5 h-5" /></a>)}
                                                    {canApprove && entry.status === 'pendente' && (
                                                        <button onClick={() => handleApprove(entry)} className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 font-bold text-xs rounded-xl transition-colors shadow-sm">Aprovar ✓</button>
                                                    )}
                                                    {!isViewOnly && (
                                                        <>
                                                            <button onClick={() => handleEditEntry(entry)} className="p-2 text-gray-400 hover:text-amber-600 opacity-0 group-hover:opacity-100"><IconEdit className="w-5 h-5" /></button>
                                                            <button onClick={() => setConfirmDeleteId(entry.id)} className="p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"><IconTrash className="w-5 h-5" /></button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            ) : activeTab === 'reports' ? (() => {
                const filteredReports = entries.filter(e => {
                    if (e.status === 'pendente') return false;
                    const d = new Date(e.data_pagamento + 'T12:00:00');
                    
                    if (d.getFullYear() !== reportFilters.year) return false;
                    
                    const matchMonth = reportFilters.isYtd
                        ? (d.getMonth() + 1 <= reportFilters.month)
                        : (d.getMonth() + 1 === reportFilters.month);
                    
                    if (!matchMonth) return false;

                    if (reportFilters.origem.startsWith('type:')) {
                        if (e.meio_pagamento !== reportFilters.origem.substring(5)) return false;
                    } else if (reportFilters.origem.startsWith('account:')) {
                        if (e.conta_origem !== reportFilters.origem.substring(8)) return false;
                    }

                    if (reportFilters.tag !== '' && e.tags !== reportFilters.tag) return false;
                    if (reportFilters.projeto !== '' && e.projeto !== reportFilters.projeto) return false;
                    if (reportFilters.flowType !== 'all' && e.tipo !== reportFilters.flowType) return false;
                    if (reportFilters.categoria !== 'all' && e.categoria !== reportFilters.categoria) return false;
                    return true;
                });

                const tEntrada = filteredReports.reduce((acc, curr) => curr.tipo === 'entrada' ? acc + curr.valor : acc, 0);
                const tSaida = filteredReports.reduce((acc, curr) => curr.tipo === 'saida' ? acc + curr.valor : acc, 0);

                const groupedConsumption = consumptionData.reduce((acc: any, curr: any) => {
                    const name = curr.nome_item_snapshot || curr.item?.name || 'Desconhecido';
                    const isMeal = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('almoco') ||
                                   name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('jantar') ||
                                   name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('refeicao') ||
                                   name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('cafe');
                    if (!acc[name]) {
                        acc[name] = {
                            name,
                            quantidade: 0,
                            valorTotal: 0,
                            isMeal
                        };
                    }
                    acc[name].quantidade += Number(curr.quantidade || 0);
                    acc[name].valorTotal += Number(curr.quantidade || 0) * Number(curr.valor_unitario_aplicado || 0);
                    return acc;
                }, {});

                const consumptionList = Object.values(groupedConsumption);
                const mealsReport = consumptionList.filter((c: any) => c.isMeal);
                const productsReport = consumptionList.filter((c: any) => !c.isMeal);

                return (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
                            {/* Report Type Selector Tab */}
                            <div className="flex gap-6 mb-6 border-b border-gray-100 pb-3 no-print">
                                <button
                                    onClick={() => setSelectedReportType('financial')}
                                    className={`pb-2 font-bold text-sm transition-all relative ${selectedReportType === 'financial' ? 'text-farm-800 border-b-2 border-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    📊 Movimentação Financeira
                                </button>
                                <button
                                    onClick={() => setSelectedReportType('consumption')}
                                    className={`pb-2 font-bold text-sm transition-all relative ${selectedReportType === 'consumption' ? 'text-farm-800 border-b-2 border-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    🍽️ Consumo (Refeições/Produtos)
                                </button>
                            </div>

                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pb-6 border-b border-gray-100">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-800 font-serif italic">
                                        {selectedReportType === 'financial' ? 'Relatório de Movimentação' : 'Relatório de Consumo (Refeições & Produtos)'}
                                    </h3>
                                    <p className="text-gray-500">
                                        {selectedReportType === 'financial' 
                                            ? 'Filtragem avançada por banco, caixa ou visão consolidada.' 
                                            : 'Relatório quantitativo de refeições servidas e outros itens de consumo.'}
                                    </p>
                                </div>
                                <div className="flex gap-3 w-full md:w-auto overflow-x-auto no-print">
                                    {selectedReportType === 'financial' ? (
                                        <button 
                                            onClick={() => exportToExcel(filteredReports, `relatorio_${reportFilters.isYtd ? 'YTD_' : ''}${reportFilters.month}_${reportFilters.year}`)} 
                                            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-50 text-green-800 border-2 border-green-100 px-6 py-3 rounded-xl font-bold text-sm hover:bg-green-100 transition-all shadow-md"
                                        >
                                            📥 Excel
                                        </button>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => exportConsumptionToExcel(mealsReport, productsReport, `relatorio_consumo_${reportFilters.isYtd ? 'YTD_' : ''}${reportFilters.month}_${reportFilters.year}`)} 
                                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-50 text-green-800 border-2 border-green-100 px-6 py-3 rounded-xl font-bold text-sm hover:bg-green-100 transition-all shadow-md"
                                            >
                                                📥 Excel Consumo
                                            </button>
                                            <button 
                                                onClick={handleOpenManualConsumption} 
                                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-farm-700 border-2 border-farm-100 px-6 py-3 rounded-xl font-bold text-sm hover:bg-farm-50 transition-colors shadow-md animate-fade-in"
                                            >
                                                🍽️ Lançar Consumo Manual
                                            </button>
                                        </>
                                    )}
                                    <button onClick={() => window.print()} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-black transition-all shadow-lg">
                                        <IconFileText className="w-4 h-4" /> Imprimir / PDF
                                    </button>
                                </div>
                            </div>

                            {/* Common Filters: Month, Year, YTD */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9 gap-4 mb-8 no-print">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Mês</label>
                                    <select 
                                        value={reportFilters.month} 
                                        onChange={e => setReportFilters({...reportFilters, month: parseInt(e.target.value)})}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200"
                                    >
                                        {Array.from({length: 12}).map((_, i) => (
                                            <option key={i+1} value={i+1}>{new Date(2000, i, 1).toLocaleDateString('pt-BR', {month: 'long'}).toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Ano</label>
                                    <select 
                                        value={reportFilters.year} 
                                        onChange={e => setReportFilters({...reportFilters, year: parseInt(e.target.value)})}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200"
                                    >
                                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center pt-6">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={reportFilters.isYtd} 
                                            onChange={e => setReportFilters({...reportFilters, isYtd: e.target.checked})}
                                            className="rounded border-gray-300 text-farm-600 focus:ring-farm-500 w-4 h-4 cursor-pointer"
                                        />
                                        <span className="text-xs font-bold text-gray-700">Acumulado (YTD)</span>
                                    </label>
                                </div>

                                {selectedReportType === 'financial' && (
                                    <>
                                        <div className="xl:col-span-2">
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Origem / Conta</label>
                                            <select 
                                                value={reportFilters.origem} 
                                                onChange={e => setReportFilters({...reportFilters, origem: e.target.value})}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200"
                                            >
                                                <option value="all">CONSOLIDADO (TODAS)</option>
                                                <optgroup label="Grupos">
                                                    <option value="type:Banco">APENAS BANCOS 🏦</option>
                                                    <option value="type:Dinheiro">APENAS DINHEIRO 💵</option>
                                                </optgroup>
                                                <optgroup label="Contas Específicas">
                                                    {accounts.map(a => (
                                                        <option key={a.id} value={`account:${a.nome}`}>
                                                            {a.tipo === 'Banco' ? '🏦' : '💵'} {a.nome}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Projeto</label>
                                            <select 
                                                value={reportFilters.projeto} 
                                                onChange={e => setReportFilters({...reportFilters, projeto: e.target.value})}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200 text-amber-800"
                                            >
                                                <option value="">-- TODOS OS PROJETOS --</option>
                                                {registeredProjects.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Área (Tag)</label>
                                            <select 
                                                value={reportFilters.tag} 
                                                onChange={e => setReportFilters({...reportFilters, tag: e.target.value})}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200 text-indigo-800"
                                            >
                                                <option value="">-- TODAS AS ÁREAS --</option>
                                                {registeredTags.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Fluxo</label>
                                            <select 
                                                value={reportFilters.flowType} 
                                                onChange={e => setReportFilters({...reportFilters, flowType: e.target.value as any})}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200"
                                            >
                                                <option value="all">TODOS</option>
                                                <option value="entrada">RECEITAS</option>
                                                <option value="saida">DESPESAS</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Classificação</label>
                                            <select 
                                                value={reportFilters.categoria} 
                                                onChange={e => setReportFilters({...reportFilters, categoria: e.target.value})}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200"
                                            >
                                                <option value="all">TODAS</option>
                                                <optgroup label="Receitas">
                                                    {groupsReceita.flatMap(g => g.items).sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                </optgroup>
                                                <optgroup label="Despesas">
                                                    {groupsDespesa.flatMap(g => g.items).sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                </optgroup>
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>

                            {selectedReportType === 'financial' ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                                            <p className="text-[10px] font-black text-green-700 uppercase mb-1 tracking-widest">{reportFilters.isYtd ? 'Entradas Acumuladas (YTD)' : 'Entradas no Período'}</p>
                                            <p className="text-2xl font-black text-green-800">R$ {tEntrada.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                        </div>
                                        <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                                            <p className="text-[10px] font-black text-red-700 uppercase mb-1 tracking-widest">{reportFilters.isYtd ? 'Saídas Acumuladas (YTD)' : 'Saídas no Período'}</p>
                                            <p className="text-2xl font-black text-red-800">R$ {tSaida.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                        </div>
                                        <div className="bg-farm-50 p-6 rounded-2xl border border-farm-100">
                                            <p className="text-[10px] font-black text-farm-700 uppercase mb-1 tracking-widest">{reportFilters.isYtd ? 'Saldo Acumulado (YTD)' : 'Saldo do Período'}</p>
                                            <p className="text-2xl font-black text-farm-800">R$ {(tEntrada - tSaida).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-2xl overflow-hidden border">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs min-w-[600px]">
                                                <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-[10px] uppercase font-black tracking-[0.2em]">
                                                    <tr>
                                                        <th className="px-6 py-5 text-left">Data</th>
                                                        <th className="px-6 py-5 text-left">Conta</th>
                                                        <th className="px-6 py-5 text-left">Descrição / Fornecedor</th>
                                                        <th className="px-6 py-5 text-right">Valor</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {filteredReports.length === 0 ? (
                                                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">Nenhuma movimentação encontrada para este filtro.</td></tr>
                                                    ) : (
                                                        filteredReports.map(e => (
                                                            <tr key={e.id} className="hover:bg-gray-50">
                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                    {new Date(e.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${e.meio_pagamento === 'Banco' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                        {e.meio_pagamento === 'Banco' ? '🏦' : '💵'} {e.conta_origem}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <div className="font-bold">{e.descricao}</div>
                                                                    {e.cnpj_fornecedor && <div className="text-[10px] text-gray-400">{e.cnpj_fornecedor}</div>}
                                                                </td>
                                                                <td className={`px-4 py-3 text-right font-black whitespace-nowrap ${e.tipo === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                                                                    {e.tipo === 'entrada' ? '+' : '-'} R$ {e.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                fetchingConsumption ? (
                                    <div className="flex justify-center items-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-farm-700"></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Section 1: Refeições Servidas */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center bg-farm-50 p-6 rounded-2xl border border-farm-100">
                                                <div>
                                                    <h4 className="font-bold text-farm-900 text-lg">🍽️ Refeições Servidas</h4>
                                                    <p className="text-xs text-farm-600">Almoços, jantares e bufês servidos na fazenda.</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] font-black text-farm-600 uppercase tracking-widest block">Total Servido</span>
                                                    <span className="text-2xl font-black text-farm-800">
                                                        {mealsReport.reduce((acc: number, curr: any) => acc + curr.quantidade, 0)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-gray-50 border-b border-gray-100 font-bold uppercase tracking-wider text-gray-500 text-[10px]">
                                                        <tr>
                                                            <th className="px-6 py-4">Refeição</th>
                                                            <th className="px-6 py-4 text-center">Quantidade</th>
                                                            <th className="px-6 py-4 text-right">Faturado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {mealsReport.length === 0 ? (
                                                            <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 italic">Nenhuma refeição servida no período.</td></tr>
                                                        ) : (
                                                            mealsReport.map((m: any) => (
                                                                <tr key={m.name} className="hover:bg-gray-50/50">
                                                                    <td className="px-6 py-4 font-bold text-gray-800">{m.name}</td>
                                                                    <td className="px-6 py-4 text-center font-mono font-bold text-gray-700">{m.quantidade}</td>
                                                                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-800">R$ {m.valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Section 2: Outros Produtos Vendidos */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                                <div>
                                                    <h4 className="font-bold text-gray-800 text-lg">🛒 Outros Produtos Vendidos</h4>
                                                    <p className="text-xs text-gray-500">Produtos, bebidas e extras comprados pelos hóspedes.</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Total Itens</span>
                                                    <span className="text-2xl font-black text-gray-800">
                                                        {productsReport.reduce((acc: number, curr: any) => acc + curr.quantidade, 0)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-gray-50 border-b border-gray-100 font-bold uppercase tracking-wider text-gray-500 text-[10px]">
                                                        <tr>
                                                            <th className="px-6 py-4">Produto</th>
                                                            <th className="px-6 py-4 text-center">Quantidade</th>
                                                            <th className="px-6 py-4 text-right">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {productsReport.length === 0 ? (
                                                            <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 italic">Nenhum produto vendido no período.</td></tr>
                                                        ) : (
                                                            productsReport.map((p: any) => (
                                                                <tr key={p.name} className="hover:bg-gray-50/50">
                                                                    <td className="px-6 py-4 font-bold text-gray-800">{p.name}</td>
                                                                    <td className="px-6 py-4 text-center font-mono font-bold text-gray-700">{p.quantidade}</td>
                                                                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-800">R$ {p.valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                );
            })()
            : activeTab === 'accounts' ? (
                <div className="bg-white rounded-3xl shadow-xl border overflow-hidden animate-fade-in">
                    <div className="p-8 border-b flex justify-between items-center bg-gray-50">
                        <div>
                            <h3 className="text-xl font-bold font-serif italic">Contas Bancárias e Caixas</h3>
                            <p className="text-xs text-gray-500">Cadastre aqui onde o dinheiro da fazenda fica guardado.</p>
                        </div>
                        {!isViewOnly && (
                            <button onClick={() => { setNewAccount({ nome: '', tipo: 'Banco', banco: '', agencia: '', conta: '' }); setShowAccountManager(true); }} className="bg-farm-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-farm-200 hover:bg-farm-900 transition-all">+ Nova Conta/Caixa</button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-[10px] uppercase font-black tracking-[0.2em]">
                                <tr>
                                    <th className="px-6 py-5 text-left">Nome da Conta</th>
                                    <th className="px-6 py-5 text-left">Tipo</th>
                                    <th className="px-6 py-5 text-left">Detalhes</th>
                                    <th className="px-6 py-5 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {accounts.map(acc => (
                                    <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-gray-800">{acc.nome}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${acc.tipo === 'Banco' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {acc.tipo === 'Banco' ? '🏦 Banco' : '💵 Dinheiro'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {acc.tipo === 'Banco' ? `${acc.banco} | Ag: ${acc.agencia} | Cc: ${acc.conta}` : 'Fundo de Caixa Físico'}
                                        </td>
                                        <td className="px-6 py-4 text-center flex justify-center gap-2">
                                            {!isViewOnly && (
                                                <>
                                                    <button onClick={() => { setNewAccount(acc); setShowAccountManager(true); }} className="p-2 text-gray-400 hover:text-farm-600"><IconEdit className="w-5 h-5" /></button>
                                                    <button onClick={async () => {
                                                        if (window.confirm(`Inativar conta ${acc.nome}?`)) {
                                                            await supabase.from('finance_accounts').update({ ativo: false }).eq('id', acc.id);
                                                            fetchAccounts();
                                                        }
                                                    }} className="p-2 text-gray-400 hover:text-red-600"><IconTrash className="w-5 h-5" /></button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : activeTab === 'contacts' ? (
                <div className="bg-white rounded-3xl shadow-xl border overflow-hidden">
                    <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                        <input type="text" placeholder="Buscar por nome ou documento..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 px-4 py-3 rounded-xl border outline-none bg-white shadow-inner" />
                        {!isViewOnly && (
                            <button onClick={() => { setNewContact({ identificador: '', nome: '', nome_fantasia: '', banco: '', agencia: '', conta: '', tipo_conta: 'Corrente', chave_pix: '', categoria_padrao: '' }); setShowContactManager(true); }} className="bg-farm-800 text-white px-6 py-3 rounded-xl font-bold ml-4">+ Novo Contato</button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-[10px] uppercase font-black tracking-[0.2em]">
                                <tr>
                                    <th className="px-6 py-5 text-left">Nome / Razão Social</th>
                                    <th className="px-6 py-5 text-left">Documento</th>
                                    <th className="px-6 py-5 text-left">Banco / PIX</th>
                                    <th className="px-6 py-5 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {Object.values(contacts).filter((c: any) => c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || (c.nome_fantasia?.toLowerCase() || '').includes(searchTerm.toLowerCase())).map((contact: any) => (
                                    <tr key={contact.identificador} className="text-sm hover:bg-gray-50">
                                        <td className="px-6 py-4"><div className="font-bold">{contact.nome_fantasia || contact.nome}</div></td>
                                        <td className="px-6 py-4 font-mono text-xs">{contact.identificador}</td>
                                        <td className="px-6 py-4 text-[11px] leading-relaxed">
                                            {contact.banco && <div>🏦 {contact.banco} | Ag: {contact.agencia} | Cc: {contact.conta}</div>}
                                            {contact.chave_pix && <div className="font-bold text-farm-700">✨ PIX: {contact.chave_pix}</div>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {!isViewOnly && (
                                                <button onClick={() => { setNewContact(contact); setShowContactManager(true); }} className="p-2 text-gray-400 hover:text-farm-600"><IconEdit className="w-4 h-4" /></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : activeTab === 'audit' && canApprove ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-black text-farm-900">Painel de Auditoria e Aprovação</h2>
                        {selectedIds.length > 0 && (
                            <button onClick={handleBulkApprove} className="bg-green-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-200 flex items-center gap-2">
                                <IconCheck className="w-5 h-5" /> Aprovar Selecionados ({selectedIds.length})
                            </button>
                        )}
                    </div>
                    
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-widest border-b border-gray-100">
                                    <th className="p-4 w-10 text-center"><input type="checkbox" onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedIds(entries.filter(tx => tx.status === 'pendente').map(tx => tx.id));
                                        } else {
                                            setSelectedIds([]);
                                        }
                                    }} checked={entries.filter(tx => tx.status === 'pendente').length > 0 && selectedIds.length === entries.filter(tx => tx.status === 'pendente').length} className="w-4 h-4 rounded text-farm-600 focus:ring-farm-500 border-gray-300" /></th>
                                    <th className="p-4">Data</th>
                                    <th className="p-4">Descrição</th>
                                    <th className="p-4">Categoria</th>
                                    <th className="p-4">Status / Alertas</th>
                                    <th className="p-4 text-right">Valor</th>
                                    <th className="p-4 text-center">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.filter(e => e.status === 'pendente').map((entry) => (
                                    <tr key={entry.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${selectedIds.includes(entry.id) ? 'bg-farm-50/30' : ''}`}>
                                        <td className="p-4 text-center"><input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={(e) => {
                                            if (e.target.checked) setSelectedIds([...selectedIds, entry.id]);
                                            else setSelectedIds(selectedIds.filter(id => id !== entry.id));
                                        }} className="w-4 h-4 rounded text-farm-600 focus:ring-farm-500 border-gray-300" /></td>
                                        <td className="p-4 font-mono text-[11px] text-gray-400">{new Date(entry.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-700 text-sm">{entry.descricao}</div>
                                            {entry.projeto && <div className="text-[10px] text-gray-400 mt-0.5">Projeto: {entry.projeto}</div>}
                                        </td>
                                        <td className="p-4">
                                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{entry.categoria}</span>
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded inline-block mb-1">PENDENTE APROVAÇÃO</span>
                                            {entry.valor > 5000 && <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-[10px] font-bold rounded inline-block">ALTO VALOR</span>}
                                            {entry.categoria === 'Geral' && <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 text-[10px] font-bold rounded inline-block">GENÉRICO</span>}
                                        </td>
                                        <td className={`p-4 text-right font-black ${entry.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                            {entry.tipo === 'entrada' ? '+' : '-'} {entry.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => handleApprove(entry)} className="px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1 mx-auto"><IconCheck className="w-4 h-4"/> Aprovar</button>
                                        </td>
                                    </tr>
                                ))}
                                {entries.filter(e => e.status === 'pendente').length === 0 && (
                                    <tr><td colSpan={7} className="p-12 text-center text-gray-400 font-bold">Nenhum lançamento pendente de aprovação. 🎉</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : activeTab === 'tags' ? (
                <div className="space-y-8 animate-fade-in">
                    {/* Seção de Projetos */}
                    <div className="bg-white rounded-3xl shadow-xl border overflow-hidden">
                        <div className="p-8 border-b flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 gap-4">
                            <div>
                                <h3 className="text-xl font-bold font-serif italic text-amber-900">Projetos Especiais / Obras</h3>
                                <p className="text-xs text-gray-500">Ex: Repotencialização de Minas, Pintura da Sede, etc.</p>
                            </div>
                            {!isViewOnly && (
                                <form onSubmit={handleSaveProject} className="flex gap-2 w-full md:w-auto">
                                    <input type="text" value={newProject.nome} onChange={e => setNewProject({...newProject, nome: e.target.value})} placeholder="Nome do projeto..." className="px-4 py-3 rounded-xl border border-gray-300 outline-none w-full md:w-64" required />
                                    <button type="submit" className="bg-amber-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-amber-700 transition flex items-center justify-center whitespace-nowrap shadow-sm"><IconPlus className="w-5 h-5 mr-1" /> Adicionar</button>
                                </form>
                            )}
                        </div>
                        <div className="p-8">
                            {registeredProjects.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 font-bold border-2 border-dashed rounded-2xl">Nenhum projeto especial cadastrado.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {registeredProjects.map(p => (
                                        <div key={p.id} className="flex justify-between items-center bg-amber-50 border border-amber-100 p-4 rounded-xl group hover:shadow-md transition-all">
                                            <div className="font-bold text-amber-900 truncate" title={p.nome}>🏗️ {p.nome}</div>
                                            {!isViewOnly && (
                                                <button onClick={() => handleDeleteProject(p.id)} className="text-amber-300 hover:text-red-600 p-2 rounded opacity-0 group-hover:opacity-100 transition-all"><IconTrash className="w-5 h-5" /></button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Seção de Tags */}
                    <div className="bg-white rounded-3xl shadow-xl border overflow-hidden">
                        <div className="p-8 border-b flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 gap-4">
                            <div>
                                <h3 className="text-xl font-bold font-serif italic text-indigo-900">Áreas / Departamentos (Tags)</h3>
                                <p className="text-xs text-gray-500">Ex: Cozinha, Jardinagem, Portaria, etc.</p>
                            </div>
                            {!isViewOnly && (
                                <form onSubmit={handleSaveTag} className="flex gap-2 w-full md:w-auto">
                                    <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Nova área..." className="px-4 py-3 rounded-xl border border-gray-300 outline-none w-full md:w-64" required />
                                    <button type="submit" className="bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-indigo-700 transition flex items-center justify-center whitespace-nowrap shadow-sm"><IconPlus className="w-5 h-5 mr-1" /> Adicionar</button>
                                </form>
                            )}
                        </div>
                        <div className="p-8">
                            {registeredTags.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 font-bold border-2 border-dashed rounded-2xl">Nenhuma área (tag) cadastrada.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {registeredTags.map(tag => (
                                        <div key={tag.id} className="flex justify-between items-center bg-indigo-50 border border-indigo-100 p-4 rounded-xl group hover:shadow-md transition-all">
                                            <div className="font-bold text-indigo-900 truncate" title={tag.nome}>📌 {tag.nome}</div>
                                            {!isViewOnly && (
                                                <button onClick={() => handleDeleteTag(tag.id)} className="text-indigo-300 hover:text-red-600 p-2 rounded opacity-0 group-hover:opacity-100 transition-all"><IconTrash className="w-5 h-5" /></button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Account Manager Modal */}
            {showAccountManager && (
                <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setShowAccountManager(false)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] relative z-10">
                        <header className="p-6 border-b flex justify-between items-center bg-gray-50 shrink-0">
                            <h3 className="text-xl font-bold">{newAccount.id ? 'Editar Conta' : 'Nova Conta Bancária / Caixa'}</h3>
                            <button onClick={() => setShowAccountManager(false)} className="text-gray-400 hover:text-gray-600"><IconPlus className="w-6 h-6 rotate-45" /></button>
                        </header>
                        <form onSubmit={handleSaveAccount} className="p-8 space-y-6 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nome Identificador (Ex: Itaú Principal, Caixa PDV)</label>
                                    <input type="text" value={newAccount.nome} onChange={e => setNewAccount({...newAccount, nome: e.target.value})} className="w-full px-4 py-3 border rounded-xl outline-none mt-1" required />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Tipo</label>
                                    <div className="flex bg-gray-100 p-1 rounded-xl mt-1">
                                        <button type="button" onClick={() => setNewAccount({...newAccount, tipo: 'Banco'})} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newAccount.tipo === 'Banco' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>🏦 Banco</button>
                                        <button type="button" onClick={() => setNewAccount({...newAccount, tipo: 'Dinheiro'})} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newAccount.tipo === 'Dinheiro' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500'}`}>💵 Dinheiro</button>
                                    </div>
                                </div>
                                {newAccount.tipo === 'Banco' && (
                                    <>
                                        <div className="col-span-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Banco</label>
                                            <input type="text" value={newAccount.banco} onChange={e => setNewAccount({...newAccount, banco: e.target.value})} className="w-full px-4 py-3 border rounded-xl outline-none" placeholder="Ex: Banco Itaú" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Agência</label>
                                            <input type="text" value={newAccount.agencia} onChange={e => setNewAccount({...newAccount, agencia: e.target.value})} className="w-full px-4 py-3 border rounded-xl outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Conta</label>
                                            <input type="text" value={newAccount.conta} onChange={e => setNewAccount({...newAccount, conta: e.target.value})} className="w-full px-4 py-3 border rounded-xl outline-none" />
                                        </div>
                                    </>
                                )}
                            </div>
                            <button type="submit" disabled={isSavingAccount} className="w-full py-4 bg-farm-800 text-white font-bold rounded-2xl hover:bg-farm-900 transition-all font-serif italic text-lg shadow-xl shadow-farm-100">
                                {isSavingAccount ? 'Salvando...' : 'Confirmar Cadastro'}
                            </button>
                        </form>
                    </div>
                    </div>
                </div>
            )}

            {showContactManager && (
                <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setShowContactManager(false)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] relative z-10">
                        <header className="p-6 border-b flex justify-between items-center bg-gray-50 shrink-0"><h3 className="text-xl font-bold">{newContact.identificador ? 'Editar' : 'Novo'} Fornecedor</h3><button onClick={() => setShowContactManager(false)} className="text-gray-400">FECHAR</button></header>
                        <div className="p-6 overflow-y-auto pb-10">
                            <form onSubmit={handleSaveContact} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" placeholder="Nome" value={newContact.nome} onChange={e => setNewContact({...newContact, nome: e.target.value})} className="px-4 py-2 border rounded" required />
                                <input type="text" placeholder="CPF/CNPJ" value={newContact.identificador} onChange={e => setNewContact({...newContact, identificador: e.target.value})} className="px-4 py-2 border rounded" required />
                                <input type="text" placeholder="Banco" value={newContact.banco} onChange={e => setNewContact({...newContact, banco: e.target.value})} className="px-4 py-2 border rounded" />
                                <input type="text" placeholder="Agencia" value={newContact.agencia} onChange={e => setNewContact({...newContact, agencia: e.target.value})} className="px-4 py-2 border rounded" />
                                <input type="text" placeholder="Conta" value={newContact.conta} onChange={e => setNewContact({...newContact, conta: e.target.value})} className="px-4 py-2 border rounded" />
                                <input type="text" placeholder="PIX" value={newContact.chave_pix} onChange={e => setNewContact({...newContact, chave_pix: e.target.value})} className="px-4 py-2 border rounded" />
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Categoria Padrão (Sugestão Automática)</label>
                                    <select 
                                        value={newContact.categoria_padrao || ''} 
                                        onChange={e => setNewContact({...newContact, categoria_padrao: e.target.value})}
                                        className="w-full px-4 py-2 border rounded bg-white"
                                    >
                                        <option value="">-- NENHUMA (ESCOLHER NA HORA) --</option>
                                        {[...groupsReceita, ...groupsDespesa].map(g => (
                                            <optgroup key={g.groupName} label={g.groupName}>
                                                {g.items.map(i => <option key={i} value={i}>{i}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <button type="submit" className="md:col-span-2 py-3 bg-farm-800 text-white font-bold rounded">Salvar Fornecedor</button>
                            </form>
                        </div>
                    </div>
                    </div>
                </div>
            )}

            {confirmDeleteId !== null && (
                <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setConfirmDeleteId(null)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full relative z-10"><h3 className="text-xl font-bold mb-4">Excluir?</h3><div className="flex gap-4"><button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-3 border rounded-2xl">Não</button><button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 py-3 bg-red-600 text-white rounded-2xl">Excluir</button></div></div>
                    </div>
                </div>
            )}

            {reconciliationView === 'sessions' && (
                <ReconciliationSessions 
                    onClose={() => setReconciliationView('none')} 
                    onSelectSession={(id) => {
                        setActiveReconciliationId(id);
                        setReconciliationView('active');
                    }} 
                />
            )}
            
            {reconciliationView === 'active' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setReconciliationView('sessions')}></div>
                    <div className="relative z-10 w-full max-w-7xl h-full flex items-center justify-center pointer-events-none">
                        <div className="pointer-events-auto w-full flex justify-center">
                            <BankReconciliation 
                                sessionId={activeReconciliationId}
                                onReconciled={fetchCashFlow} 
                                onClose={() => setReconciliationView('sessions')} 
                            />
                        </div>
                    </div>
                </div>
            )}

            {showManualConsumptionModal && (
                <div className="fixed inset-0 z-[110] overflow-y-auto no-print animate-fade-in">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowManualConsumptionModal(false)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] relative z-10">
                            <header className="p-6 border-b flex justify-between items-center bg-gray-50 shrink-0">
                                <h3 className="text-xl font-bold font-serif text-farm-800">🍽️ Lançar Consumo Manual (Histórico)</h3>
                                <button 
                                    onClick={() => setShowManualConsumptionModal(false)} 
                                    className="text-gray-400 hover:text-gray-600 font-bold"
                                >
                                    ✕
                                </button>
                            </header>
                            <form onSubmit={handleSaveManualConsumption} className="p-8 space-y-4 overflow-y-auto">
                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Produto / Item</label>
                                    <select
                                        value={manualConsumptionForm.item_id}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const itemId = val === 'custom' ? 'custom' : (val ? parseInt(val) : '');
                                            const product = productsList.find(p => p.id === itemId);
                                            setManualConsumptionForm(prev => ({
                                                ...prev,
                                                item_id: itemId,
                                                custom_name: product ? product.name : '',
                                                valor_unitario_aplicado: product ? Number(product.price) : 0
                                            }));
                                        }}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm outline-none focus:ring-2 focus:ring-farm-200"
                                        required
                                    >
                                        <option value="">-- Selecione um produto --</option>
                                        <option value="custom">Outro (Inserir nome personalizado)</option>
                                        <optgroup label="Produtos Cadastrados">
                                            {productsList.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} (R$ {Number(p.price).toFixed(2)})</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                {manualConsumptionForm.item_id === 'custom' && (
                                    <div className="animate-fade-in">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Nome Personalizado do Item</label>
                                        <input
                                            type="text"
                                            value={manualConsumptionForm.custom_name}
                                            onChange={(e) => setManualConsumptionForm(prev => ({ ...prev, custom_name: e.target.value }))}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-200 text-sm"
                                            placeholder="Ex: Almoço Especial"
                                            required
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Quantidade</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            min="0.001"
                                            value={manualConsumptionForm.quantidade}
                                            onChange={(e) => setManualConsumptionForm(prev => ({ ...prev, quantidade: parseFloat(e.target.value) }))}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-200 text-sm font-bold"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Valor Unitário (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={manualConsumptionForm.valor_unitario_aplicado}
                                            onChange={(e) => setManualConsumptionForm(prev => ({ ...prev, valor_unitario_aplicado: parseFloat(e.target.value) }))}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-200 text-sm font-bold"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Data de Lançamento</label>
                                    <input
                                        type="date"
                                        value={manualConsumptionForm.date}
                                        onChange={(e) => setManualConsumptionForm(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-200 text-sm font-bold"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Observações</label>
                                    <textarea
                                        value={manualConsumptionForm.observacoes}
                                        onChange={(e) => setManualConsumptionForm(prev => ({ ...prev, observacoes: e.target.value }))}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-200 text-sm min-h-[80px]"
                                    />
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={isSavingManualConsumption} 
                                    className="w-full py-4 bg-farm-800 text-white font-bold rounded-2xl hover:bg-farm-900 transition-all font-serif italic text-lg shadow-xl shadow-farm-100 flex items-center justify-center gap-2"
                                >
                                    {isSavingManualConsumption ? (
                                        <>
                                            <IconLoader className="w-5 h-5 animate-spin" /> Salvando...
                                        </>
                                    ) : (
                                        'Confirmar Lançamento'
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
