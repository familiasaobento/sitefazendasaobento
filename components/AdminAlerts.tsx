import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconAlertTriangle, IconLoader, IconCheck, IconZap } from './Icons';
import { Page } from '../types';

interface AdminAlertsProps {
    onNavigate: (page: Page) => void;
}

export const AdminAlerts: React.FC<AdminAlertsProps> = ({ onNavigate }) => {
    const [overdueCheckouts, setOverdueCheckouts] = useState<any[]>([]);
    const [unapprovedConsumptions, setUnapprovedConsumptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAlerts();
    }, []);

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            // 1. Fetch overdue checkouts
            const { data: overdueData } = await supabase
                .from('estadias')
                .select('*, reservations:reserva_id(*, profiles:user_id(*))')
                .eq('status', 'ativa')
                .lt('reservations.check_out', new Date().toISOString());

            // Since lt filter on joined table might be tricky depending on API, 
            // the safest way is a view or just filter in JS if the volume is low.
            const now = new Date();
            const filteredOverdue = overdueData?.filter(s => new Date(s.reservations?.check_out) < now) || [];
            setOverdueCheckouts(filteredOverdue);

            // 2. Fetch unapproved consumptions
            const { data: unapprovedData } = await supabase
                .from('lancamentos_consumo')
                .select('id')
                .eq('aprovado_admin', false);

            setUnapprovedConsumptions(unapprovedData || []);

        } catch (err) {
            console.error('Error fetching alerts:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return null;
    if (overdueCheckouts.length === 0 && unapprovedConsumptions.length === 0) return null;

    return (
        <div className="space-y-4 mb-8">
            {overdueCheckouts.length > 0 && (
                <div className="bg-orange-50 border-2 border-orange-200 p-6 rounded-3xl flex items-center gap-6 shadow-lg shadow-orange-100 animate-fade-in">
                    <div className="bg-orange-500 text-white p-3 rounded-2xl shadow-md">
                        <IconAlertTriangle className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-orange-900 font-black text-lg">Checkouts Atrasados!</h4>
                        <p className="text-orange-800 text-sm">
                            Existem {overdueCheckouts.length} estadia(s) que já passaram do horário de saída previsto mas ainda não foram encerradas.
                        </p>
                        <div className="flex gap-2 mt-3">
                            {overdueCheckouts.slice(0, 3).map(stay => (
                                <span key={stay.id} className="bg-white/50 px-2 py-1 rounded-lg text-[10px] font-bold text-orange-700">
                                    {stay.reservations?.name || stay.reservations?.profiles?.full_name}
                                </span>
                            ))}
                            {overdueCheckouts.length > 3 && <span className="text-orange-400 text-[10px] font-bold">+{overdueCheckouts.length - 3} mais</span>}
                        </div>
                    </div>
                    <button onClick={() => onNavigate(Page.ACTIVE_STAYS)} className="bg-orange-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-orange-700 transition-all">
                        Resolver Agora
                    </button>
                </div>
            )}

            {unapprovedConsumptions.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 p-6 rounded-3xl flex items-center gap-6 shadow-lg shadow-red-100 animate-fade-in">
                    <div className="bg-red-500 text-white p-3 rounded-2xl shadow-md">
                        <IconZap className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-red-900 font-black text-lg">Consumos Pendentes</h4>
                        <p className="text-red-800 text-sm">
                            Há {unapprovedConsumptions.length} lançamentos de consumo/extra aguardando sua validação manual.
                        </p>
                    </div>
                    <button onClick={() => onNavigate(Page.CONSUMPTION_REVIEW)} className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all">
                        Validar Tudo
                    </button>
                </div>
            )}
        </div>
    );
};
