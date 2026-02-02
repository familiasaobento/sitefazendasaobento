import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Reservation {
  id: number;
  check_in: string;
  check_out: string;
  num_guests: number;
  accommodation: string;
  status?: string;
  created_at: string;
}

export const ReservationsPage: React.FC<{ isAdmin?: boolean; isVisitor?: boolean }> = ({ isAdmin, isVisitor }) => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [authEmail, setAuthEmail] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [visitorCpf, setVisitorCpf] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [numGuests, setNumGuests] = useState(1);
  const [guestsDetails, setGuestsDetails] = useState<{ name: string; age: string }[]>([{ name: '', age: '' }]);
  const [accommodation, setAccommodation] = useState('Casa Grande');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchReservations();
    if (isAdmin) {
      fetchAllReservations();
    }
  }, [isAdmin]);

  const fetchReservations = async () => {
    try {
      setFetching(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setAuthEmail(user.email || '');

      // Fetch profile to get full_name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (isVisitor) {
        setVisitorEmail(user.email || '');
        if (profile?.full_name) {
          setVisitorName(profile.full_name);
        }
      }

      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('user_id', user.id)
        .order('check_in', { ascending: false });

      if (error) throw error;
      setMyReservations(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar reservas:', err);
    } finally {
      setFetching(false);
    }
  };

  const fetchAllReservations = async () => {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          profiles:profiles!user_id(full_name)
        `)
        .order('check_in', { ascending: true });

      if (error) throw error;
      setAllReservations(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar todas as reservas:', err);
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    const promptMsg = newStatus === 'confirmed'
      ? 'Deseja confirmar esta reserva? Informe detalhes como n- do quarto/chalé (opcional):'
      : 'Deseja recusar esta reserva? Por favor, informe o motivo:';

    const adminNote = prompt(promptMsg);
    if (newStatus === 'rejected' && adminNote === null) return;
    if (newStatus === 'confirmed' && adminNote === null) return;

    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          status: newStatus,
          admin_notes: adminNote || ''
        })
        .eq('id', id);

      if (error) throw error;
      fetchAllReservations();
    } catch (err: any) {
      alert('Erro ao atualizar status: ' + err.message);
    }
  };

  const handleDeleteReservation = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta reserva permanentemente?')) return;
    try {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchAllReservations();
      fetchReservations();
    } catch (err: any) {
      alert('Erro ao excluir reserva: ' + err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleNumGuestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1;
    setNumGuests(value);

    setGuestsDetails(prev => {
      const newList = [...prev];
      if (value > prev.length) {
        for (let i = prev.length; i < value; i++) {
          newList.push({ name: '', age: '' });
        }
      } else if (value < prev.length) {
        newList.splice(value);
      }
      return newList;
    });
  };

  const handleGuestDetailChange = (index: number, field: 'name' | 'age', value: string) => {
    const newList = [...guestsDetails];
    newList[index] = { ...newList[index], [field]: value };
    setGuestsDetails(newList);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Você precisa estar logado para fazer uma reserva.');
      }

      const { error: insertError } = await supabase
        .from('reservations')
        .insert([
          {
            user_id: user.id,
            check_in: checkIn,
            check_out: checkOut,
            num_guests: numGuests,
            guests_details: guestsDetails,
            accommodation: accommodation,
            notes: `${notes}${isVisitor ? `\n\n--- Dados do Visitante ---\nNome: ${visitorName}\nCPF: ${visitorCpf}\nE-mail: ${visitorEmail}\nTelefone: ${visitorPhone}\nChegada Prevista: ${arrivalTime}\nSaída Prevista: ${departureTime}` : ''}`,
            status: 'pending'
          }
        ]);

      if (insertError) throw insertError;

      setSubmitted(true);
      // Reset form
      setName('');
      setVisitorName('');
      setVisitorCpf('');
      setVisitorEmail(authEmail);
      setVisitorPhone('');
      setArrivalTime('');
      setDepartureTime('');
      setCheckIn('');
      setCheckOut('');
      setNumGuests(1);
      setGuestsDetails([{ name: '', age: '' }]);
      setAccommodation('Casa Grande');
      setNotes('');

      fetchReservations(); // Refresh list
      if (isAdmin) fetchAllReservations();
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err: any) {
      console.error('Erro ao salvar reserva:', err);
      setError(err.message || 'Erro ao processar sua reserva. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <div className="max-w-2xl mx-auto no-print">
        <div className="mb-6 sm:mb-8 text-center px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-farm-900 font-serif">Reservas de Hospedagem</h2>
          <p className="text-sm sm:text-base text-gray-600 mt-2 italic sm:not-italic">Avise que você está indo para a fazenda</p>
        </div>

        {submitted ? (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-8 rounded-lg text-center shadow-sm fade-in">
            <p className="font-bold text-xl mb-2">Solicitação Enviada!</p>
            <p>Sua solicitação de reserva foi enviada para análise da administração. <br /> Você será avisado em breve sobre a confirmação.</p>
          </div>
        ) : (
          <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
            <div className="h-2 bg-farm-500 w-full"></div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  {isVisitor ? 'Nome do sócio anfitrião' : 'Nome do Sócio Principal'}
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500 transition-colors"
                  placeholder={isVisitor ? "Ex: Nome do Sócio que o convidou" : "Ex: João da Silva"}
                />
              </div>

              {isVisitor && (
                <div className="space-y-6 fade-in border-l-4 border-farm-200 pl-4 py-2 bg-farm-50/30 rounded-r-lg">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label htmlFor="visitorName" className="block text-sm font-medium text-gray-700 text-farm-800">Seu Nome Completo (Visitante)</label>
                      <input
                        type="text"
                        id="visitorName"
                        required
                        disabled
                        value={visitorName}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label htmlFor="visitorCpf" className="block text-sm font-medium text-gray-700">Seu CPF</label>
                        <input
                          type="text"
                          id="visitorCpf"
                          required
                          value={visitorCpf}
                          onChange={(e) => setVisitorCpf(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500 transition-colors bg-white"
                          placeholder="000.000.000-00"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="visitorPhone" className="block text-sm font-medium text-gray-700">Seu Telefone</label>
                        <input
                          type="tel"
                          id="visitorPhone"
                          required
                          value={visitorPhone}
                          onChange={(e) => setVisitorPhone(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500 transition-colors bg-white"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="visitorEmail" className="block text-sm font-medium text-gray-700">Seu E-mail (Cadastro)</label>
                      <input
                        type="email"
                        id="visitorEmail"
                        required
                        disabled
                        value={visitorEmail}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label htmlFor="checkin" className="block text-sm font-medium text-gray-700">Data de Chegada</label>
                  <input
                    type="date"
                    id="checkin"
                    required
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="checkout" className="block text-sm font-medium text-gray-700">Data de Saída</label>
                  <input
                    type="date"
                    id="checkout"
                    required
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500"
                  />
                </div>
              </div>

              {isVisitor && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 fade-in">
                  <div className="space-y-1">
                    <label htmlFor="arrivalTime" className="block text-sm font-medium text-gray-700">Horário Previsto de Chegada</label>
                    <input
                      type="time"
                      id="arrivalTime"
                      required
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="departureTime" className="block text-sm font-medium text-gray-700">Horário Previsto de Saída</label>
                    <input
                      type="time"
                      id="departureTime"
                      required
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="guests" className="block text-sm font-medium text-gray-700">Número de Pessoas (Total)</label>
                <input
                  type="number"
                  id="guests"
                  min="1"
                  required
                  value={numGuests}
                  onChange={handleNumGuestsChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500"
                  placeholder="Incluindo crianças"
                />
              </div>

              {numGuests > 0 && (
                <div className="space-y-4 fade-in">
                  <div className="flex items-center gap-2 pb-2 border-b border-farm-100">
                    <svg className="w-5 h-5 text-farm-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <label className="block text-sm font-semibold text-farm-800">Detalhes dos Integrantes</label>
                  </div>
                  <div className="space-y-3">
                    {guestsDetails.map((guest, index) => (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-farm-200">
                        <div className="md:col-span-2 space-y-1">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400">Nome Completo ({index + 1})</label>
                          <input
                            type="text"
                            value={guest.name}
                            onChange={(e) => handleGuestDetailChange(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500 outline-none transition-all placeholder:text-gray-300"
                            placeholder="Digite o nome"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400">Idade</label>
                          <input
                            type="number"
                            min="0"
                            value={guest.age}
                            onChange={(e) => handleGuestDetailChange(index, 'age', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500 outline-none transition-all placeholder:text-gray-300"
                            placeholder="Anos"
                            required
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="rooms" className="block text-sm font-medium text-gray-700">Acomodação Desejada</label>
                <select
                  id="rooms"
                  value={accommodation}
                  onChange={(e) => setAccommodation(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500 bg-white"
                >
                  <option>Casa Grande</option>
                  <option>Chalés</option>
                  <option>Casa de sócio</option>
                  <option>Somente visita (Sem necessidade de hospedagem)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Observações Adicionais</label>
                <textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 focus:border-farm-500"
                  placeholder="Ex: Não farei refeições, chegarei para o jantar, etc."
                ></textarea>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-farm-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-farm-700 transition-colors shadow-md hover:shadow-lg transform active:scale-95 duration-200 disabled:opacity-50"
                >
                  {loading ? 'Processando...' : 'Solicitar Reserva'}
                </button>
                <p className="text-xs text-gray-500 text-center mt-3">
                  * Ao clicar, as informações serão salvas no sistema da fazenda.
                </p>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto no-print">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
          <span className="w-2 h-8 bg-farm-500 rounded-full mr-3"></span>
          Minhas Próximas Reservas
        </h3>

        {fetching ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-farm-700"></div>
          </div>
        ) : myReservations.length === 0 ? (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
            Você ainda não possui reservas confirmadas.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myReservations.map((res) => (
              <div key={res.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-farm-100 text-farm-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
                    {res.accommodation}
                  </span>
                  <span className="text-[10px] text-gray-400">Ref: #{res.id}</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Chegada</p>
                      <p className="font-bold text-gray-800">{formatDate(res.check_in)}</p>
                    </div>
                    <div className="h-8 w-px bg-gray-100"></div>
                    <div className="flex-1">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Saída</p>
                      <p className="font-bold text-gray-800">{formatDate(res.check_out)}</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-gray-50 flex justify-between items-center text-sm">
                    <span className="text-gray-500">{res.num_guests} {res.num_guests === 1 ? 'pessoa' : 'pessoas'}</span>
                    <span className={`font-medium ${res.status === 'canceled' ? 'text-red-500' :
                      res.status === 'confirmed' ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                      {res.status === 'canceled' ? 'Cancelada' :
                        res.status === 'rejected' ? 'Recusada' :
                          res.status === 'confirmed' ? 'Confirmada' : 'Aguardando Análise'}
                    </span>
                  </div>
                  {(res as any).admin_notes && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 border-l-2 border-farm-300 italic">
                      <strong>Nota da Admin:</strong> {(res as any).admin_notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Lodging Management Section */}
      {
        isAdmin && (
          <div className="mt-16 space-y-6 pt-12 border-t border-gray-200 print:m-0 print:p-0">
            <style dangerouslySetInnerHTML={{
              __html: `
            @media print {
              @page {
                size: landscape;
                margin: 1cm;
              }
              body {
                background: white !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .no-print {
                display: none !important;
              }
              .print-area {
                position: static !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
                box-shadow: none !important;
              }
              table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-size: 10px !important;
              }
              th, td {
                border: 1px solid #e5e7eb !important;
                padding: 6px 8px !important;
                word-break: break-word !important;
                white-space: normal !important;
              }
              th {
                background-color: #f9fafb !important;
                color: #111827 !important;
              }
              /* Hide everything else */
              header, aside, main > div:not(.print-area), .max-w-2xl, .max-w-4xl {
                display: none !important;
              }
              main {
                margin: 0 !important;
                padding: 0 !important;
              }
            }
          `}} />

            <div className="flex items-center justify-between no-print">
              <div>
                <h3 className="text-2xl font-bold text-gray-800 font-serif flex items-center">
                  <span className="w-2 h-8 bg-farm-800 rounded-full mr-3"></span>
                  Gerenciamento de Hospedagem (ADM)
                </h3>
                <p className="text-sm text-gray-500 ml-5">Visualize todas as solicitações enviadas pelos sócios</p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-all border border-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Imprimir Lista
                </button>
                <button
                  onClick={fetchAllReservations}
                  className="flex items-center gap-1 text-xs text-farm-600 font-bold hover:bg-farm-50 px-3 py-2 rounded-lg transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Atualizar Lista
                </button>
              </div>
            </div>

            {/* Mobile Admin View (Cards) */}
            <div className="grid grid-cols-1 gap-4 md:hidden no-print">
              {allReservations.map((res) => (
                <div key={res.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-gray-900">
                        {(() => {
                          const profiles = (res as any).profiles;
                          if (Array.isArray(profiles)) return profiles[0]?.full_name || 'Usuário';
                          return profiles?.full_name || 'Usuário';
                        })()}
                      </p>
                      <p className="text-[10px] text-gray-400">ID: #{res.id} • {res.accommodation}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${res.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                      res.status === 'canceled' ? 'bg-red-100 text-red-700' :
                        res.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                      }`}>
                      {res.status === 'confirmed' ? 'Confirmada' :
                        res.status === 'rejected' ? 'Recusada' :
                          res.status === 'canceled' ? 'Cancelada' : 'Pendente'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-3 rounded-lg">
                    <div>
                      <p className="text-gray-400 uppercase font-bold text-[10px] mb-1">Chegada</p>
                      <p className="text-gray-700 font-bold">{formatDate(res.check_in)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase font-bold text-[10px] mb-1">Saída</p>
                      <p className="text-gray-700 font-bold">{formatDate(res.check_out)}</p>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-gray-200">
                      <p className="text-gray-400 uppercase font-bold text-[10px] mb-1">Hóspedes ({res.num_guests})</p>
                      <p className="text-gray-700 italic">
                        {res.guests_details?.map((g: any) => `${g.name} (${g.age})`).join(', ') || 'Sem detalhes'}
                      </p>
                    </div>
                  </div>

                  {res.notes && (
                    <div className="text-xs text-gray-600 italic px-2">
                      "{res.notes}"
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    {res.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(res.id, 'confirmed')}
                          className="flex-1 bg-green-600 text-white font-bold py-2 rounded-lg text-xs"
                        >
                          Aceitar
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(res.id, 'rejected')}
                          className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg text-xs"
                        >
                          Recusar
                        </button>
                      </>
                    )}
                    {res.status === 'confirmed' && (
                      <button
                        onClick={() => handleUpdateStatus(res.id, 'canceled')}
                        className="flex-1 bg-orange-500 text-white font-bold py-2 rounded-lg text-xs"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteReservation(res.id)}
                      className="bg-red-50 text-red-500 p-2 rounded-lg border border-red-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (Admin) */}
            <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm print-area hidden md:block">
              <div className="hidden print:block mb-6">
                <h1 className="text-2xl font-bold text-gray-900 border-b-2 border-farm-800 pb-2">Fazenda São Bento - Relatório de Hospedagem</h1>
                <p className="text-sm text-gray-500 mt-1">Relatório gerado em: {new Date().toLocaleString('pt-BR')}</p>
              </div>

              <table className="w-full bg-white text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-bold text-gray-700">Sócio</th>
                    <th className="px-6 py-4 font-bold text-gray-700">Acomodação</th>
                    <th className="px-6 py-4 font-bold text-gray-700">Chegada</th>
                    <th className="px-6 py-4 font-bold text-gray-700">Saída</th>
                    <th className="px-6 py-4 font-bold text-gray-700">Pessoas</th>
                    <th className="px-6 py-4 font-bold text-gray-700">Observações</th>
                    <th className="px-6 py-4 font-bold text-gray-700">Status</th>
                    <th className="px-6 py-4 font-bold text-gray-700 no-print text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allReservations.map((res) => (
                    <tr key={res.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-800">
                          {(() => {
                            const profiles = (res as any).profiles;
                            if (Array.isArray(profiles)) return profiles[0]?.full_name || 'Usuário';
                            return profiles?.full_name || 'Usuário';
                          })()}
                        </p>
                        <p className="text-[10px] text-gray-400">ID: #{res.id}</p>
                      </td>
                      <td className="px-6 py-4">{res.accommodation}</td>
                      <td className="px-6 py-4">{formatDate(res.check_in)}</td>
                      <td className="px-6 py-4">{formatDate(res.check_out)}</td>
                      <td className="px-6 py-4">
                        <p className="font-medium">{res.num_guests} {res.num_guests === 1 ? 'pessoa' : 'pessoas'}</p>
                        {res.guests_details && res.guests_details.length > 0 && (
                          <div className="text-[10px] text-gray-500 mt-1">
                            <span className="font-bold">Acompanhantes:</span><br />
                            {res.guests_details.map((g: any) => `${g.name} (${g.age} anos)`).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-600 max-w-[250px] whitespace-normal">
                          {res.notes || <span className="text-gray-300 italic">Sem observações</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${res.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          res.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            res.status === 'canceled' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                          }`}>
                          {res.status === 'confirmed' ? 'Confirmada' :
                            res.status === 'rejected' ? 'Recusada' :
                              res.status === 'canceled' ? 'Cancelada' : 'Pendente'}
                        </span>
                        {res.admin_notes && (
                          <p className="text-[9px] text-gray-500 mt-1 italic max-w-[120px] truncate" title={res.admin_notes}>
                            Obs: {res.admin_notes}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 no-print text-center space-x-2">
                        {res.status === 'pending' && (
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleUpdateStatus(res.id, 'confirmed')}
                              className="text-green-600 hover:text-green-800 font-bold text-[10px] bg-green-50 px-2 py-1 rounded border border-green-100"
                            >
                              Aceitar
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(res.id, 'rejected')}
                              className="text-red-600 hover:text-red-800 font-bold text-[10px] bg-red-50 px-2 py-1 rounded border border-red-100"
                            >
                              Recusar
                            </button>
                          </div>
                        )}
                        {res.status === 'confirmed' && (
                          <button
                            onClick={() => handleUpdateStatus(res.id, 'canceled')}
                            className="text-orange-600 hover:text-orange-800 font-bold text-[10px] bg-orange-50 px-2 py-1 rounded border border-orange-100"
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteReservation(res.id)}
                          className="text-red-500 hover:text-red-700 bg-red-50 p-1 rounded border border-red-100 transition-colors inline-flex align-middle"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {allReservations.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-400">Nenhuma reserva encontrada no sistema.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </div >
  );
};