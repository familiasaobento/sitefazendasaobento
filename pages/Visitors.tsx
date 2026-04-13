import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconUser, IconPhone, IconTrash } from '../components/Icons';

interface ReservationData {
    id: number;
    check_in: string;
    check_out: string;
    status: string;
    accommodation: string;
    admin_notes?: string;
}

interface VisitorProfile {
    id: string;
    full_name: string;
    role: string;
    approved: boolean;
    created_at: string;
    email?: string;
    // Data from most recent reservation if available
    cpf?: string;
    phone?: string;
    host_name?: string;
    guests_details?: { name: string; age: string }[];
    notes?: string;
    history: ReservationData[];
}

export const VisitorsPage: React.FC = () => {
    const [visitors, setVisitors] = useState<VisitorProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [expandedVisitor, setExpandedVisitor] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);

    const fetchVisitors = async () => {
        setLoading(true);
        try {
            // First get all visitor profiles
            const { data: profiles, error: pError } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'visitor')
                .order('full_name', { ascending: true });

            if (pError) throw pError;

            // Then get their reservations to extract more info
            const { data: reservations, error: rError } = await supabase
                .from('reservations')
                .select('*')
                .order('check_in', { ascending: false });

            if (rError) throw rError;

            const enrichedVisitors = (profiles || []).map(profile => {
                // Get all reservations for this visitor
                const myRes = (reservations || []).filter(r => r.user_id === profile.id);
                // Find most recent for main details
                const lastRes = myRes[0];

                let visitorData: VisitorProfile = {
                    ...profile,
                    cpf: profile.cpf || '—',
                    phone: profile.phone || '—',
                    host_name: profile.host_name || '—',
                    guests_details: [],
                    notes: '',
                    history: myRes.map(r => ({
                        id: r.id,
                        check_in: r.check_in,
                        check_out: r.check_out,
                        status: r.status,
                        accommodation: r.accommodation,
                        admin_notes: r.admin_notes
                    }))
                };

                if (lastRes) {
                    const notes = lastRes.notes || '';
                    
                    // Prioritize host_name from profile, then from notes regex, then from reservation name (though res.name is usually visitor name)
                    if (visitorData.host_name === '—') {
                        const hostMatch = notes.match(/Anfitrião:\s*(.*?)(?:\.|$)/i);
                        visitorData.host_name = hostMatch ? hostMatch[1].trim() : '—';
                    }

                    if (visitorData.cpf === '—') {
                        const cpfMatch = notes.match(/CPF:\s*(.*)/i);
                        visitorData.cpf = cpfMatch ? cpfMatch[1].trim() : '—';
                    }
                    if (visitorData.phone === '—') {
                        const phoneMatch = notes.match(/Telefone:\s*(.*)/i);
                        visitorData.phone = phoneMatch ? phoneMatch[1].trim() : '—';
                    }
                    visitorData.guests_details = lastRes.guests_details || [];
                    visitorData.notes = notes;
                }

                return visitorData;
            });

            setVisitors(enrichedVisitors);
        } catch (err) {
            console.error('Error fetching visitors:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVisitors();
        checkAdmin();
    }, []);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            setIsAdmin(profile?.role === 'admin');
        }
    };

    const handleDeleteVisitor = async (id: string, name: string) => {
        if (!confirm(`TEM CERTEZA? Isso excluirá permanentemente o acesso e histórico de "${name}". Esta ação não pode ser desfeita.`)) return;

        try {
            const { error } = await supabase.rpc('delete_user_account', { target_user_id: id });
            if (error) {
                const fallbackResponse = await supabase.from('profiles').delete().eq('id', id);
                if (fallbackResponse.error) throw fallbackResponse.error;
            }
            setVisitors(visitors.filter(v => v.id !== id));
            alert('Cadastro de visitante excluído com sucesso.');
        } catch (err) {
            console.error('Error deleting visitor:', err);
            alert('Erro ao excluir visitante.');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
    };

    const filteredVisitors = visitors.filter(v =>
        v.full_name?.toLowerCase().includes(filter.toLowerCase()) ||
        v.cpf?.includes(filter)
    );

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Cadastro de Visitantes</h1>
                    <p className="text-gray-500 mt-2 text-lg">Gerencie as informações e histórico completo dos visitantes.</p>
                </div>

                <div>
                    <input
                        type="text"
                        placeholder="Nome ou CPF..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none w-full md:w-64 transition-all"
                    />
                </div>
            </header>
            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-farm-700"></div>
                </div>
            ) : filteredVisitors.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
                    <IconUser className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-600">Nenhum visitante encontrado</h3>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Desktop Table View */}
                    <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden hidden md:block">
                        <div className="w-full">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left min-w-[1200px] divide-y divide-gray-100">
                                    <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">
                                        <tr>
                                            <th className="px-6 py-5 text-left">Visitante</th>
                                            <th className="px-6 py-5 text-left">Identificação</th>
                                            <th className="px-6 py-5 text-left">Responsável</th>
                                            <th className="px-6 py-5 text-left">Histórico</th>
                                            <th className="px-6 py-5 text-right pr-8">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredVisitors.map((visitor) => (
                                            <tr key={visitor.id} className="hover:bg-gray-50/50 transition-colors align-top">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-blue-50 w-10 h-10 rounded-full flex items-center justify-center text-blue-700 font-bold shrink-0">
                                                            {visitor.full_name?.charAt(0) || '?'}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800">{visitor.full_name || 'Visitante'}</p>
                                                            <p className="text-xs text-gray-400">{visitor.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap" title={visitor.cpf}>
                                                    <p className="text-sm font-mono text-gray-600">
                                                        {visitor.cpf && visitor.cpf.replace(/\D/g, '').length === 11 
                                                            ? visitor.cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
                                                            : visitor.cpf}
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-1">{visitor.phone}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-medium text-gray-700">{visitor.host_name}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="space-y-2">
                                                        {visitor.history.length === 0 ? (
                                                            <span className="text-xs text-gray-300 italic">Nenhuma reserva</span>
                                                        ) : (
                                                            <div className="max-h-32 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                                                                {visitor.history.map((h, i) => (
                                                                    <div key={h.id} className="text-[10px] bg-white border border-gray-100 p-1.5 rounded flex justify-between items-center gap-4">
                                                                        <div className="flex-1">
                                                                            <span className="font-bold text-gray-700">{formatDate(h.check_in)}</span>
                                                                            <span className="mx-1">à</span>
                                                                            <span className="font-bold text-gray-700">{formatDate(h.check_out)}</span>
                                                                        </div>
                                                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${h.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                                                                h.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                                            }`}>
                                                                            {h.status === 'confirmed' ? 'Confirmada' : h.status === 'rejected' ? 'RECUSADA' : 'AGUARDANDO'}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => handleDeleteVisitor(visitor.id, visitor.full_name)}
                                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Excluir Visitante"
                                                        >
                                                            <IconTrash className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden space-y-4">
                        {filteredVisitors.map((visitor) => (
                            <div key={visitor.id} className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-gray-100 space-y-3">
                                <div className="flex items-center gap-3 border-b border-gray-50 pb-3">
                                    <div className="bg-blue-50 w-12 h-12 rounded-full flex items-center justify-center text-blue-700 font-bold text-xl">
                                        {visitor.full_name?.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-900">{visitor.full_name}</p>
                                        <p className="text-xs text-gray-500">{visitor.email}</p>
                                    </div>
                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDeleteVisitor(visitor.id, visitor.full_name)}
                                            className="p-2 text-red-500 bg-red-50 rounded-lg"
                                        >
                                            <IconTrash className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-y-3 text-xs">
                                    <div>
                                        <p className="text-gray-400 font-bold uppercase text-[9px]">Anfitrião</p>
                                        <p className="text-gray-800">{visitor.host_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 font-bold uppercase text-[9px]">CPF</p>
                                        <p className="text-gray-800 font-mono">
                                            {visitor.cpf && visitor.cpf.replace(/\D/g, '').length === 11 
                                                ? visitor.cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
                                                : visitor.cpf}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 font-bold uppercase text-[9px]">Telefone</p>
                                        <p className="text-gray-800">{visitor.phone}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 font-bold uppercase text-[9px]">Visitas</p>
                                        <p className="text-gray-800">{visitor.history.filter(h => h.status === 'confirmed').length}</p>
                                    </div>
                                </div>

                                {/* Expandable History for Mobile */}
                                {visitor.history.length > 0 && (
                                    <div className="pt-2">
                                        <button
                                            onClick={() => setExpandedVisitor(expandedVisitor === visitor.id ? null : visitor.id)}
                                            className="w-full bg-gray-50 py-2 rounded-xl text-[10px] font-bold text-gray-500 hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                                        >
                                            {expandedVisitor === visitor.id ? 'Ocultar Histórico' : 'Ver Histórico Completo'}
                                        </button>

                                        {expandedVisitor === visitor.id && (
                                            <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-300">
                                                {visitor.history.map((h) => (
                                                    <div key={h.id} className="bg-white border border-gray-100 p-2 rounded-xl text-[10px] flex justify-between items-center shadow-sm">
                                                        <div>
                                                            <p className="font-bold text-gray-700">{formatDate(h.check_in)} — {formatDate(h.check_out)}</p>
                                                            <p className="text-gray-400">{h.accommodation || 'Acomodação'}</p>
                                                        </div>
                                                        <span className={`px-1.5 py-0.5 rounded-lg text-[8px] font-black uppercase ${h.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                                                h.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {h.status === 'confirmed' ? 'Confirmada' : h.status === 'rejected' ? 'Recusada' : 'Pendente'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
