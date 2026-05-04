import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
    IconUser, IconPlus, IconTrash, IconCheck, IconX, 
    IconLoader, IconClock, IconZap, IconCalendar, IconAlertTriangle 
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
    const [activeTab, setActiveTab] = useState<'team' | 'vacations'>('team');
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
        
        // If employee has been here for more than 11 months, they are due for vacation
        if (diffMonths >= 11) {
            // Check if they already have a vacation in the system for this year
            const yearStart = new Date(today.getFullYear(), 0, 1).toISOString();
            const hasRecentVacation = vacations.some(v => v.employee_id === emp.id && v.start_date >= yearStart);
            if (!hasRecentVacation) return 'vencendo';
        }
        return 'ok';
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('pt-BR');
    };

    // Calendar logic
    const currentMonth = new Date().getMonth();
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
                    ) : (
                        <button 
                            onClick={() => setShowVacationForm(true)}
                            className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-orange-700 transition-all shadow-lg"
                        >
                            <IconPlus className="w-5 h-5" /> Agendar Férias
                        </button>
                    )}
                </div>
            </header>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button 
                    onClick={() => setActiveTab('team')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'team' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Lista de Equipe
                    {activeTab === 'team' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('vacations')}
                    className={`px-8 py-4 font-bold text-sm transition-all relative ${activeTab === 'vacations' ? 'text-farm-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Controle de Férias
                    {activeTab === 'vacations' && <div className="absolute bottom-0 left-0 w-full h-1 bg-farm-600 rounded-t-full"></div>}
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
        </div>
    );
};
