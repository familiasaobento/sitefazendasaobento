import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconUser, IconCalendar, IconTrash, IconPlus, IconX, IconLoader, IconMail, IconCheck, IconLock, IconEdit, IconDotsVertical } from '../components/Icons';

interface Profile {
    id: string;
    full_name: string;
    role: string;
    approved: boolean;
    created_at: string;
    host_name?: string;
    member_status?: string;
    email?: string;
}

interface NewUser {
    email: string;
    full_name: string;
    role: string;
    member_status: string;
    send_email: boolean;
    cpf: string;
    phone: string;
    birth_date: string;
    address_street: string;
    address_number: string;
    address_complement: string;
    address_neighborhood: string;
    address_city: string;
    has_house: boolean;
    house_number: string;
    host_name: string;
    dependents: { name: string; birthDate: string; relationship: string; }[];
}

export const AdminUsersPage: React.FC = () => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('pending');
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    
    // Admin Registration States
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isFetchingFullProfile, setIsFetchingFullProfile] = useState(false);
    const [registerLoading, setRegisterLoading] = useState(false);
    const [registerError, setRegisterError] = useState('');
    const [registerSuccess, setRegisterSuccess] = useState('');
    
    const initialNewUser: NewUser = {
        email: '',
        full_name: '',
        role: 'member',
        member_status: 'Ativo',
        send_email: false,
        cpf: '',
        phone: '',
        birth_date: '',
        address_street: '',
        address_number: '',
        address_complement: '',
        address_neighborhood: '',
        address_city: '',
        has_house: false,
        house_number: '',
        host_name: '',
        dependents: []
    };

    const [newUser, setNewUser] = useState<NewUser>(initialNewUser);

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, role, approved, created_at, host_name, member_status, email')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProfiles(data || []);
        } catch (err) {
            console.error('Error fetching profiles:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    const handleOpenEditModal = async (profile: Profile) => {
        setIsFetchingFullProfile(true);
        setEditingUserId(profile.id);
        setRegisterError('');
        setRegisterSuccess('');

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', profile.id)
                .single();

            if (error) throw error;

            if (data) {
                setNewUser({
                    email: data.email || '',
                    full_name: data.full_name || '',
                    role: data.role || 'member',
                    member_status: data.member_status || 'Ativo',
                    send_email: false,
                    cpf: data.cpf || '',
                    phone: data.phone || '',
                    birth_date: data.birth_date || '',
                    address_street: data.address_street || data.address || '',
                    address_number: data.address_number || '',
                    address_complement: data.address_complement || '',
                    address_neighborhood: data.address_neighborhood || '',
                    address_city: data.address_city || '',
                    has_house: data.has_house || false,
                    house_number: data.house_number || '',
                    host_name: data.host_name || '',
                    dependents: data.dependents || []
                });
                setIsEditModalOpen(true);
            }
        } catch (err: any) {
            console.error('Error fetching full profile:', err);
            alert('Erro ao carregar dados completos do perfil: ' + err.message);
        } finally {
            setIsFetchingFullProfile(false);
        }
    };

    const handleUpdateProfile = async () => {
        setRegisterLoading(true);
        setRegisterError('');
        setRegisterSuccess('');

        try {
            if (!editingUserId) return;
            const formattedName = toTitleCase(newUser.full_name);

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: formattedName,
                    role: newUser.role,
                    member_status: newUser.member_status,
                    cpf: newUser.cpf,
                    phone: newUser.phone,
                    birth_date: newUser.birth_date || null,
                    address_street: newUser.address_street,
                    address_number: newUser.address_number,
                    address_complement: newUser.address_complement,
                    address_neighborhood: newUser.address_neighborhood,
                    address_city: newUser.address_city,
                    has_house: newUser.has_house,
                    house_number: newUser.house_number,
                    host_name: newUser.host_name,
                    dependents: newUser.dependents
                })
                .eq('id', editingUserId);

            if (error) throw error;

            setRegisterSuccess('Perfil atualizado com sucesso!');
            fetchProfiles(); // Refresh list
            
            setTimeout(() => {
                setIsEditModalOpen(false);
                setEditingUserId(null);
                setNewUser(initialNewUser);
                setRegisterSuccess('');
            }, 1500);

        } catch (err: any) {
            console.error('Error updating profile:', err);
            setRegisterError(err.message || 'Erro ao atualizar perfil.');
        } finally {
            setRegisterLoading(false);
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

    const handleToggleApproval = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ approved: !currentStatus })
                .eq('id', id);

            if (error) throw error;

            setProfiles(profiles.map(p =>
                p.id === id ? { ...p, approved: !currentStatus } : p
            ));
        } catch (err) {
            console.error('Error updating approval:', err);
            alert('Erro ao atualizar status.');
        }
    };

    const handleToggleRole = async (id: string, newRole: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', id);

            if (error) throw error;

            setProfiles(profiles.map(p =>
                p.id === id ? { ...p, role: newRole } : p
            ));
        } catch (err) {
            console.error('Error updating role:', err);
            alert('Erro ao atualizar tipo.');
        }
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
        } catch (err) {
            console.error('Error deleting user:', err);
            alert('Erro ao excluir usuário.');
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
            alert('Erro ao atualizar status do cadastro.');
        }
    };

    const handleSendInvite = async (profile: Profile) => {
        if (!profile.email) {
            alert('Este usuário não possui e-mail.');
            return;
        }
        if (!confirm(`Deseja enviar agora o e-mail de convite para "${profile.full_name}"?`)) return;

        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('admin-register-user', {
                body: { 
                    action: 'send-invite',
                    email: profile.email,
                    full_name: profile.full_name,
                    role: profile.role
                }
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            alert('Convite enviado com sucesso!');
        } catch (err: any) {
            console.error('Error sending invite:', err);
            alert('Erro ao enviar convite: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (email: string) => {
        if (!email) {
            alert('Este usuário não possui e-mail.');
            return;
        }
        if (!confirm(`Enviar link de redefinição de senha para "${email}"?`)) return;

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'https://portal.fazendafamiliasaobento.com.br'
            });
            if (error) throw error;
            alert('E-mail enviado!');
        } catch (err: any) {
            alert('Erro: ' + err.message);
        }
    };

    const handleAdminRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegisterLoading(true);
        setRegisterError('');
        setRegisterSuccess('');

        try {
            const formattedName = toTitleCase(newUser.full_name);
            const { data, error } = await supabase.functions.invoke('admin-register-user', {
                body: { ...newUser, full_name: formattedName, action: 'register' }
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            setRegisterSuccess('Usuário cadastrado com sucesso!');
            setNewUser(initialNewUser);
            fetchProfiles();
            
            setTimeout(() => {
                setIsRegisterModalOpen(false);
                setRegisterSuccess('');
            }, 3000);

        } catch (err: any) {
            console.error('Error registering user:', err);
            setRegisterError(err.message || 'Erro ao cadastrar usuário.');
        } finally {
            setRegisterLoading(false);
        }
    };

    const addDependent = () => {
        setNewUser({
            ...newUser,
            dependents: [...newUser.dependents, { name: '', birthDate: '', relationship: '' }]
        });
    };

    const removeDependent = (index: number) => {
        const newDeps = [...newUser.dependents];
        newDeps.splice(index, 1);
        setNewUser({ ...newUser, dependents: newDeps });
    };

    const updateDependent = (index: number, field: string, value: string) => {
        const newDeps = [...newUser.dependents];
        newDeps[index] = { ...newDeps[index], [field]: value };
        setNewUser({ ...newUser, dependents: newDeps });
    };

    const filteredProfiles = profiles.filter(p => {
        if (filter === 'pending') return !p.approved;
        if (filter === 'approved') return p.approved;
        return true;
    });

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Controle de Acessos</h1>
                    <p className="text-gray-500 mt-2 text-lg">Gestão de usuários e permissões do portal.</p>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => setIsRegisterModalOpen(true)}
                        className="bg-farm-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-farm-800 transition-all shadow-lg shadow-farm-100"
                    >
                        <IconPlus className="w-5 h-5" />
                        Cadastrar Novo
                    </button>
                </div>
            </header>

            <div className="flex bg-white rounded-lg shadow-sm p-1 border border-gray-100 w-fit">
                <button
                    onClick={() => setFilter('pending')}
                    className={`px-4 py-2 rounded-md transition-all ${filter === 'pending' ? 'bg-farm-700 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    Pendentes
                </button>
                <button
                    onClick={() => setFilter('approved')}
                    className={`px-4 py-2 rounded-md transition-all ${filter === 'approved' ? 'bg-farm-700 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    Aprovados
                </button>
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-md transition-all ${filter === 'all' ? 'bg-farm-700 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    Todos
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-farm-700"></div>
                </div>
            ) : filteredProfiles.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
                    <IconUser className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-600">Nenhum registro encontrado</h3>
                    <p className="text-gray-400 mt-2">Nenhum usuário se encaixa no filtro selecionado.</p>
                </div>
            ) : (
                <>
                    {/* Mobile View */}
                    <div className="grid grid-cols-1 gap-4 md:hidden">
                        {filteredProfiles.map((profile) => (
                            <div key={profile.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-farm-50 w-12 h-12 rounded-full flex items-center justify-center text-farm-700 font-bold shrink-0">
                                        {profile.full_name?.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-800 truncate">{profile.full_name || '—'}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                                profile.member_status === 'Ativo' ? 'bg-green-100 text-green-700 border-green-200' :
                                                profile.member_status === 'Inativo' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-orange-100 text-orange-700 border-orange-200'
                                            }`}>
                                                {profile.member_status || 'Ativo'}
                                            </span>
                                            <p className="text-[10px] text-gray-400 truncate">{profile.email}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteUser(profile.id, profile.full_name)}
                                        className="p-2 text-red-400 hover:text-red-600 bg-red-50 rounded-lg"
                                    >
                                        <IconTrash className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleToggleApproval(profile.id, profile.approved)}
                                        className={`py-2 rounded-lg font-bold text-[10px] transition-all ${profile.approved ? 'text-yellow-600 bg-yellow-50' : 'bg-farm-700 text-white'}`}
                                    >
                                        {profile.approved ? 'Bloquear' : 'Liberar'}
                                    </button>
                                    <button
                                        onClick={() => handleOpenEditModal(profile)}
                                        className="py-2 rounded-lg font-bold text-[10px] text-blue-600 bg-blue-50 flex items-center justify-center gap-1"
                                    >
                                        <IconEdit className="w-3 h-3" /> Editar
                                    </button>
                                    <button
                                        onClick={() => handleSendInvite(profile)}
                                        className="py-2 rounded-lg font-bold text-[10px] text-gray-600 bg-gray-100 flex items-center justify-center gap-1"
                                    >
                                        <IconMail className="w-3 h-3" /> Convite
                                    </button>
                                    <button
                                        onClick={() => handleResetPassword(profile.email || '')}
                                        className="py-2 rounded-lg font-bold text-[10px] text-gray-600 bg-gray-100"
                                    >
                                        Senha
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop View */}
                    <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden hidden md:block">
                        <div className="w-full">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="min-w-[1000px] w-full divide-y divide-gray-100">
                                    <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-[10px] uppercase font-black tracking-[0.2em]">
                                        <tr>
                                            <th className="px-6 py-5 text-left">Usuário</th>
                                            <th className="px-6 py-5 text-left">Responsável</th>
                                            <th className="px-6 py-5 text-left">Tipo</th>
                                            <th className="px-6 py-5 text-center">Acesso</th>
                                            <th className="px-6 py-5 text-right pr-8">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredProfiles.map((profile) => (
                                            <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-farm-50 w-10 h-10 rounded-full flex items-center justify-center text-farm-700 font-bold shrink-0">
                                                            {profile.full_name?.charAt(0) || '?'}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800">{profile.full_name || '—'}</p>
                                                            <p className="text-xs text-gray-400">{profile.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{profile.host_name || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={profile.role}
                                                        onChange={(e) => handleToggleRole(profile.id, e.target.value)}
                                                        className="bg-gray-100/50 border-none rounded-lg px-3 py-2 text-[10px] font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-200 transition-all font-sans min-w-[120px]"
                                                    >
                                                        <option value="member">Sócio</option>
                                                        <option value="visitor">Visitante</option>
                                                        <option value="finance">Financeiro</option>
                                                        <option value="finance_manager">Gerente Financeiro</option>
                                                        <option value="accounting">Contabilidade</option>
                                                        <option value="site_admin">Site Admin</option>
                                                        <option value="admin">Admin Geral</option>
                                                        <option value="pdv">Operador PDV</option>
                                                        <option value="consu">CONSU</option>
                                                        <option value="manutencao">Manutenção</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${profile.approved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {profile.approved ? 'Liberado' : 'Pendente'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right pr-8">
                                                    <div className="relative inline-block text-left">
                                                        <button 
                                                            onClick={() => setOpenMenuId(openMenuId === profile.id ? null : profile.id)}
                                                            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                                                            title="Mais opções"
                                                        >
                                                            <IconDotsVertical className="w-5 h-5" />
                                                        </button>
                                                        
                                                        {openMenuId === profile.id && (
                                                            <>
                                                                {/* Backdrop for closing */}
                                                                <div 
                                                                    className="fixed inset-0 z-40" 
                                                                    onClick={() => setOpenMenuId(null)}
                                                                ></div>
                                                                
                                                                <div className="absolute right-0 mt-2 w-56 rounded-2xl shadow-2xl bg-white border border-gray-100 ring-1 ring-black ring-opacity-5 focus:outline-none z-50 overflow-hidden divide-y divide-gray-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                                                    <div className="py-1">
                                                                        <button
                                                                            onClick={() => { handleToggleApproval(profile.id, profile.approved); setOpenMenuId(null); }}
                                                                            className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-bold transition-colors ${profile.approved ? 'text-yellow-600 hover:bg-yellow-50' : 'text-farm-700 hover:bg-farm-50'}`}
                                                                        >
                                                                            <IconCheck className="w-4 h-4" /> {profile.approved ? 'Bloquear Acesso' : 'Liberar Acesso'}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { handleOpenEditModal(profile); setOpenMenuId(null); }}
                                                                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                                                                        >
                                                                            <IconEdit className="w-4 h-4 text-blue-500" /> Editar Perfil
                                                                        </button>
                                                                    </div>
                                                                    <div className="py-1">
                                                                        <button
                                                                            onClick={() => { handleSendInvite(profile); setOpenMenuId(null); }}
                                                                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                                                                        >
                                                                            <IconMail className="w-4 h-4 text-green-500" /> Reenviar Convite
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { handleResetPassword(profile.email || ''); setOpenMenuId(null); }}
                                                                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                                                                        >
                                                                            <IconLock className="w-4 h-4 text-amber-500" /> Redefinir Senha
                                                                        </button>
                                                                    </div>
                                                                    <div className="py-1">
                                                                        <button
                                                                            onClick={() => { handleDeleteUser(profile.id, profile.full_name); setOpenMenuId(null); }}
                                                                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 font-bold transition-colors"
                                                                        >
                                                                            <IconTrash className="w-4 h-4" /> Excluir Conta
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Registration/Edit Modal - FULL PROFILE VERSION */}
            {(isRegisterModalOpen || isEditModalOpen) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full my-8 overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                        <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 font-serif">
                                    {isEditModalOpen ? 'Editar Perfil de Usuário' : 'Cadastro Completo de Usuário'}
                                </h3>
                                <p className="text-gray-500 text-sm">
                                    {isEditModalOpen ? 'Atualize as informações cadastrais do perfil.' : 'Pré-preenchimento de todos os dados do perfil.'}
                                </p>
                            </div>
                            <button onClick={() => { setIsRegisterModalOpen(false); setIsEditModalOpen(false); setEditingUserId(null); setNewUser(initialNewUser); }} className="p-2 hover:bg-white rounded-xl">
                                <IconX className="w-6 h-6 text-gray-400" />
                            </button>
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); isEditModalOpen ? handleUpdateProfile() : handleAdminRegister(e); }} className="overflow-y-auto p-8 space-y-8 flex-1">
                            {registerError && <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm font-bold">{registerError}</div>}
                            {registerSuccess && <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm font-bold">{registerSuccess}</div>}
                            
                            {/* Seção 1: Acesso e Identidade */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-black text-farm-700 uppercase tracking-widest border-l-4 border-farm-500 pl-3">Acesso e Identidade</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Nome Completo</label>
                                        <input type="text" required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none" value={newUser.full_name} onChange={e => setNewUser({...newUser, full_name: e.target.value})} placeholder="Ex: João da Silva" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">E-mail</label>
                                        <input 
                                            type="email" 
                                            required 
                                            disabled={isEditModalOpen}
                                            className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none ${isEditModalOpen ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`} 
                                            value={newUser.email} 
                                            onChange={e => setNewUser({...newUser, email: e.target.value})} 
                                            placeholder="joao@email.com" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">CPF</label>
                                        <input type="text" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none" value={newUser.cpf} onChange={e => setNewUser({...newUser, cpf: e.target.value})} placeholder="000.000.000-00" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Data de Nascimento</label>
                                        <input type="date" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none" value={newUser.birth_date} onChange={e => setNewUser({...newUser, birth_date: e.target.value})} />
                                    </div>
                                </div>
                            </div>

                            {/* Seção 2: Contato e Localização */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-black text-farm-700 uppercase tracking-widest border-l-4 border-farm-500 pl-3">Contato e Localização</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Telefone / WhatsApp</label>
                                        <input type="text" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} placeholder="(00) 00000-0000" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Responsável (Sócio Anfitrião se Visitante)</label>
                                        <input type="text" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none" value={newUser.host_name} onChange={e => setNewUser({...newUser, host_name: e.target.value})} placeholder="Nome do Sócio" />
                                    </div>
                                    <div className="md:col-span-2 space-y-4 pt-4 border-t border-gray-100">
                                        <h4 className="text-sm font-bold text-farm-800">Endereço Residencial Completo</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="md:col-span-3 space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Rua / Logradouro</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUser.address_street}
                                                    onChange={e => setNewUser({ ...newUser, address_street: e.target.value })}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                                    placeholder="Rua, Av., etc"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Número</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUser.address_number}
                                                    onChange={e => setNewUser({ ...newUser, address_number: e.target.value })}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                                    placeholder="123"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Complemento</label>
                                                <input
                                                    type="text"
                                                    value={newUser.address_complement}
                                                    onChange={e => setNewUser({ ...newUser, address_complement: e.target.value })}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                                    placeholder="Apto, Bloco, etc"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Bairro</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUser.address_neighborhood}
                                                    onChange={e => setNewUser({ ...newUser, address_neighborhood: e.target.value })}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                                    placeholder="Centro"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Cidade</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newUser.address_city}
                                                    onChange={e => setNewUser({ ...newUser, address_city: e.target.value })}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                                    placeholder="São Paulo"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {newUser.role === 'member' && (
                                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                                            <div className="flex items-center">
                                                <label className="flex items-center gap-3 p-3 bg-white border border-blue-200 rounded-xl w-full cursor-pointer hover:bg-blue-50 transition-all select-none shadow-sm">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-5 h-5 accent-blue-600" 
                                                        checked={newUser.has_house} 
                                                        onChange={e => setNewUser({...newUser, has_house: e.target.checked})} 
                                                    />
                                                    <span className="text-xs font-bold text-blue-800 leading-tight">Possui casa na fazenda?</span>
                                                </label>
                                            </div>
                                            {newUser.has_house && (
                                                <div className="animate-in slide-in-from-left-2">
                                                    <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Número da Casa</label>
                                                    <input
                                                        type="text"
                                                        value={newUser.house_number}
                                                        onChange={e => setNewUser({ ...newUser, house_number: e.target.value })}
                                                        className="w-full px-4 py-3 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-blue-900 bg-white"
                                                        placeholder="Ex: 12-A"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Seção 3: Configurações de Acesso */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-black text-farm-700 uppercase tracking-widest border-l-4 border-farm-500 pl-3">Configurações de Acesso</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Perfil</label>
                                        <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none bg-white font-sans" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                                            <option value="member">Sócio</option>
                                            <option value="visitor">Visitante</option>
                                            <option value="finance">Financeiro</option>
                                            <option value="finance_manager">Gerente Financeiro</option>
                                            <option value="accounting">Contabilidade</option>
                                            <option value="site_admin">Site Admin</option>
                                            <option value="admin">Admin Geral</option>
                                            <option value="pdv">Operador PDV</option>
                                            <option value="consu">CONSU</option>
                                            <option value="manutencao">Manutenção</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-400 mb-1">Situação (Gerenciar em Sócios)</label>
                                        <div className={`w-full px-4 py-3 border rounded-xl font-bold text-sm ${
                                            newUser.member_status === 'Ativo' ? 'bg-green-50 text-green-700 border-green-200' :
                                            newUser.member_status === 'Inativo' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                                        }`}>
                                            {newUser.member_status === 'Ativo' ? '🟢 Ativo' : 
                                             newUser.member_status === 'Inativo' ? '🔴 Inativo' : '🟠 Licença'}
                                        </div>
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-3 p-3 bg-farm-50 border border-farm-100 rounded-xl w-full cursor-pointer hover:bg-farm-100 transition-all select-none border-dashed">
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 accent-farm-600" 
                                                checked={newUser.send_email} 
                                                onChange={e => setNewUser({...newUser, send_email: e.target.checked})} 
                                            />
                                            <span className="text-xs font-bold text-farm-800 leading-tight">Enviar convite por e-mail AGORA</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Seção 4: Dependentes */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-sm font-black text-farm-700 uppercase tracking-widest border-l-4 border-farm-500 pl-3">Dependentes</h4>
                                    <button type="button" onClick={addDependent} className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-1">
                                        <IconPlus className="w-3 h-3" /> Adicionar
                                    </button>
                                </div>
                                {newUser.dependents.length === 0 ? (
                                    <div className="text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                                        Nenhum dependente adicionado.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {newUser.dependents.map((dep, idx) => (
                                            <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 relative group">
                                                <input type="text" className="px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-farm-500 text-sm" placeholder="Nome" value={dep.name} onChange={e => updateDependent(idx, 'name', e.target.value)} />
                                                <input type="date" className="px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-farm-500 text-sm" value={dep.birthDate} onChange={e => updateDependent(idx, 'birthDate', e.target.value)} />
                                                <select className="px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-farm-500 text-sm bg-white font-sans" value={dep.relationship} onChange={e => updateDependent(idx, 'relationship', e.target.value)}>
                                                    <option value="">Parentesco</option>
                                                    <option value="Cônjuge">Cônjuge</option>
                                                    <option value="Filho(a)">Filho(a)</option>
                                                    <option value="Pai/Mãe">Pai/Mãe</option>
                                                    <option value="Outro">Outro</option>
                                                </select>
                                                <div className="flex items-center justify-end">
                                                    <button type="button" onClick={() => removeDependent(idx)} className="p-2 text-red-400 hover:text-red-600 bg-white rounded-lg shadow-sm border border-gray-100">
                                                        <IconTrash className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </form>

                        <div className="p-8 border-t border-gray-100 bg-gray-50 shrink-0">
                            <button 
                                type="button" 
                                onClick={isEditModalOpen ? handleUpdateProfile : handleAdminRegister} 
                                disabled={registerLoading || (!!registerSuccess && !isEditModalOpen && !isRegisterModalOpen)} 
                                className={`w-full ${isEditModalOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-farm-800 hover:bg-black'} text-white font-bold py-4 rounded-2xl shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-lg`}
                            >
                                {registerLoading ? <IconLoader className="w-6 h-6 animate-spin" /> : isEditModalOpen ? <IconEdit className="w-6 h-6" /> : <IconCheck className="w-6 h-6" />}
                                {registerLoading ? 'Processando...' : isEditModalOpen ? 'Salvar Alterações' : 'Salvar Cadastro e Finalizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
