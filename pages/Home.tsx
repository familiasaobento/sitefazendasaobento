import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconInstagram, IconWhatsapp, IconMail, IconEdit, IconTrash, IconX } from '../components/Icons';
import { AdminAlerts } from '../components/AdminAlerts';
import { InstagramFeed } from '../components/InstagramFeed';

import { Page } from '../types';

interface NewsItem {
    id: string;
    title: string;
    body: string;
    category: string;
    published_at: string;
    author_name?: string;
    file_url?: string;
    images?: string[];
}

export const HomePage: React.FC<{ isManagement: boolean; canEditNews?: boolean; isVisitor?: boolean; onNavigate: (page: Page) => void }> = ({ isManagement, canEditNews, isVisitor, onNavigate }) => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingItem, setEditingItem] = useState<NewsItem | null>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('Social');
    const [body, setBody] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [uploadingImages, setUploadingImages] = useState(false);

    const handleCancelForm = () => {
        setTitle('');
        setBody('');
        setCategory('Social');
        setFileUrl('');
        setUploadedImages([]);
        setEditingItem(null);
        setShowAddForm(false);
    };

    const handleEditClick = (item: NewsItem) => {
        setEditingItem(item);
        setTitle(item.title);
        setCategory(item.category);
        setBody(item.body);
        setFileUrl(item.file_url || '');
        setUploadedImages(item.images || []);
        setShowAddForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteNews = async (id: string) => {
        if (!window.confirm('Tem certeza de que deseja apagar esta notícia/aviso?')) return;
        try {
            const { error } = await supabase
                .from('news')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchNews();
        } catch (err) {
            console.error('Erro ao excluir notícia:', err);
            alert('Erro ao excluir notícia.');
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const newImages = [...uploadedImages];
        if (newImages.length + files.length > 4) {
            alert('Você só pode adicionar até 4 fotos por notícia.');
            return;
        }

        setUploadingImages(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
                const filePath = `news-photos/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('documents')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('documents')
                    .getPublicUrl(filePath);

                newImages.push(publicUrl);
            }
            setUploadedImages(newImages);
        } catch (err: any) {
            alert('Erro no upload das fotos: ' + err.message);
        } finally {
            setUploadingImages(false);
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setUploadedImages(uploadedImages.filter((_, idx) => idx !== indexToRemove));
    };

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
          file_url,
          images
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

            if (editingItem) {
                const { error } = await supabase
                    .from('news')
                    .update({
                        title,
                        category,
                        body,
                        file_url: fileUrl || null,
                        images: uploadedImages
                    })
                    .eq('id', editingItem.id);

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('news')
                    .insert([{
                        title,
                        category,
                        body,
                        file_url: fileUrl || null,
                        author: user?.id,
                        images: uploadedImages
                    }]);

                if (error) throw error;
            }

            handleCancelForm();
            fetchNews();
        } catch (err) {
            console.error('Erro ao salvar notícia:', err);
            alert('Erro ao salvar notícia.');
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
            {isManagement && <AdminAlerts onNavigate={onNavigate} />}
            {/* Welcome Section */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1 order-2 md:order-1">
                    <h2 className="text-2xl sm:text-3xl font-bold text-farm-900 font-serif mb-4 text-center md:text-left">
                        {isVisitor ? 'Bem-vindos à Nossa Casa: Fazenda São Bento' : 'Bem-vindo a Fazenda São Bento!'}
                    </h2>
                    <p className="text-gray-600 leading-relaxed mb-6 text-sm sm:text-base text-justify md:text-left">
                        {isVisitor
                            ? 'É uma alegria receber você! Nossa fazenda não é um hotel, mas sim o coração de uma família que abre as portas para quem estimamos. Aqui, cada detalhe é cuidado com carinho para que sua estadia seja repleta de paz e boas memórias. Esperamos que você se sinta em casa, aproveitando a simplicidade e o aconchego de um ambiente onde todos são profundamente queridos e respeitados. Aproveite cada momento junto à nossa história!'
                            : 'Este site nasce para unir a nossa família em torno do legado da Fazenda São Bento, oferecendo um espaço transparente para acompanhar nossos resultados financeiros, documentos e o calendário de eventos. Queremos que cada sócio tenha a facilidade de realizar reservas, atualizar seus dados e reviver nossas memórias em fotos, mantendo viva a conexão com nossas raízes e com a administração. É o nosso ponto de encontro digital para cuidar, com amor e clareza, do que construímos juntos.'
                        }
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                        <div className="bg-farm-50 p-3 rounded-lg text-farm-800 flex items-center gap-2 overflow-hidden">
                            {isVisitor ? <IconMail className="w-5 h-5 flex-shrink-0" /> : <IconInstagram className="w-5 h-5 flex-shrink-0" />}
                            <span className="break-all sm:break-normal">
                                <strong>{isVisitor ? 'E-mail:' : 'Instagram:'}</strong> {isVisitor ? 'contato@familiasaobento.com' : '@fazendasb23'}
                            </span>
                        </div>
                        <div className="bg-farm-50 p-3 rounded-lg text-farm-800 flex items-center gap-2">
                            <IconWhatsapp className="w-5 h-5 flex-shrink-0" />
                            <span><strong>Telefone:</strong> (32) 98465-3051</span>
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
            {!isVisitor && (
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800 flex items-center">
                            <span className="w-2 h-8 bg-farm-500 rounded-full mr-3"></span>
                            Últimas Notícias e Avisos
                        </h3>
                        {canEditNews && (
                            <button
                                onClick={() => {
                                    if (showAddForm) {
                                        handleCancelForm();
                                    } else {
                                        setShowAddForm(true);
                                    }
                                }}
                                className="bg-farm-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
                            >
                                {showAddForm ? 'Cancelar' : '+ Novo Aviso'}
                            </button>
                        )}
                    </div>

                    {showAddForm && (
                        <div className="bg-white p-6 rounded-xl shadow-md border border-farm-100 mb-8 fade-in">
                            <h4 className="text-lg font-bold text-farm-800 mb-4">
                                {editingItem ? 'Editar Notícia/Aviso' : 'Novo Aviso ou Notícia'}
                            </h4>
                            <form onSubmit={handleAddNews} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="md:col-span-2 lg:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Título</label>
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
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Categoria</label>
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
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Anexar Detalhamento</label>
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
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Resumo do Conteúdo</label>
                                    <textarea
                                        required
                                        rows={4}
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                                        placeholder="Escreva a notícia resumidamente..."
                                    ></textarea>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Fotos da Notícia (Até 4)</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
                                        {uploadedImages.map((imgUrl, index) => (
                                            <div key={index} className="relative group rounded-lg overflow-hidden border border-gray-200 h-24 bg-gray-50">
                                                <img src={imgUrl} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveImage(index)}
                                                    className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-85 hover:opacity-100 transition-opacity shadow-sm animate-fade-in"
                                                    title="Remover Foto"
                                                >
                                                    <IconX className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        {uploadedImages.length < 4 && (
                                            <label className="border-2 border-dashed border-farm-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-farm-50 transition-all h-24 text-farm-700">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept="image/*"
                                                    onChange={handleImageUpload}
                                                    className="hidden"
                                                    disabled={uploadingImages}
                                                />
                                                <svg className="w-6 h-6 mb-1 text-farm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                                </svg>
                                                <span className="text-xs font-bold">{uploadingImages ? 'Enviando...' : 'Adicionar Foto'}</span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting || uploadingFile}
                                    className="w-full bg-farm-600 text-white font-bold py-2 rounded-lg hover:bg-farm-700 disabled:opacity-50 transition-all font-serif"
                                >
                                    {submitting ? (editingItem ? 'Salvando...' : 'Publicando...') : (editingItem ? 'Salvar Alterações' : 'Publicar Notícia')}
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
                                <div key={item.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full 
                          ${item.category === 'Importante' ? 'bg-red-100 text-red-700' :
                                                    item.category === 'Manutenção' ? 'bg-orange-100 text-orange-700' :
                                                        item.category === 'Aviso' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {item.category}
                                            </span>
                                            {canEditNews && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleEditClick(item)}
                                                        className="text-gray-400 hover:text-farm-600 transition-colors p-1"
                                                        title="Editar"
                                                    >
                                                        <IconEdit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteNews(item.id)}
                                                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                        title="Excluir"
                                                    >
                                                        <IconTrash className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <h4 className="font-bold text-lg mb-2 text-gray-800">{item.title}</h4>
                                        <p className="text-gray-400 text-[10px] mb-3">{formatDate(item.published_at)}</p>
                                        <p className="text-gray-600 text-sm whitespace-pre-wrap mb-4">{item.body}</p>

                                        {/* Imagens da notícia */}
                                        {item.images && item.images.length > 0 && (
                                            <div className="mb-4">
                                                {item.images.length === 1 ? (
                                                    <div className="rounded-xl overflow-hidden border border-gray-100 h-44 bg-gray-50">
                                                        <img 
                                                            src={item.images[0]} 
                                                            alt={item.title} 
                                                            className="w-full h-full object-cover cursor-pointer hover:scale-102 transition-all duration-300" 
                                                            onClick={() => window.open(item.images![0], '_blank')} 
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className={`grid gap-2 ${
                                                        item.images.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                                                    }`}>
                                                        {item.images.map((img, idx) => (
                                                            <div key={idx} className={`rounded-lg overflow-hidden border border-gray-100 bg-gray-50 ${
                                                                item.images!.length === 2 ? 'h-32' : 'h-24'
                                                            }`}>
                                                                <img 
                                                                    src={img} 
                                                                    alt={`${item.title} ${idx + 1}`} 
                                                                    className="w-full h-full object-cover cursor-pointer hover:scale-102 transition-all duration-300" 
                                                                    onClick={() => window.open(img, '_blank')} 
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {item.file_url && (
                                        <a
                                            href={item.file_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-xs font-bold text-farm-700 bg-farm-50 px-3 py-2 rounded-lg hover:bg-farm-100 transition-colors w-full justify-center border border-farm-100 mt-auto"
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
            )}

            {/* Instagram Feed Section */}
            <InstagramFeed isAdmin={canEditNews} />
        </div>
    );
};
