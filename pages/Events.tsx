import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EventItem {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date?: string;
}

export const EventsPage: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEvents();
    checkAdmin();
    // Run cleanup of old events
    cleanupOldEvents();
  }, []);

  const cleanupOldEvents = async () => {
    try {
      // Call the database function to delete old events
      await supabase.rpc('delete_old_events');
    } catch (err) {
      console.error('Erro na limpeza automática:', err);
    }
  };

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
          end_date: endDate || null
        }]);

      if (error) throw error;

      setNewTitle('');
      setNewDescription('');
      setStartDate('');
      setEndDate('');
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                required
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
                placeholder="Descreva o que acontecerá..."
              ></textarea>
            </div>
            <button
              type="submit"
              disabled={submitting}
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
                <p className="text-gray-600 text-sm leading-relaxed">{event.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}


    </div>
  );
};