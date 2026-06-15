import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconFileText, IconCheck, IconPlus, IconLoader, IconEdit } from './Icons';

interface Session {
    id: number;
    nome_arquivo: string;
    mapping: any;
    criado_em: string;
    atualizado_em: string;
    transacoes: any[];
}

interface ReconciliationSessionsProps {
    onClose: () => void;
    onSelectSession: (id: number | null) => void;
}

export const ReconciliationSessions: React.FC<ReconciliationSessionsProps> = ({ onClose, onSelectSession }) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingName, setEditingName] = useState<number | null>(null);
    const [tempName, setTempName] = useState("");

    useEffect(() => {
        const fetchSessions = async () => {
            const { data, error } = await supabase
                .from('conciliacao_pendente')
                .select('*')
                .order('atualizado_em', { ascending: false });
            
            if (data) {
                setSessions(data.filter(s => s.transacoes && s.transacoes.length > 0));
            }
            setLoading(false);
        };
        fetchSessions();
    }, []);

    const formatMonthYear = (mapping: any) => {
        if (mapping?.mes_referencia) return mapping.mes_referencia;
        return "Mês Desconhecido";
    };

    const getStatus = (mapping: any) => {
        return mapping?.status === 'concluida' ? 'Concluída' : 'Pendente';
    };

    const handleSaveName = async (session: Session) => {
        const updatedMapping = { ...session.mapping, nome_sessao: tempName || formatMonthYear(session.mapping) };
        await supabase.from('conciliacao_pendente').update({ mapping: updatedMapping }).eq('id', session.id);
        setSessions(sessions.map(s => s.id === session.id ? { ...s, mapping: updatedMapping } : s));
        setEditingName(null);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            
            <div className="bg-gray-100 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] relative z-10">
                <header className="p-6 border-b flex justify-between items-center bg-farm-900 text-white">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/10 p-3 rounded-2xl">
                            <IconFileText className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold font-serif italic text-farm-50">Sessões de Conciliação</h3>
                            <p className="text-farm-200 text-xs">Gerencie suas conciliações mensais.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
                    <div className="flex justify-between items-center">
                        <h4 className="font-bold text-gray-700">Seu Histórico</h4>
                        <button 
                            onClick={() => onSelectSession(null)}
                            className="bg-farm-600 hover:bg-farm-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-colors text-sm"
                        >
                            <IconPlus className="w-4 h-4" /> Nova Conciliação
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12"><IconLoader className="w-8 h-8 animate-spin text-farm-600" /></div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
                            <IconFileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h5 className="font-bold text-gray-600">Nenhuma sessão encontrada</h5>
                            <p className="text-gray-400 text-sm mt-2">Você ainda não possui conciliações salvas.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {sessions.map(session => {
                                const status = getStatus(session.mapping);
                                const isConcluida = status === 'Concluída';
                                const totalItems = session.transacoes.length;
                                const matchedItems = session.transacoes.filter(t => t.status === 'matched').length;
                                const progress = Math.round((matchedItems / totalItems) * 100) || 0;

                                return (
                                    <div key={session.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 mr-4">
                                                {editingName === session.id ? (
                                                    <input
                                                        autoFocus
                                                        className="w-full text-lg font-bold text-gray-800 border-b-2 border-farm-500 outline-none bg-transparent"
                                                        value={tempName}
                                                        onChange={e => setTempName(e.target.value)}
                                                        onBlur={() => handleSaveName(session)}
                                                        onKeyDown={e => e.key === 'Enter' && handleSaveName(session)}
                                                    />
                                                ) : (
                                                    <h5 
                                                        className="font-bold text-gray-800 text-lg cursor-pointer hover:text-farm-600 flex items-center gap-2 group" 
                                                        onClick={() => { setEditingName(session.id); setTempName(session.mapping?.nome_sessao || formatMonthYear(session.mapping)); }}
                                                        title="Clique para renomear"
                                                    >
                                                        {session.mapping?.nome_sessao || formatMonthYear(session.mapping)} 
                                                        <IconEdit className="w-4 h-4 text-gray-300 group-hover:text-farm-500 transition-colors" />
                                                    </h5>
                                                )}
                                                <p className="text-xs text-gray-500 mt-1 truncate" title={session.nome_arquivo}>
                                                    {session.nome_arquivo}
                                                </p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase whitespace-nowrap ${isConcluida ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {status}
                                            </span>
                                        </div>

                                        <div>
                                            <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                                <span>Progresso</span>
                                                <span>{progress}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2">
                                                <div className={`h-2 rounded-full ${isConcluida ? 'bg-green-500' : 'bg-farm-500'}`} style={{ width: `${progress}%` }}></div>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">{matchedItems} de {totalItems} itens conciliados</p>
                                        </div>

                                        <div className="mt-auto pt-2 border-t border-gray-50 flex gap-2">
                                            <button 
                                                onClick={() => onSelectSession(session.id)}
                                                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                                                    isConcluida 
                                                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' 
                                                    : 'bg-farm-50 hover:bg-farm-100 text-farm-700'
                                                }`}
                                            >
                                                {isConcluida ? 'Visualizar Auditoria' : 'Continuar'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
