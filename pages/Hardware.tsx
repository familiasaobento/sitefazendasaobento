import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconZap, IconPlus, IconTrash, IconCheck, IconX, IconLoader } from '../components/Icons';

interface Dispositivo {
    id: number;
    pdv_id: number;
    serial_number: string;
    nome_identificador: string;
    ativo: boolean;
    created_at: string;
    pontos_venda?: {
        nome: string;
    };
}

interface PDV {
    id: number;
    nome: string;
}

export const HardwarePage: React.FC = () => {
    const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
    const [pdvs, setPdvs] = useState<PDV[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    
    // Form state
    const [serial, setSerial] = useState('');
    const [nome, setNome] = useState('');
    const [pdvId, setPdvId] = useState<string>('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [dispRes, pdvRes] = await Promise.all([
                supabase
                    .from('idface_dispositivos')
                    .select('*, pontos_venda(nome)')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('pontos_venda')
                    .select('id, nome')
                    .order('nome')
            ]);

            if (dispRes.data) setDispositivos(dispRes.data);
            if (pdvRes.data) setPdvs(pdvRes.data);
        } catch (err) {
            console.error('Error fetching hardware data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!serial || !nome || !pdvId) return;

        try {
            const { error } = await supabase
                .from('idface_dispositivos')
                .insert({
                    serial_number: serial,
                    nome_identificador: nome,
                    pdv_id: parseInt(pdvId),
                    ativo: true
                });

            if (error) throw error;

            setSerial('');
            setNome('');
            setPdvId('');
            setIsAdding(false);
            fetchData();
        } catch (err: any) {
            alert('Erro ao cadastrar dispositivo: ' + err.message);
        }
    };

    const handleToggleAtivo = async (id: number, current: boolean) => {
        try {
            const { error } = await supabase
                .from('idface_dispositivos')
                .update({ ativo: !current })
                .eq('id', id);

            if (error) throw error;
            fetchData();
        } catch (err) {
            console.error('Error toggling device:', err);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Tem certeza que deseja remover este dispositivo?')) return;
        try {
            const { error } = await supabase
                .from('idface_dispositivos')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchData();
        } catch (err) {
            console.error('Error deleting device:', err);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <p className="text-[10px] font-black text-farm-600 uppercase tracking-[0.3em] mb-2 px-1">Infraestrutura IoT</p>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight font-serif">Configuração de Hardware</h2>
                </div>
                <button 
                    onClick={() => setIsAdding(true)}
                    className="bg-farm-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-farm-700 transition-all shadow-lg shadow-farm-100"
                >
                    <IconPlus className="w-5 h-5" /> Novo Dispositivo
                </button>
            </header>

            {isAdding && (
                <div className="bg-white p-8 rounded-3xl border-2 border-farm-100 shadow-xl animate-scale-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Cadastrar iDFace</h3>
                        <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <IconX className="w-6 h-6" />
                        </button>
                    </div>
                    <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Número de Série</label>
                            <input 
                                required
                                value={serial}
                                onChange={e => setSerial(e.target.value)}
                                placeholder="Ex: 0000000000000000"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Nome Identificador</label>
                            <input 
                                required
                                value={nome}
                                onChange={e => setNome(e.target.value)}
                                placeholder="Ex: Entrada Restaurante"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none font-medium"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Ponto de Venda (PDV)</label>
                            <select 
                                required
                                value={pdvId}
                                onChange={e => setPdvId(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none font-medium"
                            >
                                <option value="">Selecionar...</option>
                                {pdvs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button type="submit" className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-xl hover:bg-farm-600 transition-all shadow-lg">
                                Confirmar Cadastro
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-100 overflow-hidden border border-gray-100">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[800px]">
                    <thead>
                        <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                            <th className="px-8 py-6">Dispositivo / Local</th>
                            <th className="px-8 py-6">Número de Série</th>
                            <th className="px-8 py-6">Ponto de Venda</th>
                            <th className="px-8 py-6">Status</th>
                            <th className="px-8 py-6 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-8 py-12 text-center text-gray-400 font-medium">
                                    <IconLoader className="w-8 h-8 animate-spin mx-auto mb-3 opacity-20" />
                                    Carregando dispositivos...
                                </td>
                            </tr>
                        ) : dispositivos.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-8 py-12 text-center text-gray-400 font-medium">
                                    Nenhum hardware cadastrado.
                                </td>
                            </tr>
                        ) : dispositivos.map(disp => (
                            <tr key={disp.id} className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-8 py-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${disp.ativo ? 'bg-farm-100 text-farm-600' : 'bg-gray-100 text-gray-400'}`}>
                                            <IconZap className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900">{disp.nome_identificador}</p>
                                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">ControlID iDFace</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-6">
                                    <span className="font-mono text-xs bg-gray-100 px-3 py-1 rounded-lg text-gray-600 border border-gray-200">
                                        {disp.serial_number}
                                    </span>
                                </td>
                                <td className="px-8 py-6">
                                    <span className="text-sm font-bold text-gray-700">{disp.pontos_venda?.nome || 'Não vinculado'}</span>
                                </td>
                                <td className="px-8 py-6">
                                    <button 
                                        onClick={() => handleToggleAtivo(disp.id, disp.ativo)}
                                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                                            disp.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}
                                    >
                                        {disp.ativo ? 'Ativo' : 'Inativo'}
                                    </button>
                                </td>
                                <td className="px-8 py-6 text-right">
                                    <button 
                                        onClick={() => handleDelete(disp.id)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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

            <footer className="p-8 bg-amber-50 rounded-3xl border border-amber-100 flex gap-6 items-start">
                <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
                    <IconZap className="w-6 h-6" />
                </div>
                <div>
                    <h4 className="font-bold text-amber-900 mb-1">Instruções de Configuração</h4>
                    <p className="text-sm text-amber-800/80 leading-relaxed max-w-2xl">
                        Após cadastrar o dispositivo aqui, acesse as configurações de rede no hardware iDFace e configure a **URL de Notificação HTTP** para o endereço do nosso servidor. O número de série deve coincidir exatamente com o que consta na etiqueta do aparelho.
                    </p>
                </div>
            </footer>
        </div>
    );
};
