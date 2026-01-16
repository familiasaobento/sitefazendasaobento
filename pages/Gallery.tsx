import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconLoader } from '../components/Icons';

interface Album {
    id: number;
    title: string;
    description: string;
    cover_image_path: string | null;
    created_at: string;
}

interface GalleryItem {
    id: string;
    title: string;
    file_path: string;
    created_at: string;
    album_id: number | null;
}

export const GalleryPage: React.FC = () => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [photos, setPhotos] = useState<GalleryItem[]>([]);
    const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showAlbumForm, setShowAlbumForm] = useState(false);

    // Photo Form state
    const [photoTitle, setPhotoTitle] = useState('');
    const [files, setFiles] = useState<FileList | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Album Form state
    const [albumTitle, setAlbumTitle] = useState('');
    const [albumDescription, setAlbumDescription] = useState('');

    useEffect(() => {
        checkAdmin();
        fetchAlbums();
    }, []);

    useEffect(() => {
        if (selectedAlbum) {
            fetchPhotos(selectedAlbum.id);
        }
    }, [selectedAlbum]);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            setIsAdmin(data?.role === 'admin');
        }
    };

    const fetchAlbums = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('albums')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAlbums(data || []);
        } catch (err) {
            console.error('Erro ao buscar álbuns:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPhotos = async (albumId: number) => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('gallery')
                .select('*')
                .eq('album_id', albumId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPhotos(data || []);
        } catch (err) {
            console.error('Erro ao buscar fotos:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAlbum = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
                .from('albums')
                .insert([{
                    title: albumTitle,
                    description: albumDescription,
                    created_by: user?.id
                }]);

            if (error) throw error;

            setAlbumTitle('');
            setAlbumDescription('');
            setShowAlbumForm(false);
            fetchAlbums();
        } catch (err) {
            console.error('Erro ao criar álbum:', err);
            alert('Erro ao criar álbum.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!files || files.length === 0 || !selectedAlbum) return;

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
                const filePath = `uploads/${fileName}`;

                // 1. Upload to Storage
                const { error: uploadError } = await supabase.storage
                    .from('gallery')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // 2. Insert into DB
                const { error: insertError } = await supabase
                    .from('gallery')
                    .insert([{
                        title: photoTitle || file.name,
                        file_path: filePath,
                        created_by: user?.id,
                        album_id: selectedAlbum.id
                    }]);

                if (insertError) throw insertError;
            }

            setPhotoTitle('');
            setFiles(null);
            setShowAddForm(false);
            fetchPhotos(selectedAlbum.id);
        } catch (err) {
            console.error('Erro no upload:', err);
            alert('Erro ao enviar fotos.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeletePhoto = async (photo: GalleryItem) => {
        if (!window.confirm('Excluir esta foto permanentemente?')) return;

        try {
            await supabase.storage.from('gallery').remove([photo.file_path]);
            const { error } = await supabase.from('gallery').delete().eq('id', photo.id);
            if (error) throw error;
            if (selectedAlbum) fetchPhotos(selectedAlbum.id);
        } catch (err) {
            console.error('Erro ao excluir:', err);
            alert('Erro ao excluir foto.');
        }
    };

    const handleDeleteAlbum = async (album: Album) => {
        if (!window.confirm('Excluir este álbum e todas as suas fotos permanentemente?')) return;

        try {
            // First fetch and delete photos from storage
            const { data: albumPhotos } = await supabase
                .from('gallery')
                .select('file_path')
                .eq('album_id', album.id);

            if (albumPhotos && albumPhotos.length > 0) {
                const paths = albumPhotos.map(p => p.file_path);
                await supabase.storage.from('gallery').remove(paths);
            }

            const { error } = await supabase.from('albums').delete().eq('id', album.id);
            if (error) throw error;
            fetchAlbums();
        } catch (err) {
            console.error('Erro ao excluir álbum:', err);
            alert('Erro ao excluir álbum.');
        }
    };

    const getPublicUrl = (path: string) => {
        const { data } = supabase.storage.from('gallery').getPublicUrl(path);
        return data.publicUrl;
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-farm-900 font-serif">
                        {selectedAlbum ? (
                            <button
                                onClick={() => setSelectedAlbum(null)}
                                className="hover:text-farm-600 transition-colors flex items-center gap-2"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                {selectedAlbum.title}
                            </button>
                        ) : 'Álbum de Fotos'}
                    </h2>
                    <p className="text-gray-600">
                        {selectedAlbum ? selectedAlbum.description : 'Explore os momentos especiais da Fazenda São Bento.'}
                    </p>
                </div>
                {isAdmin && (
                    <div className="flex gap-2">
                        {selectedAlbum ? (
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className="bg-farm-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
                            >
                                {showAddForm ? 'Cancelar' : '+ Adicionar Fotos'}
                            </button>
                        ) : (
                            <button
                                onClick={() => setShowAlbumForm(!showAlbumForm)}
                                className="bg-farm-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
                            >
                                {showAlbumForm ? 'Cancelar' : '+ Novo Álbum'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Album Creation Form */}
            {showAlbumForm && !selectedAlbum && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-farm-100 mb-8 fade-in">
                    <h3 className="text-xl font-bold text-farm-800 mb-4">Criar Novo Álbum</h3>
                    <form onSubmit={handleCreateAlbum} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Título do Álbum</label>
                            <input
                                type="text"
                                required
                                value={albumTitle}
                                onChange={(e) => setAlbumTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                                placeholder="Ex: Natal 2025"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (Opcional)</label>
                            <textarea
                                value={albumDescription}
                                onChange={(e) => setAlbumDescription(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                                placeholder="Uma breve descrição sobre o álbum..."
                                rows={3}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-farm-600 text-white font-bold py-3 rounded-lg hover:bg-farm-700 disabled:opacity-50 transition-all"
                        >
                            {submitting ? 'Criando...' : 'Criar Álbum'}
                        </button>
                    </form>
                </div>
            )}

            {/* Photo Upload Form */}
            {showAddForm && selectedAlbum && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-farm-100 mb-8 fade-in">
                    <h3 className="text-xl font-bold text-farm-800 mb-4">Adicionar Fotos ao Álbum</h3>
                    <form onSubmit={handleUpload} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Título / Legenda (Opcional)</label>
                            <input
                                type="text"
                                value={photoTitle}
                                onChange={(e) => setPhotoTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                                placeholder="Ex: Almoço de Domingo"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Selecionar Fotos (Pode escolher várias)</label>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                required
                                onChange={(e) => setFiles(e.target.files)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-farm-50 file:text-farm-700 hover:file:bg-farm-100"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-farm-600 text-white font-bold py-3 rounded-lg hover:bg-farm-700 disabled:opacity-50 transition-all"
                        >
                            {submitting ? 'Enviando...' : 'Fazer Upload'}
                        </button>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <IconLoader className="w-10 h-10 text-farm-600 animate-spin" />
                </div>
            ) : !selectedAlbum ? (
                // Albums Grid
                albums.length === 0 ? (
                    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-20 text-center">
                        <p className="text-gray-500">Nenhum álbum criado ainda.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {albums.map((album) => (
                            <div
                                key={album.id}
                                onClick={() => setSelectedAlbum(album)}
                                className="group cursor-pointer bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100"
                            >
                                <div className="aspect-[4/3] bg-farm-50 relative overflow-hidden">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <svg className="w-12 h-12 text-farm-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </div>
                                    <div className="absolute inset-0 bg-farm-900/10 group-hover:bg-transparent transition-colors" />
                                </div>
                                <div className="p-4 relative">
                                    <h3 className="font-bold text-gray-900 group-hover:text-farm-600 transition-colors uppercase tracking-wider text-sm">{album.title}</h3>
                                    {album.description && <p className="text-gray-500 text-xs mt-1 line-clamp-1">{album.description}</p>}
                                    <p className="text-gray-400 text-[10px] mt-2 italic">{new Date(album.created_at).toLocaleDateString('pt-BR')}</p>

                                    {isAdmin && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteAlbum(album);
                                            }}
                                            className="absolute top-4 right-4 bg-red-50 text-red-600 p-1.5 rounded-lg hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                            title="Excluir álbum"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                // Photos Grid (within album)
                photos.length === 0 ? (
                    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-20 text-center">
                        <p className="text-gray-500">Este álbum ainda não tem fotos.</p>
                        {isAdmin && (
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="mt-4 text-farm-600 font-bold hover:underline"
                            >
                                Adicionar as primeiras fotos
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {photos.map((photo) => (
                            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-200">
                                <img
                                    src={getPublicUrl(photo.file_path)}
                                    alt={photo.title}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-5">
                                    <p className="text-white font-medium text-sm mb-1">{photo.title}</p>
                                    <p className="text-gray-300 text-[10px]">{new Date(photo.created_at).toLocaleDateString('pt-BR')}</p>

                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDeletePhoto(photo)}
                                            className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors shadow-lg"
                                            title="Excluir foto"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
};
