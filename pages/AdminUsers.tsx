import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconUser, IconCalendar, IconTrash } from '../components/Icons';

interface Profile {
    id: string;
    full_name: string;
    role: string;
    approved: boolean;
    created_at: string;
}

export const AdminUsersPage: React.FC = () => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('pending');

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, role, approved, created_at')
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

    const handleToggleRole = async (id: string, currentRole: string) => {
        const newRole = currentRole === 'admin' ? 'member' : 'admin';
        if (!confirm(`Deseja realmente alterar o papel deste usuário para ${newRole}?`)) return;

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
            alert('Erro ao atualizar papel.');
        }
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if (!confirm(`TEM CERTEZA? Isso excluirá permanentemente o acesso de "${name}". Esta ação não pode ser desfeita.`)) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setProfiles(profiles.filter(p => p.id !== id));
        } catch (err) {
            console.error('Error deleting user:', err);
            alert('Erro ao excluir usuário.');
        }
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
                    <p className="text-gray-500 mt-2 text-lg">Aprovação de novos usuários e gestão de permissões do portal.</p>
                </div>

                <div className="flex bg-white rounded-lg shadow-sm p-1 border border-gray-100">
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
            </header>

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
                    {/* Mobile View: Cards */}
                    <div className="grid grid-cols-1 gap-4 md:hidden">
                        {filteredProfiles.map((profile) => (
                            <div key={profile.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-farm-50 w-12 h-12 rounded-full flex items-center justify-center text-farm-700 font-bold shrink-0">
                                        {profile.full_name?.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-800 truncate">{profile.full_name || 'Usuário sem nome'}</p>
                                        <p className="text-xs text-gray-400 flex items-center gap-1">
                                            <IconCalendar className="w-3 h-3" />
                                            {new Date(profile.created_at).toLocaleDateString('pt-BR')}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteUser(profile.id, profile.full_name)}
                                        className="p-2 text-red-400 hover:text-red-600 bg-red-50 rounded-lg transition-colors"
                                    >
                                        <IconTrash className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50">
                                    <button
                                        onClick={() => handleToggleRole(profile.id, profile.role)}
                                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${profile.role === 'admin'
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-blue-100 text-blue-800'
                                            }`}
                                    >
                                        {profile.role === 'admin' ? 'Administrador' : 'Sócio'}
                                    </button>
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${profile.approved
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {profile.approved ? 'Acesso Liberado' : 'Pendente'}
                                    </span>
                                </div>

                                <button
                                    onClick={() => handleToggleApproval(profile.id, profile.approved)}
                                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${profile.approved
                                        ? 'text-yellow-600 border border-yellow-200 bg-yellow-50'
                                        : 'bg-farm-700 text-white shadow-md'
                                        }`}
                                >
                                    {profile.approved ? 'Bloquear Acesso' : 'Liberar Acesso'}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Desktop View: Table */}
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden hidden md:block">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                        <th className="px-6 py-4 font-semibold">Usuário</th>
                                        <th className="px-6 py-4 font-semibold">Papel</th>
                                        <th className="px-6 py-4 font-semibold">Status de Acesso</th>
                                        <th className="px-6 py-4 font-semibold text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredProfiles.map((profile) => (
                                        <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-farm-50 w-10 h-10 rounded-full flex items-center justify-center text-farm-700 font-bold">
                                                        {profile.full_name?.charAt(0) || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-800">{profile.full_name || 'Usuário sem nome'}</p>
                                                        <p className="text-xs text-gray-400 flex items-center gap-1">
                                                            <IconCalendar className="w-3 h-3" />
                                                            {new Date(profile.created_at).toLocaleDateString('pt-BR')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => handleToggleRole(profile.id, profile.role)}
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${profile.role === 'admin'
                                                        ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                                        : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                                        } transition-colors cursor-pointer`}
                                                    title="Clique para alterar"
                                                >
                                                    {profile.role === 'admin' ? 'Administrador' : 'Sócio'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${profile.approved
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {profile.approved ? 'Acesso Liberado' : 'Aguardando Aprovação'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleToggleApproval(profile.id, profile.approved)}
                                                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${profile.approved
                                                            ? 'text-yellow-600 hover:bg-yellow-50 border border-yellow-100'
                                                            : 'bg-farm-700 text-white hover:bg-farm-800 shadow-sm'
                                                            }`}
                                                    >
                                                        {profile.approved ? 'Bloquear Acesso' : 'Liberar Acesso'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(profile.id, profile.full_name)}
                                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Excluir Usuário"
                                                    >
                                                        <IconTrash className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div >
    );
};

