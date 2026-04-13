import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const IconPlus = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
);
const IconEdit = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
);
const IconTrash = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);
const IconCheck = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
);
const IconX = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
);

interface Category {
    id: number;
    nome: string;
    tipo: 'receita' | 'despesa';
    parent_id: number | null;
    ativo: boolean;
    display_order: number;
    children?: Category[];
}

type ModalMode = 'new-parent' | 'new-child' | 'rename' | null;

interface ParentCardProps {
    group: Category;
    colors: any;
    editingId: number | null;
    setEditingId: (id: number | null) => void;
    editingName: string;
    setEditingName: (name: string) => void;
    handleSaveEdit: (id: number) => void;
    handleToggleActive: (cat: Category) => void;
    handleToggleChildActive: (child: Category) => void;
    setConfirmDeleteId: (id: number | null) => void;
    openNewChild: (parent: Category) => void;
}

const ParentCard: React.FC<ParentCardProps> = ({
    group,
    colors,
    editingId,
    setEditingId,
    editingName,
    setEditingName,
    handleSaveEdit,
    handleToggleActive,
    handleToggleChildActive,
    setConfirmDeleteId,
    openNewChild
}) => {
    const activeChildren = group.children?.filter(c => c.ativo).length ?? 0;
    const totalChildren = group.children?.length ?? 0;

    return (
        <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${group.ativo ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
            {/* Parent Header */}
            <div className={`bg-gradient-to-r ${colors.header} px-5 py-4 border-b flex items-center gap-3 group`}>
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors.dot} ${!group.ativo ? 'opacity-30' : ''}`} />

                {editingId === group.id ? (
                    <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(group.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="flex-1 px-3 py-1 border border-farm-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none text-sm font-bold"
                    />
                ) : (
                    <span className={`flex-1 font-bold text-sm text-gray-800 ${!group.ativo ? 'line-through text-gray-400' : ''}`}>
                        {group.nome}
                    </span>
                )}

                <span className="text-xs text-gray-400 font-mono whitespace-nowrap">{activeChildren}/{totalChildren}</span>

                {/* Action buttons */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingId === group.id ? (
                        <>
                            <button onClick={() => handleSaveEdit(group.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors" title="Salvar">
                                <IconCheck className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" title="Cancelar">
                                <IconX className="w-3.5 h-3.5" />
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => { setEditingId(group.id); setEditingName(group.nome); }} className="p-1.5 text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="Renomear">
                                <IconEdit className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => handleToggleActive(group)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${group.ativo ? 'text-gray-400 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50'}`}
                            >
                                {group.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                            <button onClick={() => setConfirmDeleteId(group.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Excluir grupo">
                                <IconTrash className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Children list */}
            <div className="divide-y divide-gray-50">
                {(group.children ?? []).map((child, idx) => (
                    <div key={child.id} className={`flex items-center gap-3 px-5 py-3 group hover:bg-gray-50 transition-colors border-l-4 ${colors.accent} ${!child.ativo ? 'opacity-50' : ''}`}>
                        <span className="text-xs text-gray-300 font-mono w-12 flex-shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                        </span>

                        {editingId === child.id ? (
                            <input
                                autoFocus
                                type="text"
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(child.id); if (e.key === 'Escape') setEditingId(null); }}
                                className="flex-1 px-3 py-1 border border-farm-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                            />
                        ) : (
                            <span className={`flex-1 text-sm ${child.ativo ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
                                {child.nome}
                            </span>
                        )}

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {editingId === child.id ? (
                                <>
                                    <button onClick={() => handleSaveEdit(child.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg" title="Salvar"><IconCheck className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" title="Cancelar"><IconX className="w-3.5 h-3.5" /></button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => { setEditingId(child.id); setEditingName(child.nome); }} className="p-1.5 text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="Renomear"><IconEdit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleToggleChildActive(child)} className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${child.ativo ? 'text-gray-400 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50'}`}>{child.ativo ? 'Desativar' : 'Reativar'}</button>
                                    <button onClick={() => setConfirmDeleteId(child.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><IconTrash className="w-3.5 h-3.5" /></button>
                                </>
                            )}
                        </div>
                    </div>
                ))}

                {/* Add sub-category row */}
                <button
                    onClick={() => openNewChild(group)}
                    className="w-full flex items-center gap-2 px-5 py-3 text-xs font-bold text-gray-400 hover:text-farm-600 hover:bg-farm-50 transition-colors border-l-4 border-l-transparent"
                >
                    <IconPlus className="w-3.5 h-3.5" />
                    Adicionar subcategoria
                </button>
            </div>
        </div>
    );
};

export const CostCategoriesPage: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    // Editing inline
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');

    // Modal state
    const [modal, setModal] = useState<ModalMode>(null);
    const [modalParent, setModalParent] = useState<Category | null>(null);
    const [modalTipo, setModalTipo] = useState<'receita' | 'despesa'>('despesa');
    const [modalName, setModalName] = useState('');
    const [saving, setSaving] = useState(false);

    // Delete confirm
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('categorias_financeiras')
                .select('*')
                .order('display_order', { ascending: true })
                .order('nome', { ascending: true });
            if (error) throw error;

            // Build tree
            const allCats: Category[] = data || [];
            const parents = allCats.filter(c => c.parent_id === null);
            parents.forEach(p => {
                p.children = allCats.filter(c => c.parent_id === p.id);
            });
            setCategories(parents);
        } catch (err: any) {
            alert('Erro ao carregar categorias: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCategories(); }, [fetchCategories]);

    // --- CRUD ---
    const openNewParent = (tipo: 'receita' | 'despesa') => {
        setModal('new-parent');
        setModalTipo(tipo);
        setModalParent(null);
        setModalName('');
    };

    const openNewChild = (parent: Category) => {
        setModal('new-child');
        setModalTipo(parent.tipo);
        setModalParent(parent);
        setModalName('');
    };

    const handleModalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalName.trim()) return;
        setSaving(true);
        try {
            if (modal === 'new-parent') {
                const { error } = await supabase.from('categorias_financeiras').insert([{
                    nome: modalName.trim(),
                    tipo: modalTipo,
                    parent_id: null,
                    display_order: 999,
                    ativo: true
                }]);
                if (error) throw error;
            } else if (modal === 'new-child' && modalParent) {
                const { error } = await supabase.from('categorias_financeiras').insert([{
                    nome: modalName.trim(),
                    tipo: modalParent.tipo,
                    parent_id: modalParent.id,
                    display_order: 999,
                    ativo: true
                }]);
                if (error) throw error;
            }
            setModal(null);
            setModalName('');
            fetchCategories();
        } catch (err: any) {
            alert('Erro ao adicionar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdit = async (id: number) => {
        if (!editingName.trim()) return;
        try {
            const { error } = await supabase
                .from('categorias_financeiras')
                .update({ nome: editingName.trim() })
                .eq('id', id);
            if (error) throw error;
            setEditingId(null);
            fetchCategories();
        } catch (err: any) {
            alert('Erro ao renomear: ' + err.message);
        }
    };

    const handleToggleActive = async (cat: Category) => {
        try {
            // Also toggle all children
            const ids = [cat.id, ...(cat.children?.map(c => c.id) ?? [])];
            const { error } = await supabase
                .from('categorias_financeiras')
                .update({ ativo: !cat.ativo })
                .in('id', ids);
            if (error) throw error;
            fetchCategories();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        }
    };

    const handleToggleChildActive = async (child: Category) => {
        try {
            const { error } = await supabase
                .from('categorias_financeiras')
                .update({ ativo: !child.ativo })
                .eq('id', child.id);
            if (error) throw error;
            fetchCategories();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const { error } = await supabase.from('categorias_financeiras').delete().eq('id', id);
            if (error) throw error;
            setConfirmDeleteId(null);
            fetchCategories();
        } catch (err: any) {
            alert('Erro ao excluir: ' + err.message);
        }
    };

    // --- Render helpers ---
    const tipoColor = (tipo: 'receita' | 'despesa') =>
        tipo === 'receita'
            ? { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700', header: 'from-emerald-50 to-white border-emerald-100', accent: 'border-l-emerald-400', btn: 'hover:text-emerald-600 hover:bg-emerald-50' }
            : { dot: 'bg-red-400', badge: 'bg-red-50 text-red-600', header: 'from-red-50 to-white border-red-100', accent: 'border-l-red-400', btn: 'hover:text-red-500 hover:bg-red-50' };

    const receitas = categories.filter(c => c.tipo === 'receita');
    const despesas = categories.filter(c => c.tipo === 'despesa');

    return (
        <div className="space-y-8 pb-16">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Categorias Financeiras</h1>
                    <p className="text-gray-500 mt-2 text-lg">
                        Estrutura hierárquica de receitas e despesas do sistema.
                    </p>
                </div>
            </div>

            {/* Info banner */}
            <div className="bg-farm-50 border border-farm-100 rounded-2xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 text-farm-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm text-farm-700">
                    As categorias aparecerão agrupadas no <strong>Fluxo de Caixa</strong> e nos <strong>Suprimentos</strong>.
                    Passe o mouse sobre um item para editar, desativar ou excluir. Desativar é preferível a excluir para preservar dados históricos.
                </p>
            </div>

            {loading ? (
                <div className="flex justify-center p-16"><div className="w-10 h-10 border-4 border-farm-700 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                    {/* RECEITAS COLUMN */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>
                                </div>
                                <h2 className="text-lg font-bold text-gray-800">Receitas</h2>
                                <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-full">{receitas.length} grupos</span>
                            </div>
                            <button
                                onClick={() => openNewParent('receita')}
                                className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl transition-colors"
                            >
                                <IconPlus className="w-4 h-4" /> Novo grupo
                            </button>
                        </div>
                        <div className="space-y-4">
                            {receitas.map(g => (
                                <ParentCard
                                    key={g.id}
                                    group={g}
                                    colors={tipoColor(g.tipo)}
                                    editingId={editingId}
                                    setEditingId={setEditingId}
                                    editingName={editingName}
                                    setEditingName={setEditingName}
                                    handleSaveEdit={handleSaveEdit}
                                    handleToggleActive={handleToggleActive}
                                    handleToggleChildActive={handleToggleChildActive}
                                    setConfirmDeleteId={setConfirmDeleteId}
                                    openNewChild={openNewChild}
                                />
                            ))}
                            {receitas.length === 0 && (
                                <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <p className="text-sm">Nenhuma categoria de receita.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* DESPESAS COLUMN */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 13l-5 5m0 0l-5-5m5 5V6" /></svg>
                                </div>
                                <h2 className="text-lg font-bold text-gray-800">Despesas</h2>
                                <span className="text-xs bg-red-50 text-red-600 font-bold px-2 py-1 rounded-full">{despesas.length} grupos</span>
                            </div>
                            <button
                                onClick={() => openNewParent('despesa')}
                                className="flex items-center gap-1.5 text-sm font-bold text-red-500 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition-colors"
                            >
                                <IconPlus className="w-4 h-4" /> Novo grupo
                            </button>
                        </div>
                        <div className="space-y-4">
                            {despesas.map(g => (
                                <ParentCard
                                    key={g.id}
                                    group={g}
                                    colors={tipoColor(g.tipo)}
                                    editingId={editingId}
                                    setEditingId={setEditingId}
                                    editingName={editingName}
                                    setEditingName={setEditingName}
                                    handleSaveEdit={handleSaveEdit}
                                    handleToggleActive={handleToggleActive}
                                    handleToggleChildActive={handleToggleChildActive}
                                    setConfirmDeleteId={setConfirmDeleteId}
                                    openNewChild={openNewChild}
                                />
                            ))}
                            {despesas.length === 0 && (
                                <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <p className="text-sm">Nenhuma categoria de despesa.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => { setModal(null); setModalName(''); }}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto relative z-10">
                            <h3 className="text-xl font-bold text-gray-900 font-serif mb-1">
                            {modal === 'new-parent' ? 'Novo Grupo' : `Subcategoria em "${modalParent?.nome}"`}
                        </h3>
                        <p className="text-sm text-gray-400 mb-6">
                            {modal === 'new-parent' ? 'Crie uma categoria macro para agrupar subcategorias.' : 'Esta subcategoria aparecerá nos dropdowns dos formulários.'}
                        </p>
                        <form onSubmit={handleModalSubmit} className="space-y-5">
                            {modal === 'new-parent' && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Tipo</label>
                                    <div className="flex bg-gray-100 p-1 rounded-xl">
                                        <button type="button" onClick={() => setModalTipo('receita')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${modalTipo === 'receita' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>↑ Receita</button>
                                        <button type="button" onClick={() => setModalTipo('despesa')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${modalTipo === 'despesa' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>↓ Despesa</button>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Nome</label>
                                <input
                                    autoFocus
                                    type="text"
                                    required
                                    value={modalName}
                                    onChange={e => setModalName(e.target.value)}
                                    placeholder={modal === 'new-parent' ? 'Ex: Cozinha e Alimentação' : 'Ex: Supermercado'}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setModal(null); setModalName(''); }} className="flex-1 py-3 font-bold text-gray-500 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors">Cancelar</button>
                                <button type="submit" disabled={saving} className="flex-1 py-3 font-bold text-white bg-farm-700 rounded-2xl hover:bg-farm-800 transition-colors shadow-lg disabled:opacity-50">{saving ? 'Salvando...' : 'Adicionar'}</button>
                            </div>
                        </form>
                    </div>
                    </div>
                </div>
            )}

            {/* Confirm Delete */}
            {confirmDeleteId !== null && (
                <div className="fixed inset-0 z-50 overflow-y-auto no-print">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setConfirmDeleteId(null)}></div>
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 max-h-[90vh] overflow-y-auto text-center relative z-10">
                        <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><IconTrash className="w-8 h-8 text-red-600" /></div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Excluir Categoria?</h3>
                        <p className="text-gray-500 text-sm mb-6">Se for um <strong>grupo</strong>, todas as subcategorias serão excluídas junto. Prefira <strong>desativar</strong> para manter o histórico.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-3 font-bold text-gray-500 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors">Cancelar</button>
                            <button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 py-3 font-bold text-white bg-red-600 rounded-2xl hover:bg-red-700 transition-colors">Excluir</button>
                        </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
