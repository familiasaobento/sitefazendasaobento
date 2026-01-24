import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconMail, IconUser, IconCalendar, IconLoader } from '../components/Icons';

interface Message {
    id: number;
    user_id: string;
    type: string;
    subject: string;
    message: string;
    created_at: string;
    profiles?: {
        full_name: string;
    };
}

export const ContactPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [fetchingMessages, setFetchingMessages] = useState(false);
    const [type, setType] = useState('Sugestão');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isAdmin) {
            fetchMessages();
        }
    }, [isAdmin]);

    const fetchMessages = async () => {
        setFetchingMessages(true);
        try {
            // Buscamos todas as mensagens e trazemos o nome do sócio da tabela profiles
            const { data, error } = await supabase
                .from('contact_messages')
                .select(`
                    *,
                    profiles ( full_name )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Garantimos que profiles seja tratado corretamente, seja objeto ou array
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
                    message
                }]);

            if (insertError) throw insertError;

            setSubmitted(true);
            setSubject('');
            setMessage('');
            setTimeout(() => setSubmitted(false), 5000);
        } catch (err: any) {
            console.error('Erro ao enviar mensagem:', err);
            setError('Ocorreu um erro ao enviar sua mensagem. Tente novamente mais tarde.');
        } finally {
            setLoading(false);
        }
    };

    if (isAdmin) {
        return (
            <div className="space-y-8">
                <header>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Mensagens e Sugestões</h1>
                    <p className="text-gray-500 mt-2 text-lg">Visualize as comunicações enviadas pelos sócios pelo portal.</p>
                </header>

                {fetchingMessages ? (
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
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    <span className="flex items-center gap-1">
                                                        <IconCalendar className="w-3 h-3" />
                                                        {new Date(msg.created_at).toLocaleString('pt-BR')}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-full font-medium ${msg.type === 'Elogio' ? 'bg-green-100 text-green-700' :
                                                        msg.type === 'Crítica/Reclamação' ? 'bg-red-100 text-red-700' :
                                                            'bg-blue-100 text-blue-700'
                                                        }`}>
                                                        {msg.type}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <h4 className="text-lg font-bold text-gray-800 mb-2">{msg.subject}</h4>
                                    <p className="text-gray-600 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 italic">
                                        "{msg.message}"
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto text-center py-12">
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
        );
    }

    return (
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Mensagem</label>
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

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                    <textarea
                        required
                        rows={6}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none transition-all resize-none"
                        placeholder="Descreva detalhadamente sua sugestão ou crítica..."
                    ></textarea>
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-farm-600 hover:bg-farm-700 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                        {loading ? 'Enviando...' : 'Enviar Mensagem para Administração'}
                    </button>
                    <p className="text-[10px] text-gray-400 text-center mt-3">
                        * Sua mensagem será lida pela diretoria e levada em consideração nas próximas reuniões.
                    </p>
                </div>
            </form>
        </div>
    );
};
