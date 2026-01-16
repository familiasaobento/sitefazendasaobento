import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Dependent {
    name: string;
    birthDate: string;
}

interface ProfileData {
    full_name: string;
    cpf: string;
    birth_date: string;
    phone: string;
    address: string;
    dependents: Dependent[];
}

export const ProfilePage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');

    const [formData, setFormData] = useState<ProfileData>({
        full_name: '',
        cpf: '',
        birth_date: '',
        phone: '',
        address: '',
        dependents: []
    });

    const [hasDependents, setHasDependents] = useState<string>('Não');

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setEmail(user.email || '');

            const { data, error } = await supabase
                .from('profiles')
                .select('full_name, cpf, birth_date, phone, address, dependents')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (data) {
                setFormData({
                    full_name: data.full_name || '',
                    cpf: data.cpf || '',
                    birth_date: data.birth_date || '',
                    phone: data.phone || '',
                    address: data.address || '',
                    dependents: data.dependents || []
                });
                setHasDependents(data.dependents && data.dependents.length > 0 ? 'Sim' : 'Não');
            }
        } catch (err: any) {
            console.error('Erro ao buscar perfil:', err);
            setError('Não foi possível carregar seus dados.');
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
                dependents: [{ name: '', birthDate: '' }]
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
            dependents: [...prev.dependents, { name: '', birthDate: '' }]
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
                    cpf: formData.cpf,
                    birth_date: formData.birth_date || null,
                    phone: formData.phone,
                    address: formData.address,
                    dependents: formData.dependents
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
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-100 bg-farm-50">
                <h2 className="text-2xl font-bold text-farm-900 font-serif">Atualização Cadastral</h2>
                <p className="text-gray-600 mt-1">Mantenha seus dados e de seus dependentes atualizados.</p>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome Completo</label>
                        <input
                            id="name"
                            type="text"
                            required
                            value={formData.full_name}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="cpf" className="block text-sm font-medium text-gray-700">CPF</label>
                        <input
                            id="cpf"
                            type="text"
                            required
                            placeholder="000.000.000-00"
                            value={formData.cpf}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <label htmlFor="birth_date" className="block text-sm font-medium text-gray-700">Data de Nascimento</label>
                        <input
                            id="birth_date"
                            type="date"
                            required
                            value={formData.birth_date}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">E-mail</label>
                        <input
                            id="email"
                            type="email"
                            disabled
                            value={email}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                        />
                        <p className="text-[10px] text-gray-400">O e-mail não pode ser alterado por aqui.</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Telefone / WhatsApp</label>
                    <input
                        id="phone"
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                    />
                </div>

                <div className="space-y-1">
                    <label htmlFor="address" className="block text-sm font-medium text-gray-700">Endereço Atual</label>
                    <input
                        id="address"
                        type="text"
                        required
                        value={formData.address}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                    />
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-700">Possui Dependentes?</label>
                        <select
                            value={hasDependents}
                            onChange={handleDependentStatusChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none bg-white"
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
                                            <label className="block text-xs font-semibold text-gray-500">Nome do Dependente</label>
                                            <input
                                                type="text"
                                                required
                                                value={dep.name}
                                                onChange={(e) => handleDependentChange(idx, 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500">Data de Nascimento</label>
                                            <input
                                                type="date"
                                                required
                                                value={dep.birthDate}
                                                onChange={(e) => handleDependentChange(idx, 'birthDate', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                            />
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
    );
};
