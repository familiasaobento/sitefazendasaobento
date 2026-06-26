import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
    IconClock, IconUser, IconZap, IconCheck, IconX, 
    IconLoader, IconCalendar, IconPlus, IconTrash 
} from '../components/Icons';
import * as XLSX from 'xlsx';

interface TimeEntry {
    id: string;
    employee_id: string;
    entry_type: 'entry' | 'exit';
    timestamp: string;
    location?: string;
    employees: {
        id: string;
        full_name: string;
        work_start: string;
        work_end: string;
        break_start?: string;
        break_end?: string;
        journey_type?: 'integral' | 'parcial' | 'horista' | 'diarista';
        daily_min_hours?: number;
        half_saturday?: boolean;
        default_day_off?: number;
    };
    device_id?: number;
    idface_dispositivos?: {
        nome_identificador: string;
    };
    status?: 'pending' | 'approved' | 'rejected';
}

interface Employee {
    id: string;
    full_name: string;
}

interface GroupedDayEntry {
    dateStr: string;
    employeeId: string;
    employeeName: string;
    workStart?: string;
    workEnd?: string;
    breakStart?: string;
    breakEnd?: string;
    punches: TimeEntry[];
    workedHours: number;
    expectedHours: number;
    balance: number;
    isDayOff: boolean;
}

export const TimeTrackingPage: React.FC<{ userRole?: string }> = ({ userRole = 'member' }) => {
    const [entries, setEntries] = useState<TimeEntry[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [showAbonoForm, setShowAbonoForm] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    // Form state
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [entryType, setEntryType] = useState<'entry' | 'exit'>('entry');
    const [entryTime, setEntryTime] = useState(new Date().toISOString().slice(0, 16));
    const [abonoDate, setAbonoDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
    const [viewMode, setViewMode] = useState<'logs' | 'grouped'>('grouped'); // Default to grouped daily view
    const [daysOff, setDaysOff] = useState<any[]>([]);
    const [vacations, setVacations] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
    }, [selectedMonth]);

    useEffect(() => {
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
        await Promise.all([fetchEntries(), fetchEmployees(), fetchDaysOffAndVacations()]);
        setLoading(false);
    };

    const fetchDaysOffAndVacations = async (monthStr = selectedMonth) => {
        const startDate = `${monthStr}-01`;
        const year = parseInt(monthStr.split('-')[0]);
        const month = parseInt(monthStr.split('-')[1]) - 1;
        const endDate = `${monthStr}-${new Date(year, month + 1, 0).getDate()}`;

        const [daysOffRes, vacationsRes] = await Promise.all([
            supabase
                .from('employee_days_off')
                .select('*')
                .gte('date', startDate)
                .lte('date', endDate),
            supabase
                .from('employee_vacations')
                .select('*')
                .or(`start_date.lte.${endDate},end_date.gte.${startDate}`)
        ]);

        if (!daysOffRes.error && daysOffRes.data) setDaysOff(daysOffRes.data);
        if (!vacationsRes.error && vacationsRes.data) setVacations(vacationsRes.data);
    };

    const fetchEntries = async (monthStr = selectedMonth) => {
        const year = parseInt(monthStr.split('-')[0]);
        const month = parseInt(monthStr.split('-')[1]) - 1;
        const startDate = `${monthStr}-01T00:00:00Z`;
        const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

        const { data, error } = await supabase
            .from('time_entries')
            .select(`
                *,
                employees:employee_id(id, full_name, work_start, work_end, break_start, break_end, journey_type, daily_min_hours, half_saturday, default_day_off),
                idface_dispositivos:device_id(nome_identificador)
            `)
            .gte('timestamp', startDate)
            .lte('timestamp', endDate)
            .order('timestamp', { ascending: false });

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
        const isManagerOrAdmin = userRole === 'admin' || userRole === 'site_admin' || userRole === 'finance_manager';
        const initialStatus = isManagerOrAdmin ? 'approved' : 'pending';

        const { error } = await supabase
            .from('time_entries')
            .insert({
                employee_id: selectedEmployee,
                entry_type: entryType,
                timestamp: new Date(entryTime).toISOString(),
                location: 'Registro Manual (Painel)',
                status: initialStatus
            });

        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao registrar: ' + error.message });
        } else {
            setFeedback({ 
                type: 'success', 
                msg: initialStatus === 'approved' 
                    ? 'Ponto registrado com sucesso!' 
                    : 'Ponto enviado para aprovação do Gerente Financeiro!' 
            });
            setShowManualEntry(false);
            setSelectedEmployee('');
            fetchEntries();
        }
        setLoading(false);
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleAbonoSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        setLoading(true);
        const isManagerOrAdmin = userRole === 'admin' || userRole === 'site_admin' || userRole === 'finance_manager';
        const initialStatus = isManagerOrAdmin ? 'approved' : 'pending';

        const { error } = await supabase
            .from('employee_days_off')
            .insert({
                employee_id: selectedEmployee,
                date: abonoDate,
                status: initialStatus
            });

        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao registrar abono: ' + error.message });
        } else {
            setFeedback({ 
                type: 'success', 
                msg: initialStatus === 'approved' 
                    ? 'Abono/Atestado registrado com sucesso!' 
                    : 'Abono enviado para aprovação do Gerente Financeiro!' 
            });
            setShowAbonoForm(false);
            setSelectedEmployee('');
            fetchDaysOffAndVacations();
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

    const timeToHours = (timeStr: string) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h + (m || 0) / 60;
    };

    const getExpectedHours = (emp: any, dateStr: string) => {
        const isVacation = vacations.some(v => v.employee_id === emp.id && v.start_date <= dateStr && v.end_date >= dateStr);
        if (isVacation) return 0;

        if (emp.journey_type === 'horista' || emp.journey_type === 'diarista') {
            const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
            if (dayOfWeek === (emp.default_day_off ?? 0)) return 0;
            return emp.journey_type === 'horista' ? (Number(emp.daily_min_hours) || 0) : 0;
        }

        const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
        if (dayOfWeek === (emp.default_day_off ?? 0)) return 0;
        if (emp.half_saturday && dayOfWeek === 6) return 4;

        const work = timeToHours(emp.work_end) - timeToHours(emp.work_start);
        const breakTime = timeToHours(emp.break_end) - timeToHours(emp.break_start);
        return Math.max(0, work - breakTime);
    };

    const formatHours = (hours: number) => {
        const sign = hours < 0 ? '-' : '+';
        const absH = Math.abs(hours);
        const h = Math.floor(absH);
        const m = Math.floor((absH - h) * 60);
        return `${sign}${h}h${String(m).padStart(2, '0')}m`;
    };

    const calculateGroupedEntries = (): GroupedDayEntry[] => {
        const groups: { [key: string]: TimeEntry[] } = {};
        
        entries.forEach(entry => {
            const localDate = new Date(entry.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const parts = localDate.split('/');
            if (parts.length === 3) {
                const dateKey = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                const groupKey = `${dateKey}_${entry.employee_id}`;
                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }
                groups[groupKey].push(entry);
            }
        });

        const result: GroupedDayEntry[] = [];

        Object.keys(groups).forEach(key => {
            const [dateStr, employeeId] = key.split('_');
            const dayPunches = groups[key].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            
            const firstEntry = dayPunches[0];
            const emp = firstEntry?.employees;

            if (!emp) return;

            const isDayOff = daysOff.some(d => d.employee_id === employeeId && d.date === dateStr && d.status !== 'pending');
            const expected = isDayOff ? 0 : getExpectedHours({ id: employeeId, ...emp }, dateStr);

            let workedHours = 0;
            const approvedPunches = dayPunches.filter(e => e.status !== 'pending');

            approvedPunches.filter(e => e.entry_type === 'entry').forEach(entry => {
                const exit = approvedPunches.find(e => e.entry_type === 'exit' && new Date(e.timestamp) > new Date(entry.timestamp));
                if (exit) {
                    const start = new Date(entry.timestamp).getTime();
                    const end = new Date(exit.timestamp).getTime();
                    let durationH = (end - start) / (1000 * 60 * 60);
                    if (durationH > 24) durationH = 24;

                    if (new Date(exit.timestamp).getDate() !== new Date(entry.timestamp).getDate() || new Date(entry.timestamp).getHours() >= 22 || new Date(exit.timestamp).getHours() <= 5) {
                        let nightHours = 0;
                        for (let t = start; t < end; t += 60000) {
                            const h = new Date(t).getHours();
                            if (h >= 22 || h < 5) nightHours += 1/60;
                        }
                        durationH += (nightHours * 0.2);
                    }
                    workedHours += durationH;
                }
            });

            let balance = workedHours - expected;
            if (Math.abs(balance) <= (10 / 60)) {
                workedHours = expected;
                balance = 0;
            }

            result.push({
                dateStr,
                employeeId,
                employeeName: emp.full_name,
                workStart: emp.work_start,
                workEnd: emp.work_end,
                breakStart: emp.break_start,
                breakEnd: emp.break_end,
                punches: dayPunches,
                workedHours,
                expectedHours: expected,
                balance,
                isDayOff
            });
        });

        return result.sort((a, b) => {
            const dateCompare = b.dateStr.localeCompare(a.dateStr);
            if (dateCompare !== 0) return dateCompare;
            return a.employeeName.localeCompare(b.employeeName);
        });
    };

    const exportMonthlyReport = async () => {
        setLoading(true);
        const year = parseInt(selectedMonth.split('-')[0]);
        const month = parseInt(selectedMonth.split('-')[1]) - 1;
        const startDate = `${selectedMonth}-01T00:00:00Z`;
        const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

        const { data, error } = await supabase
            .from('time_entries')
            .select(`
                *,
                employees:employee_id(full_name, work_start, work_end, break_start, break_end),
                idface_dispositivos:device_id(nome_identificador)
            `)
            .gte('timestamp', startDate)
            .lte('timestamp', endDate)
            .order('timestamp', { ascending: true });

        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao buscar registros: ' + error.message });
            setLoading(false);
            setTimeout(() => setFeedback(null), 3000);
            return;
        }

        if (!data || data.length === 0) {
            setFeedback({ type: 'error', msg: 'Nenhum registro encontrado para este mês.' });
            setLoading(false);
            setTimeout(() => setFeedback(null), 3000);
            return;
        }

        const dataToExport = data.map(entry => {
            const dateObj = new Date(entry.timestamp);
            const dateStr = dateObj.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit', 
                timeZone: 'America/Sao_Paulo' 
            });

            const emp = entry.employees;
            let workJourney = '-';
            if (emp) {
                workJourney = `${emp.work_start || ''} - ${emp.work_end || ''}`;
                if (emp.break_start && emp.break_end) {
                    workJourney += ` (Almoço: ${emp.break_start} - ${emp.break_end})`;
                }
            }

            return {
                'Data': dateStr,
                'Dia da Semana': weekday,
                'Hora': timeStr,
                'Colaborador': emp?.full_name || 'Desconhecido',
                'Tipo': entry.entry_type === 'entry' ? 'Entrada' : 'Saída',
                'Origem / Dispositivo': entry.idface_dispositivos?.nome_identificador || entry.location || 'Manual',
                'Jornada Cadastrada': workJourney
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Registros de Ponto");

        // Auto-fit columns
        const maxLen = dataToExport.reduce((acc, row) => {
            Object.keys(row).forEach((key, i) => {
                const val = String(row[key as keyof typeof row] || '');
                acc[i] = Math.max(acc[i] || 0, val.length, key.length);
            });
            return acc;
        }, [] as number[]);
        worksheet['!cols'] = maxLen.map(len => ({ wch: len + 3 }));

        XLSX.writeFile(workbook, `relatorio-mensal-ponto-${selectedMonth}.xlsx`);
        setLoading(false);
        setFeedback({ type: 'success', msg: 'Relatório exportado com sucesso!' });
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleApproveEntry = async (id: string, type: 'time' | 'day_off') => {
        setLoading(true);
        const table = type === 'time' ? 'time_entries' : 'employee_days_off';
        const { error } = await supabase
            .from(table)
            .update({ status: 'approved' })
            .eq('id', id);

        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao aprovar: ' + error.message });
        } else {
            setFeedback({ type: 'success', msg: 'Ajuste aprovado com sucesso!' });
            await fetchData();
        }
        setLoading(false);
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleRejectEntry = async (id: string, type: 'time' | 'day_off') => {
        if (!confirm('Recusar e excluir permanentemente este ajuste?')) return;
        setLoading(true);
        const table = type === 'time' ? 'time_entries' : 'employee_days_off';
        const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);

        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao recusar: ' + error.message });
        } else {
            setFeedback({ type: 'success', msg: 'Ajuste recusado e excluído!' });
            await fetchData();
        }
        setLoading(false);
        setTimeout(() => setFeedback(null), 3000);
    };

    const isManagerOrAdmin = userRole === 'admin' || userRole === 'site_admin' || userRole === 'finance_manager';
    const pendingEntries = entries.filter(e => e.status === 'pending');
    const pendingDaysOff = daysOff.filter(d => d.status === 'pending');

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <p className="text-[10px] font-black text-farm-600 uppercase tracking-[0.3em] mb-2 px-1">Recursos Humanos</p>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight font-serif">Controle de Ponto</h2>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => { setShowAbonoForm(true); setShowManualEntry(false); }}
                        className="bg-white text-farm-900 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-farm-50 transition-all shadow-lg border-2 border-farm-100"
                    >
                        Abonar Falta
                    </button>
                    <button 
                        onClick={() => { setShowManualEntry(true); setShowAbonoForm(false); }}
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

            {/* Seção de Solicitações Pendentes (Apenas para Gerente Financeiro e Admin Geral) */}
            {isManagerOrAdmin && (pendingEntries.length > 0 || pendingDaysOff.length > 0) && (
                <div className="bg-yellow-50/50 border border-yellow-200 p-8 rounded-[2rem] shadow-lg animate-fade-in space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-100 text-yellow-800 rounded-xl flex items-center justify-center font-bold">
                            ⚠️
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg">Solicitações de Ajuste Pendentes</h3>
                            <p className="text-xs text-gray-500">Há solicitações lançadas pelo financeiro aguardando aprovação para entrarem nos cálculos de saldo e banco de horas.</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-yellow-100 bg-white">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-yellow-50/30 text-[10px] font-black text-yellow-700 uppercase tracking-widest border-b border-yellow-100">
                                <tr>
                                    <th className="px-6 py-4">Colaborador</th>
                                    <th className="px-6 py-4">Tipo</th>
                                    <th className="px-6 py-4">Data / Hora do Ajuste</th>
                                    <th className="px-6 py-4">Origem</th>
                                    <th className="px-6 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-yellow-50/50">
                                {/* Pending Time Entries */}
                                {pendingEntries.map(entry => (
                                    <tr key={entry.id} className="hover:bg-yellow-50/10">
                                        <td className="px-6 py-4 font-bold text-gray-900">
                                            {entry.employees?.full_name || 'Desconhecido'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                                entry.entry_type === 'entry' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                            }`}>
                                                {entry.entry_type === 'entry' ? 'Entrada' : 'Saída'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {formatTimestamp(entry.timestamp)}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-gray-400">
                                            {entry.location || 'Manual'}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button 
                                                onClick={() => handleApproveEntry(entry.id, 'time')}
                                                className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition-colors"
                                            >
                                                Aprovar
                                            </button>
                                            <button 
                                                onClick={() => handleRejectEntry(entry.id, 'time')}
                                                className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-3.5 py-1.5 rounded-lg transition-colors"
                                            >
                                                Recusar
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {/* Pending Days Off (Abonos) */}
                                {pendingDaysOff.map(dayOff => {
                                    const dateObj = new Date(dayOff.date + 'T12:00:00Z');
                                    const employeeName = employees.find(emp => emp.id === dayOff.employee_id)?.full_name || 'Desconhecido';
                                    return (
                                        <tr key={dayOff.id} className="hover:bg-yellow-50/10">
                                            <td className="px-6 py-4 font-bold text-gray-900">
                                                {employeeName}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
                                                    Abono de Falta
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600">
                                                {dateObj.toLocaleDateString('pt-BR')} ({dateObj.toLocaleDateString('pt-BR', { weekday: 'long' })})
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-400">
                                                Manual
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button 
                                                    onClick={() => handleApproveEntry(dayOff.id, 'day_off')}
                                                    className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition-colors"
                                                >
                                                    Aprovar
                                                </button>
                                                <button 
                                                    onClick={() => handleRejectEntry(dayOff.id, 'day_off')}
                                                    className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-3.5 py-1.5 rounded-lg transition-colors"
                                                >
                                                    Recusar
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

            {showAbonoForm && (
                <div className="bg-white p-8 rounded-3xl border-2 border-blue-100 shadow-xl animate-scale-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">Registrar Abono / Atestado Médico</h3>
                        <button onClick={() => setShowAbonoForm(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <IconX className="w-6 h-6" />
                        </button>
                    </div>
                    <form onSubmit={handleAbonoSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Funcionário</label>
                            <select 
                                required
                                value={selectedEmployee}
                                onChange={e => setSelectedEmployee(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                            >
                                <option value="">Selecionar...</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Data da Falta Abonada</label>
                            <input type="date" required value={abonoDate} onChange={e => setAbonoDate(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                        </div>
                        <div className="flex items-end">
                            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-lg transition-all">Registrar Abono</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Selecione o Mês</label>
                    <input 
                        type="month" 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:border-farm-500 shadow-sm text-sm"
                    />
                </div>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => setViewMode('grouped')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                            viewMode === 'grouped' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Resumo Diário por Trabalhador
                    </button>
                    <button
                        onClick={() => setViewMode('logs')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                            viewMode === 'logs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Histórico de Batidas
                    </button>
                </div>
            </div>

            {feedback && <div className={`p-4 rounded-xl text-white font-bold text-center animate-bounce ${feedback.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{feedback.msg}</div>}

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-100 overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    {viewMode === 'grouped' ? (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                                    <th className="px-8 py-6">Data</th>
                                    <th className="px-8 py-6">Funcionário</th>
                                    <th className="px-8 py-6">Escala / Jornada</th>
                                    <th className="px-8 py-6 text-center">Registros (Batidas)</th>
                                    <th className="px-8 py-6 text-center">Trabalhado</th>
                                    <th className="px-8 py-6 text-right">Saldo Diário</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading && entries.length === 0 ? (
                                    <tr><td colSpan={6} className="px-8 py-12 text-center"><IconLoader className="w-8 h-8 animate-spin mx-auto text-farm-600 opacity-20" /></td></tr>
                                ) : calculateGroupedEntries().length === 0 ? (
                                    <tr><td colSpan={6} className="px-8 py-12 text-center text-gray-400">Nenhum registro consolidado encontrado para este mês.</td></tr>
                                ) : calculateGroupedEntries().map((groupedEntry, idx) => {
                                    const dateObj = new Date(groupedEntry.dateStr + 'T12:00:00Z');
                                    return (
                                        <tr key={`${groupedEntry.dateStr}_${groupedEntry.employeeId}`} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-8 py-6">
                                                <span className="font-bold text-gray-700">{groupedEntry.dateStr.split('-')[2]}/{groupedEntry.dateStr.split('-')[1]}</span>
                                                <span className="text-xs text-gray-400 ml-2 uppercase font-medium">
                                                    {dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-farm-100 text-farm-700 rounded-full flex items-center justify-center font-bold">
                                                        {groupedEntry.employeeName?.charAt(0)}
                                                    </div>
                                                    <span className="font-bold text-gray-900">{groupedEntry.employeeName}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-xs text-gray-500">
                                                {groupedEntry.isDayOff ? (
                                                    <span className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-100 rounded-lg text-[9px] font-black uppercase tracking-wider">Folga</span>
                                                ) : (
                                                    <div className="space-y-0.5">
                                                        <div>Jornada: <span className="font-bold text-gray-700">{groupedEntry.workStart} - {groupedEntry.workEnd}</span></div>
                                                        {groupedEntry.breakStart && groupedEntry.breakEnd && (
                                                            <div className="text-[10px] text-gray-400 font-medium">Almoço: {groupedEntry.breakStart} - {groupedEntry.breakEnd}</div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex flex-wrap justify-center gap-1">
                                                    {groupedEntry.punches.map((p, pIdx) => {
                                                        const time = new Date(p.timestamp).toLocaleTimeString('pt-BR', { 
                                                            hour: '2-digit', 
                                                            minute: '2-digit', 
                                                            timeZone: 'America/Sao_Paulo' 
                                                        });
                                                        return (
                                                            <span 
                                                                key={p.id || pIdx} 
                                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                                    p.entry_type === 'entry' 
                                                                        ? 'bg-green-50 text-green-700 border-green-100' 
                                                                        : 'bg-orange-50 text-orange-700 border-orange-100'
                                                                }`}
                                                                title={p.idface_dispositivos?.nome_identificador || p.location || 'Manual'}
                                                            >
                                                                {time} ({p.entry_type === 'entry' ? 'Ent' : 'Sai'})
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-center text-sm font-medium text-gray-700">
                                                {groupedEntry.workedHours > 0 ? (
                                                    `${Math.floor(groupedEntry.workedHours)}h${String(Math.round((groupedEntry.workedHours % 1) * 60)).padStart(2, '0')}m`
                                                ) : (
                                                    <span className="text-gray-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <span className={`font-bold text-xs px-3 py-1.5 rounded-xl ${
                                                    groupedEntry.balance > 0 ? 'bg-green-50 text-green-700' : 
                                                    groupedEntry.balance < 0 ? 'bg-red-50 text-red-700' : 
                                                    'text-gray-400'
                                                }`}>
                                                    {formatHours(groupedEntry.balance)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
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
                                    <tr><td colSpan={5} className="px-8 py-12 text-center text-gray-400">Nenhum registro de ponto encontrado para este mês.</td></tr>
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
                    )}
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
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full md:w-auto">
                    <input 
                        type="month" 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-4 py-3 bg-farm-800 border border-farm-700 text-white rounded-xl font-bold outline-none focus:ring-2 focus:ring-farm-500 shadow-sm text-sm"
                    />
                    <button 
                        onClick={exportMonthlyReport}
                        className="bg-white text-farm-900 px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-farm-100 transition-all whitespace-nowrap"
                    >
                        Exportar Relatório Mensal
                    </button>
                </div>
            </footer>
        </div>
    );
};
