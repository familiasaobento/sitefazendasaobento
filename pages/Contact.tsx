import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconMail, IconUser, IconCalendar, IconLoader, IconTrash } from '../components/Icons';

interface Message {
    id: number;
    user_id: string;
    type: string;
    subject: string;
    message: string;
    created_at: string;
    department?: string;
    profiles?: {
        full_name: string;
    };
}

export const ContactPage: React.FC<{
    userRole: string;
    canViewMessages: boolean;
}> = ({ userRole, canViewMessages }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [fetchingMessages, setFetchingMessages] = useState(false);
    const [type, setType] = useState('Sugestão');
    const [department, setDepartment] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'view' | 'send'>(canViewMessages ? 'view' : 'send');

    useEffect(() => {
        if (canViewMessages) {
            fetchMessages();
        }
    }, [canViewMessages]);

    const fetchMessages = async () => {
        setFetchingMessages(true);
        try {
            // Buscamos todas as mensagens e trazemos o nome do sócio da tabela profiles.
            // As políticas de RLS no banco filtrarão os dados automaticamente com base no perfil logado.
            const { data, error } = await supabase
                .from('contact_messages')
                .select(`
                    *,
                    profiles ( full_name )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedMessages = (data || []).map((msg: any) => ({
                ...msg,
                profiles: Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles
            }));

            setMessages(formattedMessages);
        } catch (err: any) {
            console.error('Erro ao carregar mensagens:', err);
            setError(`Erro ao carregar mensagens: ${err.message}`);
        } finally {
            setFetchingMessages(false);
        }
    };

    const handleDeleteMessage = async (id: number) => {
        if (!confirm('Deseja realmente excluir esta mensagem permanentemente?')) return;

        try {
            const { error } = await supabase
                .from('contact_messages')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setMessages(messages.filter(msg => msg.id !== id));
        } catch (err: any) {
            console.error('Erro ao excluir mensagem:', err);
            alert('Erro ao excluir mensagem.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { error: insertError } = await supabase
                .from('contact_messages')
                .insert([{
                    user_id: user?.id,
                    type,
                    subject,
                    message,
                    department: department || null
                }]);

            if (insertError) throw insertError;

            setSubmitted(true);
            setSubject('');
            setMessage('');
            setDepartment('');
            setTimeout(() => setSubmitted(false), 5000);
        } catch (err: any) {
            console.error('Erro ao enviar mensagem:', err);
            setError('Ocorreu um erro ao enviar sua mensagem. Tente novamente mais tarde.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Contatos e Sugestões</h1>
                    <p className="text-gray-500 mt-2 text-lg">
                        {canViewMessages 
                            ? 'Gerencie as comunicações enviadas pelos sócios e visitantes.'
                            : 'Envie sua mensagem direta para a administração da fazenda.'}
                    </p>
                </div>
            </header>

            {canViewMessages && (
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 w-full sm:w-fit">
                    <button
                        onClick={() => setActiveTab('view')}
                        className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'view' ? 'bg-farm-700 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Mensagens Recebidas
                    </button>
                    <button
                        onClick={() => setActiveTab('send')}
                        className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'send' ? 'bg-farm-700 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Enviar Nova Mensagem
                    </button>
                </div>
            )}

            {activeTab === 'view' && canViewMessages ? (
                fetchingMessages ? (
                    <div className="flex justify-center p-12">
                        <IconLoader className="w-12 h-12 text-farm-700 animate-spin" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
                        <IconMail className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-xl font-medium text-gray-600">Nenhuma mensagem encontrada</h3>
                    </div>
                ) : (
                    <div className="grid gap-6">
                        {messages.map((msg) => (
                            <div key={msg.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                                <div className="p-6">
                                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-farm-50 rounded-full flex items-center justify-center text-farm-700">
                                                <IconUser className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">{msg.profiles?.full_name || 'Usuário Desconhecido'}</p>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                    <span className="flex items-center gap-1">
                                                        <IconCalendar className="w-3 h-3" />
                                                        {new Date(msg.created_at).toLocaleString('pt-BR')}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                                                        msg.type === 'Elogio' ? 'bg-green-100 text-green-700' :
                                                        msg.type === 'Crítica/Reclamação' ? 'bg-red-100 text-red-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {msg.type}
                                                    </span>
                                                    {msg.department && (
                                                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[9px] ${
                                                            msg.department === 'financeiro' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                                            msg.department === 'manutencao' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                                            'bg-teal-100 text-teal-700 border border-teal-200'
                                                        }`}>
                                                            {msg.department === 'financeiro' ? 'Financeiro' :
                                                             msg.department === 'manutencao' ? 'Manutenção' : 'CONSU'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {(userRole === 'admin' || userRole === 'site_admin') && (
                                            <button
                                                onClick={() => handleDeleteMessage(msg.id)}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                                                title="Excluir Mensagem"
                                            >
                                                <IconTrash className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                    <h4 className="text-lg font-bold text-gray-800 mb-2">{msg.subject}</h4>
                                    <p className="text-gray-600 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 italic">
                                        "{msg.message}"
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : submitted ? (
                <div className="max-w-2xl mx-auto text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Mensagem Enviada!</h2>
                    <p className="text-gray-500">Obrigado pelo seu contato. Sua sugestão foi registrada com sucesso.</p>
                    <button
                        onClick={() => setSubmitted(false)}
                        className="mt-6 text-farm-600 font-bold hover:underline"
                    >
                        Enviar outra mensagem
                    </button>
                </div>
            ) : (
                <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-8 border-b border-gray-100 bg-farm-50">
                        <h2 className="text-2xl font-bold text-farm-900 font-serif">Críticas e Sugestões</h2>
                        <p className="text-gray-600 mt-1">Este canal é direto com a administração da fazenda.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Enviar para (Setor de Destino)</label>
                                <select
                                    value={department}
                                    onChange={(e) => setDepartment(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none bg-white transition-all"
                                    required
                                >
                                    <option value="">Selecione o setor...</option>
                                    <option value="financeiro">Financeiro</option>
                                    <option value="manutencao">Manutenção</option>
                                    <option value="consu">CONSU</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Tipo de Mensagem</label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none bg-white transition-all"
                                >
                                    <option>Sugestão</option>
                                    <option>Crítica/Reclamação</option>
                                    <option>Elogio</option>
                                    <option>Outro</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Assunto</label>
                            <input
                                type="text"
                                required
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none transition-all"
                                placeholder="Ex: Melhoria na portaria"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Mensagem</label>
                            <textarea
                                required
                                rows={6}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none transition-all resize-none font-sans"
                                placeholder="Descreva detalhadamente sua sugestão ou crítica..."
                            ></textarea>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-farm-600 hover:bg-farm-700 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                            >
                                {loading ? 'Enviando...' : 'Enviar Mensagem'}
                            </button>
                            <p className="text-[10px] text-gray-400 text-center mt-3">
                                * Sua mensagem será lida pelo setor responsável e levada em consideração.
                            </p>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
