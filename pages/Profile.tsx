import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { VisualizadorProforma } from '../components/VisualizadorProforma';
import { IconFileText, IconZap, IconUser, IconLoader, IconDownload, IconLock } from '../components/Icons';

interface Dependent {
    name: string;
    birthDate: string;
    relationship: string;
    controlid_id?: string;
}

interface ProfileData {
    full_name: string;
    cpf: string;
    birth_date: string;
    phone: string;
    address_street: string;
    address_number: string;
    address_complement: string;
    address_neighborhood: string;
    address_city: string;
    has_house: boolean;
    house_number: string;
    email: string;
    dependents: Dependent[];
    host_name: string;
    role: string;
    controlid_id: string;
}

export const ProfilePage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authEmail, setAuthEmail] = useState('');
    const [pastStays, setPastStays] = useState<any[]>([]);
    const [selectedEstadiaId, setSelectedEstadiaId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'data' | 'security'>('data');
    const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });

    const [formData, setFormData] = useState<ProfileData>({
        full_name: '',
        cpf: '',
        birth_date: '',
        phone: '',
        address_street: '',
        address_number: '',
        address_complement: '',
        address_neighborhood: '',
        address_city: '',
        has_house: false,
        house_number: '',
        email: '',
        dependents: [],
        host_name: '',
        role: '',
        controlid_id: ''
    });

    const [legacyAddress, setLegacyAddress] = useState<string>('');

    const [hasDependents, setHasDependents] = useState<string>('Não');

    const [enrollState, setEnrollState] = useState<{
        enrolling: boolean;
        commandId?: string;
        status?: string;
        error?: string;
        targetName?: string;
    }>({ enrolling: false });

    const cancelEnroll = async () => {
        if (!enrollState.commandId) return;
        try {
            await supabase
                .from('controlid_commands')
                .update({ 
                    status: 'failed', 
                    error: 'Operação cancelada pelo usuário no Portal.',
                    updated_at: new Date().toISOString() 
                })
                .eq('id', enrollState.commandId);
        } catch (err) {
            console.error('Error cancelling enrollment:', err);
        }
        setEnrollState({ enrolling: false });
    };

    const startEnroll = async (targetType: 'member' | 'dependent', dependentName?: string) => {
        try {
            const { data: devices, error: devError } = await supabase
                .from('idface_dispositivos')
                .select('serial_number')
                .eq('pdv_id', 3) // PDV Escritório
                .eq('ativo', true)
                .limit(1);

            if (devError || !devices || devices.length === 0) {
                alert('Nenhum aparelho do Escritório (PDV Escritório) está cadastrado ou ativo no sistema. Cadastre o leitor na tela de Configuração de Hardware primeiro!');
                return;
            }

            const device = devices[0];

            let generatedId = '';
            let attempts = 0;
            const existingIds = new Set<string>();

            const { data: allProfiles } = await supabase
                .from('profiles')
                .select('controlid_id, dependents');
            
            const { data: allEmployees } = await supabase
                .from('employees')
                .select('controlid_id');

            if (allProfiles) {
                allProfiles.forEach((p: any) => {
                    if (p.controlid_id) existingIds.add(String(p.controlid_id));
                    if (Array.isArray(p.dependents)) {
                        p.dependents.forEach((d: any) => {
                            if (d.controlid_id) existingIds.add(String(d.controlid_id));
                        });
                    }
                });
            }
            if (allEmployees) {
                allEmployees.forEach((e: any) => {
                    if (e.controlid_id) existingIds.add(String(e.controlid_id));
                });
            }

            do {
                generatedId = String(Math.floor(100000 + Math.random() * 900000));
                attempts++;
            } while (existingIds.has(generatedId) && attempts < 100);

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: command, error: cmdError } = await supabase
                .from('controlid_commands')
                .insert({
                    device_id: device.serial_number,
                    command: 'remote_enroll.fcgi',
                    params: {
                        type: 'face',
                        user_id: parseInt(generatedId),
                        save: true
                    },
                    metadata: {
                        target_type: targetType,
                        target_id: user.id,
                        parent_id: targetType === 'dependent' ? user.id : undefined,
                        dependent_name: targetType === 'dependent' ? dependentName : undefined
                    },
                    status: 'pending'
                })
                .select()
                .single();

            if (cmdError || !command) throw cmdError || new Error('Falha ao criar comando de cadastro.');

            setEnrollState({
                enrolling: true,
                commandId: command.id,
                status: 'pending',
                targetName: dependentName || 'Titular'
            });

            const subscription = supabase
                .channel(`controlid-enroll-${command.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'controlid_commands',
                        filter: `id=eq.${command.id}`
                    },
                    (payload) => {
                        const updatedCmd = payload.new;
                        setEnrollState(prev => ({
                            ...prev,
                            status: updatedCmd.status,
                            error: updatedCmd.error || undefined
                        }));

                        if (updatedCmd.status === 'success') {
                            if (targetType === 'member') {
                                setFormData(f => ({ ...f, controlid_id: generatedId }));
                            } else if (targetType === 'dependent') {
                                setFormData(f => {
                                    const updatedDeps = f.dependents.map(d => {
                                        if (d.name === dependentName) {
                                            return { ...d, controlid_id: generatedId };
                                        }
                                        return d;
                                    });
                                    return { ...f, dependents: updatedDeps };
                                });
                            }
                            subscription.unsubscribe();
                            setEnrollState({ enrolling: false });
                        } else if (updatedCmd.status === 'failed') {
                            alert(`Falha ao cadastrar no leitor: ${updatedCmd.error || 'Erro desconhecido.'}`);
                            subscription.unsubscribe();
                            setEnrollState({ enrolling: false });
                        }
                    }
                )
                .subscribe();

            // Timeout de 60 segundos
            setTimeout(async () => {
                const { data: latestCmd } = await supabase
                    .from('controlid_commands')
                    .select('status')
                    .eq('id', command.id)
                    .single();

                if (latestCmd && (latestCmd.status === 'pending' || latestCmd.status === 'sent')) {
                    await supabase
                        .from('controlid_commands')
                        .update({ 
                            status: 'failed', 
                            error: 'Tempo esgotado (60s) aguardando o leitor.',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', command.id);
                    alert('Tempo esgotado (60 segundos). A captura de rosto expirou.');
                    subscription.unsubscribe();
                    setEnrollState({ enrolling: false });
                }
            }, 60000);

        } catch (err: any) {
            alert('Erro ao iniciar cadastro facial: ' + err.message);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setAuthEmail(user.email || '');

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                const profile = data[0];
                setLegacyAddress(profile.address || '');
                setFormData({
                    full_name: profile.full_name || '',
                    cpf: profile.cpf || '',
                    birth_date: profile.birth_date || '',
                    phone: profile.phone || '',
                    address_street: profile.address_street || '',
                    address_number: profile.address_number || '',
                    address_complement: profile.address_complement || '',
                    address_neighborhood: profile.address_neighborhood || '',
                    address_city: profile.address_city || '',
                    has_house: profile.has_house || false,
                    house_number: profile.house_number || '',
                    email: profile.email || user.email || '',
                    dependents: profile.dependents || [],
                    host_name: profile.host_name || '',
                    role: profile.role || '',
                    controlid_id: profile.controlid_id || ''
                });
                setHasDependents(profile.dependents && profile.dependents.length > 0 ? 'Sim' : 'Não');
            } else {
                // If no profile found, initialize with user email
                setFormData(prev => ({
                    ...prev,
                    email: user.email || ''
                }));
            }

            // Fetch past stays
            const { data: staysData } = await supabase
                .from('estadias')
                .select('*, reservations:reserva_id(*)')
                .eq('status', 'finalizada')
                .order('created_at', { ascending: false });

            // Filter by user in JS if we don't have direct profile-reservation-estadia join easily or just query reservations first
            // But since RLS is likely active, let's just query and filter
            if (staysData) {
                const userStays = staysData.filter(s => s.reservations?.user_id === user.id);
                setPastStays(userStays);
            }



        } catch (err: any) {
            console.error('Erro ao buscar perfil:', err);
            setError(`Não foi possível carregar seus dados: ${err.message || 'Erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDependentStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setHasDependents(value);
        if (value === 'Sim' && formData.dependents.length === 0) {
            setFormData(prev => ({
                ...prev,
                dependents: [{ name: '', birthDate: '', relationship: '' }]
            }));
        } else if (value === 'Não') {
            setFormData(prev => ({
                ...prev,
                dependents: []
            }));
        }
    };

    const addDependent = () => {
        setFormData(prev => ({
            ...prev,
            dependents: [...prev.dependents, { name: '', birthDate: '', relationship: '' }]
        }));
    };

    const removeDependent = (index: number) => {
        const newList = [...formData.dependents];
        newList.splice(index, 1);
        setFormData(prev => ({
            ...prev,
            dependents: newList
        }));
        if (newList.length === 0) {
            setHasDependents('Não');
        }
    };

    const handleDependentChange = (index: number, field: keyof Dependent, value: string) => {
        const newList = [...formData.dependents];
        newList[index] = { ...newList[index], [field]: value };
        setFormData(prev => ({
            ...prev,
            dependents: newList
        }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [id === 'name' ? 'full_name' : id]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    full_name: formData.full_name,
                    cpf: formData.cpf.replace(/\D/g, ''),
                    birth_date: formData.birth_date || null,
                    phone: formData.phone,
                    address_street: formData.address_street,
                    address_number: formData.address_number,
                    address_complement: formData.address_complement,
                    address_neighborhood: formData.address_neighborhood,
                    address_city: formData.address_city,
                    has_house: formData.has_house,
                    house_number: formData.house_number,
                    dependents: formData.dependents,
                    controlid_id: formData.controlid_id || null,
                    email: formData.email 
                })
                .eq('id', user.id);

            if (updateError) throw updateError;

            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 4000);
        } catch (err: any) {
            console.error('Erro ao atualizar perfil:', err);
            setError(err.message || 'Erro ao atualizar dados. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordMessage({ text: 'As senhas não coincidem.', type: 'error' });
            return;
        }
        if (passwordData.newPassword.length < 6) {
            setPasswordMessage({ text: 'A senha deve ter pelo menos 6 caracteres.', type: 'error' });
            return;
        }

        setIsUpdatingPassword(true);
        setPasswordMessage({ text: '', type: '' });

        try {
            const { error } = await supabase.auth.updateUser({ password: passwordData.newPassword });
            if (error) throw error;
            setPasswordMessage({ text: 'Senha atualizada com sucesso!', type: 'success' });
            setPasswordData({ newPassword: '', confirmPassword: '' });
        } catch (err: any) {
            setPasswordMessage({ text: err.message || 'Erro ao atualizar senha.', type: 'error' });
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-farm-700"></div>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Enviado com Sucesso!</h2>
                <p className="text-gray-500">Suas informações cadastrais foram atualizadas.</p>
                <button
                    onClick={() => setSubmitted(false)}
                    className="mt-6 text-farm-600 font-bold hover:underline"
                >
                    Voltar para o formulário
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6 pb-20">
            {/* Tab Navigation */}
            <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 mb-8">

                <button
                    onClick={() => setActiveTab('data')}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'data' ? 'bg-farm-700 text-white shadow-lg shadow-farm-100' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <IconUser className="w-4 h-4" />
                    Meus Dados e Histórico
                </button>
                <button
                    onClick={() => setActiveTab('security')}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'security' ? 'bg-farm-700 text-white shadow-lg shadow-farm-100' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <IconLock className="w-4 h-4" />
                    Segurança
                </button>
            </div>

            {activeTab === 'data' ? (
                /* Profile Form and History */
                <div className="animate-fade-in space-y-6">
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-8 border-b border-gray-100 bg-farm-50/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 font-serif">Dados Cadastrais</h3>
                                <p className="text-gray-500 text-xs">Mantenha seus dados atualizados para facilitar as reservas.</p>
                            </div>
                            <div className="bg-white p-3 rounded-2xl shadow-sm">
                                <IconUser className="w-6 h-6 text-farm-600" />
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-8 space-y-6">
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label htmlFor="name" className="block text-sm font-bold text-gray-700 mb-1.5">Nome Completo</label>
                                    <input
                                        id="name"
                                        type="text"
                                        required
                                        value={formData.full_name}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="cpf" className="block text-sm font-bold text-gray-700 mb-1.5">CPF</label>
                                    <input
                                        id="cpf"
                                        type="text"
                                        required
                                        placeholder="000.000.000-00"
                                        value={formData.cpf}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label htmlFor="birth_date" className="block text-sm font-bold text-gray-700 mb-1.5">Data de Nascimento</label>
                                    <input
                                        id="birth_date"
                                        type="date"
                                        required
                                        value={formData.birth_date}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="auth_email" className="block text-sm font-bold text-gray-700 mb-1.5">E-mail de Acesso (Login)</label>
                                    <input
                                        id="auth_email"
                                        type="email"
                                        disabled
                                        value={authEmail}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-400 cursor-not-allowed"
                                    />
                                    <p className="text-[10px] text-gray-400">O e-mail de login não pode ser alterado por aqui.</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-1.5">E-mail de Contato (Para relatórios e avisos)</label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                />
                                <p className="text-[10px] text-gray-400">Este é o e-mail que aparecerá nos cadastros e relatórios.</p>
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="phone" className="block text-sm font-bold text-gray-700 mb-1.5">Telefone / WhatsApp</label>
                                <input
                                    id="phone"
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="controlid_id" className="block text-sm font-bold text-gray-700 mb-1.5">ID Facial (Biometria)</label>
                                <div className="flex gap-2">
                                    <input
                                        id="controlid_id"
                                        type="text"
                                        value={formData.controlid_id}
                                        onChange={handleInputChange}
                                        placeholder="Ex: 123"
                                        className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => startEnroll('member')}
                                        className="bg-farm-50 text-farm-600 px-4 py-3 rounded-xl border border-farm-200 hover:bg-farm-100 transition-all font-bold text-xs flex items-center gap-1.5"
                                        title="Capturar biometria usando o leitor do escritório"
                                    >
                                        <IconZap className="w-4 h-4 text-farm-500 animate-pulse" /> Capturar Rosto
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-400">Número gerado ao cadastrar seu rosto no aparelho do escritório.</p>
                            </div>

                            {formData.host_name && (
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700">Sócio Responsável (Anfitrião)</label>
                                    <input
                                        type="text"
                                        disabled
                                        value={formData.host_name}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed font-bold"
                                    />
                                    <p className="text-[10px] text-gray-400">Este é o sócio que convidou você para a Fazenda.</p>
                                </div>
                            )}

                            {formData.address_street === '' && legacyAddress && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-6 shadow-sm animate-pulse-subtle">
                                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <span className="bg-amber-200 w-4 h-4 rounded-full flex items-center justify-center text-[8px]">!</span>
                                        Endereço Anterior Detectado
                                    </p>
                                    <p className="text-sm text-amber-900 font-medium italic">{legacyAddress}</p>
                                    <p className="text-[10px] text-amber-700 mt-2 font-bold uppercase tracking-tight">Copie e preencha os campos abaixo para atualizar seu cadastro:</p>
                                </div>
                            )}

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h4 className="text-sm font-bold text-farm-800">Endereço Residencial</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="md:col-span-3 space-y-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Rua / Logradouro</label>
                                        <input
                                            id="address_street"
                                            type="text"
                                            required
                                            value={formData.address_street}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-xs font-medium text-gray-700">Número</label>
                                        <input
                                            id="address_number"
                                            type="text"
                                            required
                                            value={formData.address_number}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Complemento</label>
                                        <input
                                            id="address_complement"
                                            type="text"
                                            value={formData.address_complement}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Bairro</label>
                                        <input
                                            id="address_neighborhood"
                                            type="text"
                                            required
                                            value={formData.address_neighborhood}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Cidade</label>
                                        <input
                                            id="address_city"
                                            type="text"
                                            required
                                            value={formData.address_city}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {(formData.role === 'member' || formData.role === 'consu') && (
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <h4 className="text-sm font-bold text-farm-800">Residência na Fazenda</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <label className="flex items-center gap-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl cursor-pointer hover:bg-blue-100 transition-all select-none">
                                            <input 
                                                type="checkbox" 
                                                id="has_house"
                                                className="w-5 h-5 accent-blue-600" 
                                                checked={formData.has_house} 
                                                onChange={e => setFormData({...formData, has_house: e.target.checked})} 
                                            />
                                            <div>
                                                <span className="block text-sm font-bold text-blue-900">Possuo casa na fazenda</span>
                                                <span className="text-[10px] text-blue-700 uppercase font-medium">Ative se você reside ou possui lote edificado</span>
                                            </div>
                                        </label>

                                        {formData.has_house && (
                                            <div className="space-y-1 animate-in slide-in-from-left-2">
                                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Número da Casa / Lote</label>
                                                <input
                                                    id="house_number"
                                                    type="text"
                                                    value={formData.house_number}
                                                    onChange={handleInputChange}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none font-bold text-farm-700 transition-all"
                                                    placeholder="Ex: 12-A"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <div className="space-y-1">
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Possui Dependentes?</label>
                                    <select
                                        value={hasDependents}
                                        onChange={handleDependentStatusChange}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                    >
                                        <option value="Não">Não</option>
                                        <option value="Sim">Sim</option>
                                    </select>
                                </div>

                                {hasDependents === 'Sim' && (
                                    <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-sm font-bold text-farm-800">Lista de Dependentes</h4>
                                            <button
                                                type="button"
                                                onClick={addDependent}
                                                className="text-xs bg-farm-600 text-white px-3 py-1 rounded-full hover:bg-farm-700 transition-colors"
                                            >
                                                + Adicionar outro
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {formData.dependents.map((dep, idx) => (
                                                <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-white rounded-lg border border-gray-200 relative">
                                                    <div className="space-y-1">
                                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nome do Dependente</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={dep.name}
                                                            onChange={(e) => handleDependentChange(idx, 'name', e.target.value)}
                                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm transition-all"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Data de Nascimento</label>
                                                        <input
                                                            type="date"
                                                            required
                                                            value={dep.birthDate}
                                                            onChange={(e) => handleDependentChange(idx, 'birthDate', e.target.value)}
                                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm transition-all"
                                                        />
                                                    </div>
                                                    <div className="space-y-1 md:col-span-2">
                                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Parentesco</label>
                                                        <select
                                                            required
                                                            value={dep.relationship || ''}
                                                            onChange={(e) => handleDependentChange(idx, 'relationship', e.target.value)}
                                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm bg-white transition-all"
                                                        >
                                                            <option value="">Selecione...</option>
                                                            <option value="Filho(a)">Filho(a)</option>
                                                            <option value="Esposa/Marido">Esposa/Marido</option>
                                                            <option value="Outros">Outros</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1 md:col-span-2">
                                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">ID Facial (Opcional)</label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                placeholder="Ex: 124"
                                                                value={dep.controlid_id || ''}
                                                                onChange={(e) => handleDependentChange(idx, 'controlid_id', e.target.value)}
                                                                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm transition-all bg-white font-mono"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => startEnroll('dependent', dep.name)}
                                                                className="bg-farm-50 text-farm-600 px-3 py-3 rounded-xl border border-farm-200 hover:bg-farm-100 transition-all font-bold text-[10px] flex items-center gap-1"
                                                                title="Capturar biometria usando o leitor do escritório"
                                                            >
                                                                <IconZap className="w-3.5 h-3.5 text-farm-500 animate-pulse" /> Capturar
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeDependent(idx)}
                                                        className="absolute -top-2 -right-2 bg-red-100 text-red-600 w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-200"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-farm-600 hover:bg-farm-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md hover:shadow-xl transform active:scale-[0.98] duration-200 disabled:opacity-50"
                            >
                                {submitting ? 'Salvando...' : 'Atualizar Cadastro'}
                            </button>
                        </form>
                    </div>

                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-8 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-xl font-bold text-farm-900 font-serif mb-4 flex items-center gap-2">
                                🏠 Minhas Estadias Passadas
                            </h3>

                            {pastStays.length === 0 ? (
                                <p className="text-sm text-gray-400 italic">Nenhuma estadia finalizada encontrada.</p>
                            ) : (
                                <div className="space-y-3">
                                    {pastStays.map((stay: any) => (
                                        <div key={stay.id} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center group hover:border-farm-300 transition-all">
                                            <div>
                                                <p className="font-bold text-gray-800">{stay.reservations.accommodation}</p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(stay.reservations.check_in).toLocaleDateString('pt-BR')} — {new Date(stay.reservations.check_out).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setSelectedEstadiaId(stay.id)}
                                                className="flex items-center gap-2 text-farm-700 font-bold text-sm bg-farm-50 px-4 py-2 rounded-lg group-hover:bg-farm-600 group-hover:text-white transition-all shadow-sm"
                                            >
                                                <IconFileText className="w-4 h-4" />
                                                Ver Recibo
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'security' ? (
                /* Security / Password Section */
                <div className="animate-fade-in space-y-6">
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 font-serif">Segurança e Acesso</h3>
                                <p className="text-gray-500 text-xs">Atualize sua senha de acesso ao portal.</p>
                            </div>
                            <div className="bg-white p-3 rounded-2xl shadow-sm">
                                <IconLock className="w-6 h-6 text-farm-600" />
                            </div>
                        </div>

                        <form onSubmit={handleChangePassword} className="p-8 space-y-6">
                            {passwordMessage.text && (
                                <div className={`px-4 py-3 rounded-xl text-sm font-bold ${passwordMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                                    {passwordMessage.text}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="Mínimo 6 caracteres"
                                        value={passwordData.newPassword}
                                        onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700">Confirmar Nova Senha</label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="Digite novamente"
                                        value={passwordData.confirmPassword}
                                        onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isUpdatingPassword}
                                className="w-full bg-farm-800 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-black transition-all disabled:opacity-50"
                            >
                                {isUpdatingPassword ? 'Atualizando...' : 'Alterar Minha Senha'}
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}

            {selectedEstadiaId && (
                <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setSelectedEstadiaId(null)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="max-w-4xl w-full my-8 relative z-10">
                            <VisualizadorProforma
                                estadiaId={selectedEstadiaId}
                                onClose={() => setSelectedEstadiaId(null)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {enrollState.enrolling && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] p-8 max-w-md w-full border border-gray-100 shadow-2xl space-y-6 text-center animate-scale-in">
                        <div className="w-16 h-16 bg-farm-50 text-farm-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
                            <IconZap className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 font-serif">Cadastrando Rosto</h3>
                            <p className="text-sm text-gray-500 mt-2">
                                Capturando a biometria de <span className="font-bold text-farm-600">{enrollState.targetName}</span> no aparelho do Escritório.
                            </p>
                        </div>
                        
                        <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                            <p className="text-xs text-gray-400 font-black uppercase tracking-wider">Status do Leitor</p>
                            {enrollState.status === 'pending' && (
                                <p className="text-sm text-amber-600 font-bold flex items-center justify-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                                    Aguardando leitor receber comando...
                                </p>
                            )}
                            {enrollState.status === 'sent' && (
                                <p className="text-sm text-blue-600 font-bold flex items-center justify-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></span>
                                    Olhe para a câmera do iDFace agora!
                                </p>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={cancelEnroll}
                            className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all"
                        >
                            Cancelar Operação
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

