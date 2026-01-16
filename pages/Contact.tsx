import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export const ContactPage: React.FC = () => {
    const [type, setType] = useState('Sugestão');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Salvar no Banco de Dados
            const { error: insertError } = await supabase
                .from('contact_messages')
                .insert([{
                    user_id: user?.id,
                    type,
                    subject,
                    message
                }]);

            if (insertError) throw insertError;

            // 2. Chamar a função de envio de e-mail (Opcional: Pode ser feito via Database Webhook depois)
            // Por enquanto, vamos apenas garantir que os dados estão salvos.

            setSubmitted(true);
            // Reset form
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
