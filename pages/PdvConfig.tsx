import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconSettings, IconLoader, IconCheck, IconTrash, IconPlus, IconShoppingCart, IconPackage } from '../components/Icons';

interface PontoVenda {
    id: number;
    nome: string;
    ativo: boolean;
}

interface Product {
    id: number;
    name: string;
    category: string;
    price: number;
}

export const PdvConfigPage: React.FC = () => {
    const [points, setPoints] = useState<PontoVenda[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [visibilities, setVisibilities] = useState<Record<number, number[]>>({}); // pdv_id -> [product_ids]
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedPdv, setSelectedPdv] = useState<PontoVenda | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [pts, prods, vis] = await Promise.all([
                supabase.from('pontos_venda').select('*').order('nome'),
                supabase.from('products').select('id, name, category, price').order('name'),
                supabase.from('pdv_produtos_visibilidade').select('*')
            ]);

            setPoints(pts.data || []);
            setProducts(prods.data || []);

            const visMap: Record<number, number[]> = {};
            vis.data?.forEach(v => {
                if (!visMap[v.pdv_id]) visMap[v.pdv_id] = [];
                visMap[v.pdv_id].push(v.produto_id);
            });
            setVisibilities(visMap);
        } catch (err) {
            console.error('Error fetching PDV config:', err);
        } finally {
            setLoading(false);
        }
    };

    const togglePdvStatus = async (id: number, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('pontos_venda')
                .update({ ativo: !currentStatus })
                .eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (err: any) {
            alert('Erro ao atualizar PDV: ' + err.message);
        }
    };

    const deletePdv = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir este PDV?')) return;
        try {
            const { error } = await supabase.from('pontos_venda').delete().eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (err: any) {
            alert('Erro ao excluir PDV: ' + err.message);
        }
    };

    const handleAddPdv = async () => {
        const nome = prompt('Nome do novo Ponto de Venda:');
        if (!nome) return;
        try {
            const { error } = await supabase.from('pontos_venda').insert({ nome });
            if (error) throw error;
            fetchData();
        } catch (err: any) {
            alert('Erro ao criar PDV: ' + err.message);
        }
    };

    const openConfigModal = (pdv: PontoVenda) => {
        setSelectedPdv(pdv);
        setShowModal(true);
    };

    const handleToggleVisibility = async (pdvId: number, prodId: number) => {
        const currentVis = visibilities[pdvId] || [];
        const isVisible = currentVis.includes(prodId);

        setSaving(true);
        try {
            if (isVisible) {
                await supabase.from('pdv_produtos_visibilidade').delete().eq('pdv_id', pdvId).eq('produto_id', prodId);
            } else {
                await supabase.from('pdv_produtos_visibilidade').insert({ pdv_id: pdvId, produto_id: prodId });
            }

            // Optimistic update
            setVisibilities(prev => {
                const updated = { ...prev };
                if (isVisible) {
                    updated[pdvId] = updated[pdvId].filter(id => id !== prodId);
                } else {
                    updated[pdvId] = [...(updated[pdvId] || []), prodId];
                }
                return updated;
            });
        } catch (err) {
            console.error('Error toggling visibility:', err);
        } finally {
            setSaving(false);
        }
    };

    const productCategories = Array.from(new Set(products.map(p => p.category)));

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Configuração de PDVs</h1>
                    <p className="text-gray-500 mt-2 text-lg">Gerencie os locais de venda e os itens disponíveis em cada um.</p>
                </div>

                <button
                    onClick={handleAddPdv}
                    className="bg-farm-700 text-white px-8 py-4 rounded-2xl font-bold shadow-xl hover:bg-farm-800 transition-all flex items-center gap-2"
                >
                    <IconPlus className="w-5 h-5" />
                    Novo Ponto de Venda
                </button>
            </header>

            {loading ? (
                <div className="flex justify-center p-12">
                    <IconLoader className="w-12 h-12 text-farm-700 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {points.map(pdv => (
                        <div key={pdv.id} className={`bg-white rounded-3xl p-6 border-2 transition-all ${pdv.ativo ? 'border-gray-100 shadow-sm' : 'border-gray-50 opacity-60'}`}>
                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-4 rounded-2xl ${pdv.ativo ? 'bg-farm-50 text-farm-700' : 'bg-gray-100 text-gray-400'}`}>
                                    <IconSettings className="w-8 h-8" />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => togglePdvStatus(pdv.id, pdv.ativo)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${pdv.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                                    >
                                        {pdv.ativo ? 'Ativo' : 'Inativo'}
                                    </button>
                                    <button onClick={() => deletePdv(pdv.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                                        <IconTrash className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-2xl font-bold text-gray-900 mb-2">{pdv.nome}</h3>
                            <p className="text-gray-400 text-sm font-medium mb-6">
                                {(visibilities[pdv.id] || []).length} produtos visíveis
                            </p>

                            <button
                                onClick={() => openConfigModal(pdv)}
                                className="w-full py-3 bg-gray-50 hover:bg-farm-50 text-gray-600 hover:text-farm-700 rounded-xl font-bold transition-all border border-gray-100 hover:border-farm-200 flex items-center justify-center gap-2"
                            >
                                <IconShoppingCart className="w-4 h-4" />
                                Configurar Itens
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Config Modal */}
            {showModal && selectedPdv && (
                <div className="fixed inset-0 z-[100] overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setShowModal(false)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-[2.5rem] w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 relative z-10">
                            <header className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 font-serif">Itens Visíveis: {selectedPdv.nome}</h3>
                                <p className="text-gray-500 text-sm font-medium">Selecione quais produtos o operador poderá vender neste PDV.</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="bg-white p-3 rounded-2xl text-gray-400 hover:text-gray-600 shadow-sm border border-gray-100 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
                            {productCategories.map(cat => (
                                <section key={cat}>
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                        <div className="h-px bg-gray-100 flex-1"></div>
                                        {cat}
                                        <div className="h-px bg-gray-100 flex-1"></div>
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {products.filter(p => p.category === cat).map(prod => {
                                            const isVisible = (visibilities[selectedPdv.id] || []).includes(prod.id);
                                            return (
                                                <button
                                                    key={prod.id}
                                                    disabled={saving}
                                                    onClick={() => handleToggleVisibility(selectedPdv.id, prod.id)}
                                                    className={`p-4 rounded-2xl border-2 text-left transition-all relative group ${isVisible
                                                            ? 'border-farm-500 bg-farm-50/50 shadow-md ring-4 ring-farm-50'
                                                            : 'border-gray-50 bg-gray-50/30 hover:border-gray-200 text-gray-400 hover:text-gray-600'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className={`font-bold text-sm ${isVisible ? 'text-farm-900' : 'text-gray-400'}`}>{prod.name}</p>
                                                            <p className={`text-xs mt-1 ${isVisible ? 'text-farm-600 font-bold' : 'text-gray-400 font-medium'}`}>
                                                                R$ {prod.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </p>
                                                        </div>
                                                        {isVisible && <IconCheck className="w-5 h-5 text-farm-600 animate-in zoom-in" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>

                        <footer className="p-8 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setShowModal(false)}
                                className="bg-farm-700 text-white px-10 py-4 rounded-2xl font-bold shadow-xl hover:bg-farm-800 transition-all"
                            >
                                Concluir Configuração
                            </button>
                        </footer>
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
};
