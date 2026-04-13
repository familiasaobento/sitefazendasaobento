import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconPackage, IconLoader, IconCheck, IconChart, IconZap } from '../components/Icons';

interface InventoryItem {
    id: number;
    nome: string;
    quantidade_atual: number;
    preco_custo_medio: number;
    preco_venda: number;
    valor_total_investido: number;
    quantidade_total_comprada: number;
    estoque_minimo: number;
}

export const InventoryManagementPage: React.FC = () => {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [newPrice, setNewPrice] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('itens_estoque')
                .select('*')
                .order('nome');

            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error('Error fetching inventory:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleEditPrice = (item: InventoryItem) => {
        setEditingItem(item);
        setNewPrice(item.preco_venda.toString());
    };

    const savePrice = async () => {
        if (!editingItem) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('itens_estoque')
                .update({ preco_venda: parseFloat(newPrice) })
                .eq('id', editingItem.id);

            if (error) throw error;

            setEditingItem(null);
            fetchInventory();
        } catch (err: any) {
            alert('Erro ao salvar preço: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const calculateMargin = (cost: number, sale: number) => {
        if (cost === 0) return 100;
        return ((sale - cost) / cost) * 100;
    };

    return (
        <div className="space-y-8 pb-20">
            <header>
                <h1 className="text-4xl font-bold text-gray-900 font-serif">Gestão de Preços e Margens</h1>
                <p className="text-gray-500 mt-2 text-lg">Monitore o custo médio e ajuste seus preços de venda para maximizar o lucro.</p>
            </header>

            {loading ? (
                <div className="flex justify-center p-12">
                    <IconLoader className="w-12 h-12 text-farm-700 animate-spin" />
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">
                                <tr>
                                    <th className="px-6 py-5 font-black">Produto</th>
                                    <th className="px-6 py-5 font-black">Estoque Atual</th>
                                    <th className="px-6 py-5 font-black text-right">Custo Médio</th>
                                    <th className="px-6 py-5 font-black text-right">Preço de Venda</th>
                                    <th className="px-6 py-5 font-black text-right">Margem (%)</th>
                                    <th className="px-6 py-5 font-black text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {items.map((item) => {
                                    const margin = calculateMargin(item.preco_custo_medio, item.preco_venda);
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-5 font-bold text-gray-800">{item.nome}</td>
                                            <td className="px-6 py-5">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.quantidade_atual <= item.estoque_minimo ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {item.quantidade_atual} un.
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-right font-medium text-gray-500">
                                                R$ {item.preco_custo_medio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-5 text-right font-black text-farm-900">
                                                R$ {item.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-5 text-right font-bold">
                                                <span className={margin < 30 ? 'text-orange-500' : 'text-green-600'}>
                                                    {margin.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button
                                                    onClick={() => handleEditPrice(item)}
                                                    className="bg-farm-50 text-farm-700 px-4 py-2 rounded-xl font-bold hover:bg-farm-100 transition-all"
                                                >
                                                    Ajustar
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal de Ajuste de Preço */}
            {editingItem && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setEditingItem(null)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto animate-fade-in relative z-10">
                            <button onClick={() => setEditingItem(null)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>

                            <h2 className="text-2xl font-bold text-gray-900 font-serif mb-2">Ajustar Preço de Venda</h2>
                            <p className="text-gray-500 text-sm mb-6">{editingItem.nome}</p>

                            <div className="space-y-6">
                                <div className="bg-gray-50 p-4 rounded-2xl flex justify-between items-center">
                                    <span className="text-gray-400 text-xs font-bold uppercase">Custo Médio Atual</span>
                                    <span className="font-bold text-gray-700">R$ {editingItem.preco_custo_medio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Novo Preço de Venda (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={newPrice}
                                        onChange={(e) => setNewPrice(e.target.value)}
                                        className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-farm-500 outline-none text-2xl font-black text-farm-900 transition-all"
                                        autoFocus
                                    />
                                </div>

                                {newPrice && parseFloat(newPrice) > 0 && (
                                    <div className="text-center">
                                        <p className="text-gray-400 text-xs font-bold uppercase mb-1">Margem Estipulada</p>
                                        <p className={`text-3xl font-black ${calculateMargin(editingItem.preco_custo_medio, parseFloat(newPrice)) < 30 ? 'text-orange-500' : 'text-green-600'}`}>
                                            {calculateMargin(editingItem.preco_custo_medio, parseFloat(newPrice)).toFixed(1)}%
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-4">
                                    <button onClick={() => setEditingItem(null)} className="flex-1 py-4 font-bold text-gray-400">Cancelar</button>
                                    <button
                                        onClick={savePrice}
                                        disabled={isSaving}
                                        className="flex-1 bg-farm-700 text-white py-4 font-bold rounded-2xl shadow-xl hover:bg-farm-800 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? <IconLoader className="w-5 h-5 animate-spin" /> : <IconCheck className="w-5 h-5" />}
                                        Salvar Preço
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
