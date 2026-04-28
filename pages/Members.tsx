import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { IconUser, IconPrinter, IconTrash, IconPhone, IconMail, IconCalendar, IconPlus, IconLoader, IconChart, IconUpload, IconEdit, IconX, IconCheck } from '../components/Icons';

interface Dependent {
    name: string;
    birthDate: string;
    relationship?: string;
}

interface Profile {
    id: string;
    full_name: string;
    role: string;
    approved: boolean;
    created_at: string;
    cpf?: string;
    phone?: string;
    address?: string;
    address_street?: string;
    address_number?: string;
    address_complement?: string;
    address_neighborhood?: string;
    address_city?: string;
    has_house?: boolean;
    house_number?: string;
    email?: string;
    member_status?: string;
    dependents?: Dependent[];
    controlid_id?: string;
}

interface MemberTitle {
    id: string;
    member_id: string;
    amount: number;
    description?: string;
    due_date?: string;
    bank_reference?: string;
    status: 'pending' | 'paid';
    created_at: string;
}

interface MemberLicense {
    id: string;
    member_id: string;
    start_date: string;
    end_date: string;
    notes?: string;
    created_at: string;
}

export const MembersPage: React.FC = () => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [printMode, setPrintMode] = useState<'simple' | 'detailed'>('simple');
    const [filter, setFilter] = useState<string>('');
    const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'list' | 'licenses' | 'delinquency'>('list');
    const [showLicenseForm, setShowLicenseForm] = useState(false);
    const [selectedMemberForLicense, setSelectedMemberForLicense] = useState('');
    const [licenseData, setLicenseData] = useState({ start_date: new Date().toISOString().split('T')[0], end_date: '', notes: '' });
    const [isSavingLicense, setIsSavingLicense] = useState(false);
    const [licenses, setLicenses] = useState<MemberLicense[]>([]);
    const [debts, setDebts] = useState<Record<string, number>>({});
    const [allTitles, setAllTitles] = useState<MemberTitle[]>([]);
    const [titleValue, setTitleValue] = useState<number>(50000);
    const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
    const [delinquencyText, setDelinquencyText] = useState('');
    const [isProcessingReport, setIsProcessingReport] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [pendingUpdates, setPendingUpdates] = useState<MemberTitle[] | null>(null);
    const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('full_name');
            if (error) throw error;
            setProfiles(data || []);
        } catch (err) {
            console.error('Error fetching profiles:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLicenses = async () => {
        try {
            const { data, error } = await supabase
                .from('member_licenses')
                .select('*')
                .order('start_date', { ascending: false });
            if (error) throw error;
            setLicenses(data || []);
        } catch (err) {
            console.error('Error fetching licenses:', err);
        }
    };

    useEffect(() => {
        fetchProfiles();
        fetchLicenses();
        fetchDebts();
        fetchTitleValue();
        checkAdmin();
    }, []);

    const fetchDebts = async () => {
        const { data, error } = await supabase
            .from('member_titles')
            .select('*')
            .eq('status', 'pending')
            .order('due_date', { ascending: true });
            
        if (data) {
            setAllTitles(data);
            const debMap: Record<string, number> = {};
            data.forEach(d => {
                debMap[d.member_id] = (debMap[d.member_id] || 0) + Number(d.amount);
            });
            setDebts(debMap);
        }
    };

    const fetchTitleValue = async () => {
        const { data } = await supabase.from('site_settings').select('value').eq('key', 'current_title_value').maybeSingle();
        if (data) setTitleValue(parseFloat(data.value));
    };

    const updateTitleValue = async (newVal: number) => {
        setIsUpdatingTitle(true);
        try {
            const { error } = await supabase
                .from('site_settings')
                .upsert({ key: 'current_title_value', value: newVal.toString() }, { onConflict: 'key' });
            
            if (error) throw error;
            setTitleValue(newVal);
            alert('Valor do título atualizado com sucesso!');
        } catch (err) {
            console.error('Error updating title value:', err);
            alert('Erro ao atualizar o valor do título.');
        } finally {
            setIsUpdatingTitle(false);
        }
    };

    const processBankReport = async () => {
        if (!delinquencyText.trim()) return;
        setIsProcessingReport(true);
        try {
            if (pendingUpdates && pendingUpdates.length > 0) {
                // Bulk insert/upsert of titles
                // Ensure no duplicates in the same batch (bank_reference must be unique)
                const uniqueUpdatesMap = new Map();
                pendingUpdates.forEach(u => uniqueUpdatesMap.set(u.bank_reference, u));
                const finalUpdates = Array.from(uniqueUpdatesMap.values()).map(({ id, ...rest }: any) => rest);

                const { error } = await supabase
                    .from('member_titles')
                    .upsert(finalUpdates, { onConflict: 'bank_reference' });
                if (error) throw error;
            } else {
                // Fallback logic for manual entry remains similar but for a single total row if necessary
                alert('Para novos títulos, utilize o upload de Excel para maior precisão.');
                return;
            }

            await fetchDebts();
            setDelinquencyText('');
            setPendingUpdates(null);
            alert(`Processamento concluído com sucesso!`);
        } catch (err) {
            console.error('Error processing report:', err);
            alert('Erro ao processar relatório.');
        } finally {
            setIsProcessingReport(false);
        }
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const extension = file.name.split('.').pop()?.toLowerCase();
        
        if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
            const reader = new FileReader();
            reader.onload = (event) => {
                let rows: any[] = [];
                if (extension === 'csv') {
                    const content = event.target?.result as string;
                    // For CSV, we can still use the text area for preview or just process it
                    setDelinquencyText(content);
                    return; 
                } else {
                    const data = new Uint8Array(event.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    rows = XLSX.utils.sheet_to_json(worksheet);
                }

                if (rows.length > 0) {
                    processRows(rows);
                }
            };
            if (extension === 'csv') reader.readAsText(file);
            else reader.readAsArrayBuffer(file);
        }
    };

    const processRows = (rows: any[]) => {
        const normalize = (str: string) => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
        
        const formatDate = (val: any) => {
            if (!val) return null;
            if (val instanceof Date) return val.toISOString().split('T')[0];
            if (typeof val === 'number') {
                const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                return date.toISOString().split('T')[0];
            }
            const parts = val.toString().match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`;
            return null;
        };

        const identifiedTitles: any[] = [];
        let count = 0;

        rows.forEach(row => {
            const rowValues = Object.values(row).map(v => v?.toString() || "");
            const rowText = rowValues.join(" ");
            const rowDigits = rowText.replace(/\D/g, '');

            const matchingMember = profiles.find(p => {
                const cpfClean = p.cpf?.replace(/\D/g, '');
                const nameNorm = normalize(p.full_name || '');
                return (cpfClean && rowDigits.includes(cpfClean)) || (nameNorm && normalize(rowText).includes(nameNorm));
            });

            if (matchingMember) {
                const keys = Object.keys(row);
                const valueKey = keys.find(k => k.toLowerCase().includes('valor')) || keys[keys.length - 1];
                const refKey = keys.find(k => k.toLowerCase().includes('nosso número'));
                const descKey = keys.find(k => k.toLowerCase().includes('seu número'));
                const dateKey = keys.find(k => k.toLowerCase().includes('vencimento'));
                
                let val = row[valueKey];
                if (typeof val === 'string') {
                    let clean = val.replace(/[^\d,\.]/g, '');
                    if (clean.includes('.') && clean.includes(',')) val = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
                    else if (clean.includes(',')) val = parseFloat(clean.replace(',', '.'));
                    else val = parseFloat(clean);
                }
                
                if (typeof val === 'number' && !isNaN(val)) {
                    const ref = refKey ? row[refKey]?.toString() : null;
                    identifiedTitles.push({
                        member_id: matchingMember.id,
                        amount: val,
                        description: descKey ? row[descKey] : 'Título banco',
                        due_date: formatDate(dateKey ? row[dateKey] : null),
                        bank_reference: ref || `man-${Date.now()}-${count}`,
                        status: 'pending'
                    });
                    count++;
                }
            }
        });

        if (identifiedTitles.length > 0) {
            setPendingUpdates(identifiedTitles);
            
            // Group by member for summary
            const summary: Record<string, number> = {};
            identifiedTitles.forEach(t => {
                summary[t.member_id] = (summary[t.member_id] || 0) + t.amount;
            });

            setDelinquencyText(`RESUMO DA IMPORTAÇÃO EXCEL: ${count} títulos identificados.\n` + 
                `--------------------------------------------------\n` +
                Object.entries(summary).map(([id, total]) => {
                    const p = profiles.find(prof => prof.id === id);
                    return `${p?.full_name}: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                }).join('\n')
            );
            alert(`Sucesso! Identificamos ${identifiedTitles.length} títulos no arquivo. Verifique o resumo e clique em "Sincronizar Débitos" para efetivar.`);
        } else {
            alert('Não conseguimos vincular os registros aos sócios cadastrados.');
        }
    };

    const settleTitle = async (titleId: string) => {
        if (!confirm('Deseja marcar este título como pago?')) return;
        try {
            const { error } = await supabase
                .from('member_titles')
                .update({ status: 'paid' })
                .eq('id', titleId);
            if (error) throw error;
            fetchDebts();
        } catch (err) {
            console.error('Error settling title:', err);
            alert('Erro ao baixar título.');
        }
    };

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            const allowedRoles = ['admin', 'site_admin', 'finance_manager'];
            setIsAdmin(allowedRoles.includes(profile?.role || ''));
        }
    };

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ member_status: newStatus })
                .eq('id', id);

            if (error) throw error;

            setProfiles(profiles.map(p =>
                p.id === id ? { ...p, member_status: newStatus } : p
            ));
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Erro ao atualizar status.');
        }
    };
    
    const handleUpdateControlId = async (id: string, newId: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ controlid_id: newId })
                .eq('id', id);

            if (error) throw error;

            setProfiles(profiles.map(p =>
                p.id === id ? { ...p, controlid_id: newId } : p
            ));
        } catch (err) {
            console.error('Error updating controlid_id:', err);
            alert('Erro ao atualizar Face ID.');
        }
    };

    const toTitleCase = (name: string) => {
        if (!name) return '';
        const exceptions = ['de', 'da', 'do', 'das', 'dos', 'e'];
        return name.toLowerCase().split(' ').map((word, index) => {
            if (index > 0 && exceptions.includes(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if (!confirm(`TEM CERTEZA? Isso excluirá permanentemente o acesso de "${name}". Esta ação não pode ser desfeita.`)) return;

        try {
            const { error } = await supabase.rpc('delete_user_account', { target_user_id: id });
            if (error) {
                const fallbackResponse = await supabase.from('profiles').delete().eq('id', id);
                if (fallbackResponse.error) throw fallbackResponse.error;
            }
            setProfiles(profiles.filter(p => p.id !== id));
            alert('Conta excluída com sucesso.');
        } catch (err) {
            console.error('Error deleting user:', err);
            alert('Erro ao excluir usuário. Verifique se ele possui reservas ativas.');
        }
    };

    const handleRegisterLicense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMemberForLicense) return;

        const memberLicenses = licenses.filter(l => l.member_id === selectedMemberForLicense);
        if (memberLicenses.length >= 2) {
            if (!confirm('Este sócio já utilizou 2 licenças. Deseja registrar mesmo assim? (A regra é de no máximo 2)')) return;
        }

        setIsSavingLicense(true);
        try {
            const { error } = await supabase
                .from('member_licenses')
                .insert([{
                    member_id: selectedMemberForLicense,
                    start_date: licenseData.start_date,
                    end_date: licenseData.end_date || new Date(new Date(licenseData.start_date).setMonth(new Date(licenseData.start_date).getMonth() + 6)).toISOString().split('T')[0],
                    notes: licenseData.notes,
                    created_by: (await supabase.auth.getUser()).data.user?.id
                }]);

            if (error) throw error;

            // Update member status to 'Licença' automatically if the license is current
            const today = new Date().toISOString().split('T')[0];
            if (licenseData.start_date <= today && (licenseData.end_date >= today || !licenseData.end_date)) {
                await handleUpdateStatus(selectedMemberForLicense, 'Licença');
            }

            alert('Licença registrada com sucesso!');
            setShowLicenseForm(false);
            fetchLicenses();
            setLicenseData({ start_date: new Date().toISOString().split('T')[0], end_date: '', notes: '' });
        } catch (err) {
            console.error('Error saving license:', err);
            alert('Erro ao salvar licença.');
        } finally {
            setIsSavingLicense(false);
        }
    };

    const handleDeleteLicense = async (id: string) => {
        if (!confirm('Deseja excluir este registro de licença?')) return;
        try {
            const { error } = await supabase.from('member_licenses').delete().eq('id', id);
            if (error) throw error;
            fetchLicenses();
        } catch (err) {
            console.error('Error deleting license:', err);
        }
    };

    const handlePrint = (mode: 'simple' | 'detailed') => {
        setPrintMode(mode);
        setTimeout(() => {
            window.print();
        }, 100);
    };

    const exportToExcel = () => {
        let dataToExport: any[] = [];
        let filename = 'relatorio';

        if (activeTab === 'list') {
            dataToExport = filteredProfiles.map(p => ({
                'Nome Completo': p.full_name,
                'CPF': p.cpf || '',
                'Status': p.member_status || 'Ativo',
                'Telefone': p.phone || '',
                'E-mail': p.email || '',
                'Endereço': p.address || ''
            }));
            filename = 'lista_socios';
        } else {
            dataToExport = licenses.map(l => {
                const member = profiles.find(p => p.id === l.member_id);
                return {
                    'Sócio': member?.full_name || 'Desconhecido',
                    'Início': formatDate(l.start_date),
                    'Fim': formatDate(l.end_date),
                    'Observações': l.notes || ''
                };
            });
            filename = 'controle_licencas';
        }

        if (dataToExport.length === 0) {
            alert('Não há dados para exportar.');
            return;
        }

        const headers = Object.keys(dataToExport[0]).join(';');
        const rows = dataToExport.map(row => 
            Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')
        ).join('\n');

        const csvContent = "\ufeff" + headers + '\n' + rows;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredProfiles = profiles.filter(p => 
        p.role !== 'visitor' && (
            p.full_name?.toLowerCase().includes(filter.toLowerCase()) ||
            p.cpf?.includes(filter)
        )
    );

    const toggleExpanded = (id: string) => {
        setExpandedProfileId(expandedProfileId === id ? null : id);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '—';
        // Handle YYYY-MM-DD format without timezone shift
        const [year, month, day] = dateStr.split('-').map(Number);
        if (!year || !month || !day) return dateStr;
        return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
    };

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Gestão de Sócios</h1>
                    <p className="text-gray-500 mt-2 text-lg">Controle de cadastros, dependentes e licenças.</p>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-end">
                    {activeTab === 'list' && (
                        <>
                            <input
                                type="text"
                                placeholder="Nome ou CPF..."
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="px-5 py-2.5 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-farm-500 outline-none w-full md:w-64 transition-all text-sm"
                            />
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={exportToExcel}
                                    className="bg-green-50 hover:bg-green-100 text-green-700 font-bold py-2.5 px-4 rounded-2xl flex items-center gap-2 transition-colors text-sm border border-green-200"
                                    title="Exportar dados para Excel"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Excel
                                </button>
                                <button
                                    onClick={() => handlePrint('simple')}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-4 rounded-2xl flex items-center gap-2 transition-colors text-sm"
                                >
                                    <IconPrinter className="w-4 h-4" />
                                    Lista
                                </button>
                                <button
                                    onClick={() => handlePrint('detailed')}
                                    className="bg-farm-700 hover:bg-farm-800 text-white font-bold py-2.5 px-4 rounded-2xl flex items-center gap-2 transition-colors shadow-sm text-sm"
                                >
                                    <IconPrinter className="w-4 h-4" />
                                    Completa
                                </button>
                            </div>
                        </>
                    )}
                    {activeTab === 'licenses' && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={exportToExcel}
                                className="bg-green-50 hover:bg-green-100 text-green-700 font-bold py-2.5 px-4 rounded-2xl flex items-center gap-2 transition-colors text-sm border border-green-200"
                                title="Exportar dados para Excel"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Excel
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-4 rounded-2xl flex items-center gap-2 transition-colors print:hidden text-sm"
                            >
                                <IconPrinter className="w-4 h-4" />
                                Imprimir
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => {
                                        setSelectedMemberForLicense('');
                                        setShowLicenseForm(true);
                                    }}
                                    className="bg-farm-700 hover:bg-farm-800 text-white font-bold py-2.5 px-4 rounded-2xl flex items-center gap-2 transition-all shadow-lg print:hidden text-sm"
                                >
                                    <IconPlus className="w-4 h-4" />
                                    Nova Licença
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <div className="flex border-b border-gray-200 print:hidden">
                <button
                    onClick={() => setActiveTab('list')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'list' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Lista de Sócios
                    {activeTab === 'list' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button
                    onClick={() => setActiveTab('licenses')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'licenses' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Controle de Licenças
                    {activeTab === 'licenses' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button
                    onClick={() => setActiveTab('delinquency')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'delinquency' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Inadimplência
                    {activeTab === 'delinquency' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12 print:hidden">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-farm-700"></div>
                </div>
            ) : (
                <>
                    {/* TAB: LISTA DE SÓCIOS */}
                    {activeTab === 'list' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2">
                            {filteredProfiles.length === 0 ? (
                                <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100 print:hidden">
                                    <IconUser className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                    <h3 className="text-xl font-medium text-gray-600">Nenhum sócio encontrado</h3>
                                </div>
                            ) : (
                                <>
                    {/* Mobile Card View (Hidden on Desktop) */}
                    {/* Mobile Card View (Hidden on Desktop & Print) */}
                    <div className="grid grid-cols-1 gap-4 md:hidden print:hidden">
                        {filteredProfiles.map((profile) => (
                            <div key={profile.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-farm-50 w-12 h-12 rounded-full flex items-center justify-center text-farm-700 font-bold shrink-0 text-xl">
                                        {profile.full_name?.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-900 truncate">{profile.full_name || 'Sem nome'}</p>
                                            {profile.has_house && profile.house_number && (
                                                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-md font-black border border-blue-200">
                                                    CASA {profile.house_number}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400 font-mono">
                                            {profile.cpf ? (
                                                profile.cpf.replace(/\D/g, '').length === 11 
                                                    ? profile.cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
                                                    : profile.cpf
                                            ) : 'CPF não informado'}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-50 p-2 rounded-lg">
                                        <p className="text-gray-400 uppercase font-bold text-[10px] mb-1">Contato</p>
                                        <p className="text-gray-700 truncate">{profile.phone || '—'}</p>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded-lg">
                                        <p className="text-gray-400 uppercase font-bold text-[10px] mb-1">E-mail</p>
                                        <p className="text-gray-700 truncate" title={profile.email}>{profile.email || '—'}</p>
                                    </div>
                                    {isAdmin && (
                                        <div className="col-span-2 pt-2 flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                            <select
                                                value={profile.member_status || 'Ativo'}
                                                onChange={(e) => handleUpdateStatus(profile.id, e.target.value)}
                                                className={`text-[10px] font-bold uppercase rounded-md px-2 py-1 outline-none ${
                                                    profile.member_status === 'Ativo' ? 'bg-green-100 text-green-700' :
                                                    profile.member_status === 'Inativo' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                                                }`}
                                            >
                                                <option value="Ativo">Ativo</option>
                                                <option value="Inativo">Inativo</option>
                                                <option value="Licença">Licença</option>
                                            </select>
                                            <button 
                                                onClick={() => handleDeleteUser(profile.id, profile.full_name)}
                                                className="text-red-500 p-1 hover:bg-red-50 rounded"
                                            >
                                                <IconTrash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {(profile.address || profile.address_street) && (
                                    <div className="bg-gray-50 p-2 rounded-lg">
                                        <p className="text-gray-400 uppercase font-bold text-[10px] mb-1">Endereço</p>
                                        <p className="text-gray-700 text-xs leading-tight">
                                            {profile.address_street 
                                                ? `${profile.address_street}, ${profile.address_number}${profile.address_complement ? ` - ${profile.address_complement}` : ''}, ${profile.address_neighborhood}, ${profile.address_city}`
                                                : profile.address
                                            }
                                        </p>
                                    </div>
                                )}

                                {profile.dependents && profile.dependents.length > 0 && (
                                    <div className="pt-2 border-t border-gray-100">
                                        <button
                                            onClick={() => toggleExpanded(profile.id)}
                                            className="w-full flex items-center justify-between text-blue-600 font-bold text-xs"
                                        >
                                            <span>{profile.dependents.length} dependentes</span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${expandedProfileId === profile.id ? 'rotate-180' : ''}`}
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {expandedProfileId === profile.id && (
                                            <div className="mt-3 space-y-2 animate-in slide-in-from-top-2">
                                                {profile.dependents.map((dep, idx) => (
                                                    <div key={idx} className="bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                                                        <p className="font-bold text-gray-800 text-xs">{dep.name}</p>
                                                        <p className="text-[10px] text-gray-500 flex justify-between">
                                                            <span>{dep.relationship}</span>
                                                            <span>{formatDate(dep.birthDate)}</span>
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table View (Hidden on Mobile) */}
                    <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden print:hidden hidden md:block">
                        <div className="w-full">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left min-w-[1200px] divide-y divide-gray-100">
                                    <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">
                                        <tr>
                                            <th className="px-6 py-5 font-black">Usuário</th>
                                            <th className="px-6 py-5 font-black">CPF</th>
                                            <th className="px-6 py-5 font-black">Contato</th>
                                            <th className="px-6 py-5 font-black">E-mail</th>
                                            <th className="px-6 py-5 font-black">Face ID</th>
                                            <th className="px-6 py-5 font-black text-right">Ações</th>
                                        </tr>
                                    </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredProfiles.map((profile) => (
                                        <React.Fragment key={profile.id}>
                                            <tr className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-farm-50 w-10 h-10 rounded-full flex items-center justify-center text-farm-700 font-bold shrink-0">
                                                            {profile.full_name?.charAt(0) || '?'}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-gray-800">{profile.full_name || 'Sem nome'}</p>
                                                                {profile.has_house && profile.house_number && (
                                                                    <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-black border border-blue-200">
                                                                        CASA {profile.house_number}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {(profile.address || profile.address_street) && (
                                                                <p className="text-xs text-gray-400 mt-0.5 leading-tight" title={profile.address_street ? `${profile.address_street}, ${profile.address_number}, ${profile.address_city}` : profile.address}>
                                                                    {profile.address_street 
                                                                        ? `${profile.address_street}, ${profile.address_number}${profile.address_complement ? ` - ${profile.address_complement}` : ''}, ${profile.address_neighborhood}, ${profile.address_city}`
                                                                        : profile.address
                                                                    }
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 font-mono whitespace-nowrap w-40 min-w-[140px]" title={profile.cpf}>
                                                    {(() => {
                                                        if (!profile.cpf) return '—';
                                                        const digits = profile.cpf.replace(/\D/g, '');
                                                        if (digits.length === 11) {
                                                            return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                                                        }
                                                        return profile.cpf;
                                                    })()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-600 flex items-center gap-2">
                                                        <IconPhone className="w-4 h-4 text-gray-400" />
                                                        {profile.phone || '—'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-600 flex items-center gap-2">
                                                        {profile.email ? (
                                                            <>
                                                                <IconMail className="w-4 h-4 text-gray-400 shrink-0" />
                                                                <span className="truncate max-w-[180px]" title={profile.email}>{profile.email}</span>
                                                            </>
                                                        ) : '—'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <input 
                                                        type="text"
                                                        defaultValue={profile.controlid_id || ''}
                                                        onBlur={(e) => {
                                                            if (e.target.value !== (profile.controlid_id || '')) {
                                                                handleUpdateControlId(profile.id, e.target.value);
                                                            }
                                                        }}
                                                        placeholder="ID Facial..."
                                                        className="w-24 px-2 py-1 text-[10px] font-mono border border-gray-100 rounded bg-gray-50 focus:bg-white focus:ring-1 focus:ring-farm-500 outline-none transition-all"
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-3">
                                                        {profile.dependents && profile.dependents.length > 0 ? (
                                                            <button
                                                                onClick={() => toggleExpanded(profile.id)}
                                                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${expandedProfileId === profile.id
                                                                    ? 'bg-blue-200 text-blue-900 ring-2 ring-blue-500 ring-offset-1'
                                                                    : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                                                    }`}
                                                            >
                                                                {profile.dependents.length} dependentes
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-400 text-sm italic">S/ dep.</span>
                                                        )}

                                                        {isAdmin && (
                                                            <>
                                                                <select
                                                                    value={profile.member_status || 'Ativo'}
                                                                    onChange={(e) => handleUpdateStatus(profile.id, e.target.value)}
                                                                    className={`text-xs font-bold uppercase rounded-full px-3 py-1 outline-none border border-transparent hover:border-gray-200 ${
                                                                        profile.member_status === 'Ativo' ? 'bg-green-100 text-green-700' :
                                                                        profile.member_status === 'Inativo' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                                                                    }`}
                                                                >
                                                                    <option value="Ativo">Ativo</option>
                                                                    <option value="Inativo">Inativo</option>
                                                                    <option value="Licença">Licença</option>
                                                                </select>
                                                                <button
                                                                    onClick={() => handleDeleteUser(profile.id, profile.full_name)}
                                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Excluir Sócio"
                                                                >
                                                                    <IconTrash className="w-5 h-5" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedProfileId === profile.id && profile.dependents && (
                                                <tr className="bg-blue-50/50">
                                                    <td colSpan={5} className="px-6 py-4 border-t border-b border-gray-100">
                                                        <div className="ml-12 pl-4 border-l-2 border-blue-200">
                                                            <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                                                <span className="bg-blue-100 text-blue-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">i</span>
                                                                Dependentes Vinculados:
                                                            </h4>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                {profile.dependents.map((dep, idx) => (
                                                                    <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-sm">
                                                                        <div className="font-semibold text-gray-800">{dep.name}</div>
                                                                        <div className="text-gray-500 text-xs mt-1 flex justify-between">
                                                                            <span>{dep.relationship}</span>
                                                                            <span>{formatDate(dep.birthDate)}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                    {/* Print Views */}
                    <div className="hidden print:block bg-white p-8">
                        <div className="text-center mb-8 border-b-2 border-gray-900 pb-4">
                            <h1 className="text-3xl font-bold font-serif text-gray-900">Fazenda São Bento</h1>
                            <h2 className="text-xl text-gray-600 mt-2 font-bold uppercase">
                                {printMode === 'simple' ? 'Lista Simples de Sócios' : 'Lista Completa de Sócios e Dependentes'}
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">Portal Fazenda São Bento - {new Date().toLocaleDateString('pt-BR')}</p>
                        </div>

                        <style>
                            {`
                                @media print {
                                    @page {
                                        margin: 1.5cm;
                                        size: auto;
                                    }
                                    body {
                                        -webkit-print-color-adjust: exact !important;
                                        print-color-adjust: exact !important;
                                    }
                                    .print-border {
                                        border: 1px solid #e5e7eb;
                                    }
                                    .print-header {
                                        background-color: #f3f4f6 !important;
                                        -webkit-print-color-adjust: exact !important;
                                    }
                                    .print-row {
                                        page-break-inside: avoid;
                                    }
                                }
                            `}
                        </style>
                        <table className="w-full text-left border-collapse border border-gray-300">
                            <thead>
                                <tr className="bg-gray-100 print-header">
                                    <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs w-[30%]">
                                        {printMode === 'simple' ? 'Nome do Sócio' : 'Nome / Endereço'}
                                    </th>
                                    <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs w-[15%]">CPF</th>
                                    <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs w-[20%]">Telefone</th>
                                    <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs w-[35%]">E-mail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProfiles.map((profile, index) => (
                                    <React.Fragment key={profile.id}>
                                        <tr className={`break-inside-avoid print-row ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                            <td className="px-2 py-1 border border-gray-400 align-top">
                                                <div className="font-bold text-gray-900 text-[10px] uppercase leading-tight">{profile.full_name}</div>
                                                {printMode === 'detailed' && profile.address && (
                                                    <div className="text-[9px] text-gray-600 mt-1 leading-tight border-t border-gray-200 pt-0.5">{profile.address}</div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 border border-gray-400 align-top text-[10px] text-gray-800 font-mono">
                                                {profile.cpf || '—'}
                                            </td>
                                            <td className="px-2 py-1 border border-gray-400 align-top text-[10px] text-gray-800 whitespace-nowrap">
                                                {profile.phone || '—'}
                                            </td>
                                            <td className="px-2 py-1 border border-gray-400 align-top text-[10px] text-gray-800 break-all leading-tight">
                                                {profile.email || '—'}
                                            </td>
                                        </tr>
                                        {printMode === 'detailed' && profile.dependents && profile.dependents.length > 0 && (
                                            <tr className="break-inside-avoid print-row">
                                                <td colSpan={4} className="px-2 py-1 border border-gray-400 bg-white">
                                                    <div className="border-l-2 border-gray-400 pl-2 ml-1">
                                                        <p className="text-[9px] font-bold text-gray-600 uppercase mb-0.5">Dependentes:</p>
                                                        <div className="flex flex-col gap-y-1">
                                                            {profile.dependents.map((dep, idx) => (
                                                                <div key={idx} className="flex justify-between items-center text-[9px] border-b border-dotted border-gray-300 pb-0.5">
                                                                    <span className="font-medium text-gray-900 uppercase truncate pr-1">{dep.name}</span>
                                                                    <span className="text-gray-500 whitespace-nowrap">
                                                                        {dep.relationship} {dep.birthDate ? `• ${formatDate(dep.birthDate)}` : ''}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </>
                )}
            </div>
        )}

                    {/* TAB: CONTROLE DE LICENÇAS */}
                    {activeTab === 'licenses' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Status Geral</p>
                            <p className="text-2xl font-black text-gray-800">{profiles.length} Sócios</p>
                        </div>
                        <div className="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-100">
                            <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">Em Licença Atual</p>
                            <p className="text-2xl font-black text-orange-700">
                                {profiles.filter(p => p.member_status === 'Licença').length} Ativas
                            </p>
                        </div>
                        <div className="bg-farm-800 p-5 rounded-2xl shadow-xl border border-farm-700 text-white">
                            <p className="text-xs font-bold text-farm-300 uppercase tracking-widest mb-1">Licenças Concedidas</p>
                            <p className="text-2xl font-black">{licenses.length} Registros</p>
                        </div>
                    </div>

                    {showLicenseForm && (
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-farm-100 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-farm-500 to-farm-700"></div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                                <span className="bg-farm-100 p-2 rounded-xl text-farm-700">
                                    <IconPlus className="w-6 h-6" />
                                </span>
                                Registrar Nova Licença
                            </h3>
                            <form onSubmit={handleRegisterLicense} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-1">
                                    <label className="block text-sm font-black text-gray-600 uppercase mb-2">Sócio</label>
                                    <select
                                        required
                                        value={selectedMemberForLicense}
                                        onChange={(e) => setSelectedMemberForLicense(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-farm-500/10 focus:border-farm-500 transition-all font-medium"
                                    >
                                        <option value="">Selecione um sócio...</option>
                                        {profiles.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.full_name} ({licenses.filter(l => l.member_id === p.id).length}/2 licenças)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-black text-gray-600 uppercase mb-2">Data Início</label>
                                    <input
                                        type="date"
                                        required
                                        value={licenseData.start_date}
                                        onChange={(e) => setLicenseData({ ...licenseData, start_date: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-farm-500/10 focus:border-farm-500 transition-all font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-black text-gray-600 uppercase mb-2">Data Fim (Opcional - padrão 6 meses)</label>
                                    <input
                                        type="date"
                                        value={licenseData.end_date}
                                        onChange={(e) => setLicenseData({ ...licenseData, end_date: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-farm-500/10 focus:border-farm-500 transition-all font-medium"
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="block text-sm font-black text-gray-600 uppercase mb-2">Observações (Justificativa ou registro retroativo)</label>
                                    <textarea
                                        value={licenseData.notes}
                                        onChange={(e) => setLicenseData({ ...licenseData, notes: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-farm-500/10 focus:border-farm-500 transition-all font-medium min-h-[100px]"
                                        placeholder="Ex: Licença tirada em 2023 antes da implementação do sistema..."
                                    />
                                </div>
                                <div className="md:col-span-3 flex justify-end gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowLicenseForm(false)}
                                        className="px-6 py-2.5 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSavingLicense}
                                        className="bg-farm-700 hover:bg-farm-800 text-white font-bold px-8 py-2.5 rounded-2xl text-sm shadow-lg shadow-farm-200 transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSavingLicense ? <IconLoader className="w-5 h-5 animate-spin" /> : 'Salvar Registro'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Sócio</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Uso de Licenças</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Período</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Status Atual</th>
                                        {isAdmin && <th className="px-8 py-6 text-[10px] font-black uppercase text-gray-400 tracking-[0.2em] text-right">Ações</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {profiles.filter(p => p.role !== 'visitor').map(profile => {
                                        const profileLicenses = licenses.filter(l => l.member_id === profile.id);
                                        const activeLicense = profileLicenses.find(l => {
                                            const today = new Date().toISOString().split('T')[0];
                                            return l.start_date <= today && (l.end_date >= today || !l.end_date);
                                        });

                                        return (
                                            <tr key={profile.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-farm-50 flex items-center justify-center text-farm-700 font-bold shrink-0">
                                                            {profile.full_name?.charAt(0)}
                                                        </div>
                                                        <span className="font-bold text-gray-800">{profile.full_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-2">
                                                        {[1, 2].map(i => (
                                                            <div 
                                                                key={i} 
                                                                className={`w-8 h-2 rounded-full ${i <= profileLicenses.length ? 'bg-orange-500 shadow-sm shadow-orange-200' : 'bg-gray-200'}`}
                                                                title={i <= profileLicenses.length ? "Licença utilizada" : "Disponível"}
                                                            ></div>
                                                        ))}
                                                        <span className="ml-2 text-xs font-bold text-gray-500">{profileLicenses.length}/2</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    {activeLicense ? (
                                                        <div className="text-sm font-medium text-gray-600">
                                                            <span className="text-xs uppercase font-black text-orange-400 block tracking-tighter">Em Vigência:</span>
                                                            {formatDate(activeLicense.start_date)} — {formatDate(activeLicense.end_date)}
                                                        </div>
                                                    ) : profileLicenses.length > 0 ? (
                                                        <div className="text-xs text-gray-400">
                                                            Última: {formatDate(profileLicenses[0].end_date)}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs italic text-gray-400">Nenhum registro</span>
                                                    )}
                                                </td>
                                                <td className="px-8 py-5">
                                                    {activeLicense ? (
                                                        <span className="bg-orange-100 text-orange-700 text-[10px] font-black uppercase px-3 py-1 rounded-full ring-2 ring-orange-500/10">
                                                            Em Licença
                                                        </span>
                                                    ) : (
                                                        <span className="bg-green-50 text-green-700 text-[10px] font-black uppercase px-3 py-1 rounded-full opacity-50">
                                                            Ativo
                                                        </span>
                                                    )}
                                                </td>
                                                {isAdmin && (
                                                    <td className="px-8 py-5 text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedMemberForLicense(profile.id);
                                                                    setShowLicenseForm(true);
                                                                }}
                                                                className="p-2 text-farm-600 hover:bg-farm-50 rounded-xl transition-colors"
                                                                title="Adicionar Licença"
                                                            >
                                                                <IconPlus className="w-5 h-5" />
                                                            </button>
                                                            {profileLicenses.length > 0 && (
                                                                <button
                                                                    onClick={() => handleDeleteLicense(profileLicenses[0].id)}
                                                                    className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                                                                    title="Excluir último registro"
                                                                >
                                                                    <IconTrash className="w-5 h-5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Print View for Licenses */}
            {activeTab === 'licenses' && (
                <div className="hidden print:block bg-white p-8">
                    <div className="text-center mb-8 border-b-2 border-gray-900 pb-4">
                        <h1 className="text-3xl font-bold font-serif text-gray-900">Fazenda São Bento</h1>
                        <h2 className="text-xl text-gray-600 mt-2 font-bold uppercase">Relatório de Controle de Licenças</h2>
                        <p className="text-xs text-gray-400 mt-1">Portal Fazenda São Bento - {new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    <table className="w-full text-left border-collapse border border-gray-300">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs">Sócio</th>
                                <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs">Período</th>
                                <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs">Uso</th>
                                <th className="px-2 py-1 border border-gray-400 font-bold text-gray-900 text-xs">Observações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {profiles.filter(p => p.role !== 'visitor').map(profile => {
                                const profileLicenses = licenses.filter(l => l.member_id === profile.id);
                                if (profileLicenses.length === 0) return null;
                                return profileLicenses.map((lic, idx) => (
                                    <tr key={lic.id} className="text-[10px]">
                                        {idx === 0 && (
                                            <td rowSpan={profileLicenses.length} className="px-2 py-1 border border-gray-400 font-bold align-top">
                                                {profile.full_name}
                                            </td>
                                        )}
                                        <td className="px-2 py-1 border border-gray-400 whitespace-nowrap">
                                            {formatDate(lic.start_date)} — {formatDate(lic.end_date)}
                                        </td>
                                        <td className="px-2 py-1 border border-gray-400 text-center">
                                            {idx + 1}/2
                                        </td>
                                        <td className="px-2 py-1 border border-gray-400">
                                            {lic.notes || '—'}
                                        </td>
                                    </tr>
                                ));
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB: INADIMPLÊNCIA */}
            {activeTab === 'delinquency' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            {/* Title Value Control */}
                            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-farm-100">
                                <h3 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                                    <IconChart className="w-5 h-5 text-farm-700" />
                                    Valor do Título
                                </h3>
                                <p className="text-gray-500 text-xs mb-4">Referência de perda. Atual: R$ {titleValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <div className="flex gap-2">
                                    <input 
                                        type="number" 
                                        defaultValue={titleValue}
                                        onBlur={(e) => updateTitleValue(parseFloat(e.target.value))}
                                        className="flex-1 px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-farm-500 font-bold text-md"
                                    />
                                    {isUpdatingTitle && <IconLoader className="animate-spin w-5 h-5 text-farm-700 self-center" />}
                                </div>
                            </div>

                            {/* Report Processing */}
                            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-farm-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <IconPlus className="w-5 h-5 text-farm-700" />
                                        Inadimplência
                                    </h3>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 px-3 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                                        title="Fazer upload de arquivo"
                                    >
                                        <IconUpload className="w-3 h-3" />
                                        Upload Excel
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileImport} 
                                        className="hidden" 
                                        accept=".txt,.csv,.pdf,.xls,.xlsx"
                                    />
                                </div>
                                <p className="text-gray-500 text-xs mb-4">Cole o conteúdo ou faça o upload do arquivo. O sistema identificará sócios pelo nome ou CPF.</p>
                                <textarea
                                    value={delinquencyText}
                                    onChange={(e) => {
                                        setDelinquencyText(e.target.value);
                                        setPendingUpdates(null); // Reset pending updates if manual edit occurs
                                    }}
                                    placeholder="Ex: 001.234.567-89 - JOAO DA SILVA - 1.250,56"
                                    className="w-full h-40 px-5 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-farm-500 mb-4 font-mono text-xs custom-scrollbar box-border"
                                />
                                <button
                                    onClick={processBankReport}
                                    disabled={isProcessingReport || !delinquencyText.trim()}
                                    className="w-full bg-farm-700 hover:bg-farm-800 text-white font-bold py-3 text-sm rounded-2xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 box-border"
                                >
                                    {isProcessingReport ? <IconLoader className="animate-spin w-4 h-4" /> : 'Sincronizar Débitos'}
                                </button>
                            </div>
                        </div>

                        {/* Detalhamento de Dívidas e Títulos */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Stats Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="bg-farm-50 p-6 rounded-[2rem] border border-farm-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-farm-600 rounded-2xl flex items-center justify-center shadow-lg">
                                        <IconChart className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-farm-600 text-[10px] font-bold uppercase tracking-wider">Total em Aberto</p>
                                        <p className="text-2xl font-black text-gray-800">
                                            R$ {Object.values(debts).reduce((a, b) => a + Number(b), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-orange-50 p-6 rounded-[2rem] border border-orange-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                                        <IconUser className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-orange-600 text-[10px] font-bold uppercase tracking-wider">Sócios Inadimplentes</p>
                                        <p className="text-2xl font-black text-gray-800">{Object.keys(debts).length}</p>
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
                                        <IconChart className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-gray-600 text-[10px] font-bold uppercase tracking-wider">Títulos Pendentes</p>
                                        <p className="text-2xl font-black text-gray-800">{allTitles.length}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-farm-100">
                                <div className="p-8 border-b border-gray-100 bg-gray-50/30 flex justify-between items-center">
                                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Detalhamento por Sócio</h2>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Clique para ver títulos individuais</div>
                                </div>
                                <div className="divide-y divide-gray-100 max-h-[1000px] overflow-y-auto custom-scrollbar">
                                    {Object.entries(debts)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([memberId, total]) => {
                                            const profile = profiles.find(p => p.id === memberId);
                                            const riskPercentage = Math.min((total / titleValue) * 100, 100);
                                            const distanceToTitleValue = Math.max(titleValue - total, 0);
                                            const isExpanded = expandedDebtId === memberId;
                                            const memberTitles = allTitles.filter(t => t.member_id === memberId);

                                            return (
                                                <div key={memberId} className={`transition-all duration-300 ${isExpanded ? 'bg-farm-50/20' : 'hover:bg-gray-50/50'}`}>
                                                    <div 
                                                        className="p-8 cursor-pointer flex flex-col md:flex-row items-start md:items-center gap-6"
                                                        onClick={() => setExpandedDebtId(isExpanded ? null : memberId)}
                                                    >
                                                        <div className="w-16 h-16 rounded-3xl bg-white border border-gray-200 shadow-sm flex items-center justify-center shrink-0">
                                                            <div className="text-farm-700 font-black text-xl">
                                                                {profile?.full_name?.charAt(0)}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex-1 w-full">
                                                            <div className="flex justify-between items-start mb-4">
                                                                <div>
                                                                    <h3 className="font-black text-gray-800 text-lg leading-none mb-1">{profile?.full_name}</h3>
                                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{profile?.cpf || '—'}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-2xl font-black text-gray-900 leading-none">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 tracking-tighter">Débito Total</p>
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-col sm:flex-row gap-8 items-start sm:items-center">
                                                                <div className="flex-1 w-full space-y-2">
                                                                    <div className="flex justify-between items-end">
                                                                        <span className="text-[9px] font-black text-farm-600 uppercase tracking-widest">Comprometimento do Título</span>
                                                                        <span className={`text-[10px] font-black ${riskPercentage >= 100 ? 'text-red-500' : 'text-gray-600'}`}>
                                                                            {riskPercentage.toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                                                                        <div 
                                                                            className={`h-full transition-all duration-1000 ${riskPercentage >= 100 ? 'bg-red-500' : riskPercentage > 70 ? 'bg-orange-500' : 'bg-farm-500'}`}
                                                                            style={{ width: `${riskPercentage}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                
                                                                <div className="bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-sm shrink-0 min-w-[160px]">
                                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mb-1 leading-none">Status</p>
                                                                    <p className={`text-sm font-black leading-none ${distanceToTitleValue === 0 ? 'text-red-600' : 'text-farm-800'}`}>
                                                                        {distanceToTitleValue > 0 ? `+ R$ ${distanceToTitleValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} p/ limite` : 'LIMITE EXCEDIDO'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Individual Titles Accordion Content */}
                                                    {isExpanded && (
                                                        <div className="px-8 pb-8 pt-0 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <div className="bg-gray-50/50 rounded-3xl border border-gray-100 overflow-hidden">
                                                                <table className="w-full text-left text-xs">
                                                                    <thead className="bg-gray-100/50 border-b border-gray-200/50">
                                                                        <tr>
                                                                            <th className="px-5 py-4 font-black text-gray-500 uppercase tracking-widest">Descrição / Ref</th>
                                                                            <th className="px-5 py-4 font-black text-gray-500 uppercase tracking-widest">Vencimento</th>
                                                                            <th className="px-5 py-4 font-black text-gray-500 uppercase tracking-widest text-right">Valor</th>
                                                                            <th className="px-5 py-4 font-black text-gray-500 uppercase tracking-widest text-center">Ações</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-100">
                                                                        {memberTitles.length > 0 ? memberTitles.map(title => (
                                                                            <tr key={title.id} className="hover:bg-white transition-colors">
                                                                                <td className="px-5 py-4">
                                                                                    <p className="font-black text-gray-700">{title.description || 'Título Bancário'}</p>
                                                                                    {title.bank_reference && <p className="text-[9px] text-gray-400 font-mono mt-0.5">{title.bank_reference}</p>}
                                                                                </td>
                                                                                <td className="px-5 py-4 text-gray-500 font-bold">
                                                                                    {title.due_date ? new Date(title.due_date).toLocaleDateString('pt-BR') : '—'}
                                                                                </td>
                                                                                <td className="px-5 py-4 text-right font-black text-gray-800 text-sm">
                                                                                    R$ {Number(title.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                                </td>
                                                                                <td className="px-5 py-4 text-center">
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); settleTitle(title.id); }}
                                                                                        className="bg-farm-600 hover:bg-farm-700 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-farm-200 transition-all active:scale-95"
                                                                                    >
                                                                                        Baixar
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        )) : (
                                                                            <tr>
                                                                                <td colSpan={4} className="px-5 py-10 text-center text-gray-400 italic">Este sócio não possui títulos pendentes registrados individualmente.</td>
                                                                            </tr>
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    {Object.keys(debts).length === 0 && (
                                        <div className="p-20 text-center flex flex-col items-center">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                <IconChart className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-400 font-bold">Nenhum registro de inadimplência encontrado.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
                </>
            )}
        </div>
    );
};
