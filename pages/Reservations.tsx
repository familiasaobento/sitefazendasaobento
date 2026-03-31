import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Page } from '../types';
import { 
  IconCalendar, IconHome, IconUser, IconMail, IconCheck, IconX,
  IconLoader, IconPrinter, IconMap, IconList, IconZap,
  IconFileText, IconPhone, IconClock, IconSearch
} from '../components/Icons';
import { VisualizadorProforma } from '../components/VisualizadorProforma';

interface Profile {
  full_name: string;
  avatar_url?: string;
}

interface Reservation {
  id: number;
  user_id: string;
  name: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  accommodation: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'canceled' | 'em_curso';
  notes?: string;
  created_at: string;
  profiles?: Profile;
  guests_details?: any[];
  estadias?: any[];
}

const ACCOMMODATIONS_BASE = [
  ...Array.from({ length: 16 }, (_, i) => `Casa Grande - Quarto/Suíte ${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `Chalé ${i + 1}`),
  'Casa de Sócio',
  'Day-Use'
];

const ReservationsPage: React.FC<{ isAdmin?: boolean; isVisitor?: boolean; onNavigate?: (page: Page) => void }> = ({ isAdmin: isAdminProp, isVisitor: isVisitorProp, onNavigate }) => {
  const [isAdmin, setIsAdmin] = useState(isAdminProp || false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [adminTab, setAdminTab] = useState<'list' | 'map' | 'form' | 'in_house' | 'history' | 'planning' | 'guest_requests'>('map');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [historyStays, setHistoryStays] = useState<any[]>([]);
  const [activeStays, setActiveStays] = useState<any[]>([]);
  const [planningRange, setPlanningRange] = useState<7 | 15 | 30>(7);

  // Calculate Dynamic Groups for Map
  const getDynamicGroups = () => {
    const casaGrande = Array.from({ length: 16 }, (_, i) => `Casa Grande - Quarto/Suíte ${i + 1}`);
    const chales = Array.from({ length: 8 }, (_, i) => `Chalé ${i + 1}`);
    
    // Find all "Casa de Sócio" reservations for the selected month
    const viewStart = new Date(selectedYear, selectedMonth, 1);
    const viewEnd = new Date(selectedYear, selectedMonth + 1, 0);
    
    const socioUnitsSet = new Set<string>();
    allReservations.forEach(r => {
      if (r.accommodation.includes('Casa de Sócio')) {
        const start = new Date(r.check_in + 'T00:00:00');
        const end = new Date(r.check_out + 'T00:00:00');
        if (start <= viewEnd && end >= viewStart) {
          // Identify the unit by the soci name to create a dedicated row
          const identifyingName = r.name || r.profiles?.full_name || 'Hóspede Sócio';
          socioUnitsSet.add(`Casa de Sócio - ${identifyingName}`);
        }
      }
    });

    return [
      { name: 'Casa Grande', units: casaGrande },
      { name: 'Chalés', units: chales },
      { name: 'Casas de Sócios', units: Array.from(socioUnitsSet).sort() },
      { name: 'Outros', units: ['Day-Use'] }
    ];
  };

  const accommodationGroups = getDynamicGroups();

  // Integration States
  const [selectedStayId, setSelectedStayId] = useState<number | null>(null);
  const [showProforma, setShowProforma] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [selectedResForCheckin, setSelectedResForCheckin] = useState<any>(null);
  const [wristbandCodes, setWristbandCodes] = useState<string[]>([]);
  const [isProcessingCheckin, setIsProcessingCheckin] = useState(false);

  // Form States
  const [name, setName] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [numGuests, setNumGuests] = useState(1);
  const [accommodation, setAccommodation] = useState('A definir');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isVisitor, setIsVisitor] = useState(isVisitorProp || false);
  const [isMember, setIsMember] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [profileComplete, setProfileComplete] = useState(true);
  const [guestsDetails, setGuestsDetails] = useState<any[]>([{ name: '', age: '' }]);
  const [selectedRoomsForApproval, setSelectedRoomsForApproval] = useState<Record<number, string>>({});
  const [guestRequests, setGuestRequests] = useState<any[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setAuthEmail(user.email || '');
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, cpf, phone')
        .eq('id', user.id)
        .single();
      
      const adminRoles = ['admin', 'site_admin', 'finance_manager', 'finance', 'master_cook'];
      const approvalRoles = ['admin', 'site_admin', 'finance_manager'];
      
      const userRole = profile?.role || (isVisitorProp ? 'visitor' : 'member');
      const isUserVisitor = userRole === 'visitor';
      const isUserMember = userRole === 'member';
      
      setIsVisitor(isUserVisitor);
      setIsMember(isUserMember);
      setCanApprove(profile && approvalRoles.includes(profile.role));

      // Check if profile is complete (CPF and Phone are required for visitors)
      if (isUserVisitor && (!profile?.cpf || !profile?.phone)) {
        setProfileComplete(false);
      } else {
        setProfileComplete(true);
      }

      if (profile && adminRoles.includes(userRole)) {
        setIsAdmin(true);
        fetchAllReservations();
        fetchGuestRequests();
      } else {
        fetchReservations();
        setName(profile?.full_name || '');
      }
    }
    setFetching(false);
  };

  const fetchReservations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          estadias:estadias!reserva_id(*)
        `)
        .eq('user_id', user.id)
        .order('check_in', { ascending: true });
      
      if (error) console.error('Error fetching reservations:', error);
      else setReservations(data || []);
    }
  };

  const fetchAllReservations = async () => {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          profiles:profiles!user_id(full_name),
          estadias:estadias!reserva_id(*)
        `)
        .order('check_in', { ascending: true });

      if (error) throw error;
      setAllReservations(data || []);
      
      // Update derived stats
      setActiveStays(data?.filter(r => r.estadias?.[0]?.status === 'ativa') || []);
      setHistoryStays(data?.filter(r => r.estadias?.[0]?.status === 'finalizada').sort((a,b) => new Date(b.estadias[0].checkout_at).getTime() - new Date(a.estadias[0].checkout_at).getTime()) || []);
      
    } catch (err: any) {
      console.error('Erro ao buscar todas as reservas:', err);
    }
  };

  const fetchGuestRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('guest_reservations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGuestRequests(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar solicitações públicas:', err);
    }
  };

  const handleActionGuestRequest = async (requestId: string, action: 'approve' | 'reject', currentRequest?: any) => {
    let accommodation = '';
    if (action === 'approve') {
      // Tenta pegar do seletor da tabela primeiro
      const preSelected = selectedRoomsForApproval[requestId];
      
      if (preSelected) {
        accommodation = preSelected;
      } else {
        const promptValue = window.prompt(
          'Informe a acomodação designada (ex: Chalé 01, Casa Grande):', 
          currentRequest?.preferred_accommodation || ''
        );
        if (promptValue === null) return; // Cancelled
        accommodation = promptValue || 'A definir';
      }
    }

    if (action === 'approve' && !window.confirm(`Deseja aprovar para ${accommodation}? Isso criará o acesso e enviará o voucher.`)) return;
    if (action === 'reject' && !window.confirm('Deseja recusar esta solicitação?')) return;

    setProcessingRequestId(requestId);
    try {
      if (action === 'approve') {
        const { data, error } = await supabase.functions.invoke('manage-guest-request', {
          body: { action: 'approve', requestId, accommodation }
        });

        if (error) throw error;
        alert('Reserva aprovada! O visitante recebeu o voucher por e-mail.');
      } else {
        const { error } = await supabase
          .from('guest_reservations')
          .update({ status: 'rejected' })
          .eq('id', requestId);

        if (error) throw error;
        alert('Solicitação recusada.');
      }
      
      await fetchGuestRequests();
      await fetchAllReservations();
    } catch (err: any) {
      alert('Erro ao processar solicitação: ' + err.message);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string, finalAccommodation?: string) => {
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ 
          status: newStatus,
          ...(finalAccommodation && { accommodation: finalAccommodation })
        })
        .eq('id', id);

      if (error) throw error;
      await Promise.all([
        fetchAllReservations(),
        fetchReservations()
      ]);
    } catch (err: any) {
      alert('Erro ao atualizar status: ' + err.message);
    }
  };

  const handleDeleteReservation = async (id: number) => {
    const res = allReservations.find(r => r.id === id);
    if (res?.estadias?.length > 0) {
      alert('Não é possível excluir esta reserva porque ela já possui uma estadia (ativa ou encerrada) vinculada. Para cancelar, altere o status para "Cancelada" ou "Recusada".');
      return;
    }

    if (!window.confirm('Tem certeza que deseja excluir esta reserva permanentemente?')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await Promise.all([
        fetchAllReservations(),
        fetchReservations()
      ]);
      
      alert('Reserva excluída com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir reserva: ' + (err.message || 'Erro desconhecido ao tentar excluir.'));
    } finally {
      setLoading(false);
    }
  };

  const handleStartCheckin = (res: any) => {
    setSelectedResForCheckin(res);
    // Initialize wristband codes with empty strings for all guests
    const codes = Array.isArray(res.guests_details) 
      ? res.guests_details.map(() => '') 
      : Array(res.num_guests || 1).fill('');
    setWristbandCodes(codes);
    setShowCheckinModal(true);
  };

  const handleConfirmCheckin = async () => {
    if (!selectedResForCheckin) return;
    
    setIsProcessingCheckin(true);
    try {
      const guests = Array.isArray(selectedResForCheckin.guests_details) 
        ? selectedResForCheckin.guests_details 
        : [{ name: selectedResForCheckin.name || 'Hóspede 1', age: '' }];

      const stayInserts = guests.map((guest: any, idx: number) => {
        const manualCode = wristbandCodes[idx];
        const finalWristband = manualCode || `FB-${selectedResForCheckin.id}-${idx + 1}-${Math.floor(Math.random()*1000)}`;
        
        return {
          reserva_id: selectedResForCheckin.id,
          status: 'ativa',
          codigo_pulseira: finalWristband,
          checkin_at: new Date().toISOString(),
          hospede_nome: guest.name || `Hóspede ${idx + 1}`,
          hospede_idade: guest.age ? parseInt(guest.age) : null
        };
      });

      const { error: stayError } = await supabase
        .from('estadias')
        .insert(stayInserts);

      if (stayError) throw stayError;

      const { error: resError } = await supabase
        .from('reservations')
        .update({ status: 'em_curso' })
        .eq('id', selectedResForCheckin.id);

      if (resError) throw resError;

      setShowCheckinModal(false);
      fetchAllReservations();
      alert(`Check-in de ${stayInserts.length} pulseiras realizado com sucesso!`);
    } catch (err: any) {
      alert('Erro ao realizar check-in: ' + err.message);
    } finally {
      setIsProcessingCheckin(false);
    }
  };

  const handleViewProforma = (stayId: number) => {
    setSelectedStayId(stayId);
    setShowProforma(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('reservations')
        .insert([{
          user_id: user.id,
          name,
          check_in: checkIn,
          check_out: checkOut,
          num_guests: numGuests,
          accommodation: canApprove ? accommodation : 'A definir',
          status: canApprove ? 'confirmed' : 'pending',
          notes,
          guests_details: guestsDetails
        }]);

      if (error) throw error;
      
      setSubmitted(true);
      fetchReservations();
      if (isAdmin) fetchAllReservations();

      // Reset form
      setName('');
      setCheckIn('');
      setCheckOut('');
      setNumGuests(1);
      setNotes('');
      setAccommodation('A definir');
      setGuestsDetails([{ name: '', age: '' }]);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNumGuestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 1;
    setNumGuests(val);
    const newDetails = [...guestsDetails];
    if (val > newDetails.length) {
      for (let i = newDetails.length; i < val; i++) {
        newDetails.push({ name: '', age: '' });
      }
    } else {
      newDetails.splice(val);
    }
    setGuestsDetails(newDetails);
  };

  const handleGuestDetailChange = (index: number, field: string, value: string) => {
    const newDetails = [...guestsDetails];
    newDetails[index] = { ...newDetails[index], [field]: value };
    setGuestsDetails(newDetails);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
  };

  const handlePrint = () => {
    window.print();
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-64">
        <IconLoader className="w-12 h-12 text-farm-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-12 pb-20">
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            @page { size: landscape; margin: 1cm; }
            body { background: white !important; -webkit-print-color-adjust: exact !important; }
            .no-print { display: none !important; }
            .print-area { position: static !important; width: 100% !important; margin: 0 !important; }
            table { font-size: 10px !important; }
            th, td { border: 1px solid #e5e7eb !important; padding: 6px !important; }
            header, aside, main > div:not(.print-area), .max-w-2xl, .max-w-4xl { display: none !important; }
          }
        `}} />

        {/* Header Section */}
        <div className="flex flex-col gap-6 no-print px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 font-serif flex items-center gap-3 italic">
                <IconCalendar className="w-8 h-8 md:w-10 md:h-10 text-farm-800" />
                {isAdmin ? 'Gestão de Ocupação & Reservas' : 'Minhas Reservas'}
              </h2>
              <p className="text-gray-500 text-sm md:text-lg mt-1 ml-1">
                {isAdmin 
                  ? 'Painel unificado para controle de hóspedes, mapa de ocupação e financeiro.' 
                  : 'Acompanhe suas reservas na Fazenda São Bento.'}
              </p>
            </div>

            {isAdmin && (
              <div className="bg-white p-1 rounded-2xl flex shadow-sm border border-gray-100 ring-1 ring-gray-50 overflow-x-auto whitespace-nowrap max-w-full custom-scrollbar scrollbar-hide">
                <button onClick={() => setAdminTab('map')} className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-xs flex-shrink-0 ${adminTab === 'map' ? 'bg-farm-600 text-white shadow-lg shadow-farm-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <IconMap className="w-4 h-4" /> Mapa
                </button>
                <button onClick={() => setAdminTab('list')} className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-xs flex-shrink-0 ${adminTab === 'list' ? 'bg-farm-600 text-white shadow-lg shadow-farm-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <IconList className="w-4 h-4" /> Pedidos {guestRequests.filter(r => r.status === 'pending').length > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ring-2 ring-white">{guestRequests.filter(r => r.status === 'pending').length}</span>}
                </button>
                <button onClick={() => setAdminTab('in_house')} className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-xs flex-shrink-0 ${adminTab === 'in_house' ? 'bg-farm-600 text-white shadow-lg shadow-farm-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <IconZap className="w-4 h-4" /> Na Casa
                </button>
                <button onClick={() => setAdminTab('history')} className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-xs flex-shrink-0 ${adminTab === 'history' ? 'bg-farm-600 text-white shadow-lg shadow-farm-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <IconFileText className="w-4 h-4" /> Histórico
                </button>
                <button onClick={() => setAdminTab('planning')} className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-xs flex-shrink-0 ${adminTab === 'planning' ? 'bg-farm-600 text-white shadow-lg shadow-farm-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <IconClock className="w-4 h-4" /> Planejamento
                </button>
                <button onClick={() => setAdminTab('form')} className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-xs flex-shrink-0 ${adminTab === 'form' ? 'bg-farm-600 text-white shadow-lg shadow-farm-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <IconHome className="w-4 h-4" /> Novo
                </button>
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="animate-fade-in no-print px-4">
            {adminTab === 'map' && (
              <div className="bg-white rounded-3xl shadow-xl border border-gray-100 print-area relative">
                <div className="p-6 bg-gray-50 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => {
                        if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); }
                        else { setSelectedMonth(selectedMonth - 1); }
                      }} className="p-2 hover:bg-white rounded-xl shadow-sm transition-all text-gray-400 hover:text-farm-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <h3 className="text-xl font-bold text-gray-800 w-48 text-center capitalize font-serif">
                      {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(selectedYear, selectedMonth))}
                    </h3>
                    <button onClick={() => {
                        if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); }
                        else { setSelectedMonth(selectedMonth + 1); }
                      }} className="p-2 hover:bg-white rounded-xl shadow-sm transition-all text-gray-400 hover:text-farm-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                  <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100"><div className="w-2 h-2 bg-blue-600 rounded-full"></div> Hóspede</span>
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg border border-green-100"><div className="w-2 h-2 bg-green-500 rounded-full"></div> Confirmada</span>
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-100"><div className="w-2 h-2 bg-yellow-400 rounded-full"></div> Pendentes</span>
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-500 rounded-lg border border-gray-100"><div className="w-2 h-2 bg-gray-400 rounded-full"></div> Encerrada</span>
                  </div>
                  <button onClick={handlePrint} className="px-4 py-2 bg-farm-50 text-farm-700 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-farm-100">
                    <IconPrinter className="w-4 h-4" /> Mapa para Impressão
                  </button>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <div className="min-w-[1400px] w-full">
                    <div className="flex bg-gray-50/50">
                      <div className="w-48 flex-shrink-0 p-4 font-black text-[10px] text-gray-400 uppercase tracking-widest border-r border-gray-100 sticky left-0 bg-gray-50 z-30">Acomodação</div>
                      <div className="flex-1 flex overflow-hidden">
                        {Array.from({ length: new Date(selectedYear, selectedMonth + 1, 0).getDate() }).map((_, i) => {
                          const isToday = new Date().getDate() === i+1 && new Date().getMonth() === selectedMonth && new Date().getFullYear() === selectedYear;
                          return (
                            <div key={i} className={`flex-1 text-center p-3 border-r border-gray-100 text-[11px] font-bold ${isToday ? 'bg-farm-600 text-white shadow-inner' : 'text-gray-500'}`}>
                              {i + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {accommodationGroups.map((group) => (
                      <React.Fragment key={group.name}>
                        <div className="bg-gray-100/50 p-2 text-[10px] font-black text-farm-700 uppercase tracking-widest pl-6 border-b border-gray-100 w-full sticky left-0 z-20">
                          {group.name}
                        </div>
                        {group.units.map((unit) => (
                          <div key={unit} className="flex border-b border-gray-100 group">
                            <div className="w-48 flex-shrink-0 p-4 font-bold text-[11px] text-gray-600 bg-gray-50/20 border-r border-gray-100 group-hover:bg-amber-50 transition-colors truncate sticky left-0 z-20 bg-white" title={unit}>
                              {unit.replace('Casa Grande - ', '')}
                            </div>
                            <div className="flex-1 flex relative h-14">
                              {Array.from({ length: new Date(selectedYear, selectedMonth + 1, 0).getDate() }).map((_, i) => (
                                <div key={i} className="flex-1 border-r border-gray-50/50"></div>
                              ))}

                              <div className="absolute inset-0">
                                {allReservations
                                  .filter(r => {
                                    if (unit.startsWith('Casa de Sócio - ')) {
                                      const identifies = r.name || r.profiles?.full_name || 'Hóspede Sócio';
                                      return r.accommodation.includes('Casa de Sócio') && identifies !== 'A definir' && unit.includes(identifies);
                                    }
                                    return r.accommodation === unit && r.status !== 'pending' && r.status !== 'rejected' && r.status !== 'canceled';
                                  })
                                  .filter(r => {
                                    const start = new Date(r.check_in + 'T00:00:00');
                                    const end = new Date(r.check_out + 'T00:00:00');
                                    const viewStart = new Date(selectedYear, selectedMonth, 1);
                                    const viewEnd = new Date(selectedYear, selectedMonth + 1, 0);
                                    return start <= viewEnd && end >= viewStart;
                                  })
                                  .map(r => {
                                    const start = new Date(r.check_in + 'T00:00:00');
                                    const end = new Date(r.check_out + 'T00:00:00');
                                    const monthDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                                    const startDay = Math.max(1, (start.getMonth() === selectedMonth && start.getFullYear() === selectedYear) ? start.getDate() : 1);
                                    const endDay = Math.min(monthDays, (end.getMonth() === selectedMonth && end.getFullYear() === selectedYear) ? end.getDate() : monthDays);
                                    const left = ((startDay - 1) / monthDays) * 100;
                                    const width = ((endDay - startDay + 1) / monthDays) * 100;
                                    
                                    const stay = r.estadias?.[0];
                                    const isActive = stay?.status === 'ativa';
                                    const isFinished = stay?.status === 'finalizada';
                                    const isCheckinPossible = r.status === 'confirmed' && !isActive && !isFinished;

                                    let barColor = 'bg-yellow-400';
                                    if (isActive) barColor = 'bg-blue-600 shadow-lg ring-2 ring-blue-100 z-10';
                                    else if (isFinished) barColor = 'bg-gray-400 opacity-60';
                                    else if (r.status === 'confirmed') barColor = 'bg-green-500';

                                    return (
                                      <div
                                        key={r.id}
                                        onClick={() => {
                                          if ((isActive || isFinished) && stay?.id) {
                                            setSelectedStayId(stay.id);
                                            setShowProforma(true);
                                          } else if (isCheckinPossible) {
                                            handleStartCheckin(r);
                                          }
                                        }}
                                        className={`absolute top-1.5 bottom-1.5 rounded-lg shadow-sm p-2 text-[9px] font-bold text-white overflow-hidden whitespace-nowrap transition-all hover:z-20 hover:scale-y-105 border border-white/20 ${barColor} ${(isActive || isCheckinPossible || isFinished) ? 'cursor-pointer' : 'cursor-default'}`}
                                        style={{ left: `${left}%`, width: `${width}%` }}
                                        title={`${r.name || r.profiles?.full_name || 'Hóspede'} (${formatDate(r.check_in)} - ${formatDate(r.check_out)})`}
                                      >
                                        <div className="flex items-center gap-1 overflow-hidden">
                                          {isActive && <IconZap className="w-2.5 h-2.5 flex-shrink-0" />}
                                          {isFinished && <IconCheck className="w-2.5 h-2.5 flex-shrink-0" />}
                                          <span className="truncate">{r.name || r.profiles?.full_name || 'Hóspede'}</span>
                                        </div>
                                      </div>
                                    );
                                  })
                                }
                              </div>
                            </div>
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'list' && (
              <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
                  <table className="w-full text-left text-sm min-w-[1200px]">
                    <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                      <tr>
                        <th className="px-8 py-5 font-black text-gray-500 text-[10px] w-64">Sócio / Hóspede</th>
                        <th className="px-8 py-5 font-black text-gray-500 text-[10px] w-72">Acomodação Designada</th>
                        <th className="px-8 py-5 font-black text-gray-500 text-[10px] w-48">Período Estadia</th>
                        <th className="px-8 py-5 font-black text-gray-500 text-[10px] w-32">Status</th>
                        <th className="px-8 py-5 no-print text-center font-black text-gray-500 text-[10px] w-64">Ações Disponíveis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        ...allReservations.filter(res => {
                          const stay = res.estadias?.[0];
                          if (stay?.status === 'finalizada' && stay.checkout_at) {
                            const checkoutDate = new Date(stay.checkout_at);
                            const limitDate = new Date();
                            limitDate.setMonth(limitDate.getMonth() - 1);
                            return checkoutDate > limitDate;
                          }
                          return true;
                        }),
                        ...guestRequests.filter(r => r.status === 'pending').map(r => ({
                          ...r,
                          isGuestRequest: true,
                          accommodation: 'A definir',
                          status: 'pending'
                        }))
                      ]
                      .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())
                      .map((res) => {
                        const isGuestRequest = (res as any).isGuestRequest;
                        return (
                        <tr key={res.id} className={`hover:bg-gray-50/50 transition-colors border-b border-gray-50 ${isGuestRequest ? 'bg-amber-50/20 border-l-4 border-l-amber-400' : ''}`}>
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ring-2 ring-white shadow-sm ${isGuestRequest ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                {isGuestRequest ? <IconMail className="w-5 h-5" /> : (res.name?.[0] || res.full_name?.[0] || res.profiles?.full_name?.[0] || 'U')}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 leading-tight">{res.name || res.full_name || res.profiles?.full_name || 'Usuário'}</p>
                                <div className="flex gap-2 text-[10px] items-center mt-0.5">
                                  <span className="text-gray-400 font-mono">{res.cpf || 'Sem CPF'}</span>
                                  {isGuestRequest && (res as any).birth_date && <span className="bg-farm-50 text-farm-600 px-1 rounded font-bold text-[9px] border border-farm-100">{new Date((res as any).birth_date).toLocaleDateString('pt-BR')}</span>}
                                </div>
                                {isGuestRequest && <p className="text-[9px] text-amber-600 mt-1 italic font-medium">Anfitrião: {(res as any).host_member_name}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            {res.status === 'pending' || isGuestRequest ? (
                              <div className={`p-3 rounded-2xl border ${isGuestRequest ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                  {isGuestRequest ? `Pretende: ${(res as any).preferred_accommodation || 'S/ Pref'}` : 'Nova Reserva'}
                                </p>
                                <select 
                                  value={selectedRoomsForApproval[res.id] || ''} 
                                  onChange={(e) => setSelectedRoomsForApproval(prev => ({ ...prev, [res.id]: e.target.value }))}
                                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-500 focus:border-transparent transition-all shadow-sm"
                                >
                                  <option value="">Atribuir Local...</option>
                                  {accommodationGroups.map(group => (
                                    <optgroup key={group.name} label={group.name}>
                                      {group.units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                      {group.name === 'Casas de Sócios' && group.units.length === 0 && <option value="Casa de Sócio">Casa de Sócio</option>}
                                    </optgroup>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <span className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-50 text-gray-600 border border-gray-100">
                                {res.accommodation}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-6">
                            <div className="flex flex-col gap-1.5 min-w-[130px]">
                              <div className="flex items-center gap-2 text-sm text-gray-800">
                                <IconCalendar className="w-3.5 h-3.5 text-farm-500" />
                                <span className="font-black">{formatDate(res.check_in)}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                                <span className="ml-5.5 italic">até {formatDate(res.check_out)}</span>
                              </div>
                              {res.arrival_time && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[10px] font-black w-fit border border-blue-100 uppercase">
                                  <IconClock className="w-3 h-3" /> {res.arrival_time}h
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-6">
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border-2 ${
                              res.estadias?.[0]?.status === 'ativa' ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-blue-50' :
                              res.estadias?.[0]?.status === 'finalizada' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                              res.status === 'confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                              res.status === 'rejected' || res.status === 'canceled' ? 'bg-red-50 text-red-700 border-red-200' :
                              isGuestRequest ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            }`}>
                              {res.estadias?.[0]?.status === 'ativa' ? 'Hóspede Local' :
                               res.estadias?.[0]?.status === 'finalizada' ? 'Encerrada' :
                               res.status === 'confirmed' ? 'Confirmada' : 
                               isGuestRequest ? 'AGUARDANDO' : 'PENDENTE'}
                            </span>
                          </td>
                          <td className="px-8 py-6 no-print text-center">
                             <div className="flex items-center justify-center gap-2">
                               {isGuestRequest ? (
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={() => handleActionGuestRequest(res.id, 'approve', res)}
                                      disabled={processingRequestId === res.id}
                                      className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 shadow-md shadow-green-100 transition-all flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      {processingRequestId === res.id ? <IconLoader className="w-3 h-3 animate-spin" /> : <IconCheck className="w-4 h-4" />} Aprovar
                                    </button>
                                    <button 
                                      onClick={() => handleActionGuestRequest(res.id, 'reject', res)}
                                      disabled={processingRequestId === res.id}
                                      className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-1.5"
                                    >
                                      <IconX className="w-4 h-4" /> Recusar
                                    </button>
                                  </div>
                               ) : res.status === 'pending' ? (
                                  <div className="flex gap-2">
                                    {canApprove ? (
                                      <>
                                        <button 
                                          onClick={() => {
                                            const room = selectedRoomsForApproval[res.id];
                                            if (!room) return alert('Por favor, atribua uma acomodação antes de aprovar.');
                                            handleUpdateStatus(res.id, 'confirmed', room);
                                          }} 
                                          className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 shadow-md shadow-green-100 transition-all flex items-center gap-1.5"
                                        >
                                          <IconCheck className="w-4 h-4" /> Aprovar
                                        </button>
                                        <button 
                                          onClick={() => handleUpdateStatus(res.id, 'rejected')} 
                                          className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100 transition-all"
                                        >
                                          Negar
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 italic">Pendente</span>
                                    )}
                                  </div>
                               ) : (
                                 <div className="flex gap-2">
                                   {(res.estadias?.[0]?.status === 'ativa' || res.estadias?.[0]?.status === 'finalizada') && (
                                     <button 
                                       onClick={() => handleViewProforma(res.estadias[0].id)} 
                                       className={`${res.estadias[0].status === 'ativa' ? 'bg-blue-600' : 'bg-farm-700'} text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2 hover:opacity-90 shadow-sm transition-all`} 
                                       title={res.estadias[0].status === 'ativa' ? "Ver Conta / Consumo" : "Ver Recibo Final"}
                                     >
                                       <IconFileText className="w-4 h-4" /> 
                                       {res.estadias[0].status === 'ativa' ? 'Gestão Financeira' : 'Ver Recibo'}
                                     </button>
                                   )}
                                   
                                   {res.status === 'confirmed' && !res.estadias?.[0]?.status && (
                                     <button onClick={() => handleStartCheckin(res)} className="bg-farm-600 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-farm-700 shadow-sm transition-all">
                                       <IconZap className="w-4 h-4" /> Dar Check-in
                                     </button>
                                   )}
                                 </div>
                               )}

                               <button onClick={() => isGuestRequest ? handleActionGuestRequest(res.id, 'reject', res) : handleDeleteReservation(res.id)} className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all ml-2" title="Excluir Permanentemente">
                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                               </button>
                             </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'in_house' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {activeStays.length === 0 ? (
                  <div className="col-span-full bg-white p-20 rounded-3xl border border-dashed border-gray-200 text-center">
                    <IconUser className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-400 font-serif">Nenhum hóspede ativo no momento</h3>
                    <p className="text-gray-400 mt-2">Clique em 'Dar Check-in' no Mapa ou Pedidos para iniciar uma estadia.</p>
                  </div>
                ) : (
                  activeStays.map(res => (
                    <div key={res.id} className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden hover:shadow-2xl transition-all group">
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-6">
                          <div className="bg-blue-50 p-4 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <IconUser className="w-8 h-8" />
                          </div>
                          <span className="bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-200">Na Casa</span>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 font-serif mb-1">{res.name || res.profiles?.full_name}</h3>
                        <p className="text-gray-500 flex items-center gap-2 mb-6">
                          <IconHome className="w-4 h-4" /> {res.accommodation}
                        </p>
                        <div className="bg-gray-50 rounded-2xl p-4 space-y-3 mb-6">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400 font-medium">Desde:</span>
                            <span className="text-gray-800 font-bold">{formatDate(res.check_in)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400 font-medium">Saída Prevista:</span>
                            <span className="text-blue-600 font-bold">{formatDate(res.check_out)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm pt-3 border-t border-gray-200">
                            <span className="text-gray-400 font-medium font-mono uppercase text-[10px]">Pulseira:</span>
                            <span className="text-gray-800 font-black font-mono">{res.estadias?.[0]?.codigo_pulseira}</span>
                          </div>
                        </div>
                        <button onClick={() => handleViewProforma(res.estadias[0].id)} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-100 flex items-center justify-center gap-2 transition-all">
                          <IconZap className="w-5 h-5" /> Abrir Comanda
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {adminTab === 'history' && (
              <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold text-gray-500">Hóspede</th>
                        <th className="px-6 py-4 font-semibold text-gray-500 text-center">Período</th>
                        <th className="px-6 py-4 font-semibold text-gray-500 text-center">Checkout em</th>
                        <th className="px-6 py-4 font-semibold text-gray-500 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {historyStays.map(res => (
                        <tr key={res.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-bold">
                                {res.name?.[0] || res.profiles?.full_name?.[0]}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800">{res.name || res.profiles?.full_name}</p>
                                <p className="text-[10px] text-gray-400">ID Estadia: #{res.estadias?.[0]?.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-center font-medium text-gray-600">
                            {formatDate(res.check_in)} - {formatDate(res.check_out)}
                          </td>
                          <td className="px-6 py-5 text-center text-gray-500 text-[11px] font-bold">
                             {new Date(res.estadias?.[0]?.checkout_at).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-5 text-center">
                            <button onClick={() => handleViewProforma(res.estadias[0].id)} className="bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-xl text-xs hover:bg-gray-200 transition-all flex items-center gap-2 mx-auto">
                              <IconFileText className="w-4 h-4" /> Recibo Final
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'form' && (
              <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl overflow-hidden border border-gray-100">
                <div className="h-2 bg-farm-600 w-full"></div>
                <div className="p-8">
                  <header className="mb-8">
                    <h3 className="text-2xl font-bold text-gray-800 font-serif">Lançar Nova Reserva</h3>
                    <p className="text-gray-400 mt-1">Utilize este formulário apenas para reservas manuais feitas por telefone ou presencial.</p>
                  </header>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-1">
                      <label className="block text-sm font-bold text-gray-700">Nome do Titular</label>
                      <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" placeholder="Ex: João da Silva" />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Chegada</label>
                        <input type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Saída</label>
                        <input type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Acomodação</label>
                        <select required value={accommodation} onChange={(e) => setAccommodation(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all bg-white">
                          {accommodationGroups.map(group => (
                            <optgroup key={group.name} label={group.name}>
                              {group.units.length > 0 ? (
                                group.units.map(unit => <option key={unit} value={unit}>{unit}</option>)
                              ) : (
                                group.name === 'Casas de Sócios' && <option value="Casa de Sócio">Casa de Sócio</option>
                              )}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Número de Pessoas</label>
                        <input type="number" min="1" required value={numGuests} onChange={handleNumGuestsChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>
                    </div>

                    {numGuests > 1 && (
                      <div className="space-y-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 animate-fade-in">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Detalhes dos Hóspedes Adicionais</p>
                        {guestsDetails.slice(1).map((_, i) => (
                          <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                            <input
                              type="text"
                              placeholder={`Nome do Hóspede ${i + 2}`}
                              required
                              value={guestsDetails[i + 1].name}
                              onChange={(e) => handleGuestDetailChange(i + 1, 'name', e.target.value)}
                              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-farm-500 outline-none"
                            />
                            <input
                              type="number"
                              placeholder="Idade"
                              required
                              value={guestsDetails[i + 1].age}
                              onChange={(e) => handleGuestDetailChange(i + 1, 'age', e.target.value)}
                              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-farm-500 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="block text-sm font-bold text-gray-700">Observações</label>
                      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" placeholder="Detalhes adicionais..."></textarea>
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-farm-600 text-white font-bold py-4 rounded-xl hover:bg-farm-700 transition-all shadow-lg shadow-farm-100 flex items-center justify-center gap-2">
                      {loading ? 'Processando...' : 'Confirmar Reserva Manual'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {adminTab === 'planning' && (
              <div className="bg-white rounded-3xl shadow-xl border border-gray-100 print-area overflow-hidden">
                <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 no-print">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 font-serif">Relatório de Planejamento</h3>
                    <p className="text-gray-400 text-sm mt-1">Visualize e imprima a previsão de ocupação para os próximos dias.</p>
                  </div>
                  <div className="flex gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                    {[7, 15, 30].map(days => (
                      <button 
                        key={days}
                        onClick={() => setPlanningRange(days as any)}
                        className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${planningRange === days ? 'bg-farm-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                      >
                        Próximos {days} dias
                      </button>
                    ))}
                  </div>
                  <button onClick={() => window.print()} className="bg-farm-50 text-farm-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-farm-100 transition-all border border-farm-100 shadow-sm">
                    <IconPrinter className="w-5 h-5" /> Imprimir Relatório
                  </button>
                </div>

                <div className="p-8">
                  {/* Print Header (Only visible on print) */}
                  <div className="hidden print:block text-center mb-8 border-b pb-6">
                    <h1 className="text-2xl font-bold uppercase tracking-widest text-farm-900">Relatório de Planejamento Fazenda São Bento</h1>
                    <p className="text-sm text-gray-500 mt-2">Período: Próximos {planningRange} dias ({new Date().toLocaleDateString('pt-BR')} até {new Date(Date.now() + (planningRange * 24 * 60 * 60 * 1000)).toLocaleDateString('pt-BR')})</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-widest font-black border-b border-gray-100">
                          <th className="px-6 py-4">Data Chegada</th>
                          <th className="px-6 py-4">Data Saída</th>
                          <th className="px-6 py-4">Hóspede Sócio</th>
                          <th className="px-6 py-4">Acomodação</th>
                          <th className="px-6 py-4 text-center">Pax (Pessoas)</th>
                          <th className="px-6 py-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-sm">
                        {allReservations
                          .filter(res => {
                            const checkInDate = new Date(res.check_in + 'T12:00:00');
                            const now = new Date();
                            now.setHours(0, 0, 0, 0);
                            const future = new Date();
                            future.setDate(now.getDate() + planningRange);
                            future.setHours(23, 59, 59, 999);
                            
                            // Include if it starts within the range OR is already in house
                            return (checkInDate >= now && checkInDate <= future) || 
                                   (res.status === 'em_curso');
                          })
                          .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())
                          .map(res => (
                            <tr key={res.id} className="hover:bg-gray-50/30 transition-colors">
                              <td className="px-6 py-4 font-bold text-gray-900 font-mono">{new Date(res.check_in + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                              <td className="px-6 py-4 text-gray-500 font-mono">{new Date(res.check_out + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                              <td className="px-6 py-4">
                                <p className="font-black text-farm-900">{res.name || res.profiles?.full_name}</p>
                                <p className="text-[10px] text-gray-400 truncate max-w-[150px]">{res.notes}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${res.accommodation === 'A definir' ? 'bg-red-50 text-red-600' : 'bg-farm-50 text-farm-700 border border-farm-100'}`}>
                                  {res.accommodation}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-lg font-bold">
                                  {res.num_guests}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`text-[10px] font-black uppercase tracking-tighter ${
                                  res.status === 'confirmed' ? 'text-green-600' : 
                                  res.status === 'pending' ? 'text-orange-500' : 
                                  res.status === 'em_curso' ? 'text-blue-600 animate-pulse' : 'text-gray-400'
                                }`}>
                                  {res.status === 'confirmed' ? 'Confirmada' : 
                                   res.status === 'pending' ? 'Pendente' : 
                                   res.status === 'em_curso' ? 'Em Curso' : res.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {allReservations.filter(res => {
                          const checkInDate = new Date(res.check_in + 'T12:00:00');
                          const now = new Date();
                          now.setHours(0,0,0,0);
                          const future = new Date();
                          future.setDate(now.getDate() + planningRange);
                          return (checkInDate >= now && checkInDate <= future) || (res.status === 'em_curso');
                        }).length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                               Nenhuma reserva planejada para este período.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-8 bg-farm-50 p-6 rounded-3xl border border-farm-100 flex flex-col md:flex-row gap-8 items-center no-print">
                      <div className="flex-1">
                        <h4 className="font-bold text-farm-900 mb-1 italic">Total previsto (PAX)</h4>
                        <p className="text-sm text-farm-700/70">Soma total de pessoas esperadas na Fazenda no período selecionado.</p>
                      </div>
                      <div className="text-4xl font-black text-farm-900 bg-white px-8 py-4 rounded-2xl shadow-sm border border-farm-200">
                        {allReservations.filter(res => {
                            const checkInDate = new Date(res.check_in + 'T12:00:00');
                            const now = new Date();
                            now.setHours(0,0,0,0);
                            const future = new Date();
                            future.setDate(now.getDate() + planningRange);
                            return (checkInDate >= now && checkInDate <= future) || (res.status === 'em_curso');
                          }).reduce((acc, r) => acc + r.num_guests, 0)}
                        <span className="text-xs text-farm-400 ml-2 uppercase tracking-widest font-bold font-sans">Pessoas</span>
                      </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* USER VIEW (Visitor/Partner) */}
        {!isAdmin && (
          <div className="space-y-12 no-print px-4">
            {!profileComplete && isVisitor && (
              <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 p-8 rounded-3xl text-center shadow-sm animate-fade-in translate-y-4">
                <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                  <IconUser className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-2xl font-bold text-amber-900 font-serif mb-3">Complete seu Cadastro</h3>
                <p className="text-amber-700 mb-8 max-w-md mx-auto leading-relaxed">
                  Para solicitar reservas na Fazenda São Bento, precisamos que você complete seu cadastro com <strong>CPF</strong> e <strong>Telefone</strong> primeiro. Isso ajuda na sua identificação e segurança.
                </p>
                <button
                   onClick={() => onNavigate ? onNavigate(Page.VISITOR_PROFILE) : window.location.hash = 'visitor_profile'}
                   className="bg-amber-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 flex items-center gap-2 mx-auto"
                >
                  <IconFileText className="w-5 h-5" />
                  Ir para Meu Cadastro
                </button>
              </div>
            )}

            {((profileComplete && isVisitor) || !isVisitor) && (
              <div className="max-w-2xl mx-auto">
                {submitted ? (
                  <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-8 rounded-2xl text-center shadow-sm animate-fade-in">
                    <p className="font-bold text-xl mb-2">Solicitação Enviada!</p>
                    <p>Sua solicitação de reserva foi enviada para análise da administração. <br /> Você será avisado em breve sobre a confirmação.</p>
                  </div>
                ) : (
                  <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
                    <div className="h-2 bg-farm-600 w-full"></div>
                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">{isVisitor ? 'Nome do sócio anfitrião' : 'Nome do Sócio Principal'}</label>
                        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="block text-sm font-bold text-gray-700">Chegada</label>
                          <input type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-sm font-bold text-gray-700">Saída</label>
                          <input type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Número de Pessoas</label>
                        <input type="number" min="1" required value={numGuests} onChange={handleNumGuestsChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>

                      {numGuests > 1 && (
                        <div className="space-y-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 animate-fade-in">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Detalhes dos Hóspedes Adicionais</p>
                          {guestsDetails.slice(1).map((_, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                              <input
                                type="text"
                                placeholder={`Nome do Hóspede ${i + 2}`}
                                required
                                value={guestsDetails[i + 1].name}
                                onChange={(e) => handleGuestDetailChange(i + 1, 'name', e.target.value)}
                                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-farm-500 outline-none"
                              />
                              <input
                                type="number"
                                placeholder="Idade"
                                required
                                value={guestsDetails[i + 1].age}
                                onChange={(e) => handleGuestDetailChange(i + 1, 'age', e.target.value)}
                                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-farm-500 outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Local de Hospedagem - Admin chooses later, only shown if user is admin now or if it's already set.
                          For visitors and members, we hide it as per request. */}
                      {!isVisitor && !isMember && (
                        <div className="space-y-1">
                          <label className="block text-sm font-bold text-gray-700">Local de Hospedagem</label>
                          <select required value={accommodation} onChange={(e) => setAccommodation(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all bg-white">
                            {ACCOMMODATIONS_BASE.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </div>
                      )}

                      {/* We'll set a placeholder if hidden */}
                      {(isVisitor || isMember) && (
                        <input type="hidden" value={accommodation} />
                      )}

                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Observações</label>
                        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" placeholder="Informações extras para a administração..."></textarea>
                      </div>

                      <button type="submit" disabled={loading} className="w-full bg-farm-600 text-white font-bold py-4 rounded-xl hover:bg-farm-700 transition-all shadow-lg shadow-farm-100 flex items-center justify-center gap-2">
                        {loading ? 'Processando...' : 'Solicitar Reserva'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* My Future Reservations for Users */}
            {reservations.length > 0 && (
              <div className="max-w-4xl mx-auto mt-12">
                <h3 className="text-2xl font-bold text-gray-800 font-serif mb-6">Minhas Próximas Reservas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {reservations.map(res => (
                    <div key={res.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative group overflow-hidden">
                      <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-xl text-[10px] font-black uppercase tracking-widest ${
                        (res.status === 'confirmed' || res.status === 'em_curso') ? 'bg-green-100 text-green-700' : 
                        res.status === 'rejected' ? 'bg-red-100 text-red-700' : 
                        res.status === 'finalizada' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {res.status === 'confirmed' ? 'Confirmada' : 
                         res.status === 'em_curso' ? 'Em Andamento' : 
                         res.status === 'finalizada' ? 'Encerrada' :
                         res.status === 'rejected' ? 'Negada' : 'Aguardando'}
                      </div>
                      <h4 className="font-bold text-gray-800 text-lg mb-2">{res.accommodation}</h4>
                      <div className="space-y-2 text-sm text-gray-500">
                        <p className="flex items-center gap-2"><IconClock className="w-4 h-4" /> {formatDate(res.check_in)} - {formatDate(res.check_out)}</p>
                        <p className="flex items-center gap-2"><IconUser className="w-4 h-4" /> {res.num_guests} hóspedes</p>
                      </div>
                      {(res.status === 'confirmed' || res.status === 'em_curso') && res.estadias?.[0]?.id && (
                        <button 
                          onClick={() => handleViewProforma(res.estadias[0].id)}
                          className="mt-6 w-full py-3 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs hover:bg-farm-50 hover:text-farm-700 transition-all border border-gray-100"
                        >
                          Ver Minha Comanda / Consumo
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Integration Modals */}
        {showProforma && selectedStayId && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => {
                setShowProforma(false);
                fetchAllReservations();
                fetchReservations();
              }}></div>
            <div className="flex min-h-full items-start md:items-center justify-center p-4 sm:p-6 lg:p-10 pointer-events-none">
              <div className="w-full max-w-4xl relative z-10 transform transition-all pointer-events-auto max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl custom-scrollbar">
                <VisualizadorProforma 
                  estadiaId={selectedStayId} 
                  onClose={() => {
                    setShowProforma(false);
                    fetchAllReservations();
                    fetchReservations();
                  }} 
                  isAdmin={isAdmin}
                />
              </div>
            </div>
          </div>
        )}

        {showCheckinModal && selectedResForCheckin && (
          <div className="fixed inset-0 z-50 overflow-y-auto no-print">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setShowCheckinModal(false)}></div>
            <div className="flex min-h-full items-start md:items-center justify-center p-4 sm:p-6">
              <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-fade-in relative z-10 w-full transform transition-all">
              <div className="h-2 bg-farm-600 w-full"></div>
              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-800 font-serif mb-2">Realizar Check-in</h3>
                <p className="text-gray-400 text-sm mb-6">Confirme os dados e vincule uma pulseira para iniciar a estadia de <strong>{selectedResForCheckin.name || selectedResForCheckin.profiles?.full_name}</strong>.</p>
                
                <div className="bg-gray-50 rounded-2xl p-6 mb-8 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium">Acomodação:</span>
                    <span className="font-bold text-gray-800">{selectedResForCheckin.accommodation}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium">Hóspedes:</span>
                    <span className="font-bold text-gray-800">{selectedResForCheckin.num_guests} pessoas</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Códigos das Pulseiras</label>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {(Array.isArray(selectedResForCheckin.guests_details) ? selectedResForCheckin.guests_details : [null]).map((guest: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-500">{guest?.name || `Hóspede ${idx + 1}`}</span>
                          <span className="text-[10px] text-gray-400 font-mono">#{idx+1}</span>
                        </div>
                        <input
                          type="text"
                          value={wristbandCodes[idx] || ''}
                          onChange={(e) => {
                            const newCodes = [...wristbandCodes];
                            newCodes[idx] = e.target.value;
                            setWristbandCodes(newCodes);
                          }}
                          className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm font-mono text-center"
                          placeholder="Manual (ou auto)"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 italic text-center">Campos vazios serão preenchidos automaticamente pelo sistema.</p>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    onClick={() => setShowCheckinModal(false)}
                    className="flex-1 py-4 font-bold text-gray-500 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleConfirmCheckin}
                    disabled={isProcessingCheckin}
                    className="flex-1 bg-farm-600 text-white py-4 font-bold rounded-2xl shadow-lg shadow-farm-100 flex items-center justify-center gap-2 hover:bg-farm-700 transition-all active:scale-95"
                  >
                    {isProcessingCheckin ? <IconLoader className="w-5 h-5 animate-spin" /> : <><IconCheck className="w-5 h-5" /> Confirmar</>}
                  </button>
                </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export { ReservationsPage };