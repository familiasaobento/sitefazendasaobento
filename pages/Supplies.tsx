import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconPackage, IconLoader, IconCheck, IconTrash, IconFileText, IconPlus, IconUser, IconShoppingCart } from '../components/Icons';

interface PurchaseRequest {
    id: number;
    solicitante_id: string;
    descricao: string;
    categoria: string;
    valor_estimado: number;
    valor_real?: number;
    area_demandante?: string;
    status: 'pendente' | 'aprovada' | 'comprada' | 'negada';
    autorizacao_id: string | null;
    created_at: string;
    profiles: {
        full_name: string;
    }
    aprovador?: { full_name: string };
}

export const SuppliesPage: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [confirmConfirmarCompraId, setConfirmConfirmarCompraId] = useState<number | null>(null);
    const [valorConfirmado, setValorConfirmado] = useState<string>('');

    // Form state
    const [items, setItems] = useState<{ name: string; details: string }[]>([{ name: '', details: '' }]);
    const [categoryGroups, setCategoryGroups] = useState<{ groupName: string, items: string[] }[]>([]);
    const [financeTags, setFinanceTags] = useState<{id: number, nome: string}[]>([]);
    const [financeAccounts, setFinanceAccounts] = useState<{id: number, nome: string}[]>([]);
    const [categoria, setCategoria] = useState<string>('');
    const [areaDemandante, setAreaDemandante] = useState<string>('');
    const [valorEstimado, setValorEstimado] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Payment execution state
    const [contaOrigem, setContaOrigem] = useState<string>('');
    const [formaPagamento, setFormaPagamento] = useState<string>('PIX');

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setCurrentUserId(user.id);
        };
        checkUser();
        fetchRequests();
        fetchCategorias();
        fetchTags();
        fetchAccounts();
    }, []);

    const fetchTags = async () => {
        const { data } = await supabase.from('finance_tags').select('id, nome').order('nome', { ascending: true });
        if (data) setFinanceTags(data);
    };

    const fetchAccounts = async () => {
        const { data } = await supabase.from('finance_accounts').select('id, nome').eq('ativo', true).order('nome', { ascending: true });
        if (data) {
            setFinanceAccounts(data);
            if (data.length > 0) setContaOrigem(data[0].nome);
        }
    };

    const fetchCategorias = async () => {
        try {
            const { data } = await supabase
                .from('categorias_financeiras')
                .select('id, nome, parent_id')
                .eq('tipo', 'despesa')
                .eq('ativo', true)
                .order('display_order', { ascending: true })
                .order('nome', { ascending: true });

            if (data && data.length > 0) {
                const parents = data.filter(c => c.parent_id === null);
                const groups = parents.map(p => ({
                    groupName: p.nome,
                    items: data.filter(c => c.parent_id === p.id).map(c => c.nome)
                })).filter(g => g.items.length > 0);

                setCategoryGroups(groups);
                if (groups.length > 0 && !categoria) {
                    setCategoria(groups[0].items[0]);
                }
            }
        } catch (err) {
            console.error('Could not load categories:', err);
        }
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('requisicoes_compra')
                .select(`
                    *,
                    profiles:solicitante_id(full_name),
                    aprovador:aprovador_id(full_name)
                `)
                .order('created_at', { ascending: false });

            // If not admin, policy handles filtering, but let's be explicit if needed
            // Actually RLS handles it perfectly.

            const { data, error } = await query;
            if (error) throw error;
            setRequests(data || []);
        } catch (err) {
            console.error('Error fetching RCs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (!currentUserId) throw new Error('Usuário não autenticado');

            const formattedDesc = items
                .filter(i => i.name.trim())
                .map(i => `- ${i.name}${i.details ? ` (${i.details})` : ''}`)
                .join('\n');

            if (!formattedDesc) throw new Error('Adicione pelo menos um item');

            if (isEditing && editingId) {
                const { error } = await supabase
                    .from('requisicoes_compra')
                    .update({
                        descricao: formattedDesc,
                        categoria,
                        area_demandante: areaDemandante,
                        valor_estimado: parseFloat(valorEstimado)
                    })
                    .eq('id', editingId);

                if (error) throw error;
                alert('Solicitação atualizada com sucesso!');
            } else {
                const { error } = await supabase
                    .from('requisicoes_compra')
                    .insert([{
                        solicitante_id: currentUserId,
                        descricao: formattedDesc,
                        categoria,
                        area_demandante: areaDemandante,
                        valor_estimado: parseFloat(valorEstimado),
                        status: 'pendente'
                    }]);

                if (error) throw error;
                alert('Solicitação de compra enviada com sucesso!');
            }

            closeModal();
            fetchRequests();
        } catch (err: any) {
            alert('Erro ao processar solicitação: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteRequest = async (id: number) => {
        try {
            const { error } = await supabase
                .from('requisicoes_compra')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setConfirmDeleteId(null);
            fetchRequests();
        } catch (err: any) {
            alert('Erro ao excluir requisição: ' + err.message);
        }
    };

    const openEditModal = (rc: PurchaseRequest) => {
        setIsEditing(true);
        setEditingId(rc.id);
        setCategoria(rc.categoria);
        setAreaDemandante(rc.area_demandante || '');
        setValorEstimado(rc.valor_estimado.toString());

        // Try to parse items from description
        const lines = rc.descricao.split('\n');
        const parsedItems = lines.map(line => {
            const match = line.match(/^-\s+(.*?)(?:\s+\((.*?)\))?$/);
            if (match) {
                return { name: match[1], details: match[2] || '' };
            }
            return { name: line.replace(/^-\s+/, ''), details: '' };
        });

        setItems(parsedItems.length > 0 ? parsedItems : [{ name: rc.descricao, details: '' }]);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setIsEditing(false);
        setEditingId(null);
        setItems([{ name: '', details: '' }]);
        setValorEstimado('');
        setAreaDemandante('');
    };

    const addItem = () => setItems([...items, { name: '', details: '' }]);
    const removeItem = (index: number) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems.length > 0 ? newItems : [{ name: '', details: '' }]);
    };

    const updateItem = (index: number, field: 'name' | 'details', value: string) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const handleUpdateStatus = async (id: number, newStatus: 'aprovada' | 'comprada' | 'negada') => {
        if (newStatus !== 'comprada' && !isAdmin) return;

        if (newStatus === 'comprada') {
            const rc = requests.find(r => r.id === id);
            if (rc) {
                setConfirmConfirmarCompraId(id);
                setValorConfirmado(rc.valor_estimado.toString());
            }
            return;
        }

        try {
            const updates: any = { status: newStatus };

            if (newStatus === 'aprovada') {
                updates.autorizacao_id = `AUTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${id}`;
                updates.aprovador_id = currentUserId;
            }

            const { error } = await supabase
                .from('requisicoes_compra')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            fetchRequests();
        } catch (err: any) {
            alert('Erro ao atualizar status: ' + err.message);
        }
    };

    const handleConfirmarCompraFinal = async () => {
        if (!confirmConfirmarCompraId) return;
        try {
            const parsedVal = parseFloat(valorConfirmado.replace(',', '.'));
            if (isNaN(parsedVal)) throw new Error('Valor inválido');

            const { error } = await supabase
                .from('requisicoes_compra')
                .update({ status: 'comprada', valor_real: parsedVal })
                .eq('id', confirmConfirmarCompraId);

            if (error) throw error;
            
            // Auto-push to cash flow
            const rc = requests.find(r => r.id === confirmConfirmarCompraId);
            if (rc) {
                const payload = {
                    tipo: 'saida',
                    categoria: rc.categoria,
                    data_pagamento: new Date().toISOString().split('T')[0],
                    descricao: `RC Automática: ${rc.descricao.replace(/\n-/g, ',').replace(/^-/,'').substring(0, 80)}...`,
                    valor: parsedVal,
                    conta_origem: contaOrigem,
                    forma_pagamento: formaPagamento,
                    meio_pagamento: 'Banco',
                    status: 'aprovado',
                    data_aprovacao: new Date().toISOString().split('T')[0],
                    tags: rc.area_demandante || null,
                    requisicao_id: rc.id
                };
                await supabase.from('fluxo_caixa').insert(payload).select();
            }

            setConfirmConfirmarCompraId(null);
            fetchRequests();
        } catch(err: any) {
            alert('Erro ao confirmar compra: ' + err.message);
        }
    };

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Suprimentos e Compras</h1>
                    <p className="text-gray-500 mt-2 text-lg">Gestão de requisições de materiais e insumos para a fazenda.</p>
                </div>

                <button
                    onClick={() => {
                        closeModal();
                        setShowModal(true);
                    }}
                    className="bg-farm-700 text-white px-8 py-4 rounded-2xl font-bold shadow-xl hover:bg-farm-800 transition-all flex items-center gap-2"
                >
                    <IconPlus className="w-5 h-5" />
                    Nova Requisição
                </button>
            </header>

            {loading ? (
                <div className="flex justify-center p-12">
                    <IconLoader className="w-12 h-12 text-farm-700 animate-spin" />
                </div>
            ) : requests.length === 0 ? (
                <div className="bg-white rounded-3xl shadow-sm p-16 text-center border border-gray-100">
                    <IconPackage className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-600">Nenhuma requisição encontrada</h3>
                    <p className="text-gray-400 mt-2">Você ainda não fez nenhuma solicitação de compra.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {requests.map((rc) => (
                        <div key={rc.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex items-center gap-4 flex-1">
                                <div className="p-4 rounded-2xl bg-amber-50 text-amber-700">
                                    <IconPackage className="w-8 h-8" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{rc.categoria}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${rc.status === 'pendente' ? 'bg-yellow-100 text-yellow-800' :
                                            rc.status === 'aprovada' ? 'bg-green-100 text-green-800' :
                                                rc.status === 'negada' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                            }`}>
                                            {rc.status}
                                        </span>
                                    </div>
                                    <pre className="text-sm font-sans text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50/50 p-2 rounded-lg mt-2">{rc.descricao}</pre>
                                    <div className="flex flex-col gap-1 mt-3 text-sm text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <IconUser className="w-4 h-4 text-gray-400" />
                                            <span><strong>Solicitante:</strong> {rc.profiles?.full_name} ({new Date(rc.created_at).toLocaleDateString('pt-BR')})</span>
                                        </div>
                                        {rc.aprovador && (
                                            <div className="flex items-center gap-2 text-green-700">
                                                <IconCheck className="w-4 h-4 text-green-600" />
                                                <span><strong>Aprovador:</strong> {rc.aprovador.full_name}</span>
                                            </div>
                                        )}
                                        {rc.area_demandante && (
                                            <div className="flex items-center gap-2 text-blue-700">
                                                <span className="font-semibold uppercase text-xs px-2 py-0.5 bg-blue-50 rounded-full border border-blue-100">
                                                    🎯 Área: {rc.area_demandante}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="text-right flex flex-col items-end gap-2">
                                <span className="text-2xl font-black text-farm-900 leading-none">
                                    {rc.status === 'comprada' && typeof rc.valor_real === 'number' 
                                        ? `R$ ${rc.valor_real.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                                        : `R$ ${rc.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                </span>
                                {rc.status === 'comprada' && typeof rc.valor_real === 'number' && rc.valor_real !== rc.valor_estimado && (
                                    <span className="text-xs text-gray-400 line-through">
                                        (Est. R$ {rc.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                    </span>
                                )}
                                {rc.autorizacao_id && (
                                    <span className="text-[10px] font-mono bg-farm-50 text-farm-700 px-2 py-1 rounded">
                                        ID: {rc.autorizacao_id}
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {/* Admin: Aprovar/Negar Pendente */}
                                {isAdmin && rc.status === 'pendente' && (
                                    <>
                                        <button
                                            onClick={() => handleUpdateStatus(rc.id, 'aprovada')}
                                            className="bg-green-600 text-white p-3 rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-100"
                                            title="Aprovar"
                                        >
                                            <IconCheck className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleUpdateStatus(rc.id, 'negada')}
                                            className="bg-red-500 text-white p-3 rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-100"
                                            title="Negar"
                                        >
                                            <IconTrash className="w-5 h-5" />
                                        </button>
                                    </>
                                )}

                                {/* Operador/Admin: Confirmar Compra se já Aprovada */}
                                {rc.status === 'aprovada' && (
                                    <button
                                        onClick={() => handleUpdateStatus(rc.id, 'comprada')}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 flex items-center gap-2 font-bold text-sm"
                                        title="Marcar como Comprada"
                                    >
                                        <IconShoppingCart className="w-4 h-4" /> Finalizar Compra
                                    </button>
                                )}

                                {/* Admin: Apagar após Comprada ou Negada */}
                                {isAdmin && (rc.status === 'comprada' || rc.status === 'negada') && (
                                    <button
                                        onClick={() => setConfirmDeleteId(rc.id)}
                                        className="bg-gray-100 text-red-500 p-3 rounded-xl hover:bg-red-50 transition-colors"
                                        title="Remover do Histórico"
                                    >
                                        <IconTrash className="w-5 h-5" />
                                    </button>
                                )}

                                {/* Solicitante: Editar se ainda Pendente */}
                                {rc.status === 'pendente' && rc.solicitante_id === currentUserId && (
                                    <>
                                        <button
                                            onClick={() => openEditModal(rc)}
                                            className="bg-gray-100 text-gray-600 p-3 rounded-xl hover:bg-gray-200 transition-colors"
                                            title="Editar"
                                        >
                                            <IconFileText className="w-5 h-5" />
                                        </button>
                                        {!isAdmin && (
                                            <button
                                                onClick={() => setConfirmDeleteId(rc.id)}
                                                className="bg-gray-100 text-red-400 p-3 rounded-xl hover:bg-red-50 transition-colors"
                                                title="Cancelar Solicitação"
                                            >
                                                <IconTrash className="w-4 h-4" />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Nova Requisição Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={closeModal}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto animate-fade-in relative z-10">
                            <h2 className="text-2xl font-bold text-gray-900 font-serif mb-6">
                                {isEditing ? 'Editar Requisição' : 'Nova Requisição de Compra'}
                            </h2>

                        <form onSubmit={handleCreateRequest} className="space-y-6">
                            <div className="space-y-4">
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Itens da Solicitação</label>
                                {items.map((item, index) => (
                                    <div key={index} className="flex gap-2 items-start animate-fade-in">
                                        <div className="flex-1">
                                            <input
                                                required
                                                type="text"
                                                value={item.name}
                                                onChange={(e) => updateItem(index, 'name', e.target.value)}
                                                placeholder="Nome do produto/serviço"
                                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                            />
                                        </div>
                                        <div className="w-32">
                                            <input
                                                type="text"
                                                value={item.details}
                                                onChange={(e) => updateItem(index, 'details', e.target.value)}
                                                placeholder="Qtd/Obs"
                                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            className="p-2 text-red-300 hover:text-red-500 transition-colors"
                                        >
                                            <IconTrash className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={addItem}
                                    className="text-xs font-bold text-farm-600 hover:text-farm-700 flex items-center gap-1 transition-all"
                                >
                                    <IconPlus className="w-3 h-3" /> Adicionar outro item
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Categoria</label>
                                    <select
                                        value={categoria}
                                        onChange={(e) => setCategoria(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-farm-500 outline-none bg-white font-medium text-sm"
                                    >
                                        {categoryGroups.map(group => (
                                            <optgroup key={group.groupName} label={group.groupName}>
                                                {group.items.map(item => (
                                                    <option key={item} value={item}>{item}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Área Demandante</label>
                                    <select
                                        value={areaDemandante}
                                        onChange={(e) => setAreaDemandante(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-farm-500 outline-none bg-white font-medium text-sm"
                                    >
                                        <option value="">-- Opcional --</option>
                                        {financeTags.map(tag => (
                                            <option key={tag.id} value={tag.nome}>{tag.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Estimado (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        value={valorEstimado}
                                        onChange={(e) => setValorEstimado(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-farm-500 outline-none font-bold"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-4">
                                <button type="button" onClick={closeModal} className="flex-1 py-4 font-bold text-gray-500">Cancelar</button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 bg-farm-700 text-white py-4 font-bold rounded-2xl shadow-xl hover:bg-farm-800 disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Processando...' : isEditing ? 'Salvar Alterações' : 'Enviar Solicitação'}
                                </button>
                            </div>
                        </form>
                    </div>
                    </div>
                </div>
            )}
            {/* Confirm Delete Modal */}
            {confirmDeleteId !== null && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setConfirmDeleteId(null)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 max-h-[90vh] overflow-y-auto text-center relative z-10">
                            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <IconTrash className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Excluir Requisição?</h3>
                        <p className="text-gray-500 text-sm mb-6">Esta ação não pode ser desfeita. A requisição será removida permanentemente.</p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex-1 py-3 font-bold text-gray-500 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDeleteRequest(confirmDeleteId)}
                                className="flex-1 py-3 font-bold text-white bg-red-600 rounded-2xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                    </div>
                </div>
            )}
            {/* Modal Confirmar Compra (Valor Real) */}
            {confirmConfirmarCompraId !== null && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setConfirmConfirmarCompraId(null)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 max-h-[90vh] overflow-y-auto text-center relative z-10 animate-fade-in">
                            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <IconShoppingCart className="w-8 h-8 text-blue-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Finalizar Compra</h3>
                            <p className="text-gray-500 text-sm mb-6">Esta ação debitará o valor automaticamente das finanças consolidadas.</p>
                            
                            <div className="mb-4 text-left">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">Valor Total Pago (R$)</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={valorConfirmado} 
                                    onChange={e => setValorConfirmado(e.target.value)} 
                                    className="w-full px-4 py-3 border border-blue-200 rounded-xl outline-none font-bold text-lg text-blue-900 focus:ring-2 focus:ring-blue-500 text-center"
                                    autoFocus
                                />
                            </div>

                            <div className="mb-4 text-left">
                                <label className="block text-xs font-bold text-gray-700 tracking-widest mb-1.5">Fornecedor / Forma de Pagamento</label>
                                <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium mb-3 text-sm">
                                    <option value="PIX">PIX</option>
                                    <option value="Boleto">Boleto Bancário</option>
                                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                                    <option value="Cartão de Débito">Cartão de Débito</option>
                                    <option value="Transferência">Transferência / TED</option>
                                    <option value="Dinheiro">Dinheiro</option>
                                </select>
                            </div>

                            <div className="mb-6 text-left">
                                <label className="block text-xs font-bold text-gray-700 tracking-widest mb-1.5">Conta Origem</label>
                                <select value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm">
                                    {financeAccounts.map(banco => (
                                        <option key={banco.id} value={banco.nome}>{banco.nome}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setConfirmConfirmarCompraId(null)}
                                    className="flex-1 py-3 font-bold text-gray-500 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors"
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleConfirmarCompraFinal}
                                    className="flex-1 py-3 font-bold text-white bg-blue-600 rounded-2xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
