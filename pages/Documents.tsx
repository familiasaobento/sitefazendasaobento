import React, { useEffect, useState } from 'react';
import { IconFileText, IconLoader } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Document } from '../types';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Atas');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDocuments();
    checkAdmin();
  }, []);

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

  async function fetchDocuments() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Erro ao buscar documentos:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    try {
      // 1. Upload to Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${category}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Insert into DB
      const { error: insertError } = await supabase
        .from('documents')
        .insert([{
          title,
          category,
          file_path: filePath,
          file_type: fileExt?.toUpperCase() || 'FILE',
          file_size: `${(file.size / 1024 / 1024).toFixed(2)} MB`
        }]);

      if (insertError) throw insertError;

      setTitle('');
      setCategory('Atas');
      setFile(null);
      setShowAddForm(false);
      fetchDocuments();
    } catch (err) {
      console.error('Erro no upload:', err);
      alert('Erro ao enviar documento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;

    try {
      // 1. Delete from Storage
      await supabase.storage.from('documents').remove([doc.file_path]);

      // 2. Delete from DB
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;

      fetchDocuments();
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir documento.');
    }
  };

  const getDownloadUrl = (path: string) => {
    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(path);
    return data.publicUrl;
  };

  const categories = Array.from(new Set(documents.map(doc => doc.category)));

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-farm-900 font-serif mb-2">Documentos da Fazenda</h2>
          <p className="text-gray-600">Acesse arquivos importantes, atas e regulamentos armazenados com segurança.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-farm-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
          >
            {showAddForm ? 'Cancelar' : '+ Novo Documento'}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-xl shadow-md border border-farm-100 mb-8 fade-in">
          <h3 className="text-xl font-bold text-farm-800 mb-4">Upload de Documento</h3>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título do Documento</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                  placeholder="Ex: Ata da Reunião Jan/24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none bg-white font-medium text-gray-700"
                >
                  <option>Atas</option>
                  <option>Regulamentos</option>
                  <option>Financeiro</option>
                  <option>Manutenção</option>
                  <option>Outros</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
              <input
                type="file"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-farm-50 file:text-farm-700 hover:file:bg-farm-100"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-farm-600 text-white font-bold py-3 rounded-lg hover:bg-farm-700 disabled:opacity-50 transition-all shadow-md"
            >
              {submitting ? 'Enviando...' : 'Salvar Documento'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <IconLoader className="w-10 h-10 text-farm-600 animate-spin mb-4" />
          <p className="text-gray-500">Carregando documentos...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconFileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">Nenhum documento encontrado</h3>
          <p className="text-gray-500">Os documentos aparecerão aqui assim que forem adicionados ao sistema.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {categories.sort().map((cat) => (
            <div key={cat} className="border-b border-gray-100 last:border-0">
              <div className="bg-farm-50 px-6 py-3 border-b border-gray-100">
                <h3 className="font-bold text-farm-800 text-sm uppercase tracking-wide">{cat}</h3>
              </div>
              <ul className="divide-y divide-gray-100">
                {documents.filter(doc => doc.category === cat).map((doc) => (
                  <li key={doc.id} className="px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                        <IconFileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{doc.title}</h4>
                        <div className="flex items-center text-xs text-gray-500 mt-1 space-x-2">
                          <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                          <span>&bull;</span>
                          <span>{doc.file_size}</span>
                          <span className="uppercase bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-semibold">{doc.file_type}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(doc)}
                          className="text-red-500 hover:text-red-700 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Excluir documento"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                      <a
                        href={getDownloadUrl(doc.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-farm-600 hover:text-farm-800 font-medium text-sm border border-farm-200 hover:border-farm-500 px-4 py-2 rounded-lg transition-all"
                      >
                        Baixar
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};