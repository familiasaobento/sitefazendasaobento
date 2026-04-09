import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconLoader, IconCheck, IconPlus, IconFileText, IconTrash, IconUser, IconRefresh } from '../components/Icons';
import { BankReconciliation } from '../components/BankReconciliation';

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

export const CashFlowPage: React.FC<{ canApprove?: boolean; isViewOnly?: boolean }> = ({ canApprove, isViewOnly }) => {
    const [entries, setEntries] = useState<CashFlowEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingEntry, setEditingEntry] = useState<CashFlowEntry | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [stats, setStats] = useState({ totalEntradas: 0, totalSaidas: 0 });
    const [groupsReceita, setGroupsReceita] = useState<CatGroup[]>(FALLBACK_GROUPS);
    const [groupsDespesa, setGroupsDespesa] = useState<CatGroup[]>(FALLBACK_GROUPS);
    const [contacts, setContacts] = useState<Record<string, FinanceContact>>({});
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [activeBankInfo, setActiveBankInfo] = useState<FinanceContact | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [entryMode, setEntryMode] = useState<'manual' | 'ocr'>('manual');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);
    const [showReconciliation, setShowReconciliation] = useState(false);

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

    const [activeTab, setActiveTab] = useState<'flow' | 'contacts' | 'accounts' | 'reports' | 'tags'>(isViewOnly ? 'reports' : 'flow');
    const [reportFilters, setReportFilters] = useState({
        account: 'all',
        type: 'all' as 'all' | 'Banco' | 'Dinheiro',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        tag: '',
        projeto: ''
    });
    const [searchTerm, setSearchTerm] = useState('');

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
        parcelas: 1
    };

    const [formData, setFormData] = useState(defaultFormData);
    const [submitting, setSubmitting] = useState(false);
    const [saveToContacts, setSaveToContacts] = useState(false);
    const [tempContact, setTempContact] = useState<Partial<FinanceContact>>({
        nome: '', identificador: '', banco: '', agencia: '', conta: '', chave_pix: '', categoria_padrao: ''
    });

    const [registeredTags, setRegisteredTags] = useState<FinanceTag[]>([]);
    const [newTag, setNewTag] = useState('');

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

    useEffect(() => {
        fetchCashFlow();
        fetchCategories();
        fetchContacts();
        fetchAccounts();
        fetchTags();
        fetchProjects();
    }, []);

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

    const fetchCashFlow = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('fluxo_caixa')
                .select('*')
                .order('data_pagamento', { ascending: false });

            if (error) throw error;
            setEntries(data || []);

            const totals = (data || []).reduce((acc, curr) => {
                if (curr.status === 'pendente') return acc;
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
            parcelas: 1
        });
        setShowForm(true);
        setEntryMode('manual');
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

    const handleApprove = async (id: number) => {
        try {
            const dataAtual = new Date().toISOString().split('T')[0];
            const { error } = await supabase
                .from('fluxo_caixa')
                .update({ status: 'aprovado', data_aprovacao: dataAtual })
                .eq('id', id);
            if (error) throw error;
            fetchCashFlow();
        } catch (err: any) {
            alert('Erro ao aprovar: ' + err.message);
        }
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
                status: editingEntry ? editingEntry.status : (canApprove ? 'aprovado' : 'pendente'),
                data_aprovacao: editingEntry ? editingEntry.data_aprovacao : (canApprove ? new Date().toISOString().split('T')[0] : null)
            };

            const payloads = [];
            if (!editingEntry && formData.is_parcelado && formData.parcelas > 1) {
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

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 no-print">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Fluxo de Caixa</h1>
                    <p className="text-gray-500 mt-2 text-lg">Gerenciamento completo de entradas e saídas.</p>
                </div>
                {!isViewOnly && activeTab === 'flow' && (
                    <div className="flex gap-4 w-full md:w-auto">
                        <button onClick={() => setShowReconciliation(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-farm-700 border-2 border-farm-100 font-bold px-6 py-3 rounded-xl hover:bg-farm-50 transition-colors">
                            <IconRefresh className="w-5 h-5" /> Conciliar Extrato
                        </button>
                        <button onClick={() => { if (showForm && editingEntry) handleCancelForm(); else { setEditingEntry(null); setFormData(defaultFormData); setShowForm(!showForm); } }} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-farm-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-farm-700 transition-colors shadow-lg shadow-farm-200">
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
                                <button onClick={() => { setEntryMode('manual'); }} className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${entryMode === 'manual' ? 'bg-white text-farm-800 shadow-md' : 'text-gray-500'}`}>Manual</button>
                                <button onClick={() => { setEntryMode('ocr'); }} className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${entryMode === 'ocr' ? 'bg-farm-700 text-white shadow-md' : 'text-gray-500'}`}>Leitor OCR (Nota Fiscal)</button>
                            </div>

                            <div className="mb-8">
                                <label className="block text-sm font-bold text-gray-700 mb-2">{entryMode === 'ocr' ? 'Tirar Foto ou Upload da Nota Fiscal' : 'Anexar Comprovante (Opcional)'}</label>
                                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-all relative overflow-hidden ${isOcrProcessing ? 'bg-blue-50 border-blue-200' : selectedFile ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                                    {previewUrl && <img src={previewUrl} className="absolute inset-0 w-full h-full object-cover opacity-20 filter blur-sm" alt="Preview" />}
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                                        {isOcrProcessing ? (<><IconLoader className="w-10 h-10 text-blue-600 animate-spin mb-3" /><span className="text-blue-700 font-bold">Processando OCR...</span></>) : selectedFile ? (<span className="text-green-700 font-bold flex flex-col items-center gap-2"><IconCheck className="w-8 h-8 bg-green-200 rounded-full p-1 shadow-sm" />{selectedFile.name}</span>) : (<><p className="mb-1 text-sm text-gray-500"><span className="font-semibold text-farm-700">Clique para selecionar arquivo</span></p></>)}
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
                                        <button type="button" onClick={() => setFormData({ ...formData, tipo: 'entrada' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.tipo === 'entrada' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}>Entrada</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, tipo: 'saida' })} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>Saída</button>
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
                                    <input type="number" step="0.01" required value={formData.valor} onChange={e => setFormData({ ...formData, valor: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none font-mono text-lg text-farm-800" placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Data de Lançamento</label>
                                    <input type="date" required value={formData.data_pagamento} onChange={e => setFormData({ ...formData, data_pagamento: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none" />
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
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none bg-white font-medium"
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
                                        <select value={formData.projeto || ''} onChange={e => setFormData({ ...formData, projeto: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none bg-white font-medium text-amber-700">
                                            <option value="">-- NENHUM PROJETO ESPECÍFICO --</option>
                                            {registeredProjects.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Área / Departamento (Tag)</label>
                                        <select value={formData.tags || ''} onChange={e => setFormData({ ...formData, tags: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none bg-white font-medium text-indigo-700">
                                            <option value="">-- GERAL (NENHUMA ÁREA) --</option>
                                            {registeredTags.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Data do Vencimento</label>
                                        <input type="date" value={formData.data_vencimento} onChange={e => setFormData({ ...formData, data_vencimento: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none text-red-700 font-bold" />
                                    </div>
                                </div>

                                {!editingEntry && (
                                    <div className="md:col-span-2 lg:col-span-4 bg-sky-50 border border-sky-200 rounded-2xl p-6 mt-2">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input type="checkbox" checked={formData.is_parcelado} onChange={e => setFormData({ ...formData, is_parcelado: e.target.checked })} className="w-5 h-5 rounded border-sky-300 text-sky-600 focus:ring-sky-500" />
                                            <span className="font-bold text-sky-900">Esta compra / despesa foi parcelada?</span>
                                        </label>
                                        {formData.is_parcelado && (
                                            <div className="mt-4 animate-fade-in flex flex-col md:flex-row items-start md:items-center gap-4">
                                                <div className="w-full md:w-1/4">
                                                    <label className="block text-xs font-bold text-sky-800 uppercase mb-2">Número de Parcelas</label>
                                                    <input type="number" min="2" max="60" value={formData.parcelas} onChange={e => setFormData({ ...formData, parcelas: parseInt(e.target.value) || 2 })} className="w-full px-4 py-3 border border-sky-300 rounded-xl outline-none text-sky-900 font-bold" />
                                                </div>
                                                <div className="text-sm text-sky-800 bg-sky-100 p-4 rounded-xl flex-1 border border-sky-200">
                                                    <strong>Atenção:</strong> O valor total {(parseFloat(formData.valor.toString().replace(',','.')) || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} será dividido em <strong>{formData.parcelas} parcelas mensais</strong> no valor de <strong>{((parseFloat(formData.valor.toString().replace(',','.')) || 0) / formData.parcelas).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>.<br/>O vencimento e/ou pagamento será incrementado em 1 mês para cada nova parcela, a partir das datas informadas.
                                                </div>
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
                                <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">Listagem de Lançamentos</span>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <button 
                                        onClick={() => exportToExcel(entries, 'todos_lancamentos')}
                                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-green-700 border border-green-200 font-bold px-4 py-2 rounded-xl hover:bg-green-50 transition-colors text-xs shadow-sm"
                                    >
                                        Excel (Tudo)
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
                                            <th className="px-6 py-4 font-semibold">Data</th>
                                            <th className="px-6 py-4 font-semibold">Descrição</th>
                                            <th className="px-6 py-4 font-semibold">Origem / Categoria</th>
                                            <th className="px-6 py-4 font-semibold text-right">Valor</th>
                                            <th className="px-6 py-4 font-semibold text-center no-print">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {entries.map((entry) => (
                                            <tr key={entry.id} className="hover:bg-gray-50 transition-colors group">
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
                                                        <button onClick={() => handleApprove(entry.id)} className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 font-bold text-xs rounded-xl transition-colors shadow-sm">Aprovar ✓</button>
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
            ) : activeTab === 'reports' ? (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pb-6 border-b border-gray-100">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-800 font-serif italic">Relatório de Movimentação</h3>
                                <p className="text-gray-500">Filtragem avançada por banco, caixa ou visão consolidada.</p>
                            </div>
                            <div className="flex gap-3 w-full md:w-auto overflow-x-auto no-print">
                                <button 
                                    onClick={() => {
                                        const filtered = entries.filter(e => {
                                            if (e.status === 'pendente') return false;
                                            const d = new Date(e.data_pagamento + 'T12:00:00');
                                            const matchDate = d.getMonth() + 1 === reportFilters.month && d.getFullYear() === reportFilters.year;
                                            if (!matchDate) return false;
                                            if (reportFilters.account !== 'all') return e.conta_origem === reportFilters.account;
                                            if (reportFilters.type !== 'all') return e.meio_pagamento === reportFilters.type;
                                            if (reportFilters.tag !== '' && e.tags !== reportFilters.tag) return false;
                                            if (reportFilters.projeto !== '' && e.projeto !== reportFilters.projeto) return false;
                                            return true;
                                        });
                                        exportToExcel(filtered, `relatorio_${reportFilters.month}_${reportFilters.year}`);
                                    }} 
                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-50 text-green-800 border-2 border-green-100 px-6 py-3 rounded-xl font-bold text-sm hover:bg-green-100 transition-all shadow-md"
                                >
                                    📥 Excel
                                </button>
                                <button onClick={() => window.print()} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-black transition-all shadow-lg">
                                    <IconFileText className="w-4 h-4" /> Imprimir / PDF
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8 no-print">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Origem</label>
                                <select 
                                    value={reportFilters.account} 
                                    onChange={e => setReportFilters({...reportFilters, account: e.target.value, type: e.target.value === 'all' ? 'all' : reportFilters.type})}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200"
                                >
                                    <option value="all">TODAS AS CONTAS</option>
                                    <optgroup label="Bancos">
                                        {accounts.filter(a => a.tipo === 'Banco').map(a => <option key={a.id} value={a.nome}>🏦 {a.nome}</option>)}
                                    </optgroup>
                                    <optgroup label="Caixa / Dinheiro">
                                        {accounts.filter(a => a.tipo === 'Dinheiro').map(a => <option key={a.id} value={a.nome}>💵 {a.nome}</option>)}
                                    </optgroup>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">Tipo Consolidado</label>
                                <select 
                                    value={reportFilters.type} 
                                    disabled={reportFilters.account !== 'all'}
                                    onChange={e => setReportFilters({...reportFilters, type: e.target.value as any})}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:ring-2 focus:ring-farm-200 disabled:opacity-50"
                                >
                                    <option value="all">GERAL CONSOLIDADO</option>
                                    <option value="Banco">APENAS BANCOS 🏦</option>
                                    <option value="Dinheiro">APENAS DINHEIRO 💵</option>
                                </select>
                            </div>
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
                        </div>

                        {(() => {
                            const filtered = entries.filter(e => {
                                if (e.status === 'pendente') return false;
                                const d = new Date(e.data_pagamento + 'T12:00:00');
                                const matchDate = d.getMonth() + 1 === reportFilters.month && d.getFullYear() === reportFilters.year;
                                if (!matchDate) return false;

                                if (reportFilters.account !== 'all') return e.conta_origem === reportFilters.account;
                                if (reportFilters.type !== 'all') return e.meio_pagamento === reportFilters.type;
                                if (reportFilters.tag !== '' && e.tags !== reportFilters.tag) return false;
                                if (reportFilters.projeto !== '' && e.projeto !== reportFilters.projeto) return false;
                                return true;
                            });

                            const tEntrada = filtered.reduce((acc, curr) => curr.tipo === 'entrada' ? acc + curr.valor : acc, 0);
                            const tSaida = filtered.reduce((acc, curr) => curr.tipo === 'saida' ? acc + curr.valor : acc, 0);

                            return (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                                            <p className="text-[10px] font-black text-green-700 uppercase mb-1 tracking-widest">Entradas no Período</p>
                                            <p className="text-2xl font-black text-green-800">R$ {tEntrada.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                        </div>
                                        <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                                            <p className="text-[10px] font-black text-red-700 uppercase mb-1 tracking-widest">Saídas no Período</p>
                                            <p className="text-2xl font-black text-red-800">R$ {tSaida.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                        </div>
                                        <div className="bg-farm-50 p-6 rounded-2xl border border-farm-100">
                                            <p className="text-[10px] font-black text-farm-700 uppercase mb-1 tracking-widest">Saldo do Período</p>
                                            <p className="text-2xl font-black text-farm-800">R$ {(tEntrada - tSaida).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-2xl overflow-hidden border">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs min-w-[600px]">
                                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 font-semibold">Data</th>
                                                    <th className="px-4 py-3 font-semibold">Conta</th>
                                                    <th className="px-4 py-3 font-semibold">Descrição / Fornecedor</th>
                                                    <th className="px-4 py-3 font-semibold text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {filtered.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">Nenhuma movimentação encontrada para este filtro.</td></tr>
                                                ) : (
                                                    filtered.map(e => (
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
                            );
                        })()}
                    </div>
                </div>
            ) : activeTab === 'accounts' ? (
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
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Nome da Conta</th>
                                    <th className="px-6 py-4 font-semibold">Tipo</th>
                                    <th className="px-6 py-4 font-semibold">Detalhes</th>
                                    <th className="px-6 py-4 font-semibold text-center">Ações</th>
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
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Nome / Razão Social</th>
                                    <th className="px-6 py-4 font-semibold">Documento</th>
                                    <th className="px-6 py-4 font-semibold">Banco / PIX</th>
                                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
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
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tipo</label>
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

            {showReconciliation && (
                <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setShowReconciliation(false)}></div>
                    <div className="flex min-h-full items-center justify-center p-4 sm:p-6 lg:p-8">
                        <div className="w-full max-w-5xl relative z-10 transform transition-all">
                            <BankReconciliation onReconciled={fetchCashFlow} onClose={() => setShowReconciliation(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
