import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Page } from '../types';
import { 
  IconCalendar, IconHome, IconUser, IconMail, IconCheck, IconX,
  IconLoader, IconPrinter, IconMap, IconList, IconZap,
  IconFileText, IconPhone, IconClock, IconSearch, IconInfoCircle
} from '../components/Icons';
import { VisualizadorProforma } from '../components/VisualizadorProforma';

interface Profile {
  full_name: string;
  avatar_url?: string;
  role?: string;
  cpf?: string;
  phone?: string;
  dependents?: any[];
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
  const [isAutoApproved, setIsAutoApproved] = useState(false);
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
  const [faceIds, setFaceIds] = useState<string[]>([]);
  const [isProcessingCheckin, setIsProcessingCheckin] = useState(false);
  const [checkinGuests, setCheckinGuests] = useState<any[]>([]);

  const [enrollState, setEnrollState] = useState<{
    enrolling: boolean;
    commandId?: string;
    status?: string;
    error?: string;
    targetName?: string;
    guestIndex?: number;
  }>({ enrolling: false });

  const cancelEnroll = async () => {
    if (!enrollState.commandId) return;
    try {
      await supabase
        .from('controlid_commands')
        .update({ 
          status: 'failed', 
          error: 'Operação cancelada pela recepção no Check-in.',
          updated_at: new Date().toISOString() 
        })
        .eq('id', enrollState.commandId);
    } catch (err) {
      console.error('Error cancelling enrollment:', err);
    }
    setEnrollState({ enrolling: false });
  };

  const startEnroll = async (guestIdx: number, guestName: string) => {
    try {
      const { data: devices, error: devError } = await supabase
        .from('idface_dispositivos')
        .select('serial_number')
        .eq('pdv_id', 3) // PDV Escritório
        .eq('ativo', true)
        .limit(1);

      if (devError || !devices || devices.length === 0) {
        alert('Nenhum aparelho do Escritório (PDV Escritório) está cadastrado ou ativo no sistema. Cadastre o leitor na tela de Configuração de Hardware primeiro!');
        return;
      }

      const device = devices[0];

      let generatedId = '';
      let attempts = 0;
      const existingIds = new Set<string>();

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('controlid_id, dependents');
      
      const { data: allEmployees } = await supabase
        .from('employees')
        .select('controlid_id');

      if (allProfiles) {
        allProfiles.forEach((p: any) => {
          if (p.controlid_id) existingIds.add(String(p.controlid_id));
          if (Array.isArray(p.dependents)) {
            p.dependents.forEach((d: any) => {
              if (d.controlid_id) existingIds.add(String(d.controlid_id));
            });
          }
        });
      }
      if (allEmployees) {
        allEmployees.forEach((e: any) => {
          if (e.controlid_id) existingIds.add(String(e.controlid_id));
        });
      }

      do {
        generatedId = String(Math.floor(100000 + Math.random() * 900000));
        attempts++;
      } while (existingIds.has(generatedId) && attempts < 100);

      const { data: command, error: cmdError } = await supabase
        .from('controlid_commands')
        .insert({
          device_id: device.serial_number,
          command: 'remote_enroll.fcgi',
          params: {
            type: 'face',
            user_id: parseInt(generatedId),
            save: true
          },
          metadata: {
            target_type: 'visitor_checkin',
            guest_name: guestName
          },
          status: 'pending'
        })
        .select()
        .single();

      if (cmdError || !command) throw cmdError || new Error('Falha ao criar comando de cadastro.');

      setEnrollState({
        enrolling: true,
        commandId: command.id,
        status: 'pending',
        targetName: guestName || `Convidado ${guestIdx + 1}`,
        guestIndex: guestIdx
      });

      const subscription = supabase
        .channel(`controlid-enroll-${command.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'controlid_commands',
            filter: `id=eq.${command.id}`
          },
          (payload) => {
            const updatedCmd = payload.new;
            setEnrollState(prev => ({
              ...prev,
              status: updatedCmd.status,
              error: updatedCmd.error || undefined
            }));

            if (updatedCmd.status === 'success') {
              setFaceIds(prev => {
                const newFaceIds = [...prev];
                newFaceIds[guestIdx] = generatedId;
                return newFaceIds;
              });
              subscription.unsubscribe();
              setEnrollState({ enrolling: false });
            } else if (updatedCmd.status === 'failed') {
              alert(`Falha ao cadastrar no leitor: ${updatedCmd.error || 'Erro desconhecido.'}`);
              subscription.unsubscribe();
              setEnrollState({ enrolling: false });
            }
          }
        )
        .subscribe();

      setTimeout(async () => {
        const { data: latestCmd } = await supabase
          .from('controlid_commands')
          .select('status')
          .eq('id', command.id)
          .single();

        if (latestCmd && (latestCmd.status === 'pending' || latestCmd.status === 'sent')) {
          await supabase
            .from('controlid_commands')
            .update({ 
              status: 'failed', 
              error: 'Tempo esgotado (60s) aguardando o leitor.',
              updated_at: new Date().toISOString()
            })
            .eq('id', command.id);
          alert('Tempo esgotado (60 segundos). A captura de rosto expirou.');
          subscription.unsubscribe();
          setEnrollState({ enrolling: false });
        }
      }, 60000);

    } catch (err: any) {
      alert('Erro ao iniciar cadastro facial: ' + err.message);
    }
  };

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
  const [viewingResDetails, setViewingResDetails] = useState<any | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [userDependents, setUserDependents] = useState<any[]>([]);
  const [accommodationPreference, setAccommodationPreference] = useState<'house' | 'guest'>('guest');

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setAuthEmail(user.email || '');
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, cpf, phone, dependents')
        .eq('id', user.id)
        .single();
      
      const adminRoles = ['admin', 'site_admin', 'finance_manager', 'finance', 'master_cook'];
      const approvalRoles = ['admin', 'site_admin', 'finance_manager'];
      
      const userRole = (profile as any)?.role || (isVisitorProp ? 'visitor' : 'member');
      const isUserVisitor = userRole === 'visitor';
      const isUserMember = userRole === 'member';
      
      setIsVisitor(isUserVisitor);
      setIsMember(isUserMember);
      setCanApprove(profile && approvalRoles.includes(profile.role));

      if (profile?.dependents) {
        setUserDependents(profile.dependents);
      }

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
          profiles:profiles!user_id(full_name, cpf, controlid_id, dependents),
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
          profiles:profiles!user_id(full_name, cpf, controlid_id, dependents),
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
  
  const handleViewDetails = (res: any) => {
    setViewingResDetails(res);
    setShowDetailsModal(true);
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
        const reason = window.prompt('Por que esta solicitação está sendo recusada?');
        if (reason === null) return; // Cancelled

        const { error } = await supabase
          .from('guest_reservations')
          .update({ 
            status: 'rejected',
            notes: (currentRequest?.notes ? currentRequest.notes + '\n\n' : '') + 'MOTIVO DA RECUSA: ' + reason
          })
          .eq('id', requestId);

        if (error) throw error;
        alert('Solicitação recusada!');
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
      let extraUpdate = {};
      if (newStatus === 'rejected') {
          const reason = window.prompt('Por que esta reserva está sendo recusada?');
          if (reason === null) return; // Cancelled
          
          const currentRes = allReservations.find(r => r.id === id);
          extraUpdate = { notes: (currentRes?.notes ? currentRes.notes + '\n\n' : '') + 'MOTIVO DA RECUSA: ' + reason };
      }

      const { error } = await supabase
        .from('reservations')
        .update({ 
          status: newStatus,
          ...(finalAccommodation && { accommodation: finalAccommodation }),
          ...extraUpdate
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin' && profile?.role !== 'site_admin') {
      alert('Acesso negado: Somente um Administrador Geral tem permissão para apagar registros permanentemente.');
      return;
    }

    const res = allReservations.find(r => r.id === id);
    if (!res) return;

    if (!window.confirm('🚨 AVISO CRÍTICO DE EXCLUSÃO 🚨\n\nEsta ação apagará IRREVERSIVELMENTE:\n1. A reserva e os dados dos hóspedes\n2. Todo o histórico de consumo (restaurante, produtos)\n3. TODOS os registros financeiros (pagamentos e entradas no caixa)\n\nIsso AFETARÁ o seu fechamento financeiro mensal. Deseja realmente prosseguir?')) return;
    
    setLoading(true);
    try {
      // 1. Get all stay IDs for this reservation to delete associated records
      const { data: stays } = await supabase
        .from('estadias')
        .select('id')
        .eq('reserva_id', id);
      
      const stayIds = stays?.map(s => s.id) || [];

      if (stayIds.length > 0) {
        // 2. Delete consumption logs
        await supabase
          .from('lancamentos_consumo')
          .delete()
          .in('estadia_id', stayIds);

        // 3. Delete financial records (fluxo_caixa)
        await supabase
          .from('fluxo_caixa')
          .delete()
          .in('estadia_id', stayIds);

        // 4. Delete stays (estadias)
        await supabase
          .from('estadias')
          .delete()
          .in('id', stayIds);
      }

      // 5. Finally, delete the reservation
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await Promise.all([
        fetchAllReservations(),
        fetchReservations()
      ]);
      
      alert('Reserva e todos os registros vinculados foram apagados com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir reserva: ' + (err.message || 'Erro desconhecido ao tentar excluir.'));
    } finally {
      setLoading(false);
    }
  };

  const handleStartCheckin = (res: any) => {
    setSelectedResForCheckin(res);
    setWristbandCodes(new Array(res.num_guests || 1).fill(''));
    
    // Initialize guests details
    const existing = res.guests_details || [];
    const initialGuests = Array.from({ length: res.num_guests || 1 }).map((_, i) => {
        if (existing[i] && existing[i].name) return { ...existing[i] };
        if (i === 0) {
            const titularName = res.name || res.profiles?.full_name || res.profiles?.[0]?.full_name;
            return { name: titularName || '', age: '' };
        }
        return { name: '', age: '' };
    });
    setCheckinGuests(initialGuests);

    // Auto-fill Face IDs based on Master Profile
    const initialFaceIds = new Array(res.num_guests || 1).fill('');
    const profile = res.profiles && !Array.isArray(res.profiles) ? res.profiles : (res.profiles?.[0] || null);

    if (profile) {
        initialFaceIds[0] = profile.controlid_id || '';
        
        if (profile.dependents && Array.isArray(profile.dependents)) {
            for (let i = 1; i < initialGuests.length; i++) {
                const guestName = initialGuests[i].name;
                if (guestName) {
                    const matchedDep = profile.dependents.find((d: any) => 
                        d.name.toLowerCase().trim() === guestName.toLowerCase().trim()
                    );
                    if (matchedDep && matchedDep.controlid_id) {
                        initialFaceIds[i] = matchedDep.controlid_id;
                    }
                }
            }
        }
    }
    setFaceIds(initialFaceIds);

    setShowCheckinModal(true);
  };

  const handleConfirmCheckin = async () => {
    if (!selectedResForCheckin) return;
    
    setIsProcessingCheckin(true);
    try {
      const guests = Array.from({ length: selectedResForCheckin.num_guests || 1 }).map((_, idx) => {
        const detail = Array.isArray(selectedResForCheckin.guests_details) ? selectedResForCheckin.guests_details[idx] : null;
        return detail || { name: idx === 0 ? selectedResForCheckin.name : `Hóspede ${idx + 1}`, age: '' };
      });

      const stayInserts = guests.map((guest: any, idx: number) => {
        const manualCode = wristbandCodes[idx];
        const finalWristband = manualCode || `FB-${selectedResForCheckin.id}-${idx + 1}-${Math.floor(Math.random()*1000)}`;
        
        return {
          reserva_id: selectedResForCheckin.id,
          status: 'ativa',
          codigo_pulseira: finalWristband,
          checkin_at: new Date().toISOString(),
          hospede_nome: guest.name || (idx === 0 ? selectedResForCheckin.name : `Hóspede ${idx + 1}`),
          hospede_idade: guest.age ? parseInt(guest.age) : null,
          controlid_id: faceIds[idx] || null
        };
      });

      const { error: stayError } = await supabase
        .from('estadias')
        .insert(stayInserts);

      if (stayError) throw stayError;

      // Update the reservation with the potentially edited guest details and set status
      const { error: resError } = await supabase
        .from('reservations')
        .update({ 
          status: 'em_curso',
          guests_details: checkinGuests
        })
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

      const autoApprove = (canApprove || (isMember && accommodation === 'Casa de Sócio'));
      setIsAutoApproved(autoApprove);

      const { error } = await supabase
        .from('reservations')
        .insert([{
          user_id: user.id,
          name,
          check_in: checkIn,
          check_out: checkOut,
          num_guests: numGuests,
          accommodation: (canApprove || accommodation === 'Casa de Sócio') ? accommodation : 'A definir',
          status: autoApprove ? 'confirmed' : 'pending',
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

  const handleQuickAddDependent = (dependent: any) => {
    // Check if already added
    if (guestsDetails.some(g => g.name === dependent.name)) return;

    const newDetails = [...guestsDetails];
    // Find first empty slot or add new
    const emptyIdx = newDetails.findIndex((g, i) => i > 0 && !g.name);
    
    // Calculate age from birthDate (YYYY-MM-DD)
    let age = '';
    if (dependent.birthDate) {
      const birth = new Date(dependent.birthDate);
      const today = new Date();
      age = (today.getFullYear() - birth.getFullYear()).toString();
    }

    if (emptyIdx !== -1) {
      newDetails[emptyIdx] = { name: dependent.name, age };
    } else {
      newDetails.push({ name: dependent.name, age });
      setNumGuests(prev => prev + 1);
    }
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

  const combinedListReservations = [
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
  ].sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());

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
              <h2 className="text-xl md:text-4xl font-bold text-gray-900 font-serif flex items-center gap-2 italic">
                <IconCalendar className="w-6 h-6 md:w-10 md:h-10 text-farm-800" />
                {isAdmin ? 'Gestão de Reservas' : 'Minhas Reservas'}
              </h2>
              <p className="text-sm md:text-lg text-gray-500 mt-1 ml-1 leading-tight">
                {isAdmin 
                  ? 'Controle de hóspedes, ocupação e financeiro.' 
                  : 'Acompanhe suas reservas na Fazenda.'}
              </p>
            </div>

            {isAdmin && (
              <div className="bg-gray-100/50 p-1 rounded-2xl flex shadow-inner border border-gray-100 overflow-x-auto whitespace-nowrap max-w-full custom-scrollbar scrollbar-hide">
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

                <div className="hidden md:block overflow-x-auto custom-scrollbar">
                  <div className="min-w-[1400px] w-full">
                    {/* ... (existing map content) ... */}
                    <div className="flex bg-gray-50/50">
                      <div className="w-48 flex-shrink-0 p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] border-r border-gray-100 sticky left-0 bg-gray-50 z-30">Acomodação</div>
                      <div className="flex-1 flex overflow-hidden">
                        {Array.from({ length: new Date(selectedYear, selectedMonth + 1, 0).getDate() }).map((_, i) => (
                          <div key={i} className={`flex-1 text-center p-3 border-r border-gray-100 text-[11px] font-bold ${new Date().getDate() === i+1 && new Date().getMonth() === selectedMonth && new Date().getFullYear() === selectedYear ? 'bg-farm-600 text-white shadow-inner' : 'text-gray-500'}`}>
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    {accommodationGroups.map((group) => (
                      <React.Fragment key={group.name}>
                        <div className="bg-gray-100/50 p-2 text-[10px] font-black text-farm-700 uppercase tracking-[0.2em] pl-6 border-b border-gray-100 w-full sticky left-0 z-20">
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
                                    const start = new Date(r.check_in + 'T12:00:00');
                                    const end = new Date(r.check_out + 'T12:00:00');
                                    const monthDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                                    const startDay = Math.max(1, (start.getMonth() === selectedMonth && start.getFullYear() === selectedYear) ? start.getDate() : 1);
                                    const endDay = Math.min(monthDays, (end.getMonth() === selectedMonth && end.getFullYear() === selectedYear) ? end.getDate() : monthDays);
                                    const left = ((startDay - 1) / monthDays) * 100;
                                    const width = ((endDay - startDay + 1) / monthDays) * 100;
                                    
                                    const stay = r.estadias?.[0];
                                    const isActive = stay?.status === 'ativa';
                                    const isFinished = stay?.status === 'finalizada';
                                    
                                    let barColor = r.status === 'confirmed' ? 'bg-green-500' : 'bg-yellow-400';
                                    if (isActive) barColor = 'bg-blue-600 shadow-lg ring-2 ring-blue-100 z-10';
                                    else if (isFinished) barColor = 'bg-gray-400 opacity-60';

                                    return (
                                      <div
                                        key={r.id}
                                        onClick={() => {
                                          if ((isActive || isFinished) && stay?.id) { setSelectedStayId(stay.id); setShowProforma(true); } 
                                          else if (r.status === 'confirmed' && !isActive && !isFinished) { handleStartCheckin(r); }
                                        }}
                                        className={`absolute top-1.5 bottom-1.5 rounded-lg shadow-sm p-2 text-[9px] font-bold text-white overflow-hidden whitespace-nowrap transition-all border border-white/20 ${barColor} cursor-pointer`}
                                        style={{ left: `${left}%`, width: `${width}%` }}
                                        title={`${r.name} (${formatDate(r.check_in)} - ${formatDate(r.check_out)})`}
                                      >
                                        <span className="truncate">{r.name || r.profiles?.full_name}</span>
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

                {/* Mobile Map View - Status Card List */}
                <div className="md:hidden space-y-4 p-4">
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-4">
                    <p className="text-[10px] text-amber-800 leading-tight">O mapa completo é otimizado para telas maiores. Abaixo você vê o status simplificado de cada acomodação para hoje.</p>
                  </div>
                  {accommodationGroups.map(group => (
                    <div key={group.name} className="space-y-4">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">{group.name}</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {group.units.map(unit => {
                          const today = new Date().toISOString().split('T')[0];
                          const reservationsToday = allReservations.filter(r => 
                            r.accommodation === unit && 
                            r.check_in <= today && 
                            r.check_out >= today &&
                            r.status !== 'rejected' && r.status !== 'canceled'
                          );
                          const res = reservationsToday[0];
                          const stay = res?.estadias?.[0];
                          
                          return (
                            <div key={unit} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between gap-4">
                               <div className="flex-1">
                                 <p className="text-sm font-bold text-gray-800">{unit.replace('Casa Grande - ', '')}</p>
                                 {res ? (
                                   <p className="text-[10px] text-gray-500 mt-0.5"><strong>{res.name || res.profiles?.full_name}</strong> ({formatDate(res.check_in)} a {formatDate(res.check_out)})</p>
                                 ) : (
                                   <p className="text-[10px] text-gray-400 italic mt-0.5">Disponível</p>
                                 )}
                               </div>
                               <div className="flex-shrink-0">
                                 {res ? (
                                   <div className="flex flex-col gap-2">
                                     <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider border ${
                                       stay?.status === 'ativa' ? 'bg-blue-600 text-white border-blue-500' : 'bg-green-500 text-white border-green-400'
                                     }`}>
                                       {stay?.status === 'ativa' ? 'Local' : 'Confirmada'}
                                     </span>
                                     {res.status === 'confirmed' && !stay && (
                                       <button onClick={() => handleStartCheckin(res)} className="bg-farm-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase">Check-in</button>
                                     )}
                                   </div>
                                 ) : (
                                   <div className="w-16 h-2 bg-gray-200 rounded-full"></div>
                                 )}
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adminTab === 'list' && (
              <div className="bg-transparent shadow-none border-none md:bg-white md:rounded-3xl md:shadow-xl md:border md:border-gray-100 md:overflow-hidden space-y-4 md:space-y-0">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200 hidden md:block">
                  <table className="w-full text-left text-sm min-w-[1200px]">
                    <thead className="bg-gray-50/50 backdrop-blur-md border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">
                      <tr>
                        <th className="px-10 py-6 w-80">Sócio / Hóspede</th>
                        <th className="px-8 py-6 w-80">Acomodação</th>
                        <th className="px-8 py-6 w-64">Período</th>
                        <th className="px-8 py-6 w-40">Status</th>
                        <th className="px-10 py-6 no-print text-right w-80">Ações Administrativas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {combinedListReservations.map((res) => {
                        const isGuestRequest = (res as any).isGuestRequest;
                        return (
                        <tr key={res.id} className={`group hover:bg-farm-50/30 transition-all duration-300 border-b border-gray-50/80 ${isGuestRequest ? 'bg-amber-50/10' : ''}`}>
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-6">
                              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg ring-4 ring-white shadow-lg shadow-gray-200/50 transition-transform group-hover:scale-105 duration-300 ${isGuestRequest ? 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700' : 'bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400'}`}>
                                {isGuestRequest ? <IconMail className="w-7 h-7" /> : (res.name?.[0] || res.full_name?.[0] || res.profiles?.full_name?.[0] || 'U')}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                  <p className="font-extrabold text-gray-900 text-lg tracking-tight truncate max-w-[180px]">
                                    {res.name || res.full_name || res.profiles?.full_name || 'Usuário'}
                                  </p>
                                  <button 
                                    onClick={() => handleViewDetails(res)} 
                                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-white text-farm-600 hover:bg-farm-600 hover:text-white hover:scale-110 active:scale-95 transition-all shadow-md shadow-farm-100 border border-farm-100 group/info"
                                    title="Ver detalhes completos"
                                  >
                                    <IconInfoCircle className="w-4 h-4 transition-transform duration-500" />
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                  {(() => {
                                      const cpfValue = res.cpf || (res as any).profiles?.cpf;
                                      return (
                                        <span className="text-[10px] font-mono font-black text-gray-400 bg-gray-50/80 px-2 py-0.5 rounded-md border border-gray-100/50 shadow-sm whitespace-nowrap" title={cpfValue}>
                                          {cpfValue && cpfValue.replace(/\D/g, '').length === 11 
                                              ? cpfValue.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
                                              : (cpfValue || 'Sem CPF')}
                                        </span>
                                      );
                                  })()}
                                  {isGuestRequest && <span className="text-amber-600 font-extrabold uppercase text-[8px] tracking-[0.1em] bg-amber-50/50 px-2 py-0.5 rounded-md border border-amber-100/50">Visitante</span>}
                                  {!isGuestRequest && <span className="text-farm-600 font-extrabold uppercase text-[8px] tracking-[0.1em] bg-farm-50/50 px-2 py-0.5 rounded-md border border-farm-100/50">Sócio</span>}
                                  {res.status === 'em_curso' && res.estadias?.[0]?.status === 'finalizada' && (
                                    <span className="text-red-600 font-black uppercase text-[8px] tracking-[0.1em] bg-red-50 px-2 py-0.5 rounded-md border border-red-100 animate-pulse">Saldo Devedor</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-8">
                            {res.status === 'pending' || isGuestRequest ? (
                              <div className={`p-4 rounded-2xl border-2 transition-all duration-300 shadow-lg ${isGuestRequest ? 'bg-white border-amber-200/50 shadow-amber-100/20' : 'bg-white border-gray-100 shadow-gray-100/20'}`}>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 px-1">
                                  {isGuestRequest ? `Pretende: ${(res as any).preferred_accommodation || 'S/ Pref'}` : 'Designação Necessária'}
                                </p>
                                <select 
                                  value={selectedRoomsForApproval[res.id] || ''} 
                                  onChange={(e) => setSelectedRoomsForApproval(prev => ({ ...prev, [res.id]: e.target.value }))}
                                  className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-farm-500/10 focus:bg-white focus:border-farm-500 transition-all font-bold text-gray-700"
                                >
                                  <option value="">Atribuir Local...</option>
                                  {accommodationGroups.map(group => (
                                    <optgroup key={group.name} label={group.name} className="font-black text-black">
                                      {group.units.map(unit => <option key={unit} value={unit} className="font-medium text-gray-600">{unit}</option>)}
                                      {group.name === 'Casas de Sócios' && group.units.length === 0 && <option value="Casa de Sócio">Casa de Sócio</option>}
                                    </optgroup>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black bg-gradient-to-r from-gray-50 to-white text-gray-700 border-2 border-gray-100/50 shadow-sm">
                                <IconHome className="w-4 h-4 text-farm-500" />
                                {res.accommodation}
                              </div>
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
                               res.status === 'rejected' ? 'RECUSADA' :
                               'AGUARDANDO'}
                            </span>
                          </td>
                          <td className="px-10 py-8 no-print text-right">
                             <div className="flex items-center justify-end gap-3">
                               {isGuestRequest ? (
                                   <div className="flex items-center gap-3">
                                     <button 
                                       onClick={() => handleActionGuestRequest(res.id, 'approve', res)}
                                       disabled={processingRequestId === res.id}
                                       className="bg-green-600 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-green-700 hover:-translate-y-0.5 active:translate-y-0 shadow-xl shadow-green-100 transition-all flex items-center gap-2 disabled:opacity-50"
                                     >
                                       {processingRequestId === res.id ? <IconLoader className="w-3.5 h-3.5 animate-spin" /> : <IconCheck className="w-4 h-4" />} Aprovar
                                     </button>
                                     <button 
                                       onClick={() => handleActionGuestRequest(res.id, 'reject', res)}
                                       disabled={processingRequestId === res.id}
                                       className="bg-white text-red-500 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-red-50 hover:text-red-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 border-2 border-red-100 shadow-lg shadow-red-50/50"
                                     >
                                       <IconX className="w-4 h-4" /> Recusar
                                     </button>
                                   </div>
                               ) : res.status === 'pending' ? (
                                   <div className="flex items-center gap-3">
                                     {canApprove ? (
                                       <>
                                         <button 
                                           onClick={() => {
                                             const room = selectedRoomsForApproval[res.id];
                                             if (!room) return alert('Por favor, atribua uma acomodação antes de aprovar.');
                                             handleUpdateStatus(res.id, 'confirmed', room);
                                           }} 
                                           className="bg-green-600 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-green-700 hover:-translate-y-0.5 active:translate-y-0 shadow-xl shadow-green-100 transition-all flex items-center gap-2"
                                         >
                                           <IconCheck className="w-4 h-4" /> Aprovar
                                         </button>
                                         <button 
                                           onClick={() => handleUpdateStatus(res.id, 'rejected')} 
                                           className="bg-white text-red-400 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-red-50 hover:text-red-600 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 border-2 border-red-50"
                                         >
                                           <IconX className="w-3.5 h-3.5" /> Recusar
                                         </button>
                                       </>
                                     ) : (
                                       <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest bg-amber-50 px-5 py-3 rounded-2xl border-2 border-amber-100/50 italic">AGUARDANDO</span>
                                     )}
                                   </div>
                                ) : (
                                  <div className="flex items-center gap-3">
                                     {(res.estadias?.[0]?.status === 'ativa' || res.estadias?.[0]?.status === 'finalizada') && (
                                       <button 
                                         onClick={() => handleViewProforma(res.estadias[0].id)} 
                                         className={`${res.estadias[0].status === 'ativa' ? 'bg-blue-600 shadow-blue-100' : 'bg-farm-700 shadow-farm-100'} text-white font-black px-6 py-3.5 rounded-2xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 shadow-xl transition-all`} 
                                         title={res.estadias[0].status === 'ativa' ? "Ver Conta / Consumo" : "Ver Recibo Final"}
                                       >
                                         <IconFileText className="w-4 h-4" /> 
                                         {res.estadias[0].status === 'ativa' ? 'Financeiro' : 'Recibo'}
                                       </button>
                                     )}
                                     
                                     {res.status === 'confirmed' && !res.estadias?.[0]?.status && (
                                       <button onClick={() => handleStartCheckin(res)} className="bg-farm-600 text-white font-black px-8 py-3.5 rounded-2xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-farm-700 hover:-translate-y-0.5 active:translate-y-0 shadow-xl shadow-farm-100 transition-all">
                                         <IconZap className="w-4 h-4" /> Check-in
                                       </button>
                                     )}

                                     <button onClick={() => isGuestRequest ? handleActionGuestRequest(res.id, 'reject', res) : handleDeleteReservation(res.id)} className="w-12 h-12 flex items-center justify-center text-red-200 hover:text-red-500 hover:bg-red-50 hover:scale-110 active:scale-95 rounded-2xl transition-all ml-2" title="Excluir Permanentemente">
                                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                     </button>
                                  </div>
                                )}
                             </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-4">
                  {combinedListReservations.map((res) => {
                    const isGuestRequest = (res as any).isGuestRequest;
                    return (
                      <div key={res.id} className={`bg-white p-5 rounded-2xl shadow-sm border ${isGuestRequest ? 'border-amber-300' : 'border-gray-100'} space-y-4`}>
                        <div className="flex items-start justify-between border-b pb-4 border-gray-50">
                          <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl ring-4 ring-white shadow-md ${isGuestRequest ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                              {isGuestRequest ? <IconMail className="w-7 h-7" /> : (res.name?.[0] || 'U')}
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <p className="font-extrabold text-gray-900 text-lg leading-tight">{res.name || 'Usuário'}</p>
                                    <button 
                                        onClick={() => handleViewDetails(res)} 
                                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-farm-50 text-farm-600 border border-farm-100 shadow-sm"
                                    >
                                        <IconInfoCircle className="w-4 h-4" />
                                    </button>
                                </div>
                                {(() => {
                                    const cpfValue = res.cpf || (res as any).profiles?.cpf;
                                    return (
                                        <p className="text-xs font-mono text-gray-400 mt-1">
                                            {cpfValue && cpfValue.replace(/\D/g, '').length === 11 
                                                ? cpfValue.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
                                                : (cpfValue || 'Sem CPF')}
                                        </p>
                                    );
                                })()}
                                {res.status === 'em_curso' && res.estadias?.[0]?.status === 'finalizada' && (
                                     <span className="mt-2 inline-block bg-red-500 text-white text-[8px] px-2 py-0.5 rounded-full font-black animate-pulse uppercase tracking-widest leading-none">Saldo Devedor</span>
                                 )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-gray-400 font-bold uppercase text-[10px] mb-1">Período Selecionado</p>
                            <div className="flex items-center gap-1 font-bold text-gray-800">
                              <IconCalendar className="w-3 h-3 text-farm-500" />
                              {formatDate(res.check_in)}
                            </div>
                            <p className="text-gray-500 text-[10px] italic ml-4 mt-0.5">até {formatDate(res.check_out)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 font-bold uppercase text-[10px] mb-1">Acomodação</p>
                            <span className="px-3 py-1 bg-gray-50 text-gray-700 font-bold rounded-lg border border-gray-100 inline-block">
                              {isGuestRequest ? 'A definir' : res.accommodation}
                            </span>
                            {res.arrival_time && <p className="text-blue-600 text-[10px] font-bold mt-1.5 flex items-center gap-1"><IconClock className="w-3 h-3"/> {res.arrival_time}h</p>}
                          </div>
                        </div>

                        {/* Status Label */}
                        <div className="pt-2">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border-2 inline-block ${
                            res.estadias?.[0]?.status === 'ativa' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            res.estadias?.[0]?.status === 'finalizada' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                            res.status === 'confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                            res.status === 'rejected' || res.status === 'canceled' ? 'bg-red-50 text-red-700 border-red-200' :
                            isGuestRequest ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}>
                            {res.estadias?.[0]?.status === 'ativa' ? 'Hóspede Local' :
                             res.estadias?.[0]?.status === 'finalizada' ? 'Encerrada' :
                             res.status === 'confirmed' ? 'Confirmada' : 
                             res.status === 'rejected' ? 'RECUSADA' :
                             'AGUARDANDO'}
                          </span>
                        </div>

                        {/* Mobile Actions block */}
                        <div className="pt-4 border-t border-gray-100 space-y-3">
                            {(res.status === 'pending' || isGuestRequest) ? (
                              <div className={`p-4 rounded-xl border ${isGuestRequest ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                                <p className="text-[11px] font-bold text-gray-600 mb-2 uppercase tracking-wider">
                                  {isGuestRequest ? `Pretende: ${(res as any).preferred_accommodation || 'S/ Pref'}` : 'Nova Reserva'}
                                </p>
                                <select 
                                  value={selectedRoomsForApproval[res.id] || ''} 
                                  onChange={(e) => setSelectedRoomsForApproval(prev => ({ ...prev, [res.id]: e.target.value }))}
                                  className="w-full text-sm p-3 bg-white border border-gray-300 rounded-lg outline-none mb-3 font-medium"
                                >
                                  <option value="">Atribuir Local...</option>
                                  {accommodationGroups.map(group => (
                                    <optgroup key={group.name} label={group.name}>
                                      {group.units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                      {group.name === 'Casas de Sócios' && group.units.length === 0 && <option value="Casa de Sócio">Casa de Sócio</option>}
                                    </optgroup>
                                  ))}
                                </select>
                                
                                <div className="flex gap-2">
                                  {isGuestRequest ? (
                                    <>
                                      <button onClick={() => handleActionGuestRequest(res.id, 'approve', res)} disabled={processingRequestId === res.id} className="flex-1 bg-green-600 text-white py-3 rounded-lg text-sm font-bold flex justify-center items-center shadow-lg shadow-green-100 active:scale-95 transition-all">Aprovar</button>
                                      <button onClick={() => handleActionGuestRequest(res.id, 'reject', res)} disabled={processingRequestId === res.id} className="flex-1 bg-red-50 text-red-600 py-3 rounded-lg text-sm font-bold flex justify-center items-center active:scale-95 transition-all border border-red-100">Recusar</button>
                                    </>
                                  ) : (
                                    canApprove ? (
                                      <>
                                        <button onClick={() => { const rm = selectedRoomsForApproval[res.id]; if(!rm) return alert('Atribua local'); handleUpdateStatus(res.id, 'confirmed', rm); }} className="flex-1 bg-green-600 text-white py-3 rounded-lg text-sm font-bold flex justify-center items-center shadow-lg shadow-green-100 active:scale-95 transition-all">Aprovar</button>
                                        <button onClick={() => handleUpdateStatus(res.id, 'rejected')} className="flex-1 bg-red-50 text-red-600 py-3 rounded-lg text-sm font-bold flex justify-center items-center active:scale-95 transition-all border border-red-100">Recusar</button>
                                      </>
                                    ) : <span className="text-sm text-amber-600 font-bold w-full text-center py-2">AGUARDANDO</span>
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {!isGuestRequest && res.status !== 'pending' && (
                               <div className="flex flex-col gap-2">
                                 {(res.estadias?.[0]?.status === 'ativa' || res.estadias?.[0]?.status === 'finalizada') && (
                                   <button onClick={() => handleViewProforma(res.estadias[0].id)} className={`w-full text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${res.estadias[0].status === 'ativa' ? 'bg-blue-600 shadow-blue-100' : 'bg-farm-700 shadow-farm-100'}`}>
                                     <IconFileText className="w-5 h-5" /> {res.estadias[0].status === 'ativa' ? 'Gestão Financeira / Comanda' : 'Ver Recibo Final'}
                                   </button>
                                 )}
                                 {res.status === 'confirmed' && !res.estadias?.[0]?.status && (
                                   <button onClick={() => handleStartCheckin(res)} className="w-full bg-farm-600 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-farm-100 active:scale-95 transition-all">
                                     <IconZap className="w-5 h-5" /> Dar Check-in Rápido
                                   </button>
                                 )}
                                 <button onClick={() => handleDeleteReservation(res.id)} className="w-full mt-3 text-red-400 font-bold py-3 text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 bg-red-50 rounded-xl active:bg-red-100 transition-colors">
                                   <IconX className="w-4 h-4" /> Excluir Registro
                                 </button>
                               </div>
                            )}

                            {isGuestRequest && res.status === 'pending' && (
                                <button onClick={() => handleActionGuestRequest(res.id, 'reject', res)} className="w-full mt-2 text-red-400 font-bold py-3 text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 bg-red-50 rounded-xl active:bg-red-100 transition-colors">
                                   <IconX className="w-4 h-4" /> Excluir Pedido Permanentemente
                                </button>
                            )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {adminTab === 'in_house' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6 px-0 md:px-0">
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
              <div className="bg-transparent shadow-none border-none md:bg-white md:rounded-3xl md:shadow-xl md:border md:border-gray-100 md:overflow-hidden space-y-4 md:space-y-0">
                <div className="overflow-x-auto hidden md:block">
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
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-gray-400">ID Estadia: #{res.estadias?.[0]?.id}</p>
                                    {res.status === 'em_curso' && (
                                        <span className="text-red-500 font-black text-[9px] uppercase tracking-tighter bg-red-50 px-1.5 py-0.5 rounded border border-red-100">Pagamento Pendente</span>
                                    )}
                                </div>
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

                {/* Mobile View */}
                <div className="md:hidden space-y-4">
                  {historyStays.map(res => (
                    <div key={res.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                      <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                        <div className="w-12 h-12 shrink-0 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-bold text-lg ring-4 ring-white shadow-sm">
                          {res.name?.[0] || res.profiles?.full_name?.[0]}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-lg leading-tight">{res.name || res.profiles?.full_name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID Estadia: #{res.estadias?.[0]?.id}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-gray-400 font-bold uppercase text-[10px] mb-1">Período</p>
                          <p className="font-bold text-gray-800">{formatDate(res.check_in)}</p>
                          <p className="font-bold text-gray-800">até {formatDate(res.check_out)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 font-bold uppercase text-[10px] mb-1">Checkout</p>
                          <p className="font-bold text-gray-600">{new Date(res.estadias?.[0]?.checkout_at).toLocaleString('pt-BR')}</p>
                        </div>
                      </div>

                      <div className="pt-2">
                         <button onClick={() => handleViewProforma(res.estadias[0].id)} className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl text-sm hover:bg-gray-200 transition-all flex items-center justify-center gap-2 active:scale-95">
                           <IconFileText className="w-5 h-5" /> Ver Recibo Final
                         </button>
                      </div>
                    </div>
                  ))}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Chegada</label>
                        <input type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700">Saída</label>
                        <input type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                  <div className="hidden md:block overflow-x-auto">
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
                            return (checkInDate >= now && checkInDate <= future) || (res.status === 'em_curso');
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
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Planning Cards */}
                  <div className="md:hidden space-y-4">
                    {allReservations
                      .filter(res => {
                        const checkInDate = new Date(res.check_in + 'T12:00:00');
                        const now = new Date();
                        now.setHours(0, 0, 0, 0);
                        const future = new Date();
                        future.setDate(now.getDate() + planningRange);
                        future.setHours(23, 59, 59, 999);
                        return (checkInDate >= now && checkInDate <= future) || (res.status === 'em_curso');
                      })
                      .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())
                      .map(res => (
                        <div key={res.id} className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-black text-farm-900 text-lg leading-tight">{res.name || res.profiles?.full_name}</p>
                              <span className={`mt-2 inline-block px-3 py-1 rounded-full text-[10px] font-bold ${res.accommodation === 'A definir' ? 'bg-red-50 text-red-600' : 'bg-white text-farm-700 border border-farm-100'}`}>
                                {res.accommodation}
                              </span>
                            </div>
                            <div className="bg-white px-3 py-2 rounded-xl text-center shadow-sm border border-gray-100">
                              <p className="text-[8px] font-black text-gray-400 uppercase">Pax</p>
                              <p className="text-lg font-black text-gray-800">{res.num_guests}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-3 rounded-xl border border-gray-100">
                              <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Chegada</p>
                              <p className="text-xs font-bold text-gray-700">{new Date(res.check_in + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-gray-100">
                              <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Saída</p>
                              <p className="text-xs font-bold text-gray-700">{new Date(res.check_out + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2">
                             <span className={`text-[10px] font-black uppercase tracking-tighter ${
                               res.status === 'confirmed' ? 'text-green-600' : 
                               res.status === 'pending' ? 'text-orange-500' : 
                               res.status === 'em_curso' ? 'text-blue-600' : 'text-gray-400'
                             }`}>
                               {res.status === 'confirmed' ? 'Confirmada' : 
                                res.status === 'pending' ? 'Pendente' : 
                                res.status === 'em_curso' ? 'Em Curso' : res.status}
                             </span>
                             {res.notes && <p className="text-[10px] text-gray-400 italic font-medium truncate max-w-[150px]">{res.notes}</p>}
                          </div>
                        </div>
                      ))}
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
                <h3 className="text-xl font-bold text-amber-900 font-serif mb-3">Complete seu Cadastro</h3>
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
                    <p className="font-bold text-lg mb-2">{isAutoApproved ? 'Reserva Confirmada!' : 'Solicitação Enviada!'}</p>
                    <p>
                        {isAutoApproved 
                            ? 'Sua reserva para sua residência foi registrada com sucesso. No dia da chegada, basta realizar o check-in no portal.' 
                            : 'Sua solicitação de reserva foi enviada para análise da administração. Você será avisado em breve sobre a confirmação.'}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
                    <div className="h-2 bg-farm-600 w-full"></div>
                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">{isVisitor ? 'Nome do sócio anfitrião' : 'Nome do Sócio Principal'}</label>
                        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-sm font-bold text-gray-700 mb-1.5">Chegada</label>
                          <input type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all text-sm font-bold" />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-sm font-bold text-gray-700 mb-1.5">Saída</label>
                          <input type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all text-sm font-bold" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Número de Pessoas</label>
                        <input type="number" min="1" required value={numGuests} onChange={handleNumGuestsChange} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all" />
                      </div>

                      {isMember && userDependents.length > 0 && (
                        <div className="space-y-2 p-4 bg-amber-50/50 rounded-2xl border border-amber-100 mb-4">
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] mb-2 flex items-center gap-1">
                                <IconUser className="w-3 h-3" /> Seus Dependentes
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {userDependents.map((dep, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleQuickAddDependent(dep)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
                                            guestsDetails.some(g => g.name === dep.name)
                                            ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-200'
                                            : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm'
                                        }`}
                                    >
                                        {dep.name} {guestsDetails.some(g => g.name === dep.name) ? '✓' : '+'}
                                    </button>
                                ))}
                            </div>
                        </div>
                      )}

                      {numGuests > 1 && (
                        <div className="space-y-4 p-5 bg-gray-50 rounded-2xl border border-gray-100 animate-fade-in shadow-inner">
                          <div className="flex justify-between items-center mb-2 px-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Detalhes dos Hóspedes Adicionais</p>
                          </div>

                          {guestsDetails.slice(1).map((_, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-3 border-b border-gray-200 last:border-0 last:pb-0">
                              <input
                                type="text"
                                placeholder={`Nome do Hóspede ${i + 2}`}
                                required
                                value={guestsDetails[i + 1].name}
                                onChange={(e) => handleGuestDetailChange(i + 1, 'name', e.target.value)}
                                className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-farm-500 outline-none font-medium"
                              />
                              <input
                                type="number"
                                placeholder="Idade"
                                required
                                value={guestsDetails[i + 1].age}
                                onChange={(e) => handleGuestDetailChange(i + 1, 'age', e.target.value)}
                                className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-farm-500 outline-none font-medium"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {isMember && (
                          <div className="p-5 bg-gradient-to-br from-farm-50/50 to-white border border-farm-100 rounded-2xl space-y-4 shadow-sm">
                            <p className="text-[10px] font-black text-farm-600 uppercase tracking-[0.2em] px-1 border-b border-farm-100 pb-2 mb-1">Local da Hospedagem</p>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setAccommodationPreference('house'); setAccommodation('Casa de Sócio'); }}
                                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                                        accommodationPreference === 'house'
                                        ? 'bg-farm-600 text-white border-farm-600 shadow-lg shadow-farm-100'
                                        : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
                                    }`}
                                >
                                    <IconHome className={`w-6 h-6 ${accommodationPreference === 'house' ? 'text-white' : 'text-gray-300'}`} />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center">Sua Própria Casa</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAccommodationPreference('guest'); setAccommodation('A definir'); }}
                                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                                        accommodationPreference === 'guest'
                                        ? 'bg-farm-600 text-white border-farm-600 shadow-lg shadow-farm-100'
                                        : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
                                    }`}
                                >
                                    <IconZap className={`w-6 h-6 ${accommodationPreference === 'guest' ? 'text-white' : 'text-gray-300'}`} />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center">Casa Grande / Chalé</span>
                                </button>
                            </div>
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
                        (res.status === 'confirmed' || res.status === 'em_curso') ? 
                          (res.estadias?.[0]?.status === 'finalizada' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700') : 
                        res.status === 'rejected' ? 'bg-red-100 text-red-700' : 
                        res.status === 'finalizada' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {res.status === 'confirmed' ? 'Confirmada' : 
                         res.status === 'em_curso' ? 
                           (res.estadias?.[0]?.status === 'finalizada' ? 'Pagamento Pendente' : 'Em Andamento') : 
                         res.status === 'finalizada' ? 'Encerrada' :
                         res.status === 'rejected' ? 'RECUSADA' : 'AGUARDANDO'}
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
          <div className="fixed inset-0 z-[100] overflow-y-auto">
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
          <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
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
                    {Array.from({ length: selectedResForCheckin.num_guests || 1 }).map((_, idx) => {
                      const guest = checkinGuests[idx] || { name: '', age: '' };
                      return (
                        <div key={idx} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                          <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hóspede #{idx+1}</span>
                            <span className="text-[10px] text-gray-400 font-mono">Pulseira</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={guest.name || ''}
                              onChange={(e) => {
                                const newGuests = [...checkinGuests];
                                newGuests[idx] = { ...newGuests[idx], name: e.target.value };
                                setCheckinGuests(newGuests);
                              }}
                              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-farm-500 outline-none"
                              placeholder="Nome"
                            />
                            <div className="relative">
                              <input
                                type="text"
                                value={guest.age || ''}
                                onChange={(e) => {
                                  const newGuests = [...checkinGuests];
                                  newGuests[idx] = { ...newGuests[idx], age: e.target.value };
                                  setCheckinGuests(newGuests);
                                }}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-farm-500 outline-none pr-8"
                                placeholder="Idade"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-gray-300 font-bold">ANOS</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={wristbandCodes[idx] || ''}
                              onChange={(e) => {
                                const newCodes = [...wristbandCodes];
                                newCodes[idx] = e.target.value;
                                setWristbandCodes(newCodes);
                              }}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-[10px] font-mono text-center placeholder:font-sans placeholder:text-gray-300"
                              placeholder="Pulseira (QR)"
                            />
                            <div className="flex gap-1.5 w-full">
                              <input
                                type="text"
                                value={faceIds[idx] || ''}
                                onChange={(e) => {
                                  const newFaceIds = [...faceIds];
                                  newFaceIds[idx] = e.target.value;
                                  setFaceIds(newFaceIds);
                                }}
                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-[10px] font-mono text-center placeholder:font-sans placeholder:text-gray-300 min-w-0"
                                placeholder="Face ID (ControlID)"
                              />
                              <button
                                type="button"
                                onClick={() => startEnroll(idx, guest.name || (idx === 0 ? selectedResForCheckin.name : `Hóspede ${idx + 1}`))}
                                className="bg-farm-50 text-farm-600 px-2 py-2 rounded-xl border border-farm-200 hover:bg-farm-100 transition-all font-bold text-[9px] flex items-center gap-0.5 shrink-0"
                                title="Capturar biometria usando o leitor do escritório"
                              >
                                <IconZap className="w-3 h-3 text-farm-500 animate-pulse" /> Capturar
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
        {/* Details Modal */}
      {showDetailsModal && viewingResDetails && (
        <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowDetailsModal(false)}></div>
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative z-10 animate-fade-in border border-gray-100">
                    <header className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-20">
                        <div>
                            <p className="text-[9px] text-farm-600 font-black uppercase tracking-[0.2em] mb-1 px-1">Ficha Técnica</p>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Detalhes do Pedido</h3>
                        </div>
                        <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-red-500 p-3 bg-gray-50 rounded-2xl hover:rotate-90 transition-all duration-300 border border-gray-100 shadow-inner">
                            <IconX className="w-6 h-6" />
                        </button>
                    </header>
                    
                    <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                        <div className="flex items-center gap-6 bg-gradient-to-br from-gray-50 to-white p-6 rounded-3xl border-2 border-gray-100 shadow-xl shadow-gray-50/50">
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center text-farm-600 text-2xl font-black border-4 border-gray-50">
                                {viewingResDetails.name?.[0] || viewingResDetails.full_name?.[0] || viewingResDetails.profiles?.full_name?.[0] || 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="text-xl font-black text-gray-900 tracking-tight mb-1 truncate">{viewingResDetails.name || viewingResDetails.full_name || viewingResDetails.profiles?.full_name}</h4>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-400 font-mono bg-white px-2 py-0.5 rounded-lg border border-gray-100 shadow-inner">{viewingResDetails.cpf || 'Sem CPF'}</span>
                                    {viewingResDetails.isGuestRequest && viewingResDetails.birth_date && (
                                        <span className="text-xs font-black text-farm-600/60 uppercase tracking-widest">{new Date(viewingResDetails.birth_date).toLocaleDateString('pt-BR')}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-white border-2 border-gray-50 rounded-2xl shadow-lg shadow-gray-50/30">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Check-in / Out</p>
                                <div className="flex items-center gap-2 text-gray-800 font-black text-base">
                                    <IconCalendar className="w-4 h-4 text-farm-500" />
                                    {formatDate(viewingResDetails.check_in)} — {formatDate(viewingResDetails.check_out)}
                                </div>
                            </div>
                            <div className="p-5 bg-white border-2 border-gray-50 rounded-2xl shadow-lg shadow-gray-50/30">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Acomodação</p>
                                <div className="flex items-center gap-2 text-farm-600 font-black text-base uppercase tracking-tight">
                                    <IconHome className="w-4 h-4" />
                                    {viewingResDetails.isGuestRequest ? (viewingResDetails.preferred_accommodation || 'Indefinida') : viewingResDetails.accommodation}
                                </div>
                            </div>
                        </div>

                        {viewingResDetails.isGuestRequest && viewingResDetails.host_member_name && (
                            <div className="p-6 bg-gradient-to-r from-amber-50 to-white border-2 border-amber-100 rounded-3xl shadow-xl shadow-amber-50/20 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <IconUser className="w-16 h-16" />
                                </div>
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2">Sócio Responsável</p>
                                <p className="text-xl font-black text-amber-900 tracking-tight italic">"{viewingResDetails.host_member_name}"</p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div className="flex justify-between items-end px-1">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-2">
                                    <IconUser className="w-3 h-3 text-farm-500" /> Grupo / Hóspedes ({viewingResDetails.num_guests})
                                </p>
                            </div>
                            <div className="grid gap-2">
                                <div className="p-4 bg-farm-50/20 rounded-xl border-dashed border-2 border-farm-100 flex justify-between items-center group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center font-bold text-[10px] text-farm-600 shadow-sm border border-farm-100">1</div>
                                        <span className="text-[13px] font-black text-gray-800">{viewingResDetails.name || viewingResDetails.full_name || viewingResDetails.profiles?.full_name}</span>
                                    </div>
                                    <span className="text-[8px] bg-farm-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest shadow-lg shadow-farm-100">Titular</span>
                                </div>
                                {viewingResDetails.guests_details?.filter((g: any) => {
                                    if (!g.name || g.name.trim() === "") return false;
                                    const titularName = (viewingResDetails.name || viewingResDetails.full_name || viewingResDetails.profiles?.full_name || "").toLowerCase();
                                    return g.name.toLowerCase() !== titularName;
                                }).map((guest: any, idx: number) => (
                                    <div key={idx} className="p-4 bg-white rounded-xl border border-gray-50 flex justify-between items-center group hover:bg-gray-50 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center font-bold text-[9px] text-gray-400 group-hover:text-farm-600 group-hover:bg-farm-50">{idx + 2}</div>
                                            <span className="text-[13px] font-bold text-gray-600 group-hover:text-gray-900 transition-colors">{guest.name}</span>
                                        </div>
                                        <span className="text-[9px] font-black text-farm-500 bg-farm-50 px-2 py-1 rounded-lg border border-farm-100">{guest.age} anos</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {viewingResDetails.notes && (
                            <div className="bg-gray-900 rounded-[1.5rem] p-6 relative overflow-hidden shadow-2xl">
                                <div className="absolute top-0 right-0 p-6 opacity-10">
                                    <IconFileText className="w-16 h-16 text-white" />
                                </div>
                                <p className="text-[9px] font-black text-farm-400 uppercase tracking-[0.3em] mb-3">Notas & Observações</p>
                                <p className="text-base text-gray-300 font-medium italic leading-relaxed relative z-10">"{viewingResDetails.notes}"</p>
                            </div>
                        )}
                    </div>

                    <footer className="px-10 py-8 bg-white border-t border-gray-100 flex justify-center sticky bottom-0 z-20">
                        <button onClick={() => setShowDetailsModal(false)} className="w-full bg-gray-900 text-white px-10 py-5 rounded-2xl text-sm font-black uppercase tracking-[0.2em] hover:bg-farm-600 hover:scale-[1.02] active:scale-95 transition-all shadow-2xl shadow-gray-200">
                            Confirmar Leitura
                        </button>
                    </footer>
                </div>
            </div>
        </div>
      )}

      {enrollState.enrolling && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full border border-gray-100 shadow-2xl space-y-6 text-center animate-scale-in">
            <div className="w-16 h-16 bg-farm-50 text-farm-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
              <IconZap className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 font-serif">Cadastrando Rosto</h3>
              <p className="text-sm text-gray-500 mt-2">
                Capturando a biometria de <span className="font-bold text-farm-600">{enrollState.targetName}</span> no aparelho do Escritório.
              </p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
              <p className="text-xs text-gray-400 font-black uppercase tracking-wider">Status do Leitor</p>
              {enrollState.status === 'pending' && (
                <p className="text-sm text-amber-600 font-bold flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                  Aguardando leitor receber comando...
                </p>
              )}
              {enrollState.status === 'sent' && (
                <p className="text-sm text-blue-600 font-bold flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></span>
                  Olhe para a câmera do iDFace agora!
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={cancelEnroll}
              className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all"
            >
              Cancelar Operação
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export { ReservationsPage };