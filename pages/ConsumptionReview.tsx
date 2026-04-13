import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconLoader, IconCheck, IconTrash, IconFileText, IconChart } from '../components/Icons';

interface ConsumptionLaunch {
    id: number;
    estadia_id: number;
    item_id: number | null;
    quantidade: number;
    valor_unitario_aplicado: number;
    created_at: string;
    item?: {
        nome: string;
    };
    estadias: {
        reservations: {
            name?: string;
            profiles: {
                full_name: string;
            }
        }
    };
}

export const ConsumptionReviewPage: React.FC = () => {
    const [launches, setLaunches] = useState<ConsumptionLaunch[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [editingLaunch, setEditingLaunch] = useState<ConsumptionLaunch | null>(null);
    const [editQty, setEditQty] = useState<number>(0);
    const [isActionLoading, setIsActionLoading] = useState(false);

    useEffect(() => {
        fetchPendingLaunches();
    }, []);

    const fetchPendingLaunches = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('lancamentos_consumo')
                .select(`
                    *,
                    item:item_id(nome),
                    estadias:estadia_id (
                        reservations:reserva_id (
                            name,
                            profiles:user_id (full_name)
                        )
                    )
                `)
                .eq('aprovado_admin', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setLaunches(data || []);
        } catch (err) {
            console.error('Error fetching pending launches:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(launches.map(l => l.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleToggleSelect = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleBulkApprove = async () => {
        if (selectedIds.length === 0) return;

        setIsActionLoading(true);
        try {
            const { error } = await supabase
                .from('lancamentos_consumo')
                .update({ aprovado_admin: true })
                .in('id', selectedIds);

            if (error) throw error;

            alert(`${selectedIds.length} lançamentos aprovados com sucesso!`);
            setSelectedIds([]);
            fetchPendingLaunches();
        } catch (err: any) {
            alert('Erro ao aprovar lançamentos: ' + err.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteLaunch = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;

        setIsActionLoading(true);
        try {
            const { error } = await supabase
                .from('lancamentos_consumo')
                .delete()
                .eq('id', id);

            if (error) throw error;

            fetchPendingLaunches();
        } catch (err: any) {
            alert('Erro ao excluir: ' + err.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleEditClick = (launch: ConsumptionLaunch) => {
        setEditingLaunch(launch);
        setEditQty(launch.quantidade);
    };

    const handleSaveEdit = async () => {
        if (!editingLaunch) return;

        setIsActionLoading(true);
        try {
            const { error } = await supabase
                .from('lancamentos_consumo')
                .update({ quantidade: editQty })
                .eq('id', editingLaunch.id);

            if (error) throw error;

            setEditingLaunch(null);
            fetchPendingLaunches();
        } catch (err: any) {
            alert('Erro ao salvar edição: ' + err.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    return (
        <div className="space-y-8 pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Conferência de Lançamentos</h1>
                    <p className="text-gray-500 mt-2 text-lg">Revise e aprove os itens lançados pelos funcionários no PDV.</p>
                </div>

                {selectedIds.length > 0 && (
                    <button
                        onClick={handleBulkApprove}
                        disabled={isActionLoading}
                        className="bg-farm-700 text-white px-8 py-4 rounded-2xl font-bold shadow-xl hover:bg-farm-800 transition-all flex items-center gap-2 animate-bounce-subtle"
                    >
                        <IconCheck className="w-5 h-5" />
                        Aprovar {selectedIds.length} Selecionados
                    </button>
                )}
            </header>

            {loading ? (
                <div className="flex justify-center p-12">
                    <IconLoader className="w-12 h-12 text-farm-700 animate-spin" />
                </div>
            ) : launches.length === 0 ? (
                <div className="bg-white rounded-3xl shadow-sm p-16 text-center border border-gray-100">
                    <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <IconCheck className="w-10 h-10 text-green-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800">Tudo em dia!</h3>
                    <p className="text-gray-400 mt-2">Não há lançamentos pendentes de aprovação no momento.</p>
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">
                                <tr>
                                    <th className="px-6 py-5 w-10">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-gray-300 text-farm-600 focus:ring-farm-500"
                                            onChange={handleSelectAll}
                                            checked={selectedIds.length === launches.length}
                                        />
                                    </th>
                                    <th className="px-6 py-5 font-black">Data / Hora</th>
                                    <th className="px-6 py-5 font-black">Hóspede</th>
                                    <th className="px-6 py-5 font-black">Item / Produto</th>
                                    <th className="px-6 py-5 font-black text-center">Qtd</th>
                                    <th className="px-6 py-5 font-black text-right">Subtotal</th>
                                    <th className="px-6 py-5 font-black text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {launches.map((launch) => (
                                    <tr key={launch.id} className={`hover:bg-farm-50 transition-colors ${selectedIds.includes(launch.id) ? 'bg-farm-50/50' : ''}`}>
                                        <td className="px-6 py-5">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-gray-300 text-farm-600 focus:ring-farm-500"
                                                checked={selectedIds.includes(launch.id)}
                                                onChange={() => handleToggleSelect(launch.id)}
                                            />
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="text-gray-800 font-medium">
                                                {new Date(launch.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                            <div className="text-gray-400 text-xs">
                                                {new Date(launch.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="font-bold text-gray-800">
                                                {launch.estadias?.reservations?.name || launch.estadias?.reservations?.profiles?.full_name || 'Desconhecido'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="text-gray-700">
                                                {launch.item?.nome || (launch.valor_unitario_aplicado > 0 ? 'Refeição/Item Genérico' : 'Sem Descrição')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center font-bold text-gray-800">
                                            {launch.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="px-6 py-5 text-right font-bold text-gray-900">
                                            R$ {(launch.quantidade * launch.valor_unitario_aplicado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleEditClick(launch)}
                                                    className="p-2 text-gray-400 hover:text-farm-600 hover:bg-white rounded-lg transition-all"
                                                    title="Editar"
                                                >
                                                    <IconFileText className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLaunch(launch.id)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                                                    title="Excluir"
                                                >
                                                    <IconTrash className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingLaunch && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setEditingLaunch(null)}></div>
                    <div className="flex min-h-full items-start md:items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto animate-fade-in relative z-10">
                            <h2 className="text-2xl font-bold text-gray-900 font-serif mb-6">Editar Lançamento</h2>
                            <div className="space-y-4">
                                <p className="text-sm text-gray-500">
                                    Item: <span className="font-bold text-gray-800">{editingLaunch.item?.nome || 'Refeição'}</span>
                                </p>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Quantidade</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={editQty}
                                        onChange={(e) => setEditQty(parseFloat(e.target.value))}
                                        className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-farm-500 outline-none text-xl font-bold"
                                    />
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => setEditingLaunch(null)}
                                        className="flex-1 py-4 font-bold text-gray-500 hover:bg-gray-50 rounded-2xl transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={isActionLoading}
                                        className="flex-1 bg-farm-700 text-white py-4 font-bold rounded-2xl shadow-lg hover:bg-farm-800 transition-all"
                                    >
                                        Salvar
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
