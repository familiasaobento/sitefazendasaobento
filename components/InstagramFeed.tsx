import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconInstagram, IconSettings, IconX, IconCheck, IconLoader } from './Icons';

interface InstagramFeedProps {
    isAdmin?: boolean;
}

const mockPosts = [
    {
        id: 'mock1',
        imageUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80',
        caption: 'A beleza das manhãs de sol na Fazenda São Bento. Um refúgio de paz para nossa família. ☀️🌾 #FazendaSaoBento #Natureza',
        likes: 124,
        comments: 12
    },
    {
        id: 'mock2',
        imageUrl: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=600&q=80',
        caption: 'Momento de conexão com a terra e com nossos animais. Tradição que atravessa gerações. 🐴❤️ #Cavalos #Fazenda',
        likes: 186,
        comments: 24
    },
    {
        id: 'mock3',
        imageUrl: 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=600&q=80',
        caption: 'Fim de tarde espetacular tingindo o céu de cores quentes sobre nossos campos. Gratidão por este lugar. 🌅✨ #Sunset #Campo',
        likes: 142,
        comments: 16
    }
];

export const InstagramFeed: React.FC<InstagramFeedProps> = ({ isAdmin }) => {
    const [posts, setPosts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form inputs (URLs or codes)
    const [input1, setInput1] = useState('');
    const [input2, setInput2] = useState('');
    const [input3, setInput3] = useState('');

    useEffect(() => {
        fetchInstagramPosts();
    }, []);

    const fetchInstagramPosts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('site_settings')
                .select('value')
                .eq('key', 'instagram_posts');

            if (error) throw error;

            if (data && data.length > 0 && data[0].value) {
                const parsed = JSON.parse(data[0].value);
                if (Array.isArray(parsed)) {
                    setPosts(parsed);
                    // Pre-populate input fields
                    setInput1(parsed[0] ? `https://www.instagram.com/p/${parsed[0]}/` : '');
                    setInput2(parsed[1] ? `https://www.instagram.com/p/${parsed[1]}/` : '');
                    setInput3(parsed[2] ? `https://www.instagram.com/p/${parsed[2]}/` : '');
                    return;
                }
            }
            setPosts([]);
        } catch (err) {
            console.error('Erro ao carregar posts do Instagram:', err);
        } finally {
            setLoading(false);
        }
    };

    const extractPostCode = (urlOrCode: string): string => {
        if (!urlOrCode) return '';
        const trimmed = urlOrCode.trim();
        // Regex matches /p/CODE/ or /reel/CODE/ or /tv/CODE/
        const regex = /(?:\/p\/|\/reel\/|\/tv\/)([^/?#&]+)/i;
        const match = trimmed.match(regex);
        if (match && match[1]) {
            return match[1];
        }
        // If it doesn't contain a slash, treat it as a raw code
        if (!trimmed.includes('/')) {
            return trimmed;
        }
        return '';
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        const code1 = extractPostCode(input1);
        const code2 = extractPostCode(input2);
        const code3 = extractPostCode(input3);

        if (
            input1.includes('/share/') || 
            input2.includes('/share/') || 
            input3.includes('/share/') ||
            code1.length > 15 || 
            code2.length > 15 || 
            code3.length > 15
        ) {
            alert('Erro: Links de compartilhamento do celular (que contêm "/share/") não podem ser exibidos no site devido a restrições de segurança do próprio Instagram. Por favor, acesse o post pelo navegador e copie o link direto (ex: https://www.instagram.com/p/C-h9D7xOpYz/).');
            setSaving(false);
            return;
        }

        const updatedCodes = [code1, code2, code3].filter(code => code !== '');

        try {
            const { error } = await supabase
                .from('site_settings')
                .upsert({
                    key: 'instagram_posts',
                    value: JSON.stringify(updatedCodes),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) throw error;

            setPosts(updatedCodes);
            setIsConfiguring(false);
        } catch (err) {
            console.error('Erro ao salvar posts do Instagram:', err);
            alert('Erro ao salvar as configurações.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 mt-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-2 h-8 bg-farm-500 rounded-full"></span>
                    <IconInstagram className="w-6 h-6 text-farm-600" />
                    Últimas do Instagram
                </h3>
                <div className="flex items-center gap-3">
                    <a
                        href="https://www.instagram.com/fazendasb23"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-farm-600 hover:text-farm-700 transition-colors"
                    >
                        @fazendasb23
                    </a>
                    {isAdmin && (
                        <button
                            onClick={() => setIsConfiguring(true)}
                            className="p-2 text-gray-400 hover:text-farm-600 hover:bg-farm-50 rounded-lg transition-all"
                            title="Configurar Feed do Instagram"
                        >
                            <IconSettings className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-12">
                    <IconLoader className="w-8 h-8 text-farm-600 animate-spin" />
                </div>
            ) : posts.length > 0 ? (
                // Show live embedded iframes
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {posts.map((code, index) => (
                        <div
                            key={code + index}
                            className="bg-gray-50 rounded-xl overflow-hidden shadow-inner border border-gray-100 flex justify-center items-center relative aspect-[4/5] min-h-[450px]"
                        >
                            <iframe
                                src={`https://www.instagram.com/p/${code}/embed/`}
                                className="w-full h-full border-0 rounded-xl"
                                allowFullScreen
                                scrolling="no"
                                allow="encrypted-media"
                                title={`Instagram post ${code}`}
                            ></iframe>
                        </div>
                    ))}
                </div>
            ) : (
                // Show mockup grid linking to profile
                <div>
                    {isAdmin && (
                        <div className="bg-farm-50 border border-farm-200 rounded-xl p-4 mb-6 text-sm text-farm-800 flex items-center justify-between">
                            <span>
                                💡 <strong>Dica para o Administrador:</strong> Este é um feed demonstrativo. Clique na engrenagem no canto superior direito para cadastrar postagens reais do Instagram da fazenda!
                            </span>
                            <button
                                onClick={() => setIsConfiguring(true)}
                                className="bg-farm-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-farm-700 transition-colors shadow-sm ml-4 whitespace-nowrap"
                            >
                                Configurar Agora
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {mockPosts.map((post) => (
                            <a
                                key={post.id}
                                href="https://www.instagram.com/fazendasb23"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group relative rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 aspect-square"
                            >
                                <img
                                    src={post.imageUrl}
                                    alt="Foto da Fazenda"
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-between p-6 text-white text-sm">
                                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-farm-300">
                                        <IconInstagram className="w-4 h-4 text-white" />
                                        @fazendasb23
                                    </div>
                                    <p className="line-clamp-4 leading-relaxed font-light text-gray-100 my-auto text-justify">
                                        {post.caption}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs font-bold text-gray-200 pt-2 border-t border-white/20">
                                        <span className="flex items-center gap-1">
                                            ❤️ {post.likes}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            💬 {post.comments}
                                        </span>
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Admin Configuration Modal */}
            {isConfiguring && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100">
                        <div className="flex justify-between items-center bg-farm-900 text-white px-6 py-4">
                            <h4 className="font-bold font-serif text-lg flex items-center gap-2">
                                <IconInstagram className="w-5 h-5" />
                                Configurar Feed do Instagram
                            </h4>
                            <button
                                onClick={() => setIsConfiguring(false)}
                                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <IconX className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <p className="text-sm text-gray-500 leading-relaxed bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg">
                                <strong>⚠️ Atenção:</strong> Não utilize links obtidos por "Compartilhar &gt; Copiar link" no celular (contêm <code>/share/</code>). Esses links são bloqueados pelo Instagram. 
                                <br />
                                <strong>Como fazer:</strong> Copie o link direto da barra de endereço de um navegador (ex: <code>https://www.instagram.com/p/C-h9D7xOpYz/</code>).
                            </p>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Publicação 1</label>
                                    <input
                                        type="text"
                                        value={input1}
                                        onChange={(e) => setInput1(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none text-sm transition-all"
                                        placeholder="Cole o link ou ID da publicação"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Publicação 2</label>
                                    <input
                                        type="text"
                                        value={input2}
                                        onChange={(e) => setInput2(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none text-sm transition-all"
                                        placeholder="Cole o link ou ID da publicação"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Publicação 3</label>
                                    <input
                                        type="text"
                                        value={input3}
                                        onChange={(e) => setInput3(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none text-sm transition-all"
                                        placeholder="Cole o link ou ID da publicação"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setIsConfiguring(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-4 py-2.5 bg-farm-600 text-white rounded-lg font-bold text-sm hover:bg-farm-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <IconLoader className="w-4 h-4 animate-spin" />
                                            Salvando...
                                        </>
                                    ) : (
                                        <>
                                            <IconCheck className="w-4 h-4" />
                                            Salvar Alterações
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
