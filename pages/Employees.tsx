import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
    IconUser, IconPlus, IconTrash, IconCheck, IconX, 
    IconLoader, IconClock, IconZap, IconCalendar, IconAlertTriangle,
    IconChart, IconBriefcase
} from '../components/Icons';

interface Employee {
    id: string;
    full_name: string;
    cpf: string;
    position: string;
    admission_date: string;
    work_start: string;
    work_end: string;
    break_start: string;
    break_end: string;
    controlid_id: string;
    active: boolean;
    participates_product_rateio: boolean;
}

interface Vacation {
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    status: 'planned' | 'taken' | 'cancelled';
    notes?: string;
    employees?: {
        full_name: string;
    };
}

export const EmployeesPage: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [vacations, setVacations] = useState<Vacation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [activeTab, setActiveTab] = useState<'team' | 'vacations' | 'banco' | 'rateio' | 'producao'>('team');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    // Form state for Employee
    const [formData, setFormData] = useState({
        full_name: '',
        cpf: '',
        position: '',
        admission_date: new Date().toISOString().split('T')[0],
        work_start: '08:00',
        work_end: '17:00',
        break_start: '12:00',
        break_end: '13:00',
        controlid_id: ''
    });

    // Form state for Vacation
    const [showVacationForm, setShowVacationForm] = useState(false);
    const [vacationFormData, setVacationFormData] = useState({
        employee_id: '',
        start_date: '',
        end_date: '',
        notes: ''
    });

    // Banco de Horas state
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
    const [timeEntries, setTimeEntries] = useState<any[]>([]);
    const [daysOff, setDaysOff] = useState<any[]>([]);
    const [selectedEmployeeForBanco, setSelectedEmployeeForBanco] = useState<string | null>(null);

    // Rateio state
    const [selectedRateioYear, setSelectedRateioYear] = useState(new Date().getFullYear());
    const [selectedRateioQuarter, setSelectedRateioQuarter] = useState(Math.floor(new Date().getMonth() / 3));
    const [quarterTips, setQuarterTips] = useState(0);

    // Producao Rateio state
    const [productionTotalSales, setProductionTotalSales] = useState(0);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchEmployees(), fetchVacations()]);
        setLoading(false);
    };

    const fetchEmployees = async () => {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('full_name');
        if (!error && data) setEmployees(data);
    };

    const fetchVacations = async () => {
        const { data, error } = await supabase
            .from('employee_vacations')
            .select('*, employees:employee_id(full_name)')
            .order('start_date', { ascending: true });
        if (!error && data) setVacations(data as any);
    };

    // Banco de Horas Functions
    const fetchBancoData = async () => {
        const startDate = `${selectedMonth}-01T00:00:00Z`;
        const endDate = new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]), 0, 23, 59, 59).toISOString();

        const [entriesRes, daysOffRes] = await Promise.all([
            supabase
                .from('time_entries')
                .select('*')
                .gte('timestamp', startDate)
                .lte('timestamp', endDate)
                .order('timestamp', { ascending: true }),
            supabase
                .from('employee_days_off')
                .select('*')
                .gte('date', startDate.split('T')[0])
                .lte('date', endDate.split('T')[0])
        ]);

        if (!entriesRes.error && entriesRes.data) setTimeEntries(entriesRes.data);
        if (!daysOffRes.error && daysOffRes.data) setDaysOff(daysOffRes.data);
    };

    // Rateio Functions
    const fetchRateioData = async () => {
        const quarterStarts = ['01-01', '04-01', '07-01', '10-01'];
        const quarterEnds = ['03-31', '06-30', '09-30', '12-31'];
        
        const start = `${selectedRateioYear}-${quarterStarts[selectedRateioQuarter]}`;
        const end = `${selectedRateioYear}-${quarterEnds[selectedRateioQuarter]}`;

        const { data, error } = await supabase
            .from('fluxo_caixa')
            .select('valor')
            .eq('tipo', 'entrada')
            .eq('categoria', 'Gorjetas')
            .gte('data_pagamento', start)
            .lte('data_pagamento', end);

        if (!error && data) {
            const total = data.reduce((acc, curr) => acc + Number(curr.valor), 0);
            setQuarterTips(total);
        } else {
            setQuarterTips(0);
        }
    };

    // Production Rateio Functions
    const fetchProductionRateioData = async () => {
        const quarterStarts = ['-01-01', '-04-01', '-07-01', '-10-01'];
        const quarterEnds = ['-03-31', '-06-30', '-09-30', '-12-31'];
        
        const start = `${selectedRateioYear}${quarterStarts[selectedRateioQuarter]}T00:00:00Z`;
        const end = `${selectedRateioYear}${quarterEnds[selectedRateioQuarter]}T23:59:59Z`;

        const { data, error } = await supabase
            .from('lancamentos_consumo')
            .select(`
                quantidade,
                valor_unitario_aplicado,
                products:item_id (include_in_product_rateio)
            `)
            .eq('pago', true)
            .gte('created_at', start)
            .lte('created_at', end);

        if (!error && data) {
            const participatingSales = data.filter((d: any) => d.products?.include_in_product_rateio);
            const total = participatingSales.reduce((acc, curr) => acc + (Number(curr.quantidade) * Number(curr.valor_unitario_aplicado)), 0);
            setProductionTotalSales(total);
        } else {
            setProductionTotalSales(0);
        }
    };

    useEffect(() => {
        if (activeTab === 'banco') {
            fetchBancoData();
        } else if (activeTab === 'rateio') {
            fetchRateioData();
        } else if (activeTab === 'producao') {
            fetchProductionRateioData();
        }
    }, [activeTab, selectedMonth, selectedRateioYear, selectedRateioQuarter]);

    const handleToggleEmployeeRateio = async (empId: string, current: boolean) => {
        const { error } = await supabase
            .from('employees')
            .update({ participates_product_rateio: !current })
            .eq('id', empId);
        
        if (!error) fetchEmployees();
    };

    const toggleDayOff = async (employeeId: string, dateStr: string) => {
        const existing = daysOff.find(d => d.employee_id === employeeId && d.date === dateStr);
        if (existing) {
            await supabase.from('employee_days_off').delete().eq('id', existing.id);
        } else {
            await supabase.from('employee_days_off').insert({ employee_id: employeeId, date: dateStr });
        }
        fetchBancoData();
    };

    const timeToHours = (timeStr: string) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h + (m || 0) / 60;
    };

    const getExpectedHours = (emp: Employee) => {
        const work = timeToHours(emp.work_end) - timeToHours(emp.work_start);
        const breakTime = timeToHours(emp.break_end) - timeToHours(emp.break_start);
        return Math.max(0, work - breakTime);
    };

    const calculateDailyBalance = (emp: Employee, dateStr: string) => {
        const isDayOff = daysOff.some(d => d.employee_id === emp.id && d.date === dateStr);
        const expected = isDayOff ? 0 : getExpectedHours(emp);

        const dayEntries = timeEntries.filter(e => {
            const localDate = new Date(e.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); // 'DD/MM/YYYY'
            const parts = localDate.split('/');
            if (parts.length === 3) {
                const eDStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                return eDStr === dateStr;
            }
            return false;
        });

        let workedHours = 0;
        let lastEntryTime: number | null = null;

        dayEntries.forEach(entry => {
            const time = new Date(entry.timestamp).getTime();
            if (entry.entry_type === 'entry') {
                lastEntryTime = time;
            } else if (entry.entry_type === 'exit' && lastEntryTime) {
                workedHours += (time - lastEntryTime) / (1000 * 60 * 60);
                lastEntryTime = null;
            }
        });

        const balance = workedHours - expected;
        return { expected, workedHours, balance, isDayOff, punches: dayEntries.length };
    };

    const getMonthlyBalance = (emp: Employee) => {
        const year = parseInt(selectedMonth.split('-')[0]);
        const month = parseInt(selectedMonth.split('-')[1]) - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let totalBalance = 0;
        let totalWorked = 0;
        let totalExpected = 0;

        for (let i = 1; i <= daysInMonth; i++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            if (new Date(dStr) > new Date()) continue;

            const daily = calculateDailyBalance(emp, dStr);
            totalBalance += daily.balance;
            totalWorked += daily.workedHours;
            totalExpected += daily.expected;
        }

        return { totalBalance, totalWorked, totalExpected };
    };

    const formatHours = (hours: number) => {
        const sign = hours < 0 ? '-' : '+';
        const absH = Math.abs(hours);
        const h = Math.floor(absH);
        const m = Math.floor((absH - h) * 60);
        return `${sign}${h}h${String(m).padStart(2, '0')}m`;
    };

    // Calculation for Rateio (Generic function for both tips and production)
    const calculateRateio = (poolAmount: number, onlyParticipants: boolean = false) => {
        const quarterStarts = ['-01-01', '-04-01', '-07-01', '-10-01'];
        const quarterEnds = ['-03-31', '-06-30', '-09-30', '-12-31'];
        
        const qStart = new Date(`${selectedRateioYear}${quarterStarts[selectedRateioQuarter]}T00:00:00`);
        const qEnd = new Date(`${selectedRateioYear}${quarterEnds[selectedRateioQuarter]}T23:59:59`);
        const totalQuarterDays = Math.ceil((qEnd.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24));

        const eligibleEmployees = employees.filter(emp => emp.active && (!onlyParticipants || emp.participates_product_rateio));
        
        const distribution = eligibleEmployees.map(emp => {
            const admission = new Date(emp.admission_date);
            const startInQuarter = admission > qStart ? admission : qStart;
            
            let daysWorked = 0;
            if (admission <= qEnd) {
                daysWorked = Math.ceil((qEnd.getTime() - startInQuarter.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                daysWorked = Math.max(0, Math.min(daysWorked, totalQuarterDays));
            }

            return {
                ...emp,
                daysWorked,
                proportion: daysWorked / totalQuarterDays
            };
        });

        const totalPoints = distribution.reduce((acc, curr) => acc + curr.daysWorked, 0);
        
        return distribution.map(d => ({
            ...d,
            amount: totalPoints > 0 ? (d.daysWorked / totalPoints) * poolAmount : 0
        }));
    };

    const handleEmployeeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.from('employees').insert([formData]);
        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao cadastrar: ' + error.message });
        } else {
            setFeedback({ type: 'success', msg: 'Funcionário cadastrado!' });
            setIsAdding(false);
            setFormData({
                full_name: '', cpf: '', position: '', 
                admission_date: new Date().toISOString().split('T')[0],
                work_start: '08:00', work_end: '17:00', 
                break_start: '12:00', break_end: '13:00', 
                controlid_id: ''
            });
            fetchEmployees();
        }
        setLoading(false);
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleVacationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.from('employee_vacations').insert([vacationFormData]);
        if (error) {
            setFeedback({ type: 'error', msg: 'Erro ao agendar férias: ' + error.message });
        } else {
            setFeedback({ type: 'success', msg: 'Férias agendadas com sucesso!' });
            setShowVacationForm(false);
            setVacationFormData({ employee_id: '', start_date: '', end_date: '', notes: '' });
            fetchVacations();
        }
        setLoading(false);
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleDeleteVacation = async (id: string) => {
        if (!confirm('Excluir este agendamento de férias?')) return;
        const { error } = await supabase.from('employee_vacations').delete().eq('id', id);
        if (!error) fetchVacations();
    };

    const getVacationStatus = (emp: Employee) => {
        const admission = new Date(emp.admission_date);
        const today = new Date();
        const diffYears = today.getFullYear() - admission.getFullYear();
        const diffMonths = (today.getMonth() + diffYears * 12) - admission.getMonth();
        
        if (diffMonths >= 11) {
            const yearStart = new Date(today.getFullYear(), 0, 1).toISOString();
            const hasRecentVacation = vacations.some(v => v.employee_id === emp.id && v.start_date >= yearStart);
            if (!hasRecentVacation) return 'vencendo';
        }
        return 'ok';
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    };

    const currentYear = new Date().getFullYear();
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <p className="text-[10px] font-black text-farm-600 uppercase tracking-[0.3em] mb-2 px-1">Gestão de Equipe</p>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight font-serif">Recursos Humanos</h2>
                </div>
                <div className="flex gap-3">
                    {activeTab === 'team' ? (
                        <button 
                            onClick={() => setIsAdding(true)}
                            className="bg-farm-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-farm-700 transition-all shadow-lg"
                        >
                            <IconPlus className="w-5 h-5" /> Novo Funcionário
                        </button>
                    ) : activeTab === 'vacations' ? (
                        <button 
                            onClick={() => setShowVacationForm(true)}
                            className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-orange-700 transition-all shadow-lg"
                        >
                            <IconPlus className="w-5 h-5" /> Agendar Férias
                        </button>
                    ) : null}
                </div>
            </header>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 overflow-x-auto custom-scrollbar no-print">
                <button 
                    onClick={() => setActiveTab('team')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'team' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Lista de Equipe
                    {activeTab === 'team' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('vacations')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'vacations' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Controle de Férias
                    {activeTab === 'vacations' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => { setActiveTab('banco'); setSelectedEmployeeForBanco(null); }}
                    className={`px-8 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'banco' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Banco de Horas & Escala
                    {activeTab === 'banco' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('rateio')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'rateio' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Rateio de Gorjetas
                    {activeTab === 'rateio' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('producao')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'producao' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Rateio de Produção (10%)
                    {activeTab === 'producao' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
            </div>

            {feedback && (
                <div className={`p-4 rounded-xl text-white font-bold text-center animate-bounce ${feedback.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {feedback.msg}
                </div>
            )}

            {activeTab === 'team' && (
                <>
                    {isAdding && (
                        <div className="bg-white p-8 rounded-3xl border-2 border-farm-100 shadow-xl animate-scale-in">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-gray-800">Cadastrar Colaborador</h3>
                                <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                                    <IconX className="w-6 h-6" />
                                </button>
                            </div>
                            <form onSubmit={handleEmployeeSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Nome Completo</label>
                                        <input required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">CPF</label>
                                        <input value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Cargo</label>
                                        <input value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Data Admissão</label>
                                        <input type="date" value={formData.admission_date} onChange={e => setFormData({...formData, admission_date: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none" />
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-6 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Entrada</label>
                                        <input type="time" value={formData.work_start} onChange={e => setFormData({...formData, work_start: e.target.value})} className="w-full px-3 py-2 rounded-lg border" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Saída</label>
                                        <input type="time" value={formData.work_end} onChange={e => setFormData({...formData, work_end: e.target.value})} className="w-full px-3 py-2 rounded-lg border" />
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">ID Facial (ControlID)</label>
                                        <input value={formData.controlid_id} onChange={e => setFormData({...formData, controlid_id: e.target.value})} className="w-full px-3 py-2 rounded-lg border" />
                                    </div>
                                </div>
                                <button type="submit" className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl shadow-lg">Finalizar Cadastro</button>
                            </form>
                        </div>
                    )}

                    <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b">
                                <tr>
                                    <th className="px-8 py-6">Funcionário</th>
                                    <th className="px-8 py-6">Admissão</th>
                                    <th className="px-8 py-6">Jornada</th>
                                    <th className="px-8 py-6">Férias</th>
                                    <th className="px-8 py-6 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-8 py-6">
                                            <p className="font-bold text-gray-900">{emp.full_name}</p>
                                            <p className="text-[10px] text-gray-400 uppercase">{emp.position}</p>
                                        </td>
                                        <td className="px-8 py-6 text-sm text-gray-600">{formatDate(emp.admission_date)}</td>
                                        <td className="px-8 py-6 text-xs font-bold">{emp.work_start} - {emp.work_end}</td>
                                        <td className="px-8 py-6">
                                            {getVacationStatus(emp) === 'vencendo' ? (
                                                <span className="flex items-center gap-1.5 text-orange-600 font-bold text-[10px] uppercase">
                                                    <IconAlertTriangle className="w-4 h-4" /> Vencendo em breve
                                                </span>
                                            ) : (
                                                <span className="text-green-600 font-bold text-[10px] uppercase">OK</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button onClick={() => {/* Delete logic */}} className="p-2 text-gray-300 hover:text-red-500"><IconTrash className="w-5 h-5" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'vacations' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    {/* Vacation Form */}
                    {showVacationForm && (
                        <div className="bg-white p-8 rounded-3xl border-2 border-orange-100 shadow-xl animate-scale-in">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-gray-800">Agendar Férias</h3>
                                <button onClick={() => setShowVacationForm(false)} className="text-gray-400 hover:text-red-500 transition-colors"><IconX className="w-6 h-6" /></button>
                            </div>
                            <form onSubmit={handleVacationSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Funcionário</label>
                                    <select required value={vacationFormData.employee_id} onChange={e => setVacationFormData({...vacationFormData, employee_id: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none font-medium">
                                        <option value="">Selecionar...</option>
                                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Início</label>
                                    <input type="date" required value={vacationFormData.start_date} onChange={e => setVacationFormData({...vacationFormData, start_date: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Fim</label>
                                    <input type="date" required value={vacationFormData.end_date} onChange={e => setVacationFormData({...vacationFormData, end_date: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none" />
                                </div>
                                <div className="flex items-end">
                                    <button type="submit" className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-orange-700">Salvar Férias</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Timeline / Calendar View */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
                        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <IconCalendar className="w-5 h-5 text-farm-600" /> Escala Global de Férias ({currentYear})
                        </h3>
                        <div className="overflow-x-auto">
                            <div className="min-w-[1000px]">
                                <div className="grid grid-cols-[200px_1fr] border-b border-gray-100 pb-2">
                                    <div className="text-[10px] font-black text-gray-400 uppercase">Colaborador</div>
                                    <div className="grid grid-cols-12 gap-1">
                                        {months.map(m => <div key={m} className="text-[10px] font-black text-gray-400 uppercase text-center">{m}</div>)}
                                    </div>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {employees.map(emp => {
                                        const empVacations = vacations.filter(v => v.employee_id === emp.id);
                                        return (
                                            <div key={emp.id} className="grid grid-cols-[200px_1fr] py-4 items-center">
                                                <div className="text-sm font-bold text-gray-700">{emp.full_name}</div>
                                                <div className="grid grid-cols-12 gap-1 relative h-6 bg-gray-50/50 rounded-full">
                                                    {empVacations.map(v => {
                                                        const start = new Date(v.start_date);
                                                        const end = new Date(v.end_date);
                                                        if (start.getFullYear() !== currentYear) return null;
                                                        
                                                        const startMonth = start.getMonth();
                                                        const endMonth = end.getMonth();
                                                        const duration = endMonth - startMonth + 1;
                                                        
                                                        return (
                                                            <div 
                                                                key={v.id}
                                                                className="absolute h-full bg-orange-500/80 rounded-full flex items-center justify-center text-[8px] text-white font-bold px-2 overflow-hidden whitespace-nowrap"
                                                                style={{ 
                                                                    left: `${(startMonth / 12) * 100}%`,
                                                                    width: `${(duration / 12) * 100}%`
                                                                }}
                                                                title={`${formatDate(v.start_date)} - ${formatDate(v.end_date)}`}
                                                            >
                                                                FÉRIAS
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Alerts and Table */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
                            <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <IconAlertTriangle className="w-5 h-5 text-orange-500" /> Próximos Vencimentos
                            </h4>
                            <div className="space-y-3">
                                {employees.filter(e => getVacationStatus(e) === 'vencendo').map(e => (
                                    <div key={e.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-xl border border-orange-100">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{e.full_name}</p>
                                            <p className="text-[10px] text-orange-600 uppercase font-black">Admitido em {formatDate(e.admission_date)}</p>
                                        </div>
                                        <button 
                                            onClick={() => { setActiveTab('vacations'); setShowVacationForm(true); setVacationFormData({...vacationFormData, employee_id: e.id}); }}
                                            className="bg-white text-orange-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-orange-200 hover:bg-orange-600 hover:text-white transition-all"
                                        >
                                            Agendar
                                        </button>
                                    </div>
                                ))}
                                {employees.filter(e => getVacationStatus(e) === 'vencendo').length === 0 && (
                                    <p className="text-gray-400 text-sm italic text-center py-4">Nenhum vencimento crítico identificado.</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
                            <h4 className="font-bold text-gray-800 mb-4">Agendamentos Recentes</h4>
                            <div className="overflow-hidden">
                                <table className="w-full text-left text-xs">
                                    <thead className="text-gray-400 uppercase font-black text-[9px] tracking-widest border-b">
                                        <tr>
                                            <th className="py-3">Nome</th>
                                            <th className="py-3">Período</th>
                                            <th className="py-3 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {vacations.slice(0, 10).map(v => (
                                            <tr key={v.id} className="hover:bg-gray-50">
                                                <td className="py-3 font-bold">{v.employees?.full_name}</td>
                                                <td className="py-3 text-gray-500">{formatDate(v.start_date)} - {formatDate(v.end_date)}</td>
                                                <td className="py-3 text-right">
                                                    <button onClick={() => handleDeleteVacation(v.id)} className="text-gray-300 hover:text-red-500"><IconTrash className="w-4 h-4" /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'banco' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
                        <div className="flex items-center gap-4">
                            <IconClock className="w-8 h-8 text-farm-600" />
                            <div>
                                <h3 className="font-bold text-gray-900 text-lg">Banco de Horas & Escala</h3>
                                <p className="text-xs text-gray-500">Gerencie as folgas e veja o saldo de horas no mês.</p>
                            </div>
                        </div>
                        <div>
                            <input 
                                type="month" 
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:border-farm-500 shadow-sm"
                            />
                        </div>
                    </div>

                    {!selectedEmployeeForBanco ? (
                        <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b">
                                    <tr>
                                        <th className="px-8 py-6">Funcionário</th>
                                        <th className="px-8 py-6 text-center">Horas Esperadas</th>
                                        <th className="px-8 py-6 text-center">Horas Trabalhadas</th>
                                        <th className="px-8 py-6 text-right">Saldo do Mês</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {employees.map(emp => {
                                        const { totalBalance, totalWorked, totalExpected } = getMonthlyBalance(emp);
                                        return (
                                            <tr key={emp.id} 
                                                onClick={() => setSelectedEmployeeForBanco(emp.id)}
                                                className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                                            >
                                                <td className="px-8 py-6">
                                                    <p className="font-bold text-gray-900 group-hover:text-farm-600 transition-colors">{emp.full_name}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase">{emp.position}</p>
                                                </td>
                                                <td className="px-8 py-6 text-center text-sm font-medium text-gray-500">{Math.round(totalExpected)}h</td>
                                                <td className="px-8 py-6 text-center text-sm font-medium text-gray-700">{Math.round(totalWorked)}h</td>
                                                <td className="px-8 py-6 text-right">
                                                    <span className={`px-4 py-2 rounded-xl text-xs font-black tracking-widest ${
                                                        totalBalance > 0 ? 'bg-green-100 text-green-700' : 
                                                        totalBalance < 0 ? 'bg-red-100 text-red-700' : 
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {formatHours(totalBalance)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100 animate-scale-in">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-gray-100 gap-4">
                                <div>
                                    <button 
                                        onClick={() => setSelectedEmployeeForBanco(null)}
                                        className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-farm-600 mb-2 flex items-center gap-1 transition-colors"
                                    >
                                        ← Voltar para lista
                                    </button>
                                    <h3 className="text-2xl font-bold text-gray-900">
                                        {employees.find(e => e.id === selectedEmployeeForBanco)?.full_name}
                                    </h3>
                                    <p className="text-sm text-gray-500">Detalhes da Escala e Ponto - {selectedMonth}</p>
                                </div>
                                <div className="text-left md:text-right bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Saldo Acumulado no Mês</p>
                                    <p className={`text-3xl font-black tracking-tighter ${
                                        getMonthlyBalance(employees.find(e => e.id === selectedEmployeeForBanco)!).totalBalance > 0 ? 'text-green-600' : 
                                        getMonthlyBalance(employees.find(e => e.id === selectedEmployeeForBanco)!).totalBalance < 0 ? 'text-red-600' : 
                                        'text-gray-800'
                                    }`}>
                                        {formatHours(getMonthlyBalance(employees.find(e => e.id === selectedEmployeeForBanco)!).totalBalance)}
                                    </p>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-gray-100">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                                        <tr>
                                            <th className="px-6 py-4">Data</th>
                                            <th className="px-6 py-4">Status / Escala</th>
                                            <th className="px-6 py-4 text-center">Registros (Batidas)</th>
                                            <th className="px-6 py-4 text-center">Trabalhado</th>
                                            <th className="px-6 py-4 text-right">Saldo Diário</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {Array.from({ length: new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]), 0).getDate() }).map((_, i) => {
                                            const dStr = `${selectedMonth}-${String(i + 1).padStart(2, '0')}`;
                                            const isFuture = new Date(dStr + 'T00:00:00') > new Date();
                                            const emp = employees.find(e => e.id === selectedEmployeeForBanco)!;
                                            const { expected, workedHours, balance, isDayOff, punches } = calculateDailyBalance(emp, dStr);
                                            const dateObj = new Date(dStr + 'T12:00:00Z');
                                            
                                            return (
                                                <tr key={dStr} className={`hover:bg-gray-50/80 transition-colors ${isDayOff ? 'bg-orange-50/30' : ''}`}>
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-gray-700">{String(i + 1).padStart(2, '0')}</span>
                                                        <span className="text-xs text-gray-400 ml-2 uppercase font-medium">
                                                            {dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button 
                                                            onClick={() => toggleDayOff(emp.id, dStr)}
                                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${
                                                                isDayOff 
                                                                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200' 
                                                                : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                                            }`}
                                                        >
                                                            {isDayOff ? 'Folga Marcada' : 'Dia de Trabalho'}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-500">
                                                        {punches > 0 ? (
                                                            <span className="bg-gray-100 px-3 py-1 rounded-full text-xs text-gray-600 border border-gray-200">{punches} batidas</span>
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-700">
                                                        {workedHours > 0 ? (
                                                            `${Math.floor(workedHours)}h${String(Math.round((workedHours % 1) * 60)).padStart(2, '0')}m`
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {!isFuture ? (
                                                            <span className={`font-bold text-sm px-3 py-1.5 rounded-xl ${
                                                                balance > 0 ? 'bg-green-50 text-green-700' : 
                                                                balance < 0 ? 'bg-red-50 text-red-700' : 
                                                                'text-gray-400'
                                                            }`}>
                                                                {formatHours(balance)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs italic">Aguardando</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'rateio' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100 md:col-span-2">
                            <div className="flex justify-between items-center mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center">
                                        <IconChart className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">Cálculo de Rateio de Gorjetas</h3>
                                        <p className="text-xs text-gray-500">Distribuição trimestral proporcional à data de admissão.</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <select 
                                        value={selectedRateioQuarter}
                                        onChange={e => setSelectedRateioQuarter(Number(e.target.value))}
                                        className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:border-farm-500 shadow-sm"
                                    >
                                        <option value={0}>1º Trimestre</option>
                                        <option value={1}>2º Trimestre</option>
                                        <option value={2}>3º Trimestre</option>
                                        <option value={3}>4º Trimestre</option>
                                    </select>
                                    <select 
                                        value={selectedRateioYear}
                                        onChange={e => setSelectedRateioYear(Number(e.target.value))}
                                        className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:border-farm-500 shadow-sm"
                                    >
                                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-3xl p-8 mb-8 border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total de Gorjetas Recebidas</p>
                                    <p className="text-4xl font-black text-gray-900">R$ {quarterTips.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="h-12 w-px bg-gray-200 hidden md:block"></div>
                                <div className="text-center md:text-right">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Funcionários Ativos</p>
                                    <p className="text-2xl font-black text-gray-900">{employees.filter(e => e.active).length} colaboradores</p>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-gray-100">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                                        <tr>
                                            <th className="px-6 py-4">Funcionário</th>
                                            <th className="px-6 py-4 text-center">Admissão</th>
                                            <th className="px-6 py-4 text-center">Dias no Trim.</th>
                                            <th className="px-6 py-4 text-right">Valor a Receber</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {calculateRateio(quarterTips).map(res => (
                                            <tr key={res.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-800">{res.full_name}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase">{res.position}</p>
                                                </td>
                                                <td className="px-6 py-4 text-center text-sm text-gray-500">
                                                    {formatDate(res.admission_date)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-100">
                                                        {res.daysWorked} dias
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <p className="font-black text-gray-900">R$ {res.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                    <p className="text-[9px] text-gray-400 font-bold">{(res.proportion * 100).toFixed(1)}% do período</p>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-farm-900 text-white p-8 rounded-[2.5rem] shadow-xl flex flex-col justify-between h-fit">
                            <div className="space-y-6">
                                <div className="w-14 h-14 bg-farm-800 rounded-2xl flex items-center justify-center">
                                    <IconBriefcase className="w-7 h-7 text-farm-300" />
                                </div>
                                <h4 className="text-xl font-bold font-serif">Regras do Rateio</h4>
                                <ul className="space-y-4 text-sm text-farm-200">
                                    <li className="flex gap-3">
                                        <div className="w-5 h-5 bg-farm-700 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">1</div>
                                        <p>Soma todas as receitas na categoria <b>"Gorjetas"</b> no trimestre selecionado.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="w-5 h-5 bg-farm-700 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">2</div>
                                        <p>Considera apenas funcionários com status <b>Ativo</b>.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="w-5 h-5 bg-farm-700 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">3</div>
                                        <p>O cálculo é <b>proporcional</b> aos dias trabalhados dentro do trimestre para quem foi admitido recentemente.</p>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'producao' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100 md:col-span-2">
                            <div className="flex justify-between items-center mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                                        <IconZap className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">Rateio de Produção (10%)</h3>
                                        <p className="text-xs text-gray-500">Distribuição trimestral das vendas de produtos próprios.</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <select 
                                        value={selectedRateioQuarter}
                                        onChange={e => setSelectedRateioQuarter(Number(e.target.value))}
                                        className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:border-farm-500 shadow-sm"
                                    >
                                        <option value={0}>1º Trimestre</option>
                                        <option value={1}>2º Trimestre</option>
                                        <option value={2}>3º Trimestre</option>
                                        <option value={3}>4º Trimestre</option>
                                    </select>
                                    <select 
                                        value={selectedRateioYear}
                                        onChange={e => setSelectedRateioYear(Number(e.target.value))}
                                        className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:border-farm-500 shadow-sm"
                                    >
                                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="bg-amber-50/30 rounded-3xl p-8 mb-8 border border-amber-100 flex flex-col md:flex-row justify-between items-center gap-6">
                                <div>
                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Vendas de Produtos de Produção</p>
                                    <p className="text-4xl font-black text-gray-900">R$ {productionTotalSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    <p className="text-[11px] font-bold text-amber-700 mt-1">
                                        Total para Rateio (10%): R$ {(productionTotalSales * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="h-12 w-px bg-amber-200 hidden md:block"></div>
                                <div className="text-center md:text-right">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Participantes Selecionados</p>
                                    <p className="text-2xl font-black text-gray-900">{employees.filter(e => e.active && e.participates_product_rateio).length} colaboradores</p>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-gray-100">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                                        <tr>
                                            <th className="px-6 py-4">Funcionário</th>
                                            <th className="px-6 py-4 text-center">Status</th>
                                            <th className="px-6 py-4 text-center">Dias no Trim.</th>
                                            <th className="px-6 py-4 text-right">Valor a Receber</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {calculateRateio(productionTotalSales * 0.1, true).map(res => (
                                            <tr key={res.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-800">{res.full_name}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase">{res.position}</p>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-2 py-1 rounded-lg uppercase">Participante</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-xs text-gray-500 font-medium">{res.daysWorked} dias</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <p className="font-black text-gray-900">R$ {res.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                    <p className="text-[9px] text-gray-400 font-bold">{(res.proportion * 100).toFixed(1)}% do período</p>
                                                </td>
                                            </tr>
                                        ))}
                                        {calculateRateio(productionTotalSales * 0.1, true).length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">Selecione os participantes na lista abaixo.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Gestao de Participantes */}
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100 h-fit">
                            <h4 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <IconUser className="w-5 h-5 text-farm-600" /> Ativar Participantes
                            </h4>
                            <div className="space-y-3">
                                {employees.map(emp => (
                                    <div key={emp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-gray-800 text-sm truncate">{emp.full_name}</p>
                                            <p className="text-[9px] text-gray-400 uppercase font-black">{emp.position}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleToggleEmployeeRateio(emp.id, emp.participates_product_rateio)}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${
                                                emp.participates_product_rateio 
                                                ? 'bg-amber-100 text-amber-600 border-amber-200' 
                                                : 'bg-white text-gray-300 border-gray-200 hover:text-gray-600'
                                            }`}
                                        >
                                            {emp.participates_product_rateio ? 'Ativo' : 'Inativo'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 bg-amber-50 p-4 rounded-2xl border border-amber-100">
                                <p className="text-xs text-amber-800 font-medium">
                                    <b>Dica:</b> Marque os produtos que geram este rateio na tela de <b>Configuração de PDV</b> clicando no ícone de raio (<IconZap className="w-3 h-3 inline" />).
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
