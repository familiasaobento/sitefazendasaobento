import React, { useEffect, useState } from 'react';
import { IconFileText, IconLoader, IconFolder, IconChevronRight } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Document } from '../types';

export const DocumentsPage: React.FC<{ isManagement?: boolean }> = ({ isManagement }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<{ [key: string]: boolean }>({});

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Atas');
  const [folder, setFolder] = useState('');
  const [meeting, setMeeting] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

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
    if (files.length === 0) return;

    setSubmitting(true);
    try {
      const uploadPromises = files.map(async (file) => {
        // 1. Upload to Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const folderPath = folder.trim() ? `${folder.trim()}/` : '';
        const meetingPath = meeting.trim() ? `${meeting.trim().replace(/[^a-zA-Z0-9_\-]/g, '_')}/` : '';
        const filePath = `${category}/${folderPath}${meetingPath}${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Compute title
        const fileTitle = title.trim()
          ? (files.length === 1 ? title.trim() : `${title.trim()} - ${file.name}`)
          : file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

        // 3. Insert into DB
        const { error: insertError } = await supabase
          .from('documents')
          .insert([{
            title: fileTitle,
            category,
            file_path: filePath,
            file_type: fileExt?.toUpperCase() || 'FILE',
            file_size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            folder: folder.trim() || null,
            meeting: meeting.trim() || null
          }]);

        if (insertError) throw insertError;
      });

      await Promise.all(uploadPromises);

      setTitle('');
      setCategory('Atas');
      setFolder('');
      setMeeting('');
      setFiles([]);
      setShowAddForm(false);
      fetchDocuments();
    } catch (err) {
      console.error('Erro no upload:', err);
      alert('Erro ao enviar um ou mais documentos.');
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

  const handleDeleteFolder = async (folderName: string, catName: string) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir a pasta "${folderName}" (da categoria "${catName}") e TODOS os seus documentos? Esta ação não pode ser desfeita.`
      )
    )
      return;

    try {
      setLoading(true);
      const docsToDelete = documents.filter(
        (doc) => doc.category === catName && doc.folder?.trim() === folderName.trim()
      );

      if (docsToDelete.length > 0) {
        // 1. Delete files from Storage
        const filePaths = docsToDelete.map((doc) => doc.file_path);
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove(filePaths);
        if (storageError) console.error('Erro ao remover arquivos do storage:', storageError);

        // 2. Delete rows from DB
        const ids = docsToDelete.map((doc) => doc.id);
        const { error: dbError } = await supabase
          .from('documents')
          .delete()
          .in('id', ids);
        if (dbError) throw dbError;
      }

      fetchDocuments();
    } catch (err) {
      console.error('Erro ao excluir pasta:', err);
      alert('Erro ao excluir pasta.');
      setLoading(false);
    }
  };

  const handleDeleteMeeting = async (folderName: string, meetingName: string, catName: string) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir a reunião/subpasta "${meetingName}" e TODOS os seus documentos? Esta ação não pode ser desfeita.`
      )
    )
      return;

    try {
      setLoading(true);
      const docsToDelete = documents.filter(
        (doc) =>
          doc.category === catName &&
          doc.folder?.trim() === folderName.trim() &&
          doc.meeting?.trim() === meetingName.trim()
      );

      if (docsToDelete.length > 0) {
        // 1. Delete files from Storage
        const filePaths = docsToDelete.map((doc) => doc.file_path);
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove(filePaths);
        if (storageError) console.error('Erro ao remover arquivos do storage:', storageError);

        // 2. Delete rows from DB
        const ids = docsToDelete.map((doc) => doc.id);
        const { error: dbError } = await supabase
          .from('documents')
          .delete()
          .in('id', ids);
        if (dbError) throw dbError;
      }

      fetchDocuments();
    } catch (err) {
      console.error('Erro ao excluir subpasta:', err);
      alert('Erro ao excluir subpasta.');
      setLoading(false);
    }
  };

  const getDownloadUrl = (path: string) => {
    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(path);
    return data.publicUrl;
  };

  const existingFolders = Array.from(
    new Set(
      documents
        .filter(doc => doc.category === category && doc.folder)
        .map(doc => doc.folder!.trim())
    )
  ).sort();

  const standardMeetings = ['AGO', 'AGE', 'CONSU'];
  const existingMeetings = Array.from(
    new Set([
      ...standardMeetings,
      ...documents
        .filter(doc => doc.category === category && doc.meeting)
        .map(doc => doc.meeting!.trim())
    ])
  ).sort();

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const categories = Array.from(new Set(documents.map(doc => doc.category)));

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-farm-900 font-serif mb-2">Documentos da Fazenda</h2>
          <p className="text-gray-600">Acesse arquivos importantes, atas e regulamentos armazenados com segurança.</p>
        </div>
        {isManagement && (
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Título do Documento</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                  placeholder="Deixe em branco p/ usar o nome do arquivo"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Categoria</label>
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
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Pasta / Ano (Opcional)</label>
                <input
                  type="text"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  list="existing-folders"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                  placeholder="Ex: 2026, 2025"
                />
                <datalist id="existing-folders">
                  {existingFolders.map(f => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Reunião (Opcional)</label>
                <input
                  type="text"
                  value={meeting}
                  onChange={(e) => setMeeting(e.target.value)}
                  list="existing-meetings"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                  placeholder="Ex: AGO - 15/Jan, AGO - 20/Jul"
                />
                <datalist id="existing-meetings">
                  {existingMeetings.map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                  Dica: Para diferenciar reuniões do mesmo tipo no ano, adicione a data ou número (ex: AGO - Jan, AGO - 2).
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Arquivo(s)</label>
              <input
                type="file"
                required
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-farm-50 file:text-farm-700 hover:file:bg-farm-100"
              />
              {files.length > 0 && (
                <p className="text-xs text-farm-600 font-medium mt-1">
                  {files.length} arquivo(s) selecionado(s)
                </p>
              )}
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
          {categories.sort().map((cat) => {
            const catDocs = documents.filter(doc => doc.category === cat);
            const docsByFolder: { [folderName: string]: Document[] } = {};
            const rootDocs: Document[] = [];

            catDocs.forEach(doc => {
              if (doc.folder && doc.folder.trim()) {
                const fName = doc.folder.trim();
                if (!docsByFolder[fName]) {
                  docsByFolder[fName] = [];
                }
                docsByFolder[fName].push(doc);
              } else {
                rootDocs.push(doc);
              }
            });

            const sortedFolders = Object.keys(docsByFolder).sort().reverse();

            return (
              <div key={cat} className="border-b border-gray-100 last:border-0">
                <div className="bg-gray-50/50 px-6 py-3 border-b border-gray-100">
                  <h3 className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">{cat}</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {/* Folders */}
                  {sortedFolders.map((folderName) => {
                    const folderDocs = docsByFolder[folderName];
                    const folderKey = `${cat}:${folderName}`;
                    const isExpanded = !!expandedFolders[folderKey];

                    // Group by meeting
                    const docsByMeeting: { [meetingName: string]: Document[] } = {};
                    const folderRootDocs: Document[] = [];

                    folderDocs.forEach(doc => {
                      if (doc.meeting && doc.meeting.trim()) {
                        const mName = doc.meeting.trim();
                        if (!docsByMeeting[mName]) {
                          docsByMeeting[mName] = [];
                        }
                        docsByMeeting[mName].push(doc);
                      } else {
                        folderRootDocs.push(doc);
                      }
                    });

                    const sortedMeetings = Object.keys(docsByMeeting).sort();

                    return (
                      <div key={folderName} className="bg-white">
                        {/* Folder Row Header */}
                        <div className="w-full px-6 py-4 hover:bg-gray-50/80 transition-colors flex items-center justify-between font-medium text-gray-800 text-left border-b border-gray-100 group/folder">
                          <button
                            onClick={() => toggleFolder(folderKey)}
                            className="flex items-center space-x-3 flex-1"
                          >
                            <IconChevronRight
                              className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            />
                            <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                              <IconFolder className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="font-semibold text-gray-900">{folderName}</span>
                              <span className="text-xs text-gray-500 ml-2">
                                ({folderDocs.length} {folderDocs.length === 1 ? 'documento' : 'documentos'})
                              </span>
                            </div>
                          </button>
                          {isManagement && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(folderName, cat);
                              }}
                              className="text-red-500 hover:text-red-700 p-2 opacity-0 group-hover/folder:opacity-100 transition-opacity"
                              title="Excluir pasta e todos os seus documentos"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {/* Folder Content */}
                        {isExpanded && (
                          <div className="bg-gray-50/30 divide-y divide-gray-100 pl-8 border-b border-gray-100">
                            {/* Meetings inside folder */}
                            {sortedMeetings.map((meetingName) => {
                              const meetingDocs = docsByMeeting[meetingName];
                              const meetingKey = `${cat}:${folderName}:${meetingName}`;
                              const isMeetingExpanded = !!expandedFolders[meetingKey];

                              return (
                                <div key={meetingName} className="bg-white/50 border-b border-gray-100/50 last:border-b-0">
                                  {/* Meeting Row Header */}
                                  <div className="w-full pr-6 py-3 hover:bg-gray-50/80 transition-colors flex items-center justify-between font-medium text-gray-700 text-left group/meeting">
                                    <button
                                      onClick={() => toggleFolder(meetingKey)}
                                      className="flex items-center space-x-2.5 flex-1"
                                    >
                                      <IconChevronRight
                                        className={`w-4 h-4 text-gray-400 transform transition-transform duration-200 ${isMeetingExpanded ? 'rotate-90' : ''}`}
                                      />
                                      <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                                        <IconFolder className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <span className="font-semibold text-gray-800 text-sm">{meetingName}</span>
                                        <span className="text-xs text-gray-500 ml-2">
                                          ({meetingDocs.length} {meetingDocs.length === 1 ? 'documento' : 'documentos'})
                                        </span>
                                      </div>
                                    </button>
                                    {isManagement && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteMeeting(folderName, meetingName, cat);
                                        }}
                                        className="text-red-500 hover:text-red-700 p-2 opacity-0 group-hover/meeting:opacity-100 transition-opacity"
                                        title="Excluir reunião e todos os seus documentos"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>

                                  {/* Meeting Files */}
                                  {isMeetingExpanded && (
                                    <ul className="bg-gray-50/50 divide-y divide-gray-100 pl-6 border-t border-gray-100/30">
                                      {meetingDocs.map((doc) => (
                                        <li key={doc.id} className="pr-6 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                                          <div className="flex items-center space-x-3.5">
                                            <div className="w-8 h-8 bg-blue-50/60 text-blue-500 rounded-lg flex items-center justify-center shrink-0">
                                              <IconFileText className="w-4 h-4" />
                                            </div>
                                            <div>
                                              <h4 className="font-medium text-gray-800 text-sm">{doc.title}</h4>
                                              <div className="flex items-center text-[11px] text-gray-500 mt-0.5 space-x-2">
                                                <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                                                <span>&bull;</span>
                                                <span>{doc.file_size}</span>
                                                <span className="uppercase bg-gray-100 px-1 py-0.2 rounded text-[10px] text-gray-600 font-semibold">{doc.file_type}</span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center space-x-3">
                                            {isManagement && (
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
                                              className="text-farm-600 hover:text-farm-800 font-medium text-xs border border-farm-200 hover:border-farm-500 px-3.5 py-1.5 rounded-lg transition-all bg-white"
                                            >
                                              Baixar
                                            </a>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              );
                            })}

                            {/* Files directly in Year Folder root (no meeting) */}
                            {folderRootDocs.map((doc) => (
                              <div key={doc.id} className="pr-6 py-3.5 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                                <div className="flex items-center space-x-3.5">
                                  <div className="w-9 h-9 bg-blue-50/80 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                                    <IconFileText className="w-4.5 h-4.5" />
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-gray-900 text-sm">{doc.title}</h4>
                                    <div className="flex items-center text-[11px] text-gray-500 mt-0.5 space-x-2">
                                      <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                                      <span>&bull;</span>
                                      <span>{doc.file_size}</span>
                                      <span className="uppercase bg-gray-100 px-1 py-0.2 rounded text-[10px] text-gray-600 font-semibold">{doc.file_type}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                  {isManagement && (
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
                                    className="text-farm-600 hover:text-farm-800 font-medium text-xs border border-farm-200 hover:border-farm-500 px-3.5 py-1.5 rounded-lg transition-all bg-white"
                                  >
                                    Baixar
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Root level documents (no folder) */}
                  {rootDocs.map((doc) => (
                    <div key={doc.id} className="px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
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
                        {isManagement && (
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
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};