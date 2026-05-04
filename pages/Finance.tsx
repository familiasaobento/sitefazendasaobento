import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { IconLoader, IconChart, IconZap, IconUser, IconShoppingCart, IconMenu } from '../components/Icons';

// Helper to format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Colors for the charts
const COLORS = ['#389f76', '#5ebb92', '#2a7f5e', '#23513f', '#95d8b6', '#c3ead4'];

export const FinancePage: React.FC<{ 
  userRole?: string; 
  isAdmin?: boolean;
  onNavigate?: (page: any) => void;
}> = ({ userRole, isAdmin, onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [projects, setProjects] = useState<{id: number, nome: string}[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [isSavingClosing, setIsSavingClosing] = useState(false);
  
  // Data States
  const [kpis, setKpis] = useState({
    receitaTotal: 0,
    despesaTotal: 0,
    balanco: 0,
    ocupacaoAtual: 0,
    consumoPdv: 0,
    novasReservas: 0,
    inadimplenciaTotal: 0,
    totalSocios: 0
  });

  const [financialData, setFinancialData] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<any[]>([]);
  const [occupancyData, setOccupancyData] = useState<any[]>([]);
  const [accountBalances, setAccountBalances] = useState<{dinheiro: number, banco: number}>({ dinheiro: 0, banco: 0 });

  useEffect(() => {
     fetchDashboardData();
   }, [timeRange, selectedProject, selectedYear]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let startDateStr = '';
      let endDateStr = '';

      // Fetch closed months
      const { data: closedData } = await supabase.from('finance_months_closed').select('ano_mes').order('ano_mes', { ascending: false });
      const closed = closedData?.map(d => d.ano_mes) || [];
      setClosedMonths(closed);

      const targetYear = parseInt(selectedYear);
      const isCurrentYear = targetYear === now.getFullYear();

      if (timeRange === 'month') {
        if (isCurrentYear) {
            // Mês: O último mês fechado registrado.
            const lastClosed = closed.length > 0 ? closed[0] : `${targetYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const [yr, mo] = lastClosed.split('-');
            startDateStr = `${yr}-${mo}-01`;
            const endD = new Date(parseInt(yr), parseInt(mo), 0);
            endDateStr = endD.toISOString().split('T')[0];
        } else {
            // Em anos retroativos, exibimos o último mês por padrão (Dezembro) se a pessoa selecionar "Mês"
            startDateStr = `${targetYear}-12-01`;
            endDateStr = `${targetYear}-12-31`;
        }
      } else if (timeRange === 'quarter') {
        // Trimestre: Sempre o trimestre anterior
        let qStartMonth, qYear;
        if (isCurrentYear) {
            const currentQuarter = Math.floor(now.getMonth() / 3);
            if (currentQuarter === 0) {
                // Se estamos em Jan/Fev/Mar, o trimestre anterior é o T4 do ano passado
                qStartMonth = 9; // Outubro
                qYear = targetYear - 1;
            } else {
                qStartMonth = (currentQuarter - 1) * 3; // Trimestre exato passado
                qYear = targetYear;
            }
        } else {
            // Em anos consolidados, mostramos o 4º Trimestre
            qStartMonth = 9; 
            qYear = targetYear;
        }
        startDateStr = `${qYear}-${String(qStartMonth + 1).padStart(2, '0')}-01`;
        const endD = new Date(qYear, qStartMonth + 3, 0);
        endDateStr = endD.toISOString().split('T')[0];
      } else {
         // Ano: Year to Date somente dos meses fechados
         startDateStr = `${targetYear}-01-01`;
         if (isCurrentYear) {
             const closedCurrentYear = closed.filter(c => c.startsWith(`${targetYear}-`));
             if (closedCurrentYear.length > 0) {
                 const mo = closedCurrentYear[0].split('-')[1]; // Mês do último mês fechado no ano
                 const endD = new Date(targetYear, parseInt(mo), 0);
                 endDateStr = endD.toISOString().split('T')[0];
             } else {
                 // Nenhum mês fechado no ano ainda
                 endDateStr = now.toISOString().split('T')[0];
             }
         } else {
             endDateStr = `${targetYear}-12-31`; // Ano consolidadão full
         }
      }

      // 1. Fetch Fluxo de Caixa (Financeiro)
      let query = supabase
        .from('fluxo_caixa')
        .select('*')
        .gte('data_pagamento', startDateStr)
        .lte('data_pagamento', endDateStr);
      
      if (selectedProject) {
        query = query.eq('projeto', selectedProject);
      }

      const { data: cashFlow } = await query;

      // 1.5 Fetch Projects if not already fetched
      if (projects.length === 0) {
        const { data: pData } = await supabase.from('finance_projects').select('id, nome').order('nome');
        if (pData) setProjects(pData);
      }

      // 2. Fetch Reservations (Ocupação e Reservas)
      const { data: reservations } = await supabase
        .from('reservations')
        .select('*, estadias(*)')
        .gte('check_in', startDateStr)
        .lte('check_in', endDateStr);

      // 3. Fetch PDV Consumption
      const { data: consumption } = await supabase
        .from('lancamentos_consumo')
        .select('*')
        .gte('created_at', `${startDateStr}T00:00:00`)
        .lte('created_at', `${endDateStr}T23:59:59`);

      // 4. Fetch Active Stays
      const { data: activeStays } = await supabase
        .from('estadias')
        .select('id')
        .eq('status', 'ativa');

      // 5. Fetch Total Delinquency (Inadimplência)
      const { data: debts } = await supabase
        .from('member_titles')
        .select('amount')
        .eq('status', 'pending');
      
      const totalDebts = debts?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

      // 6. Fetch Total Members (Sócios)
      const { count: membersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .neq('role', 'visitor');

      // --- Processing Logic ---
      const monthsRefShort = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

      // Process Finance Data (Monthly grouping)
      const monthlyMap: Record<string, any> = {};
      let totalR = 0;
      let totalD = 0;

      cashFlow?.forEach(entry => {
        if (!entry.data_pagamento) return;
        const [yr, mo] = entry.data_pagamento.split('-');
        const monthName = monthsRefShort[parseInt(mo) - 1];
        const mapKey = `${yr}-${mo}`;

        if (!monthlyMap[mapKey]) {
          monthlyMap[mapKey] = { nameKey: mapKey, name: `${monthName}/${yr.slice(2)}`, receita: 0, despesa: 0 };
        }
        
        if (entry.tipo === 'entrada') {
          monthlyMap[mapKey].receita += entry.valor;
          totalR += entry.valor;
        } else {
          monthlyMap[mapKey].despesa += entry.valor;
          totalD += entry.valor;
        }
      });

      // Process Expense Categories
      const catMap: Record<string, number> = {};
      cashFlow?.filter(e => e.tipo === 'saida').forEach(entry => {
        catMap[entry.categoria || 'Outros'] = (catMap[entry.categoria || 'Outros'] || 0) + entry.valor;
      });

      // Process Income Categories
      const incMap: Record<string, number> = {};
      cashFlow?.filter(e => e.tipo === 'entrada').forEach(entry => {
        incMap[entry.categoria || 'Outros'] = (incMap[entry.categoria || 'Outros'] || 0) + entry.valor;
      });

      // Process Occupancy
      const occMap: Record<string, number> = {};
      reservations?.forEach(res => {
        if (!res.check_in) return;
        const [yr, mo] = res.check_in.split('-');
        const monthName = monthsRefShort[parseInt(mo) - 1];
        const mapKey = `${yr}-${mo}`;

        if (!occMap[mapKey]) occMap[mapKey] = 0;
        occMap[mapKey] += 1;
      });

      // Total Pdv
      const totalPdv = consumption?.reduce((acc, curr) => acc + (curr.valor_unitario_aplicado * curr.quantidade), 0) || 0;

      // Set States
      setKpis({
        receitaTotal: totalR,
        despesaTotal: totalD,
        balanco: totalR - totalD,
        ocupacaoAtual: activeStays?.length || 0,
        consumoPdv: totalPdv,
        novasReservas: reservations?.length || 0,
        inadimplenciaTotal: totalDebts,
        totalSocios: membersCount || 0
      });

      // Process Account Balances
      const balances = { dinheiro: 0, banco: 0 };
      cashFlow?.forEach(entry => {
          const val = Number(entry.valor);
          if (entry.meio_pagamento === 'Dinheiro') {
              balances.dinheiro += entry.tipo === 'entrada' ? val : -val;
          } else {
              balances.banco += entry.tipo === 'entrada' ? val : -val;
          }
      });
      setAccountBalances(balances);

      setFinancialData(Object.values(monthlyMap).sort((a, b) => a.nameKey.localeCompare(b.nameKey)));

      setExpenseCategories(Object.entries(catMap).map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
      );

      setIncomeCategories(Object.entries(incMap).map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
      );

      setOccupancyData(Object.entries(occMap)
        .map(([mapKey, value]) => {
           const [yr, mo] = mapKey.split('-');
           return { nameKey: mapKey, name: `${monthsRefShort[parseInt(mo) - 1]}/${yr.slice(2)}`, reservas: value };
        })
        .sort((a, b) => a.nameKey.localeCompare(b.nameKey))
      );

    } catch (err) {
      console.error('Erro ao processar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const nowD = new Date();
  const prevMonthD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const prevMonthStr = `${prevMonthD.getFullYear()}-${String(prevMonthD.getMonth() + 1).padStart(2, '0')}`;
  const monthsRefFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const isPrevMonthClosed = closedMonths.includes(prevMonthStr);
  const labelPrevMonth = `${monthsRefFull[prevMonthD.getMonth()]} ${prevMonthD.getFullYear()}`;

  const handleCloseMonth = async () => {
    if (isPrevMonthClosed) return;
    setIsSavingClosing(true);
    try {
        const { data: user } = await supabase.auth.getUser();
        await supabase.from('finance_months_closed').insert({
            ano_mes: prevMonthStr,
            fechado_por: user.user?.id
        });
        fetchDashboardData();
    } catch(err) { console.error(err); }
    setIsSavingClosing(false);
  };

  if (loading && financialData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <IconLoader className="w-12 h-12 text-farm-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium animate-pulse">Carregando inteligência financeira...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-4xl font-bold text-farm-900 font-serif">Dashboard Financeiro</h2>
          <p className="text-gray-600 mt-1">Análise baseada em períodos consolidados (fechados).</p>
          
          <div className="mt-4 flex items-center gap-3">
              {isPrevMonthClosed ? (
                  <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-green-200">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span> {labelPrevMonth} Fechado
                  </span>
              ) : (isAdmin || userRole === 'finance_manager') ? (
                  <button 
                      onClick={handleCloseMonth}
                      disabled={isSavingClosing}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-2 border border-amber-300 transition-colors cursor-pointer"
                  >
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Encerrar {labelPrevMonth}
                  </button>
              ) : (
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-amber-200">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> {labelPrevMonth} em Aberto
                  </span>
              )}
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 items-center overflow-x-auto">
            {(['month', 'quarter', 'year'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-all ${timeRange === r ? 'bg-farm-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {r === 'month' ? 'Mês Fechado' : r === 'quarter' ? 'Trimestre Anterior' : 'Ano (YTD)'}
              </button>
            ))}
          </div>
          
          <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(e.target.value)}
            className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 text-xs font-bold text-gray-500 outline-none focus:ring-2 focus:ring-farm-200"
          >
            {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y.toString()}>{y}</option>
            ))}
          </select>

          <select 
            value={selectedProject} 
            onChange={e => setSelectedProject(e.target.value)}
            className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 text-xs font-bold text-gray-500 outline-none focus:ring-2 focus:ring-farm-200"
          >
            <option value="">TODOS OS PROJETOS</option>
            {projects.map(p => <option key={p.id} value={p.nome}>{p.nome.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          title="Saldo do Período" 
          value={formatCurrency(kpis.balanco)} 
          subValue={`${kpis.balanco >= 0 ? '+' : ''}${formatCurrency(kpis.balanco)}`}
          icon={<IconChart className="w-6 h-6" />}
          trend={kpis.balanco >= 0 ? 'up' : 'down'}
          color="farm"
        />
        <KpiCard 
          title="Consumo PDV" 
          value={formatCurrency(kpis.consumoPdv)} 
          subValue="Total processado"
          icon={<IconShoppingCart className="w-6 h-6" />}
          color="blue"
        />
        <KpiCard 
          title="Total de Sócios" 
          value={kpis.totalSocios} 
          subValue="Membros da família"
          icon={<IconUser className="w-6 h-6" />}
          color="amber"
        />
        <KpiCard 
          title="Inadimplência Total" 
          value={formatCurrency(kpis.inadimplenciaTotal)} 
          subValue="Pendências de sócios"
          icon={<IconShoppingCart className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {/* Account Balances Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                  <div className="bg-blue-50 p-3 rounded-xl text-blue-600">🏦</div>
                  <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saldo em Bancos</p>
                      <h4 className="text-2xl font-black text-gray-800">{formatCurrency(accountBalances.banco)}</h4>
                  </div>
              </div>
              <div className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold">DISPONÍVEL</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                  <div className="bg-amber-50 p-3 rounded-xl text-amber-600">💵</div>
                  <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dinheiro em Caixa</p>
                      <h4 className="text-2xl font-black text-gray-800">{formatCurrency(accountBalances.dinheiro)}</h4>
                  </div>
              </div>
              <div className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-bold">ESPÉCIE</div>
          </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Receita vs Despesa */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-gray-800 font-serif">Fluxo de Caixa Mensal</h3>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-farm-500"></span> Receita</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-400"></span> Despesa</span>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} tickFormatter={(value) => `R$ ${value/1000}k`} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Bar dataKey="receita" fill="#389f76" radius={[6, 6, 0, 0]} barSize={32} />
                <Bar dataKey="despesa" fill="#f87171" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Despesas por Categoria */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 font-serif mb-8">Maiores Gastos</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expenseCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                   formatter={(value: number) => [formatCurrency(value), '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-3">
            {expenseCategories.map((cat, idx) => (
              <div key={cat.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                  <span className="text-gray-500 truncate max-w-[120px]">{cat.name}</span>
                </div>
                <span className="font-bold text-gray-700">{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Reservas e Receitas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Reservas Tendência */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 font-serif mb-8">Volume de Reservas</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={occupancyData}>
                <defs>
                  <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#389f76" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#389f76" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <Tooltip 
                   contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="reservas" stroke="#389f76" strokeWidth={3} fillOpacity={1} fill="url(#colorRes)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Principais Receitas */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 font-serif mb-8">Origem das Receitas</h3>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={incomeCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {incomeCategories.map((entry, index) => (
                    <Cell key={`cell-inc-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                   formatter={(value: number) => [formatCurrency(value), '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {incomeCategories.map((cat, idx) => (
              <div key={cat.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(idx + 2) % COLORS.length] }}></div>
                  <span className="text-gray-500 truncate max-w-[120px]">{cat.name}</span>
                </div>
                <span className="font-bold text-gray-700">{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Informações Adicionais / Card de Status */}
        <div className="bg-farm-900 rounded-3xl p-8 text-white relative overflow-hidden flex flex-col justify-center">
          <div className="relative z-10">
            <h3 className="text-2xl font-bold mb-4 font-serif italic">Inteligência de Dados</h3>
            <p className="text-farm-100 text-sm leading-relaxed mb-6">
              Este dashboard cruza informações de fluxo de caixa, PDV e reservas para te dar uma visão 360º da saúde da fazenda.
            </p>
            <div className="flex flex-wrap gap-2 text-white">
               <div className="bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-white/10">Receitas OK</div>
               <div className="bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-white/10">Custos OK</div>
            </div>
          </div>
          <div className="absolute top-[-20px] right-[-20px] w-40 h-40 bg-farm-800 rounded-full blur-3xl opacity-50"></div>
        </div>
      </div>
    </div>
  );
};

// UI Components
const KpiCard = ({ title, value, subValue, icon, trend, color }: any) => {
  const colorClasses: any = {
    farm: 'bg-farm-50 text-farm-700 border-farm-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${colorClasses[color]}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[10px] font-black px-2 py-1 rounded-full ${trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>
      <div>
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
        <h4 className="text-2xl font-black text-gray-800">{value}</h4>
        <p className="text-gray-400 text-[10px] mt-1 italic">{subValue}</p>
      </div>
    </div>
  );
};