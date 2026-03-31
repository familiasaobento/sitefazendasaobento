import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PricingRule, PricingSeason } from '../types';
import { IconMenu, IconTrash, IconPlus, IconCheck, IconCalendar } from '../components/Icons';

export const PricingRulesPage: React.FC = () => {
    const [rules, setRules] = useState<PricingRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [activeTab, setActiveTab] = useState<'rules' | 'calendar'>('rules');

    // Season Calendar state
    const [seasons, setSeasons] = useState<PricingSeason[]>([]);
    const [isAddingSeason, setIsAddingSeason] = useState(false);
    const [seasonName, setSeasonName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [seasonType, setSeasonType] = useState<PricingSeason['season_type']>('Alta');
    const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [season, setSeason] = useState<PricingRule['season']>('Alta');
    const [category, setCategory] = useState<PricingRule['category']>('Hospedagem');
    const [audience, setAudience] = useState<PricingRule['audience']>('Todos');
    const [location, setLocation] = useState<PricingRule['location']>('N/A');
    const [price, setPrice] = useState<number | ''>('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const IconEdit = ({ className }: { className?: string }) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
    );

    const fetchRules = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('pricing_rules')
                .select('*')
                .order('season', { ascending: true })
                .order('category', { ascending: true });

            if (error) throw error;
            setRules(data || []);
        } catch (err) {
            console.error('Error fetching pricing rules:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSeasons = async () => {
        try {
            const { data, error } = await supabase
                .from('pricing_seasons')
                .select('*')
                .order('start_date', { ascending: true });
            if (error) throw error;
            setSeasons(data || []);
        } catch (err) {
            console.error('Error fetching seasons:', err);
        }
    };

    useEffect(() => {
        fetchRules();
        fetchSeasons();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (price === '') return;

        setLoading(true);
        try {
            const newRule = {
                name,
                season,
                category,
                audience,
                location,
                price: Number(price),
                active: true,
            };

            if (editingId) {
                const { error } = await supabase
                    .from('pricing_rules')
                    .update(newRule)
                    .eq('id', editingId);
                if (error) throw error;
                alert('Tarifa atualizada!');
            } else {
                const { error } = await supabase.from('pricing_rules').insert([newRule]);
                if (error) throw error;
                alert('Tarifa salva com sucesso!');
            }

            // Reset form
            setName('');
            setSeason('Alta');
            setCategory('Hospedagem');
            setAudience('Todos');
            setLocation('N/A');
            setPrice('');
            setIsAdding(false);
            setEditingId(null);

            await fetchRules();
        } catch (err: any) {
            console.error('Error saving rule:', err);
            alert(`Erro ao salvar tarifa: ${err.message || 'Desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (rule: PricingRule) => {
        setEditingId(rule.id);
        setName(rule.name);
        setSeason(rule.season);
        setCategory(rule.category);
        setAudience(rule.audience);
        setLocation(rule.location);
        setPrice(rule.price);
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingId(null);
        setName('');
        setSeason('Alta');
        setCategory('Hospedagem');
        setAudience('Todos');
        setLocation('N/A');
        setPrice('');
    };

    const handleDelete = async (id: string, ruleName: string) => {
        if (!confirm(`Tem certeza que deseja excluir a tarifa "${ruleName}"?`)) return;

        try {
            const { error } = await supabase.from('pricing_rules').delete().eq('id', id);
            if (error) throw error;

            setRules(rules.filter(r => r.id !== id));
        } catch (err) {
            console.error('Error deleting rule:', err);
            alert('Erro ao excluir tarifa.');
        }
    };

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('pricing_rules')
                .update({ active: !currentStatus })
                .eq('id', id);

            if (error) throw error;

            setRules(rules.map(r => r.id === id ? { ...r, active: !currentStatus } : r));
        } catch (err) {
            console.error('Error toggling active status:', err);
            alert('Erro ao alterar status.');
        }
    };

    const handleSaveSeason = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const newSeason = {
                name: seasonName,
                start_date: startDate,
                end_date: endDate,
                season_type: seasonType
            };

            if (editingSeasonId) {
                const { error } = await supabase
                    .from('pricing_seasons')
                    .update(newSeason)
                    .eq('id', editingSeasonId);
                if (error) throw error;
                alert('Período atualizado!');
            } else {
                const { error } = await supabase.from('pricing_seasons').insert([newSeason]);
                if (error) throw error;
                alert('Período salvo com sucesso!');
            }

            setSeasonName('');
            setStartDate('');
            setEndDate('');
            setSeasonType('Alta');
            setIsAddingSeason(false);
            setEditingSeasonId(null);
            await fetchSeasons();
        } catch (err: any) {
            console.error('Error saving season:', err);
            alert('Erro ao salvar período.');
        } finally {
            setLoading(false);
        }
    };

    const handleEditSeason = (season: PricingSeason) => {
        setEditingSeasonId(season.id);
        setSeasonName(season.name);
        setStartDate(season.start_date);
        setEndDate(season.end_date);
        setSeasonType(season.season_type);
        setIsAddingSeason(true);
    };

    const handleDeleteSeason = async (id: string, name: string) => {
        if (!confirm(`Excluir período "${name}"?`)) return;
        try {
            const { error } = await supabase.from('pricing_seasons').delete().eq('id', id);
            if (error) throw error;
            await fetchSeasons();
        } catch (err) {
            console.error('Error deleting season:', err);
        }
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 font-serif">Tarifário Dinâmico</h1>
                    <p className="text-gray-500 mt-2 text-lg">Gerenciamento de regras de preço por temporada e categoria.</p>
                </div>
                {!isAdding && !isAddingSeason && (
                    <button
                        onClick={() => activeTab === 'rules' ? setIsAdding(true) : setIsAddingSeason(true)}
                        className="bg-farm-700 text-white px-6 py-3 rounded-lg hover:bg-farm-800 transition-colors shadow-md flex items-center font-bold"
                    >
                        <IconPlus className="w-5 h-5 mr-2" />
                        {activeTab === 'rules' ? 'Nova Tarifa' : 'Novo Período'}
                    </button>
                )}
            </header>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('rules')}
                    className={`px-8 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'rules' ? 'border-farm-600 text-farm-700 bg-farm-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <IconMenu className="w-4 h-4" />
                        Regras de Preço
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('calendar')}
                    className={`px-8 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'calendar' ? 'border-farm-600 text-farm-700 bg-farm-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <div className="flex items-center gap-2">
                        <IconCalendar className="w-4 h-4" />
                        Calendário de Temporadas
                    </div>
                </button>
            </div>

            {activeTab === 'rules' && (
                <>

            {isAdding && (
                <div className="bg-white rounded-2xl shadow-sm border border-farm-200 overflow-hidden">
                    <div className="bg-farm-50 px-6 py-4 border-b border-farm-200">
                <h2 className="text-lg font-bold text-farm-900">{editingId ? 'Editar Tarifa' : 'Configurar Nova Tarifa'}</h2>
                    </div>
                    <form onSubmit={handleSave} className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nome / Descrição Curta</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ex: Diária Casal - Alta Temporada..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 focus:border-transparent transition-all outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Preço (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={price}
                                    onChange={e => setPrice(Number(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 focus:border-transparent transition-all outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Temporada</label>
                                <select
                                    value={season}
                                    onChange={e => setSeason(e.target.value as any)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none"
                                >
                                    <option value="Alta">Alta Temporada</option>
                                    <option value="Baixa">Baixa Temporada</option>
                                    <option value="Feriado">Pacote de Feriado</option>
                                    <option value="Ano Todo">Valor Único - Ano Todo</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Categoria de Serviço</label>
                                <select
                                    value={category}
                                    onChange={e => setCategory(e.target.value as any)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none"
                                >
                                    <option value="Hospedagem">Hospedagem</option>
                                    <option value="Refeição">Refeição Completa</option>
                                    <option value="Day Use">Day Use</option>
                                    <option value="Produto">Produto da Fazenda</option>
                                    <option value="Especial">Serviço Especial / Outro</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Público-Alvo</label>
                                <select
                                    value={audience}
                                    onChange={e => setAudience(e.target.value as any)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none"
                                >
                                    <option value="Todos">Global (Aplica a Todos)</option>
                                    <option value="Sócio">Sócio Titular / Convidados Vinculados</option>
                                    <option value="Visitante">Visitante Externo</option>
                                    <option value="Morador">Sócio Morador Fixo</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Local (Opcional)</label>
                                <select
                                    value={location}
                                    onChange={e => setLocation(e.target.value as any)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none"
                                >
                                    <option value="N/A">Geral / Não se aplica</option>
                                    <option value="Sede">Quarto na Casa Grande (Sede)</option>
                                    <option value="Chalé">Chalés</option>
                                    <option value="Casa de Sócio">Casa Própria de Sócio</option>
                                </select>
                            </div>
                        </div>



                        <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || price === ''}
                                className="bg-farm-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-farm-800 transition-colors shadow-md disabled:opacity-50"
                            >
                                {editingId ? 'Atualizar Tarifa' : 'Salvar Regra'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {loading && !isAdding ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-farm-700"></div>
                </div>
            ) : rules.length === 0 && !isAdding ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                    <IconMenu className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-600">Nenhuma tarifa cadastrada</h3>
                    <p className="text-gray-400 mt-2">Configure os preços da fazenda para utilizar nas reservas e consumos.</p>
                </div>
            ) : rules.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                    <th className="px-6 py-4 font-semibold">Descrição</th>
                                    <th className="px-6 py-4 font-semibold">Regras</th>
                                    <th className="px-6 py-4 font-semibold">Preço</th>
                                    <th className="px-6 py-4 font-semibold">Status</th>
                                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rules.map((rule) => (
                                    <tr key={rule.id} className={`hover:bg-gray-50 transition-colors ${!rule.active ? 'opacity-60' : ''}`}>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-800">{rule.name}</div>
                                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                                                {rule.category} • {rule.location !== 'N/A' ? rule.location : 'Geral'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${rule.season === 'Alta' ? 'bg-red-100 text-red-700' : rule.season === 'Baixa' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {rule.season}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${rule.audience === 'Sócio' ? 'bg-green-100 text-green-700' : rule.audience === 'Visitante' ? 'bg-yellow-100 text-yellow-700' : rule.audience === 'Morador' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-700'}`}>
                                                    {rule.audience}
                                                </span>
                                                {rule.mandatory_meals && (
                                                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700 flex items-center gap-1">
                                                        <IconCheck className="w-3 h-3" /> Pacote Obrigatório
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-extrabold text-farm-700 text-lg">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rule.price)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleToggleActive(rule.id, rule.active)}
                                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${rule.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                            >
                                                {rule.active ? 'Ativo' : 'Desativado'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEdit(rule)}
                                                className="p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                title="Editar tarifa"
                                            >
                                                <IconEdit className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(rule.id, rule.name)}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Excluir regra"
                                            >
                                                <IconTrash className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            </>
            )}

            {activeTab === 'calendar' && (
                <div className="space-y-6">
                    {isAddingSeason && (
                        <div className="bg-white rounded-2xl shadow-sm border border-farm-200 overflow-hidden">
                            <div className="bg-farm-50 px-6 py-4 border-b border-farm-200">
                                <h2 className="text-lg font-bold text-farm-900">{editingSeasonId ? 'Editar Período' : 'Definir Novo Período de Temporada'}</h2>
                            </div>
                            <form onSubmit={handleSaveSeason} className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Período (Ex: Férias de Julho, Carnaval...)</label>
                                        <input
                                            type="text"
                                            required
                                            value={seasonName}
                                            onChange={e => setSeasonName(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Data Início</label>
                                        <input
                                            type="date"
                                            required
                                            value={startDate}
                                            onChange={e => setStartDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Data Fim</label>
                                        <input
                                            type="date"
                                            required
                                            value={endDate}
                                            onChange={e => setEndDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Temporada Aplicada</label>
                                        <select
                                            value={seasonType}
                                            onChange={e => setSeasonType(e.target.value as any)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-farm-500"
                                        >
                                            <option value="Alta">Alta Temporada</option>
                                            <option value="Baixa">Baixa Temporada</option>
                                            <option value="Feriado">Feriado / Especial</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => { setIsAddingSeason(false); setEditingSeasonId(null); }}
                                        className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-100 rounded-xl"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-farm-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-farm-800 shadow-md"
                                    >
                                        Salvar Período
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                                        <th className="px-6 py-4 font-semibold">Período</th>
                                        <th className="px-6 py-4 font-semibold">Início</th>
                                        <th className="px-6 py-4 font-semibold">Fim</th>
                                        <th className="px-6 py-4 font-semibold">Tipo</th>
                                        <th className="px-6 py-4 font-semibold text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {seasons.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                                Nenhum período especial cadastrado. O sistema usará os preços de "Baixa Temporada" por padrão.
                                            </td>
                                        </tr>
                                    ) : (
                                        seasons.map(s => (
                                            <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 font-bold text-gray-800">{s.name}</td>
                                                <td className="px-6 py-4 text-gray-600">{new Date(s.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                                <td className="px-6 py-4 text-gray-600">{new Date(s.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                                        s.season_type === 'Alta' ? 'bg-red-100 text-red-700' :
                                                        s.season_type === 'Baixa' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-orange-100 text-orange-700'
                                                    }`}>
                                                        {s.season_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                    <button onClick={() => handleEditSeason(s)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg">
                                                        <IconEdit className="w-5 h-5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteSeason(s.id, s.name)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                                                        <IconTrash className="w-5 h-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
