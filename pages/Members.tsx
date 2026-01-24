import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { IconUser, IconPrinter, IconTrash, IconPhone, IconMail, IconCalendar } from '../components/Icons';

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
    email?: string;
    dependents?: Dependent[];
}

export const MembersPage: React.FC = () => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [printMode, setPrintMode] = useState<'simple' | 'detailed'>('simple');
    const [filter, setFilter] = useState<string>('');
    const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('full_name', { ascending: true });

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

    const handlePrint = (mode: 'simple' | 'detailed') => {
        setPrintMode(mode);
        setTimeout(() => {
            window.print();
        }, 100);
    };

    const filteredProfiles = profiles.filter(p =>
        p.full_name?.toLowerCase().includes(filter.toLowerCase()) ||
        p.cpf?.includes(filter)
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
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Cadastros dos Sócios</h1>
                    <p className="text-gray-500 mt-2 text-lg">Consulte e imprima os dados completos dos sócios.</p>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <input
                        type="text"
                        placeholder="Buscar por nome ou CPF..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none w-full md:w-64"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => handlePrint('simple')}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <IconPrinter className="w-5 h-5" />
                            Lista Simples
                        </button>
                        <button
                            onClick={() => handlePrint('detailed')}
                            className="bg-farm-700 hover:bg-farm-800 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <IconPrinter className="w-5 h-5" />
                            Lista Completa
                        </button>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center p-12 print:hidden">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-farm-700"></div>
                </div>
            ) : filteredProfiles.length === 0 ? (
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
                                        <p className="font-bold text-gray-900 truncate">{profile.full_name || 'Sem nome'}</p>
                                        <p className="text-xs text-gray-400 font-mono">{profile.cpf || 'CPF não informado'}</p>
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
                                </div>

                                {profile.address && (
                                    <div className="bg-gray-50 p-2 rounded-lg">
                                        <p className="text-gray-400 uppercase font-bold text-[10px] mb-1">Endereço</p>
                                        <p className="text-gray-700 text-xs leading-tight">{profile.address}</p>
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
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden print:hidden hidden md:block">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                        <th className="px-6 py-4 font-semibold">Sócio</th>
                                        <th className="px-6 py-4 font-semibold">CPF</th>
                                        <th className="px-6 py-4 font-semibold">Contato</th>
                                        <th className="px-6 py-4 font-semibold">E-mail</th>
                                        <th className="px-6 py-4 font-semibold">Dependentes</th>
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
                                                            <p className="font-bold text-gray-800">{profile.full_name || 'Sem nome'}</p>
                                                            {profile.address && (
                                                                <p className="text-xs text-gray-400 mt-0.5 leading-tight" title={profile.address}>{profile.address}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                                                    {profile.cpf || '—'}
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
                                                    {profile.dependents && profile.dependents.length > 0 ? (
                                                        <button
                                                            onClick={() => toggleExpanded(profile.id)}
                                                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${expandedProfileId === profile.id
                                                                ? 'bg-blue-200 text-blue-900 ring-2 ring-blue-500 ring-offset-1'
                                                                : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                                                }`}
                                                        >
                                                            {profile.dependents.length} dependentes
                                                            <svg
                                                                className={`w-3 h-3 transition-transform ${expandedProfileId === profile.id ? 'rotate-180' : ''}`}
                                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-400 text-sm italic">Nenhum</span>
                                                    )}
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
    );
};
