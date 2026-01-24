import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EventItem {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date?: string;
  file_url?: string;
}

export const EventsPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin: isAdminProp }) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(isAdminProp || false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Sync prop with local state if needed (though local state is now initialized by prop)
  useEffect(() => {
    if (isAdminProp !== undefined) setIsAdmin(isAdminProp);
  }, [isAdminProp]);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const cleanupOldEvents = async () => {
    try {
      // Call the database function to delete old events
      await supabase.rpc('delete_old_events');
    } catch (err) {
      console.error('Erro na limpeza automática:', err);
    }
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
        .order('start_date', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Erro ao buscar eventos:', err);
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
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `event-attachments/${fileName}`;

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

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('events')
        .insert([{
          title: newTitle,
          description: newDescription,
          start_date: startDate,
          end_date: endDate || null,
          file_url: fileUrl || null
        }]);

      if (error) throw error;

      setNewTitle('');
      setNewDescription('');
      setStartDate('');
      setEndDate('');
      setFileUrl('');
      setShowAddForm(false);
      fetchEvents();
    } catch (err) {
      console.error('Erro ao adicionar evento:', err);
      alert('Erro ao adicionar evento.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatEventDate = (start: string, end?: string) => {
    const startDateObj = new Date(start + 'T12:00:00');
    const startStr = startDateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });

    if (end && end !== start) {
      const endDateObj = new Date(end + 'T12:00:00');
      const endStr = endDateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
      return `${startStr} até ${endStr}`;
    }

    return startDateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-farm-900 font-serif">Agenda da Fazenda</h2>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-farm-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
          >
            {showAddForm ? 'Cancelar' : '+ Novo Evento'}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-xl shadow-md border border-farm-100 mb-8 fade-in">
          <h3 className="text-xl font-bold text-farm-800 mb-4">Adicionar Novo Evento</h3>
          <form onSubmit={handleAddEvent} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título do Evento</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                placeholder="Ex: Reunião de Sócios"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de Início</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de Término (Opcional)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anexar Detalhamento</label>
                <div className="relative">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="event-file-upload"
                    disabled={uploadingFile}
                  />
                  <label
                    htmlFor="event-file-upload"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Resumo da Descrição</label>
              <textarea
                required
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                placeholder="Descreva resumidamente o que acontecerá..."
              ></textarea>
            </div>
            <button
              type="submit"
              disabled={submitting || uploadingFile}
              className="w-full bg-farm-600 text-white font-bold py-2 rounded-lg hover:bg-farm-700 disabled:opacity-50 transition-all"
            >
              {submitting ? 'Salvando...' : 'Salvar Evento'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-farm-700"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-12 text-center text-gray-500">
          Nenhum evento agendado no momento.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <div key={event.id} className="bg-white rounded-xl shadow-sm border-l-4 border-farm-500 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-5">
                <div className="text-sm font-bold text-farm-600 mb-1">
                  {formatEventDate(event.start_date, event.end_date)}
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{event.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">{event.description}</p>

                {event.file_url && (
                  <a
                    href={event.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-bold text-farm-700 bg-farm-50 px-3 py-2 rounded-lg hover:bg-farm-100 transition-colors w-full justify-center border border-farm-100"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Detalhes do Evento (Arquivo)
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}


    </div>
  );
};