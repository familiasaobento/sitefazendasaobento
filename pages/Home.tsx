import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconInstagram, IconWhatsapp } from '../components/Icons';

interface NewsItem {
    id: string;
    title: string;
    body: string;
    category: string;
    published_at: string;
    author_name?: string;
    file_url?: string;
}

export const HomePage: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('Social');
    const [body, setBody] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchNews();
    }, []);

    const fetchNews = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('news')
                .select(`
          id,
          title,
          body,
          category,
          published_at,
          file_url
        `)
                .order('published_at', { ascending: false });

            if (error) throw error;
            setNews(data || []);
        } catch (err) {
            console.error('Erro ao buscar notícias:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `news-attachments/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            setFileUrl(publicUrl);
        } catch (err: any) {
            alert('Erro no upload: ' + err.message);
        } finally {
            setUploadingFile(false);
        }
    };

    const handleAddNews = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { error } = await supabase
                .from('news')
                .insert([{
                    title,
                    category,
                    body,
                    file_url: fileUrl || null,
                    author: user?.id
                }]);

            if (error) throw error;

            setTitle('');
            setBody('');
            setCategory('Social');
            setFileUrl('');
            setShowAddForm(false);
            fetchNews();
        } catch (err) {
            console.error('Erro ao adicionar notícia:', err);
            alert('Erro ao adicionar notícia.');
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    return (
        <div className="space-y-8">
            {/* Welcome Section */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1 order-2 md:order-1">
                    <h2 className="text-2xl sm:text-3xl font-bold text-farm-900 font-serif mb-4 text-center md:text-left">Bem-vindo a Fazenda São Bento!</h2>
                    <p className="text-gray-600 leading-relaxed mb-6 text-sm sm:text-base text-justify md:text-left">
                        Este site nasce para unir a nossa família em torno do legado da Fazenda São Bento, oferecendo um espaço transparente para acompanhar nossos resultados financeiros, documentos e o calendário de eventos. Queremos que cada sócio tenha a facilidade de realizar reservas, atualizar seus dados e reviver nossas memórias em fotos, mantendo viva a conexão com nossas raízes e com a administração. É o nosso ponto de encontro digital para cuidar, com amor e clareza, do que construímos juntos.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                        <div className="bg-farm-50 p-3 rounded-lg text-farm-800 flex items-center gap-2">
                            <IconInstagram className="w-5 h-5 flex-shrink-0" />
                            <span className="truncate"><strong>Instagram:</strong> fazendasb23</span>
                        </div>
                        <div className="bg-farm-50 p-3 rounded-lg text-farm-800 flex items-center gap-2">
                            <IconWhatsapp className="w-5 h-5 flex-shrink-0" />
                            <span className="truncate"><strong>WhatsApp:</strong> (32) 8465-3051</span>
                        </div>
                    </div>
                </div>
                <div className="w-full md:w-1/3 order-1 md:order-2">
                    <img
                        src="/home-photo.jpg"
                        alt="Foto da Fazenda"
                        className="rounded-xl shadow-md w-full h-48 sm:h-64 object-cover"
                    />
                </div>
            </div>

            {/* News Section */}
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center">
                        <span className="w-2 h-8 bg-farm-500 rounded-full mr-3"></span>
                        Últimas Notícias e Avisos
                    </h3>
                    {isAdmin && (
                        <button
                            onClick={() => setShowAddForm(!showAddForm)}
                            className="bg-farm-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
                        >
                            {showAddForm ? 'Cancelar' : '+ Novo Aviso'}
                        </button>
                    )}
                </div>

                {showAddForm && (
                    <div className="bg-white p-6 rounded-xl shadow-md border border-farm-100 mb-8 fade-in">
                        <h4 className="text-lg font-bold text-farm-800 mb-4">Novo Aviso ou Notícia</h4>
                        <form onSubmit={handleAddNews} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="md:col-span-2 lg:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                    <input
                                        type="text"
                                        required
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                                        placeholder="Ex: Reforma na Sede"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none bg-white"
                                    >
                                        <option>Social</option>
                                        <option>Importante</option>
                                        <option>Manutenção</option>
                                        <option>Aviso</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Anexar Detalhamento</label>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                            id="file-upload"
                                            disabled={uploadingFile}
                                        />
                                        <label
                                            htmlFor="file-upload"
                                            className={`w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-all ${fileUrl ? 'bg-green-50 border-green-500 text-green-700' : 'bg-farm-50 border-farm-200 text-farm-700 hover:bg-farm-100'
                                                }`}
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                            <span className="text-sm font-bold truncate">
                                                {uploadingFile ? 'Enviando...' : fileUrl ? 'PDF/Arquivo Pronto' : 'Selecionar Arquivo'}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Resumo do Conteúdo</label>
                                <textarea
                                    required
                                    rows={4}
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                                    placeholder="Escreva a notícia resumidamente..."
                                ></textarea>
                            </div>
                            <button
                                type="submit"
                                disabled={submitting || uploadingFile}
                                className="w-full bg-farm-600 text-white font-bold py-2 rounded-lg hover:bg-farm-700 disabled:opacity-50 transition-all font-serif"
                            >
                                {submitting ? 'Publicando...' : 'Publicar Notícia'}
                            </button>
                        </form>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-farm-700"></div>
                    </div>
                ) : news.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-12 text-center text-gray-500">
                        Nenhuma notícia publicada ainda.
                    </div>
                ) : (
                    <div className="grid md:grid-cols-3 gap-6">
                        {news.map(item => (
                            <div key={item.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full 
                  ${item.category === 'Importante' ? 'bg-red-100 text-red-700' :
                                        item.category === 'Manutenção' ? 'bg-orange-100 text-orange-700' :
                                            item.category === 'Aviso' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {item.category}
                                </span>
                                <h4 className="font-bold text-lg mt-3 mb-2 text-gray-800">{item.title}</h4>
                                <p className="text-gray-400 text-[10px] mb-3">{formatDate(item.published_at)}</p>
                                <p className="text-gray-600 text-sm whitespace-pre-wrap mb-4">{item.body}</p>

                                {item.file_url && (
                                    <a
                                        href={item.file_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-xs font-bold text-farm-700 bg-farm-50 px-3 py-2 rounded-lg hover:bg-farm-100 transition-colors w-full justify-center border border-farm-100"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Ver Detalhamento (PDF/Arquivo)
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
