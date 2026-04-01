import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconPrinter, IconCheck, IconLoader, IconFileText, IconPlus, IconTrash, IconZap, IconDownload } from './Icons';
import { QRCodeCanvas } from 'qrcode.react';

interface VisualizadorProformaProps {
    estadiaId: number;
    onClose?: () => void;
    isAdmin?: boolean;
}

export const VisualizadorProforma: React.FC<VisualizadorProformaProps> = ({ estadiaId, onClose, isAdmin }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [payments, setPayments] = useState<{ method: string, amount: number, accountId: string }[]>([]);
    const [currentPayment, setCurrentPayment] = useState({ method: 'PIX', amount: '', accountId: '' });
    const printRef = React.useRef<HTMLDivElement>(null);

    // Auto-select account based on method
    useEffect(() => {
        if (accounts.length === 0) return;
        
        let targetAcc = null;
        if (currentPayment.method === 'PIX' || currentPayment.method === 'Transferência') {
            // Try to find an account of type 'Banco' or with 'banco' in the name
            targetAcc = accounts.find(a => a.tipo === 'Banco') || accounts.find(a => a.nome.toLowerCase().includes('banco'));
        } else if (currentPayment.method === 'Dinheiro') {
            // Try to find an account of type 'Dinheiro' or with 'caixa' in the name
            targetAcc = accounts.find(a => a.tipo === 'Dinheiro') || accounts.find(a => a.nome.toLowerCase().includes('caixa'));
        }

        if (targetAcc && targetAcc.nome !== currentPayment.accountId) {
            setCurrentPayment(p => ({ ...p, accountId: targetAcc.nome }));
        }
    }, [currentPayment.method, accounts]);

    useEffect(() => {
        fetchProformaData();
        fetchAccounts();
    }, [estadiaId]);

    const fetchAccounts = async () => {
        const { data } = await supabase.from('finance_accounts').select('*').eq('ativo', true);
        if (data) {
            setAccounts(data);
            if (data.length > 0) setCurrentPayment(p => ({ ...p, accountId: data[0].nome }));
        }
    };

    const fetchProformaData = async () => {
        setLoading(true);
        try {
            // 1. Fetch THIS Estadia to get the reservation ID
            const { data: mainEstadia, error: mainError } = await supabase
                .from('estadias')
                .select('reserva_id')
                .eq('id', estadiaId)
                .single();

            if (mainError) throw mainError;

            // 1b. Fetch ALL Estadias for this reservation to aggregate consumption
            const { data: allStays, error: staysError } = await supabase
                .from('estadias')
                .select(`
                    *,
                    reservations:reserva_id (
                        *,
                        profiles:user_id (*)
                    )
                `)
                .eq('reserva_id', mainEstadia.reserva_id);

            if (staysError) throw staysError;
            if (!allStays || allStays.length === 0) throw new Error('Dados da estadia não encontrados');

            const estadia = allStays.find(s => s.id === estadiaId) || allStays[0];
            const stayIds = allStays.map(s => s.id);
            const reservation = estadia.reservations;
            const profile = reservation.profiles;

            // 2. Determine Category and Location for Tarifario
            let categoriaHospede = 'visitante';
            if (['member', 'admin', 'manager', 'staff', 'finance', 'finance_manager', 'site_admin'].includes(profile.role)) {
                categoriaHospede = 'socio_sem_casa';
            }

            const normalizeString = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const localHospedagem = normalizeString(reservation.accommodation || '');
            
            let localNormalizado = 'casa_grande';
            if (localHospedagem.includes('chale')) localNormalizado = 'chale';
            if (localHospedagem.includes('socio')) localNormalizado = 'casa_socio';

            const { data: allSeasons } = await supabase
                .from('pricing_seasons')
                .select('*');

            let audienceRule: 'Sócio' | 'Visitante' | 'Morador' | 'Todos' = 'Visitante';
            if (['member', 'admin', 'manager', 'staff', 'finance', 'finance_manager', 'site_admin'].includes(profile.role)) {
                audienceRule = 'Sócio';
            }

            let locationMapped = 'Sede';
            if (localNormalizado === 'chale') locationMapped = 'Chalé';
            else if (localNormalizado === 'casa_socio') locationMapped = 'Casa de Sócio';

            const { data: allRules } = await supabase
                .from('pricing_rules')
                .select('*')
                .eq('active', true)
                .eq('audience', audienceRule)
                .eq('location', locationMapped);

            const d1 = new Date(reservation.check_in + 'T12:00:00');
            const d2 = new Date(reservation.check_out + 'T12:00:00');
            const nights = [];
            let current = new Date(d1);
            
            while (current < d2) {
                const dateStr = current.toISOString().split('T')[0];
                const daySeason = allSeasons?.find(s => dateStr >= s.start_date && dateStr <= s.end_date);
                const seasonType = daySeason ? (daySeason.season_type as 'Alta' | 'Baixa' | 'Feriado') : 'Baixa';
                const rule = allRules?.find(r => r.season === seasonType && r.category === 'Hospedagem') || 
                             allRules?.find(r => r.season === 'Ano Todo' && r.category === 'Hospedagem');
                
                nights.push({
                    date: dateStr,
                    season: seasonType,
                    price: rule?.price || 0
                });
                
                current.setDate(current.getDate() + 1);
            }

            if (nights.length > 0 && nights.every(n => n.price === 0)) {
                const { data: tarifario } = await supabase
                    .from('tarifario')
                    .select('*')
                    .eq('categoria_hospede', categoriaHospede)
                    .eq('local_hospedagem', localNormalizado)
                    .lte('data_inicio_vigencia', reservation.check_in)
                    .order('data_inicio_vigencia', { ascending: false })
                    .limit(1);
                
                if (tarifario?.[0]) {
                    nights.forEach(n => n.price = tarifario[0].valor_diaria);
                }
            }

            const isDayUse = (reservation.accommodation === 'Day-Use');
            const totalDiariasHospedagem = isDayUse ? 0 : nights.reduce((acc, n) => acc + n.price, 0);
            
            // Season lookup for day use if no nights
            let currentSeasonType = (nights[0]?.season || 'Baixa');
            if (isDayUse && nights.length === 0) {
                const checkInDateStr = reservation.check_in;
                const daySeason = allSeasons?.find(s => checkInDateStr >= s.start_date && checkInDateStr <= s.end_date);
                currentSeasonType = daySeason ? (daySeason.season_type as 'Alta' | 'Baixa' | 'Feriado') : 'Baixa';
            }

            const findRule = (category: string, season: string) => {
                return allRules?.find(r => r.season === season && r.category === category) ||
                       allRules?.find(r => r.season === 'Ano Todo' && r.category === category);
            };

            const firstNightSeason = currentSeasonType;
            const refeicaoRule = findRule('Refeição', firstNightSeason);
            let mealRate = refeicaoRule?.price || 0;
            const dayUseRule = findRule('Day Use', firstNightSeason);
            let visitFee = dayUseRule?.price || 0;

            const activeTarifario = { 
                valor_diaria: isDayUse ? 0 : (nights[0]?.price || 0),
                valor_refeicao: mealRate, 
                taxa_visita: visitFee,
                season: firstNightSeason,
                nights: nights
            };

            const { data: consumo, error: consumoError } = await supabase
                .from('lancamentos_consumo')
                .select('*, item:item_id(name)')
                .in('estadia_id', stayIds);

            if (consumoError) throw consumoError;

            const d_in = new Date(reservation.check_in + 'T12:00:00');
            const d_out = new Date(reservation.check_out + 'T12:00:00');
            const numDiarias = Math.ceil(Math.abs(d_out.getTime() - d_in.getTime()) / (1000 * 60 * 60 * 24)) || 1;

            const refeicoes = consumo?.filter(item =>
                item.nome_item_snapshot?.toLowerCase().includes('refeição') ||
                item.item?.name?.toLowerCase().includes('refeição') ||
                item.valor_unitario_aplicado === activeTarifario.valor_refeicao
            ) || [];

            const extras = consumo?.filter(item => !refeicoes.includes(item)) || [];
            const hasUnapproved = consumo?.some(item => !item.aprovado_admin) || false;

            // Sanitize guest details: handle potential stringified JSON or missing info
            let guestList: any[] = [];
            if (reservation.guests_details) {
                if (Array.isArray(reservation.guests_details)) {
                    guestList = reservation.guests_details;
                } else if (typeof reservation.guests_details === 'string') {
                    try { guestList = JSON.parse(reservation.guests_details); } catch(e) { guestList = []; }
                }
            }
            
            const isSocio = categoriaHospede !== 'visitante';
            
            // Extract numeric ages even if they have text (e.g. "7 anos")
            const parseAge = (val: any) => {
                if (typeof val === 'number') return val;
                if (!val || typeof val !== 'string') return NaN;
                const match = val.match(/\d+/);
                return match ? parseInt(match[0]) : NaN;
            };

            const validGuestAges = guestList
                .map((g: any) => parseAge(g.age))
                .filter((age: number) => !isNaN(age));

            // User specified age rules:
            // Isento de 0 a 4 completos (uso < 5)
            // Meia de 5 a 9 completos (uso >= 5 e < 10)
            const totalSeniorSocio = isSocio ? validGuestAges.filter(age => age >= 75).length : 0;
            const totalHalfPriceKids = validGuestAges.filter(age => age >= 5 && age < 10).length;
            const totalFreeKids = validGuestAges.filter(age => age < 5).length;
            
            const totalAdults = Math.max(0, reservation.num_guests - totalHalfPriceKids - totalFreeKids);
            const regularAdults = Math.max(0, totalAdults - totalSeniorSocio);

            const equivalentGuests = regularAdults + (totalHalfPriceKids * 0.5) + (totalSeniorSocio * 0.5);
            const totalDiarias = totalDiariasHospedagem * equivalentGuests;
            const totalRefeicoes = (refeicoes.reduce((acc, item) => acc + (item.quantidade * item.valor_unitario_aplicado), 0));
            const totalExtras = extras.reduce((acc, item) => acc + (item.quantidade * item.valor_unitario_aplicado), 0);
            // Visitation fee applies to all visitors, and to anyone doing Day-Use (if rule exists for their role)
            const totalTaxas = (categoriaHospede === 'visitante' || isDayUse) ? activeTarifario.taxa_visita * equivalentGuests : 0;
            const totalGeral = totalDiarias + totalRefeicoes + totalExtras + totalTaxas;

            const { data: existingPayments } = await supabase
                .from('fluxo_caixa')
                .select('valor')
                .in('estadia_id', stayIds);
            
            const totalAlreadyPaid = existingPayments?.reduce((acc: any, p: any) => acc + (p.valor || 0), 0) || 0;

            setData({
                estadia,
                reservation,
                profile,
                allStays,
                tarifario: activeTarifario,
                consumo,
                summary: {
                    numDiarias,
                    totalDiarias,
                    totalRefeicoes,
                    refeicoesCount: refeicoes.reduce((acc, item) => acc + item.quantidade, 0),
                    totalExtras,
                    totalTaxas,
                    totalGeral,
                    totalAlreadyPaid,
                    refeicoesList: refeicoes,
                    extrasList: extras,
                    hasUnapproved,
                    adults: regularAdults,
                    halfPriceKids: totalHalfPriceKids,
                    freeKids: totalFreeKids,
                    seniors: totalSeniorSocio,
                    equivalentGuests
                }
            });

        } catch (err: any) {
            console.error('Error fetching proforma:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPayment = () => {
        const amt = parseFloat(currentPayment.amount.replace(',', '.'));
        if (isNaN(amt) || amt <= 0) return alert('Informe um valor válido');
        if (!currentPayment.accountId) return alert('Selecione uma conta de destino');

        setPayments([...payments, { ...currentPayment, amount: amt }]);
        setCurrentPayment({ ...currentPayment, amount: '' });
    };

    const handleRemovePayment = (idx: number) => {
        setPayments(payments.filter((_, i) => i !== idx));
    };

    const handleConfirmPayment = async () => {
        // Now we can allow checkout even without NEW payments if there was already partial payment, 
        // but typically you'd add at least one or it's just a status change.
        setIsProcessing(true);
        try {
            const totalNewPayments = payments.reduce((acc, p) => acc + p.amount, 0);
            const totalPaidOverall = data.summary.totalAlreadyPaid + totalNewPayments;
            const balance = data.summary.totalGeral - totalPaidOverall;
            
            const { data: stays } = await supabase
                .from('estadias')
                .select('id, reserva_id')
                .eq('reserva_id', data.reservation.id);
            
            const stayIds = stays?.map(s => s.id) || [estadiaId];

            // 1. Check out the guests regardless of payment (as requested)
            if (!isFinalizado) {
                await supabase
                    .from('estadias')
                    .update({ status: 'finalizada', checkout_at: new Date().toISOString() })
                    .in('id', stayIds);
            }

            // 2. Only mark items as paid if fully settled
            if (balance <= 0.05) {
                await supabase
                    .from('lancamentos_consumo')
                    .update({ pago: true })
                    .in('estadia_id', stayIds);
            }

            // 3. Update reservation status
            // If balance remains, keep it in 'em_curso' or maybe a new 'pendente_pagamento' if we had one.
            // For now, if balanced, it's 'finalizada'. If not, it stays 'em_curso' but with stadias closed.
            await supabase
                .from('reservations')
                .update({ status: balance <= 0.05 ? 'finalizada' : 'em_curso' })
                .eq('id', data.reservation.id);
            
            // 4. Record the NEW payments made now
            for (const p of payments) {
                await supabase
                    .from('fluxo_caixa')
                    .insert([{
                        tipo: 'entrada',
                        categoria: 'Receita Hospedagem',
                        valor: p.amount,
                        data_pagamento: new Date().toISOString().split('T')[0],
                        descricao: `Pagamento (${p.method}) - Res: ${data.reservation.name || data.profile.full_name}`,
                        estadia_id: estadiaId,
                        meio_pagamento: p.method === 'PIX' ? 'Banco' : (p.method === 'Dinheiro' ? 'Dinheiro' : 'Banco'),
                        conta_origem: p.accountId
                    }]);
            }

            alert(balance > 0.05 
                ? `Check-out realizado com sucesso! \n\nAtenção: Resta um saldo devedor de R$ ${balance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}. A reserva continuará listada como pendente até a quitação.`
                : 'Pagamento total confirmado! Estadia e reserva encerradas com sucesso.');
            
            if (onClose) onClose();
        } catch (err: any) {
            alert('Erro ao confirmar: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePrintWristbands = () => {
        const activeStays = data.allStays.filter((s:any) => s.status === 'ativa');
        if (activeStays.length === 0) return alert('Nenhuma pulseira ativa encontrada para este grupo.');

        const printWindow = window.open('', '_blank');
        if (!printWindow) return alert('Habilite popups para imprimir.');

        // We'll generate a simple HTML for the barcodes
        let qrItemsHTML = '';
        activeStays.forEach((s: any) => {
            qrItemsHTML += `
                <div style="display:inline-block; border: 1px solid #eee; padding: 20px; text-align: center; margin: 10px; border-radius: 10px; width: 140px;">
                    <p style="font-size: 10px; font-weight: bold; margin-bottom: 5px;">${s.hospede_nome}</p>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${s.codigo_pulseira}" width="120" height="120" />
                    <p style="font-size: 10px; font-family: monospace; margin-top: 5px;">${s.codigo_pulseira}</p>
                </div>
            `;
        });

        printWindow.document.write(`
            <html>
                <head><title>Imprimir Pulseiras - ${data.reservation.name || data.profile.full_name}</title></head>
                <body style="font-family: sans-serif; padding: 20px; text-align: center;">
                    <h2>Pulseiras Digitais - Fazenda São Bento</h2>
                    <div style="display: flex; flex-wrap: wrap; justify-content: center;">
                        ${qrItemsHTML}
                    </div>
                    <script>setTimeout(() => { window.print(); window.close(); }, 1500);</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleGeneratePDF = () => {
        if (!printRef.current) return;
        
        const content = printRef.current.innerHTML;
        const printWindow = window.open('', '', 'height=800,width=1000');
        
        if (!printWindow) {
            alert('Por favor, habilite popups para permitir a impressão.');
            return;
        }

        const logoUrl = window.location.origin + '/logo.jpg';
        printWindow.document.write(`
            <html>
                <head>
                    <title>Comanda - ${data.reservation.name || data.profile.full_name}</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <script>
                        tailwind.config = {
                            theme: {
                                extend: {
                                    colors: {
                                        farm: {
                                            50: '#f2fbf5', 100: '#e1f5e8', 200: '#c3ead4', 300: '#95d8b6',
                                            400: '#5ebb92', 500: '#389f76', 600: '#2a7f5e', 700: '#26664d',
                                            800: '#23513f', 900: '#1d4336',
                                        }
                                    },
                                    fontFamily: {
                                        serif: ['Georgia', 'Cambria', 'serif'],
                                    }
                                }
                            }
                        }
                    </script>
                    <style>
                        @media print {
                            .no-print { display: none !important; }
                            body { background-color: white !important; }
                        }
                        body { 
                            font-family: sans-serif; 
                            background-color: white; 
                            color: #1f2937;
                            padding: 20px;
                        }
                        .no-print { display: none !important; }
                    </style>
                </head>
                <body>
                    <div class="proforma-print-container">
                        ${content.replace(/\/logo\.jpg/g, logoUrl)}
                    </div>
                    <script>
                        setTimeout(() => { window.print(); }, 1500);
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl">
            <IconLoader className="w-10 h-10 text-farm-600 animate-spin mb-4" />
            <p className="text-gray-500">Calculando proforma...</p>
        </div>
    );

    if (error) return (
        <div className="p-8 text-center bg-red-50 rounded-3xl">
            <p className="text-red-600 font-bold mb-4">Erro: {error}</p>
            <button onClick={onClose} className="text-gray-500 underline">Fechar</button>
        </div>
    );

    const { summary, reservation, profile, tarifario, consumo, estadia } = data;
    const isFinalizado = estadia?.status === 'finalizada';

    const groupedExtras = isFinalizado ? Object.values(summary.extrasList.reduce((acc: any, item: any) => {
        const name = item.nome_item_snapshot || item.item?.name || (item.valor_unitario_aplicado === tarifario.valor_refeicao ? 'Refeição' : 'Item Extra');
        const price = item.valor_unitario_aplicado;
        const key = `${name}-${price}`;
        if (!acc[key]) acc[key] = { ...item, displayName: name, quantidade: 0 };
        acc[key].quantidade += item.quantidade;
        return acc;
    }, {})) : [];

    return (
        <div ref={printRef} className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full animate-fade-in relative z-50 proforma-print-container">
            <div className="bg-farm-700 p-8 text-white relative">
                <button
                    onClick={onClose}
                    className="absolute top-8 right-8 text-white/60 hover:text-white transition-colors no-print"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className="bg-white p-2 rounded-2xl shadow-xl shrink-0">
                            <img src="/logo.jpg" alt="Logo" className="h-16 w-auto object-contain rounded-lg" />
                        </div>
                        <div>
                            <h2 className="text-4xl font-bold font-serif tracking-tight">
                                {isFinalizado && (summary.totalGeral - summary.totalAlreadyPaid <= 0.05) ? 'Recibo de Quitação' : 'Comanda / Extrato de Consumo'}
                            </h2>
                            <div className="flex items-center gap-2 mt-1 text-farm-100/80">
                                <span className="text-sm font-medium uppercase tracking-widest">Fazenda São Bento</span>
                                <span className="w-1 h-1 bg-farm-300 rounded-full"></span>
                                <span className="text-sm italic">
                                    {isFinalizado ? 'Documento Fiscalmente Isento' : 'Documento de Controle Interno'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-8 space-y-8">
                {/* QR Codes Section for Admin / Desk */}
                {!isFinalizado && data.estadia.status === 'ativa' && (
                    <div className="bg-farm-50 p-6 rounded-3xl border border-farm-100 space-y-4 no-print">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <h3 className="font-bold text-farm-900 flex items-center gap-2 italic">
                                <IconZap className="w-5 h-5 text-farm-600" />
                                Pulseiras Digitais (Ativas)
                            </h3>
                            <button 
                                onClick={handlePrintWristbands}
                                className="bg-farm-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-farm-700 transition-all flex items-center gap-2 shadow-sm"
                            >
                                <IconPrinter className="w-4 h-4" /> Imprimir QR Codes
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {data.allStays.filter((s:any) => s.status === 'ativa').map((s: any) => (
                                <div key={s.id} className="bg-white p-4 rounded-2xl border border-farm-100 text-center space-y-2 shadow-sm relative group">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate" title={s.hospede_nome}>
                                        {s.hospede_nome}
                                    </p>
                                    <div className="flex justify-center p-2 bg-white border border-gray-50 rounded-xl">
                                        <QRCodeCanvas value={s.codigo_pulseira} size={80} level="H" includeMargin={false} fgColor="#1d4336" />
                                    </div>
                                    <p className="text-[9px] font-mono font-black text-farm-700 tracking-wider">
                                        {s.codigo_pulseira}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-gray-100 pb-8">
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Hóspede Responsável</h4>
                        <p className="text-xl font-bold text-gray-800">{reservation.name || profile.full_name}</p>
                        <p className="text-gray-500 text-sm">{profile.email} • {profile.phone}</p>
                    </div>
                    <div className="text-right">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Estadia</h4>
                        <p className="text-lg font-bold text-gray-800">{reservation.accommodation}</p>
                        <p className="text-gray-500 text-sm">
                            {new Date(reservation.check_in).toLocaleDateString('pt-BR')} até {new Date(reservation.check_out).toLocaleDateString('pt-BR')}
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-2 h-6 bg-farm-500 rounded-full"></span>
                        Detalhamento de Custos
                    </h3>

                    <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 border-b border-gray-200 text-gray-500 text-[10px] uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Descrição</th>
                                    <th className="px-6 py-3 font-semibold text-center">Unitário</th>
                                    <th className="px-6 py-3 font-semibold text-center">Qtd/Dias</th>
                                    <th className="px-6 py-3 font-semibold text-right">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                <tr>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-800">Hospedagem ({reservation.accommodation})</div>
                                        <div className="text-[10px] text-gray-500 mt-1 uppercase font-black tracking-widest">
                                            {tarifario.season} • {summary.numDiarias} Diárias
                                        </div>
                                        <div className="mt-3 space-y-1">
                                            {/* Detailed breakdown per category */}
                                            {summary.adults > 0 && <div className="text-[10px] flex items-center gap-2"><span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> <strong>{summary.adults}</strong> Adulto(s) (R$ {tarifario.valor_diaria.toLocaleString('pt-BR')}/dia)</div>}
                                            {summary.seniors > 0 && <div className="text-[10px] flex items-center gap-2 text-blue-700 font-bold"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span> <strong>{summary.seniors}</strong> Sênior(es) (Meia Diária)</div>}
                                            {summary.halfPriceKids > 0 && <div className="text-[10px] flex items-center gap-2 text-green-700 font-bold"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> <strong>{summary.halfPriceKids}</strong> Criança(s) 5-9a (Meia Diária)</div>}
                                            {summary.freeKids > 0 && <div className="text-[10px] flex items-center gap-2 text-farm-600 font-bold"><span className="w-1.5 h-1.5 bg-farm-400 rounded-full"></span> <strong>{summary.freeKids}</strong> Criança(s) 0-4a (Isento)</div>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center align-top">R$ {tarifario.valor_diaria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-4 text-center align-top font-mono text-[11px]">
                                        {summary.numDiarias}d x {summary.equivalentGuests}p
                                        <p className="text-[9px] text-gray-400 mt-1 italic">(Units equivalentes)</p>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-800 align-top">R$ {summary.totalDiarias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>

                                {(isFinalizado ? groupedExtras : consumo).map((item: any) => (
                                    <tr key={item.id}>
                                        <td className="px-6 py-4">
                                            <div className="text-gray-700 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]">
                                                {item.displayName || item.nome_item_snapshot || item.item?.name || 'Item Extra'}
                                            </div>
                                            {!isFinalizado && (
                                                <div className="text-farm-600 text-[10px] mt-0.5 font-medium">
                                                    Lançado em: {new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">R$ {item.valor_unitario_aplicado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 text-center">{item.quantidade}</td>
                                        <td className="px-6 py-4 text-right text-gray-700 font-bold">R$ {(item.quantidade * item.valor_unitario_aplicado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}

                                {summary.totalTaxas > 0 && (
                                    <tr>
                                        <td className="px-6 py-4 font-bold">Taxas de Visita</td>
                                        <td className="px-6 py-4 text-center">R$ {tarifario.taxa_visita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 text-center">{summary.equivalentGuests}</td>
                                        <td className="px-6 py-4 text-right font-bold">R$ {summary.totalTaxas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-farm-50">
                                <tr>
                                    <td colSpan={3} className="px-6 py-4 text-right font-bold text-gray-400 uppercase text-[10px] tracking-widest">Valor Total:</td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-800 text-lg">R$ {summary.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                {summary.totalAlreadyPaid > 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-4 text-right font-bold text-green-600 uppercase text-[10px] tracking-widest">Valor Pago:</td>
                                        <td className="px-6 py-4 text-right font-bold text-green-600 text-lg">- R$ {summary.totalAlreadyPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                )}
                                <tr className="bg-farm-600 text-white">
                                    <td colSpan={3} className="px-6 py-4 text-right font-black uppercase text-xs tracking-widest leading-none">Saldo a Pagar:</td>
                                    <td className="px-6 py-4 text-right font-black text-2xl leading-none italic">
                                        R$ {Math.max(0, summary.totalGeral - summary.totalAlreadyPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {isAdmin && (!isFinalizado || (summary.totalGeral - summary.totalAlreadyPaid > 0.05)) && (
                    <div className="bg-farm-50/50 p-6 rounded-3xl border border-farm-100 space-y-4 no-print mt-8">
                        <h3 className="font-bold text-farm-900 flex items-center gap-2">
                            {isFinalizado ? '💰 Regularizar Saldo Pendente' : '🛒 Pagamento e Fechamento'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-farm-600 uppercase tracking-widest pl-1">Método</label>
                                <select value={currentPayment.method} onChange={e => setCurrentPayment({...currentPayment, method: e.target.value})} className="w-full px-3 py-2 bg-white border border-farm-100 rounded-xl outline-none">
                                    <option value="PIX">PIX</option>
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="Transferência">Transferência</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-farm-600 uppercase tracking-widest pl-1">Conta</label>
                                <select value={currentPayment.accountId} onChange={e => setCurrentPayment({...currentPayment, accountId: e.target.value})} className="w-full px-3 py-2 bg-white border border-farm-100 rounded-xl outline-none">
                                    {accounts.map(acc => <option key={acc.id} value={acc.nome}>{acc.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-farm-600 uppercase tracking-widest pl-1">Valor</label>
                                <input type="text" placeholder="0,00" value={currentPayment.amount} onChange={e => setCurrentPayment({...currentPayment, amount: e.target.value})} className="w-full px-3 py-2 bg-white border border-farm-100 rounded-xl outline-none font-mono" />
                            </div>
                            <div className="flex items-end">
                                <button onClick={handleAddPayment} className="w-full bg-farm-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-farm-700 transition-all"><IconPlus className="w-5 h-5 inline mr-1" /> Add</button>
                            </div>
                        </div>

                        {payments.length > 0 && (
                            <div className="bg-white rounded-xl border border-farm-100 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-farm-50 text-farm-700 font-bold">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Método</th>
                                            <th className="px-4 py-2 text-left">Conta</th>
                                            <th className="px-4 py-2 text-right">Valor</th>
                                            <th className="px-4 py-2 text-center w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {payments.map((p, i) => (
                                            <tr key={i}>
                                                <td className="px-4 py-2">{p.method}</td>
                                                <td className="px-4 py-2">{p.accountId}</td>
                                                <td className="px-4 py-2 text-right">R$ {p.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <button onClick={() => handleRemovePayment(i)} className="text-red-400"><IconTrash className="w-4 h-4" /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 bg-white p-3 rounded-xl border border-gray-100 flex justify-between">
                                <span className="text-xs font-bold text-gray-400">Total:</span>
                                <span className="font-bold">R$ {summary.totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex-1 bg-white p-3 rounded-xl border border-gray-100 flex justify-between">
                                <span className="text-xs font-bold text-gray-400">Pago:</span>
                                <span className="font-bold text-green-600">R$ {payments.reduce((acc, p) => acc + p.amount, 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex-1 bg-white p-3 rounded-xl border border-gray-100 flex justify-between">
                                <span className="text-xs font-bold text-gray-400">Restante:</span>
                                <span className={`font-bold ${summary.totalGeral - payments.reduce((acc, p) => acc + p.amount, 0) > 0.05 ? 'text-red-600' : 'text-green-600'}`}>
                                    R$ {Math.max(0, summary.totalGeral - payments.reduce((acc, p) => acc + p.amount, 0)).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 no-print pt-4">
                    <button onClick={onClose} className="bg-gray-100 text-gray-600 font-bold py-3 px-6 rounded-2xl">
                        {isFinalizado ? 'Fechar' : 'Cancelar'}
                    </button>
                    <button onClick={handleGeneratePDF} className="flex-1 border-2 border-farm-200 text-farm-700 font-bold py-3 px-6 rounded-2xl">
                        <IconPrinter className="w-5 h-5 inline mr-2" />
                        {isFinalizado ? 'Imprimir Recibo' : 'Gerar PDF'}
                    </button>
                    {isAdmin && (!isFinalizado || (summary.totalGeral - summary.totalAlreadyPaid > 0.05)) && (
                        <button onClick={handleConfirmPayment} disabled={isProcessing} className="flex-[2] bg-farm-800 text-white font-bold py-3 px-6 rounded-2xl hover:bg-farm-900 disabled:opacity-50">
                            {isProcessing ? <IconLoader className="w-5 h-5 animate-spin inline" /> : <IconCheck className="w-5 h-5 inline mr-2" />}
                            {isFinalizado ? 'Confirmar Quitação de Saldo' : (payments.reduce((acc, p) => acc + p.amount, 0) < summary.totalGeral - 0.05 ? 'Pagamento Parcial e Checkout' : 'Finalizar Total')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
