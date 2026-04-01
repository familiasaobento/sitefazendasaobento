import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { IconCamera, IconLoader, IconCheck, IconShoppingCart, IconUser, IconZap } from '../components/Icons';

interface Stay {
    id: number;
    codigo_pulseira: string;
    status: string;
    reservations: {
        num_guests: number;
        accommodation: string;
        check_in: string;
        name?: string;
        profiles: {
            full_name: string;
            role: string;
            cpf?: string;
        }
    }
}

interface Product {
    id: number;
    name: string;
    price: number;
    category: string;
    sell_by_weight?: boolean;
    unit_type?: string;
}

interface OperatingPoint {
    id: number;
    nome: string;
}

export const PDVPage: React.FC = () => {
    const [operatingPoint, setOperatingPoint] = useState<string | null>(localStorage.getItem('pdv_current_point'));
    const [scanning, setScanning] = useState(false);
    const [activeStay, setActiveStay] = useState<Stay | null>(null);
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [showProductList, setShowProductList] = useState(false);
    const [itemQuantities, setItemQuantities] = useState<Record<number, number>>({});
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isAvulsa, setIsAvulsa] = useState(false);
    const [basket, setBasket] = useState<{product: Product, quantity: number}[]>([]);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Pix' | 'Cartão' | 'Transferência'>('Dinheiro');

    // Manual Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeStaysList, setActiveStaysList] = useState<Stay[]>([]);
    const [showManualSearch, setShowManualSearch] = useState(false);
    const [availablePoints, setAvailablePoints] = useState<OperatingPoint[]>([]);

    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const lastScanRef = useRef<{ code: string, time: number } | null>(null);

    const getCurrentMeal = () => {
        const hour = new Date().getHours();
        if (hour >= 7 && hour < 11) return 'Café da Manhã';
        if (hour >= 12 && hour < 16) return 'Almoço';
        if (hour >= 17 && hour < 22) return 'Jantar';
        return null;
    };

    const isRestaurante = (operatingPoint || '').toLowerCase().includes('restaurante') || 
                          (operatingPoint || '').toLowerCase().includes('refeitório') || 
                          (operatingPoint || '').toLowerCase().includes('refeitorio') ||
                          products.some(p => p.category === 'Refeições');

    const isEscritorio = (operatingPoint || '').toLowerCase().includes('escritório') || 
                         (operatingPoint || '').toLowerCase().includes('escritorio');

    useEffect(() => {
        const fetchInitialData = async () => {
            const { data } = await supabase.from('pontos_venda').select('id, nome').eq('ativo', true).order('nome');
            setAvailablePoints(data || []);
        };

        const fetchActiveStays = async () => {
            try {
                const { data, error } = await supabase
                    .from('estadias')
                    .select(`
                        *,
                        reservations:reserva_id (
                            num_guests,
                            accommodation,
                            check_in,
                            name,
                            profiles:profiles!user_id (full_name, role, cpf)
                        )
                    `)
                    .eq('status', 'ativa')
                    .order('id', { ascending: false });

                if (!error && data) {
                    setActiveStaysList(data);
                }
            } catch (err) {
                console.error('Error fetching active stays:', err);
            }
        };

        fetchInitialData();
        fetchActiveStays();
        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear();
            }
        };
    }, []);

    useEffect(() => {
        if (operatingPoint) {
            fetchPdvProducts();
            if (isRestaurante) {
                setTimeout(startScanner, 500);
            }
        } else {
            if (scannerRef.current) {
                scannerRef.current.clear().then(() => {
                    scannerRef.current = null;
                }).catch(e => console.error(e));
                setScanning(false);
            }
        }
    }, [operatingPoint]);

    const fetchPdvProducts = async () => {
        if (!operatingPoint) return;

        // Find ID of point
        let pt = availablePoints.find(p => p.nome === operatingPoint);
        let pdvId: number | null = pt?.id || null;

        if (!pdvId) {
            const { data: ptData } = await supabase.from('pontos_venda').select('id').eq('nome', operatingPoint).single();
            if (ptData) pdvId = ptData.id;
        }

        if (pdvId) {
            const { data: vis } = await supabase.from('pdv_produtos_visibilidade').select('produto_id').eq('pdv_id', pdvId);
            const ids = vis?.map(v => v.produto_id) || [];

            if (ids.length === 0) {
                setProducts([]);
                return;
            }

            const { data: prodData } = await supabase.from('products').select('id, name, price, category, sell_by_weight, unit_type').in('id', ids).order('name');
            setProducts((prodData as any[]).map(p => ({
                id: p.id,
                name: p.name,
                price: p.price,
                category: p.category,
                sell_by_weight: p.sell_by_weight,
                unit_type: p.unit_type
            })) || []);
        }
    };

    const setPoint = (point: string) => {
        setOperatingPoint(point);
        localStorage.setItem('pdv_current_point', point);
    };

    const startScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.clear();
                scannerRef.current = null;
            } catch (e) {
                console.error("Error clearing scanner:", e);
            }
        }

        setScanning(true);
        setActiveStay(null);

        // Wait for DOM element to be ready
        setTimeout(() => {
            const readerElement = document.getElementById("reader");
            if (!readerElement) {
                console.error("Reader element not found");
                return;
            }

            const scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );

            try {
                scanner.render(onScanSuccess, onScanFailure);
                scannerRef.current = scanner;
            } catch (err) {
                console.error("Scanner render error:", err);
            }
        }, 300);
    };

    const onScanSuccess = async (decodedText: string) => {
        // Prevent double scans (vibrate/beep workaround)
        const now = Date.now();
        if (lastScanRef.current && lastScanRef.current.code === decodedText && now - lastScanRef.current.time < 30000) {
            return;
        }
        lastScanRef.current = { code: decodedText, time: now };

        if (!isRestaurante && scannerRef.current) {
            await scannerRef.current.clear();
            scannerRef.current = null;
            setScanning(false);
        }
        
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('estadias')
                .select(`
                    id,
                    reserva_id,
                    codigo_pulseira,
                    status,
                    hospede_nome,
                    hospede_idade,
                    reservations:reserva_id (
                        num_guests,
                        accommodation,
                        check_in,
                        name,
                        profiles:profiles!user_id (full_name, role)
                    )
                `)
                .eq('codigo_pulseira', decodedText)
                .eq('status', 'ativa')
                .order('id', { ascending: false })
                .single();

            if (error || !data) {
                setFeedback('⚠️ Erro: Pulseira não encontrada ou inativa');
                setTimeout(() => setFeedback(null), 3000);
                return;
            }

            if (isRestaurante) {
                const mealName = getCurrentMeal();
                if (!mealName) {
                    setFeedback('🍽️ Fora do horário de refeições');
                    setTimeout(() => setFeedback(null), 3000);
                } else {
                    // Check if THIS specific person (stay.id) already had this meal today
                    const today = new Date().toISOString().split('T')[0];
                    const { count, error: countError } = await supabase
                        .from('lancamentos_consumo')
                        .select('*', { count: 'exact', head: true })
                        .eq('estadia_id', data.id)
                        .eq('nome_item_snapshot', mealName)
                        .gte('created_at', today);

                    if (countError) console.error('Error checking repeat meal:', countError);
                    
                    const alreadyLaunched = count || 0;

                    if (alreadyLaunched > 0) {
                        // REPEAT: Launch with price 0
                        setFeedback(`🔄 Repetição: ${data.hospede_nome || 'Hóspede'}. Registrando sem custo.`);
                        await handleLaunchConsumption(mealName, 1, 0, data);
                    } else {
                        // FIRST TIME: Launch with normal price
                        await handleLaunchConsumption(mealName, 1, undefined, data);
                    }
                }
            } else {
                setActiveStay(data);
            }
        } catch (err) {
            console.error('Error finding stay:', err);
        } finally {
            setLoading(false);
        }
    };

    const onScanFailure = (error: any) => { };

    const handleLaunchConsumption = async (itemName: string, quantity: number, priceOverride?: number, stayOverride?: any, currentIteration?: number, maxIteration?: number) => {
        const targetStayForRegular = stayOverride || activeStay;
        if (!targetStayForRegular && !isAvulsa) return;

        setLoading(true);
        try {
            const product = products.find(p => p.name === itemName);
            let price = priceOverride || product?.price || 0;

            if (isAvulsa) {
                if (product) {
                    setBasket(prev => [...prev, { product, quantity }]);
                    setFeedback(`🛒 Adicionado: ${itemName}`);
                    setTimeout(() => setFeedback(null), 2000);
                }
                setLoading(false);
                return;
            }

            const targetStay = targetStayForRegular!;
            const guestCat = targetStay.reservations?.profiles?.role || 'visitante';

            if (isRestaurante && product?.category === 'Refeições' && !priceOverride) {
                // Fetch Pricing Season
                const { data: activeSeasons } = await supabase
                    .from('pricing_seasons')
                    .select('season_type')
                    .lte('start_date', targetStay.reservations.check_in)
                    .gte('end_date', targetStay.reservations.check_in);

                const determinedSeason = activeSeasons && activeSeasons.length > 0
                    ? activeSeasons[0].season_type
                    : 'Baixa';

                // Fetch from pricing_rules
                const { data: rules } = await supabase
                    .from('pricing_rules')
                    .select('price')
                    .eq('active', true)
                    .eq('category', 'Refeição')
                    .eq('season', determinedSeason)
                    .eq('audience', guestCat !== 'visitante' ? 'Sócio' : 'Visitante')
                    .limit(1);

                if (rules && rules.length > 0) {
                    price = rules[0].price;
                } else {
                    // Fallback to legacy tarifario
                    const { data: tarifario } = await supabase
                        .from('tarifario')
                        .select('valor_refeicao')
                        .eq('categoria_hospede', guestCat)
                        .lte('data_inicio_vigencia', targetStay.reservations.check_in)
                        .order('data_inicio_vigencia', { ascending: false })
                        .limit(1)
                        .single();

                    price = tarifario?.valor_refeicao || 0;
                }

                // CHECK: If stay is in Casa Grande or Chalés, meals are included (Value 0 for counting only)
                const accom = (targetStay.reservations?.accommodation || '').toLowerCase();
                if (accom.includes('casa grande') || accom.includes('chale') || accom.includes('chalé')) {
                    price = 0;
                }
            }

            const { data: { user } } = await supabase.auth.getUser();

            const { error: insertError } = await supabase
                .from('lancamentos_consumo')
                .insert([{
                    estadia_id: targetStay.id,
                    item_id: product?.id || null,
                    nome_item_snapshot: itemName,
                    quantidade: quantity,
                    valor_unitario_aplicado: price,
                    criado_por: user?.id,
                    aprovado_admin: true,
                    pago: false
                }]);

            if (insertError) throw insertError;

            const displayName = targetStay.hospede_nome || targetStay.reservations?.name || targetStay.reservations?.profiles?.full_name;
            
            if (price === 0) {
                setFeedback(`🔄 ${displayName}: ${itemName} (Repetição sem custo)`);
            } else {
                setFeedback(`✅ ${displayName}: ${itemName} registrado!`);
            }
            setTimeout(() => setFeedback(null), 3000);

            if (product?.category !== 'Refeições') {
                setShowProductList(false);
            }
            setActiveStay(null); 
        } catch (err: any) {
            setFeedback('❌ Erro: ' + err.message);
            setTimeout(() => setFeedback(null), 3000);
        } finally {
            setLoading(false);
        }
    };

    const handleFinalizeAvulsa = async () => {
        if (basket.length === 0) return;
        setLoading(true);
        try {
            const total = basket.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Record in fluxo_caixa (Payment received)
            const { error: caixaError } = await supabase
                .from('fluxo_caixa')
                .insert([{
                    tipo: 'Entrada',
                    categoria: 'Venda Avulsa',
                    valor: total,
                    descricao: `Venda Avulsa Escritório: ${basket.map(i => `${i.quantity}x ${i.product.name}`).join(', ')}`,
                    meio_pagamento: paymentMethod,
                    data_pagamento: new Date().toISOString().split('T')[0]
                }]);

            if (caixaError) throw caixaError;

            // 2. Record as consumed (optional, for history/stock)
            const { error: consumoError } = await supabase
                .from('lancamentos_consumo')
                .insert(basket.map(item => ({
                    item_id: item.product.id,
                    nome_item_snapshot: item.product.name,
                    quantidade: item.quantity,
                    valor_unitario_aplicado: item.product.price,
                    criado_por: user?.id,
                    aprovado_admin: true,
                    pago: true // Marked as already paid since it's an avulsa sale
                })));

            setFeedback(`💰 Venda Finalizada: R$ ${total.toLocaleString('pt-BR')}`);
            setBasket([]);
            setIsAvulsa(false);
            setShowPaymentModal(false);
            setTimeout(() => setFeedback(null), 4000);
        } catch (err: any) {
            alert('Erro ao finalizar venda: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 min-h-screen bg-gray-50 flex flex-col">
            <header className="text-center relative">
                <h1 className="text-3xl font-bold text-farm-900 font-serif">Ponto de Venda Fazenda</h1>
                <p className="text-gray-500">Módulo de Consumo Rápido (Tablet)</p>

                {operatingPoint && (
                    <div className="space-y-2">
                        <button
                            onClick={() => {
                                if (scannerRef.current) scannerRef.current.clear();
                                setOperatingPoint(null);
                                setScanning(false);
                            }}
                            className="mt-2 inline-flex items-center gap-2 bg-farm-100 text-farm-700 px-3 py-1 rounded-full text-sm font-bold hover:bg-farm-200 transition-colors"
                        >
                            🏠 {operatingPoint} (Trocar)
                        </button>
                        {isRestaurante && (
                            <div className="flex flex-col items-center">
                                <div className="bg-orange-500 text-white px-6 py-2 rounded-2xl font-black text-xl shadow-lg animate-pulse uppercase tracking-tighter">
                                    Modo Self-Service: {getCurrentMeal() || 'Fechado'}
                                </div>
                                <p className="text-gray-400 text-sm mt-2">Aproxime a pulseira da câmera para registrar</p>
                            </div>
                        )}
                    </div>
                )}
            </header>

            {!operatingPoint && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-fade-in">
                    <h2 className="text-2xl font-bold text-gray-800">Selecione o local de operação:</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full max-w-4xl">
                        {availablePoints.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setPoint(p.nome)}
                                className="h-32 bg-white border-2 border-farm-100 rounded-3xl shadow-sm text-xl font-bold text-farm-900 hover:border-farm-500 hover:bg-farm-50 transition-all active:scale-95"
                            >
                                {p.nome}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {operatingPoint && !activeStay && !scanning && !showManualSearch && !isRestaurante && !isAvulsa && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                    {feedback ? (
                        <div className="flex flex-col items-center justify-center space-y-4 animate-bounce py-12">
                            <div className="w-32 h-32 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner">
                                <IconCheck className="w-16 h-16" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 text-center px-4">{feedback}</h2>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Aguarde... pronto para o próximo</p>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={startScanner}
                                className="w-64 h-64 bg-farm-600 text-white rounded-3xl shadow-2xl flex flex-col items-center justify-center gap-4 hover:bg-farm-700 transition-all active:scale-95 group"
                            >
                                <IconCamera className="w-20 h-20 group-hover:scale-110 transition-transform" />
                                <span className="text-xl font-bold uppercase tracking-widest">Escanear Pulseira</span>
                            </button>
                            <p className="text-gray-400 text-center max-w-xs font-medium uppercase tracking-tighter">— OU —</p>
                            <div className="flex flex-col gap-3 w-64">
                                <button
                                    onClick={() => setShowManualSearch(true)}
                                    className="w-full py-4 bg-white text-farm-700 border-2 border-farm-200 rounded-2xl shadow-sm flex items-center justify-center gap-3 hover:bg-farm-50 transition-all font-bold group"
                                >
                                    <IconUser className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                    Buscar Hóspede
                                </button>
                                {isEscritorio && (
                                    <button
                                        onClick={() => setIsAvulsa(true)}
                                        className="w-full py-4 bg-amber-500 text-white rounded-2xl shadow-sm flex items-center justify-center gap-3 hover:bg-amber-600 transition-all font-bold border-b-4 border-amber-700 active:border-b-0 active:translate-y-1"
                                    >
                                        <IconShoppingCart className="w-6 h-6" />
                                        Venda Avulsa
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}



            {!activeStay && showManualSearch && (
                <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                            <h2 className="text-xl font-bold text-gray-800">
                                {isRestaurante ? 'Identificação por CPF' : 'Selecione o Hóspede'}
                            </h2>
                            <button onClick={() => {
                                setShowManualSearch(false);
                                setSearchQuery('');
                            }} className="text-gray-400 hover:text-gray-600 font-bold text-sm bg-gray-100 px-3 py-1 rounded-full">
                                Voltar
                            </button>
                        </div>

                        {isRestaurante ? (
                            <div className="space-y-6">
                                <div className="bg-farm-50 p-4 rounded-2xl flex items-center gap-3 border border-farm-100">
                                    <IconZap className="w-5 h-5 text-farm-600" />
                                    <p className="text-sm text-farm-800">Digite o CPF do titular ou dependente para lançar a refeição.</p>
                                </div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="000.000.000-00"
                                        value={searchQuery}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            if (val.length <= 11) setSearchQuery(val);
                                        }}
                                        className="w-full px-5 py-6 bg-gray-50 border-2 border-farm-100 rounded-2xl focus:border-farm-500 transition-all outline-none text-3xl font-black tracking-widest text-center"
                                        autoFocus
                                    />
                                    {searchQuery.length === 11 && (
                                        <div className="mt-6 animate-fade-in">
                                            {activeStaysList.find(s => s.reservations?.profiles?.cpf?.replace(/\D/g, '') === searchQuery) ? (
                                                (() => {
                                                    const s = activeStaysList.find(s => s.reservations?.profiles?.cpf?.replace(/\D/g, '') === searchQuery)!;
                                                    return (
                                                        <div className="bg-white p-6 rounded-3xl border-2 border-green-500 shadow-xl space-y-4">
                                                            <div className="text-center">
                                                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Hóspede Encontrado</p>
                                                                <h3 className="text-2xl font-black text-farm-900">{s.reservations?.profiles?.full_name}</h3>
                                                                <p className="text-sm font-medium text-farm-600 bg-farm-50 inline-block px-3 py-1 rounded-full mt-2">
                                                                    {s.reservations?.accommodation}
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={async () => {
                                                                    const mealName = getCurrentMeal();
                                                                    if (!mealName) return alert('Fora do horário de refeições');
                                                                    
                                                                    setLoading(true);
                                                                    const { count } = await supabase
                                                                        .from('lancamentos_consumo')
                                                                        .select('*', { count: 'exact', head: true })
                                                                        .eq('estadia_id', s.id)
                                                                        .eq('nome_item_snapshot', mealName)
                                                                        .gte('created_at', new Date().toISOString().split('T')[0]);
                                                                    
                                                                    if (count && count > 0) {
                                                                        await handleLaunchConsumption(mealName, 1, 0, s);
                                                                    } else {
                                                                        await handleLaunchConsumption(mealName, 1, undefined, s);
                                                                    }
                                                                    
                                                                    setSearchQuery('');
                                                                    setShowManualSearch(false);
                                                                    setLoading(false);
                                                                }}
                                                                className="w-full bg-green-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-lg shadow-lg hover:bg-green-700 active:scale-95 transition-all"
                                                            >
                                                                Confirmar Refeição
                                                            </button>
                                                        </div>
                                                    );
                                                })()
                                            ) : (
                                                <div className="bg-red-50 p-6 rounded-3xl border border-red-100 text-center">
                                                    <p className="text-red-600 font-bold">Hóspede não encontrado com este CPF ou sem estadia ativa.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Buscar por nome ou pulseira..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full px-5 py-4 pl-12 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-farm-500 focus:ring-4 focus:ring-farm-100 transition-all outline-none text-lg font-medium"
                                    />
                                    <svg className="w-6 h-6 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>

                                <div className="max-h-96 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                                    {activeStaysList
                                        .filter(s => {
                                            const name = s.reservations?.name || s.reservations?.profiles?.full_name || '';
                                            const wristband = s.codigo_pulseira || '';
                                            const cpf = s.reservations?.profiles?.cpf || '';
                                            return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                wristband.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                cpf.includes(searchQuery);
                                        })
                                        .map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => {
                                                    setActiveStay(s);
                                                    setSearchQuery('');
                                                    setShowManualSearch(false);
                                                }}
                                                className="w-full text-left p-4 rounded-2xl border border-gray-100 hover:border-farm-300 hover:bg-farm-50 transition-all flex items-center justify-between group"
                                            >
                                                <div>
                                                    <p className="font-bold text-gray-800 text-lg">{s.reservations?.name || s.reservations?.profiles?.full_name || 'Usuário Indefinido'}</p>
                                                    <p className="text-sm text-gray-500 font-medium mt-1">
                                                        {s.reservations?.accommodation} • Code: <span className="text-farm-600 bg-farm-100 px-2 py-0.5 rounded-md text-xs">{s.codigo_pulseira}</span>
                                                    </p>
                                                </div>
                                                <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-farm-600 group-hover:border-farm-300 transition-colors shadow-sm">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                                </div>
                                            </button>
                                        ))
                                    }
                                    {activeStaysList.filter(s =>
                                        (s.reservations?.name || s.reservations?.profiles?.full_name)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        s.codigo_pulseira.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        (s.reservations?.profiles?.cpf || '').includes(searchQuery)
                                    ).length === 0 && (
                                            <div className="text-center py-10">
                                                <p className="text-gray-500 font-medium text-lg">Nenhum hóspede ativo encontrado.</p>
                                            </div>
                                        )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {scanning && !showManualSearch && !activeStay && (
                <div className="flex-1 bg-white rounded-3xl shadow-xl p-4 overflow-hidden relative border-4 border-farm-200 flex flex-col min-h-[400px]">
                    <div id="reader" className="w-full flex-1"></div>
                    
                    {/* FEEDBACK OVERLAY (Corrects the white screen issue by not unmounting the reader) */}
                    {feedback && (
                        <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-6 animate-fade-in">
                            <div className={`w-32 h-32 ${feedback.includes('✅') ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} rounded-full flex items-center justify-center shadow-inner animate-bounce`}>
                                {feedback.includes('✅') ? <IconCheck className="w-16 h-16" /> : <span className="text-6xl">⚠️</span>}
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 text-center px-8">{feedback}</h2>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Aguarde... voltando para a câmera</p>
                        </div>
                    )}

                    {isRestaurante && (
                        <button
                            onClick={() => setShowManualSearch(true)}
                            className="mt-4 w-full py-4 bg-white text-farm-700 border-2 border-farm-200 rounded-2xl shadow-sm flex items-center justify-center gap-3 hover:bg-farm-50 transition-all font-bold"
                        >
                            <IconUser className="w-6 h-6 text-farm-600" />
                            {isRestaurante ? 'Esqueci o QR Code (Entrar CPF)' : 'Esqueci o QR Code (Buscar Nome)'}
                        </button>
                    )}
                    {!isRestaurante && (
                        <button
                            onClick={() => {
                                if (scannerRef.current) scannerRef.current.clear();
                                setScanning(false);
                            }}
                            className="mt-4 w-full py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl"
                        >
                            Cancelar
                        </button>
                    )}
                </div>
            )}

            {(activeStay || isAvulsa) && !feedback && (
                <div className="flex-1 space-y-8 animate-fade-in pb-24">
                    <div className="bg-white p-8 rounded-3xl shadow-lg border border-farm-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                                {isAvulsa ? 'Ponto de Venda Directa' : 'Hóspede'}
                            </h2>
                            <p className="text-3xl font-bold text-farm-900">
                                {isAvulsa ? 'Venda Avulsa' : (activeStay!.reservations.name || activeStay!.reservations.profiles.full_name)}
                            </p>
                            <p className="text-gray-500 font-medium">
                                {isAvulsa ? 'Recebimento imediato no Escritório' : `${activeStay!.reservations.accommodation} • Pulseira: ${activeStay!.codigo_pulseira}`}
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                setActiveStay(null);
                                setIsAvulsa(false);
                                setBasket([]);
                                setItemQuantities({});
                            }}
                            className="bg-gray-100 p-4 rounded-2xl text-gray-400 hover:text-red-500 transition-colors"
                            title="Cancelar tudo"
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {isAvulsa && basket.length > 0 && (
                        <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 space-y-4">
                            <h3 className="font-black text-amber-800 uppercase tracking-widest text-xs flex items-center gap-2">
                                <IconShoppingCart className="w-4 h-4" /> Itens no Carrinho
                            </h3>
                            <div className="space-y-2">
                                {basket.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm">
                                        <span className="text-gray-700 font-bold">{item.quantity}x {item.product.name}</span>
                                        <span className="text-gray-500 font-mono">R$ {(item.quantity * item.product.price).toLocaleString('pt-BR')}</span>
                                    </div>
                                ))}
                                <div className="pt-4 border-t border-amber-200 flex justify-between items-center">
                                    <span className="text-amber-900 font-black uppercase">Total</span>
                                    <span className="text-2xl font-black text-amber-900">
                                        R$ {basket.reduce((acc, i) => acc + (i.product.price * i.quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowPaymentModal(true)}
                                className="w-full bg-green-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-green-700 shadow-lg shadow-green-100"
                            >
                                Finalizar e Receber Pagamento
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                        {products.filter(p => p.category === 'Refeições').length > 0 ? (
                            products.filter(p => p.category === 'Refeições').map(meal => (
                                <button
                                    key={meal.id}
                                    onClick={() => handleLaunchConsumption(meal.name, 1)}
                                    disabled={loading}
                                    className={`h-40 rounded-3xl shadow-xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${meal.name.includes('Café') ? 'bg-amber-500 hover:bg-amber-600' :
                                        meal.name.includes('Almoço') ? 'bg-orange-500 hover:bg-orange-600' :
                                            'bg-farm-900 hover:bg-black'
                                        } text-white`}
                                >
                                    <span className="text-4xl">
                                        {meal.name.includes('Café') ? '☕' : meal.name.includes('Almoço') ? '🍽️' : '🌙'}
                                    </span>
                                    <span className="text-2xl font-black uppercase text-center">{meal.name}</span>
                                </button>
                            ))
                        ) : (
                            <div className="md:col-span-2 bg-yellow-50 p-6 rounded-3xl border border-yellow-100 text-yellow-800 text-center font-medium">
                                Nenhuma refeição configurada para este PDV.
                            </div>
                        )}

                        <button
                            onClick={() => setShowProductList(true)}
                            disabled={loading}
                            className="h-40 md:col-span-2 bg-blue-600 text-white rounded-3xl shadow-xl flex flex-col items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                        >
                            <IconShoppingCart className="w-12 h-12" />
                            <span className="text-2xl font-black uppercase">Outros Produtos Fazenda</span>
                        </button>
                    </div>
                </div>
            )}



            {showProductList && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" aria-hidden="true" onClick={() => { setShowProductList(false); setItemQuantities({}); }}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden shadow-2xl relative z-10">
                            <header className="p-6 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-800 uppercase tracking-wide">Escolha o Produto</h3>
                            <button onClick={() => { setShowProductList(false); setItemQuantities({}); }} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 custom-scrollbar">
                            {products.filter(p => p.category !== 'Refeições').length === 0 ? (
                                <p className="col-span-full text-center text-gray-500 py-12">Nenhum produto extra configurado para este PDV.</p>
                            ) : (
                                products.filter(p => p.category !== 'Refeições').map(p => {
                                    const qty = itemQuantities[p.id] || 1;
                                    return (
                                        <div
                                            key={p.id}
                                            className="p-4 bg-gray-50 border border-gray-100 rounded-3xl flex flex-col justify-between gap-4 hover:shadow-md transition-all border-b-4 border-b-gray-200"
                                        >
                                            <div>
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-[10px] font-black text-farm-600 uppercase tracking-widest bg-farm-100 px-2 py-0.5 rounded-full">{p.category}</span>
                                                </div>
                                                <p className="font-bold text-gray-800 text-base leading-tight">{p.name}</p>
                                                <p className="text-gray-500 font-mono text-sm mt-1">R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {p.sell_by_weight ? '/ kg' : ''}</p>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-inner border border-gray-100 h-14">
                                                    <div className="flex-1 flex items-center">
                                                        {p.sell_by_weight ? (
                                                            <div className="flex items-center gap-2 w-full pr-2">
                                                                <input 
                                                                    type="number" 
                                                                    step="0.001"
                                                                    placeholder="0.000"
                                                                    value={itemQuantities[p.id] || ''}
                                                                    onChange={(e) => setItemQuantities(prev => ({ ...prev, [p.id]: parseFloat(e.target.value) }))}
                                                                    className="w-full bg-transparent outline-none focus:ring-0 font-black text-lg text-farm-900 placeholder:text-gray-200"
                                                                />
                                                                <span className="text-xs font-black text-gray-300 uppercase tracking-widest">kg</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-between w-full">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setItemQuantities(prev => ({ ...prev, [p.id]: Math.max(1, (prev[p.id] || 1) - 1) }))}
                                                                    className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center font-bold text-gray-400 hover:bg-gray-100 hover:text-farm-600 transition-colors"
                                                                >
                                                                    -
                                                                </button>
                                                                <span className="font-black text-gray-800 text-lg">{qty}</span>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setItemQuantities(prev => ({ ...prev, [p.id]: (prev[p.id] || 1) + 1 }))}
                                                                    className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center font-bold text-gray-400 hover:bg-gray-100 hover:text-farm-600 transition-colors"
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    onClick={() => {
                                                        const currentQty = itemQuantities[p.id] || (p.sell_by_weight ? 0 : 1);
                                                        if (currentQty <= 0) {
                                                            alert('Informe um peso/quantidade válido');
                                                            return;
                                                        }
                                                        handleLaunchConsumption(p.name, currentQty, p.price);
                                                        if (p.sell_by_weight) {
                                                            setItemQuantities(prev => {
                                                                const next = { ...prev };
                                                                delete next[p.id];
                                                                return next;
                                                            });
                                                        }
                                                    }}
                                                    className="w-full bg-farm-600 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-farm-700 shadow-lg shadow-farm-100 active:scale-95 transition-all"
                                                >
                                                    Adicionar ao Consumo
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                    </div>
                </div>
            )}

            {loading && !feedback && (
                <div className="fixed top-8 right-8">
                    <IconLoader className="w-8 h-8 text-farm-600 animate-spin" />
                </div>
            )}

            {/* Payment Modal for Vendas Avulsas */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
                        <div className="p-8 bg-farm-900 text-white">
                            <h3 className="text-2xl font-bold font-serif mb-2">Finalizar Venda Avulsa</h3>
                            <p className="text-farm-200">Selecione o meio de recebimento do pagamento</p>
                        </div>
                        
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                {['Dinheiro', 'Pix', 'Cartão', 'Transferência'].map(method => (
                                    <button
                                        key={method}
                                        onClick={() => setPaymentMethod(method as any)}
                                        className={`py-4 rounded-3xl font-bold border-2 transition-all ${paymentMethod === method ? 'bg-farm-600 border-farm-600 text-white shadow-xl scale-105' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-farm-200'}`}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>

                            <div className="pt-6 border-t border-gray-100">
                                <div className="flex justify-between items-center mb-8">
                                    <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">Total a Receber</span>
                                    <span className="text-4xl font-black text-gray-900">R$ {basket.reduce((acc, i) => acc + (i.product.price * i.quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>

                                <div className="flex gap-4">
                                    <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200">Cancelar</button>
                                    <button 
                                        onClick={handleFinalizeAvulsa}
                                        disabled={loading}
                                        className="flex-3 bg-farm-600 text-white py-4 px-8 rounded-2xl font-black uppercase tracking-widest hover:bg-farm-700 shadow-lg shadow-farm-100 flex items-center justify-center gap-3"
                                    >
                                        {loading ? <IconLoader className="w-6 h-6 animate-spin" /> : 'Confirmar Recebimento'}
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
