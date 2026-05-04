import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
    IconClock, IconUser, IconZap, IconCheck, IconX, 
    IconLoader, IconCalendar, IconPlus, IconTrash 
} from '../components/Icons';

interface TimeEntry {
    id: string;
    employee_id: string;
    entry_type: 'entry' | 'exit';
    timestamp: string;
    location?: string;
    employees: {
        full_name: string;
        work_start: string;
        work_end: string;
    };
    device_id?: number;
    idface_dispositivos?: {
        nome_identificador: string;
    };
}

interface Employee {
    id: string;
    full_name: string;
}

export const TimeTrackingPage: React.FC = () => {
    const [entries, setEntries] = useState<TimeEntry[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    // Form state
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [entryType, setEntryType] = useState<'entry' | 'exit'>('entry');
    const [entryTime, setEntryTime] = useState(new Date().toISOString().slice(0, 16));

    useEffect(() => {
        fetchData();
        
        const channel = supabase
            .channel('time-tracking-changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'time_entries' }, () => {
                fetchEntries();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchEntries(), fetchEmployees()]);
        setLoading(false);
    };

    const fetchEntries = async () => {
        const { data, error } = await supabase
            .from('time_entries')
            .select(`
                *,
                employees:employee_id(full_name, work_start, work_end),
                idface_dispositivos:device_id(nome_identificador)
            `)
            .order('timestamp', { ascending: false })
            .limit(100);

        if (!error && data) setEntries(data as any);
    };

    const fetchEmployees = async () => {
        const { data, error } = await supabase
            .from('employees')
            .select('id, full_name')
            .eq('active', true)
            .order('full_name');

        if (!error && data) setEmployees(data);
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        setLoading(true);
        const { error } = await supabase
            .from('time_entries')
            .insert({
                employee_id: selectedEmployee,
                entry_type: entryType,
                timestamp: new Date(entryTime).toISOString(),
                location: 'Registro Manual (Painel)'
            });

        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao registrar: ' + error.message });
        } else {
            setFeedback({ type: 'success', msg: 'Ponto registrado com sucesso!' });
            setShowManualEntry(false);
            setSelectedEmployee('');
            fetchEntries();
        }
        setLoading(false);
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este registro de ponto?')) return;
        const { error } = await supabase.from('time_entries').delete().eq('id', id);
        if (!error) fetchEntries();
    };

    const formatTimestamp = (ts: string) => {
        return new Date(ts).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <p className="text-[10px] font-black text-farm-600 uppercase tracking-[0.3em] mb-2 px-1">Recursos Humanos</p>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight font-serif">Controle de Ponto</h2>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowManualEntry(true)}
                        className="bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-800 transition-all shadow-lg"
                    >
                        <IconPlus className="w-5 h-5" /> Registro Manual
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                        <IconClock className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Registros Hoje</p>
                        <p className="text-2xl font-black text-gray-900">
                            {entries.filter(e => new Date(e.timestamp).toDateString() === new Date().toDateString()).length}
                        </p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex items-center gap-4">
                    <div className="w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center">
                        <IconUser className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaboradores</p>
                        <p className="text-2xl font-black text-gray-900">{employees.length}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex items-center gap-4 text-farm-600">
                    <div className="w-14 h-14 bg-farm-50 text-farm-600 rounded-2xl flex items-center justify-center">
                        <IconZap className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monitoramento</p>
                        <p className="text-2xl font-black">Ativo</p>
                    </div>
                </div>
            </div>

            {showManualEntry && (
                <div className="bg-white p-8 rounded-3xl border-2 border-farm-100 shadow-xl animate-scale-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Novo Registro Manual</h3>
                        <button onClick={() => setShowManualEntry(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <IconX className="w-6 h-6" />
                        </button>
                    </div>
                    <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Funcionário</label>
                            <select 
                                required
                                value={selectedEmployee}
                                onChange={e => setSelectedEmployee(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none font-medium"
                            >
                                <option value="">Selecionar...</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Tipo</label>
                            <select value={entryType} onChange={e => setEntryType(e.target.value as 'entry' | 'exit')} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none font-medium">
                                <option value="entry">Entrada</option>
                                <option value="exit">Saída</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Data e Hora</label>
                            <input type="datetime-local" value={entryTime} onChange={e => setEntryTime(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none font-medium" />
                        </div>
                        <div className="flex items-end">
                            <button type="submit" className="w-full bg-farm-600 text-white font-bold py-3.5 rounded-xl hover:bg-farm-700 shadow-lg transition-all">Salvar</button>
                        </div>
                    </form>
                </div>
            )}

            {feedback && <div className={`p-4 rounded-xl text-white font-bold text-center animate-bounce ${feedback.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{feedback.msg}</div>}

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-100 overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                                <th className="px-8 py-6">Funcionário</th>
                                <th className="px-8 py-6">Tipo</th>
                                <th className="px-8 py-6">Data / Hora</th>
                                <th className="px-8 py-6">Local / Origem</th>
                                <th className="px-8 py-6 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading && entries.length === 0 ? (
                                <tr><td colSpan={5} className="px-8 py-12 text-center"><IconLoader className="w-8 h-8 animate-spin mx-auto text-farm-600 opacity-20" /></td></tr>
                            ) : entries.length === 0 ? (
                                <tr><td colSpan={5} className="px-8 py-12 text-center text-gray-400">Nenhum registro encontrado.</td></tr>
                            ) : entries.map(entry => (
                                <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-farm-100 text-farm-700 rounded-full flex items-center justify-center font-bold">
                                                {entry.employees?.full_name?.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">{entry.employees?.full_name}</p>
                                                <p className="text-[10px] text-gray-400 font-medium italic">Jornada: {entry.employees?.work_start} - {entry.employees?.work_end}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            entry.entry_type === 'entry' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                        }`}>
                                            {entry.entry_type === 'entry' ? 'Entrada' : 'Saída'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-sm font-medium text-gray-700">{formatTimestamp(entry.timestamp)}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2 text-gray-500 text-xs">
                                            {entry.idface_dispositivos ? (
                                                <><IconZap className="w-4 h-4 text-farm-600" /> {entry.idface_dispositivos.nome_identificador}</>
                                            ) : (
                                                entry.location || 'Manual'
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <button onClick={() => handleDelete(entry.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><IconTrash className="w-5 h-5" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <footer className="bg-farm-900 text-white p-8 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-farm-800 rounded-xl flex items-center justify-center"><IconCalendar className="w-6 h-6 text-farm-300" /></div>
                    <div>
                        <h4 className="font-bold text-lg">Cálculo de Horas e Extras</h4>
                        <p className="text-farm-300 text-xs">O sistema compara automaticamente as batidas com a jornada cadastrada.</p>
                    </div>
                </div>
                <button className="bg-white text-farm-900 px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-farm-100 transition-all">Exportar Relatório Mensal</button>
            </footer>
        </div>
    );
};
