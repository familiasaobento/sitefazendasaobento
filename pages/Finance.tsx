import React, { useState, useEffect, useMemo } from 'react';
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

const parseBrlValue = (val: string | number | undefined | null): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  
  let clean = val.trim();
  // Remove currency symbol if present
  clean = clean.replace(/R\$\s*/g, '');
  
  // If there's a comma, we assume BRL format: dots are thousands, comma is decimal
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    // If there is no comma but there is a dot, check if it's a thousand separator
    const dotCount = (clean.match(/\./g) || []).length;
    if (dotCount > 1) {
      clean = clean.replace(/\./g, '');
    } else if (dotCount === 1) {
      const parts = clean.split('.');
      if (parts[1].length === 3) {
        clean = clean.replace(/\./g, '');
      }
    }
  }
  
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

// Colors for the charts (Earthy palette matching site's brand colors: green, blue, amber, purple, rose, orange, teal, cyan)
const COLORS = [
  '#389f76', // Green (farm brand)
  '#3b82f6', // Blue (banco/accounts)
  '#f59e0b', // Amber (caixa/dinheiro)
  '#8b5cf6', // Purple (tags)
  '#ec4899', // Pink
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#06b6d4'  // Cyan
];

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text 
      x={x} 
      y={y} 
      fill="white" 
      textAnchor="middle" 
      dominantBaseline="central"
      className="text-[10px] font-bold fill-white"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

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
  
  // Budget & Tabs States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'approved_budget' | 'draft_budget'>(() => {
    const saved = localStorage.getItem('finance_active_tab');
    if (saved === 'dashboard' || saved === 'approved_budget' || saved === 'draft_budget') return saved;
    if (saved === 'budget') return 'approved_budget';
    return 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('finance_active_tab', activeTab);
  }, [activeTab]);
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [editingBudgets, setEditingBudgets] = useState<Record<number, Record<number, string | number>>>({});
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [activeMonths, setActiveMonths] = useState<number[]>([]);
  const [cashFlowRaw, setCashFlowRaw] = useState<any[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});
  
  // Budget Approval States
  const [isApproved, setIsApproved] = useState(false);
  const [approvedInfo, setApprovedInfo] = useState<any>(null);
  const [isApproving, setIsApproving] = useState(false);

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

  // Auto-switch year to next year when drafting budget if current year is approved,
  // and auto-switch back to current year when viewing dashboard or approved budget.
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (activeTab === 'draft_budget') {
      if (isApproved && selectedYear === currentYear.toString()) {
        setSelectedYear((currentYear + 1).toString());
      }
    } else {
      if (selectedYear === (currentYear + 1).toString()) {
        setSelectedYear(currentYear.toString());
      }
    }
  }, [activeTab, isApproved, selectedYear]);

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

      // Fetch budget approval status
      const { data: statusData, error: statusErr } = await supabase
        .from('finance_budget_status')
        .select('*')
        .eq('ano', targetYear)
        .limit(1);

      if (statusErr) console.error('Erro ao buscar status do orçamento:', statusErr);

      if (statusData && statusData.length > 0) {
        const statusRecord = statusData[0];
        setIsApproved(statusRecord.aprovado);
        
        // Fetch profile separately to avoid join errors
        if (statusRecord.aprovado_por) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', statusRecord.aprovado_por)
            .limit(1);
          
          if (profileData && profileData.length > 0) {
            statusRecord.profiles = { full_name: profileData[0].full_name };
          }
        }
        setApprovedInfo(statusRecord);
      } else {
        setIsApproved(false);
        setApprovedInfo(null);
      }

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

      // Compute active months based on computed startDateStr and endDateStr
      const startD = new Date(startDateStr + 'T00:00:00');
      const endD = new Date(endDateStr + 'T23:59:59');
      const activeMos: number[] = [];
      let currentD = new Date(startD);
      while (currentD <= endD) {
        if (currentD.getFullYear() === targetYear) {
          const mNum = currentD.getMonth() + 1;
          if (!activeMos.includes(mNum)) {
            activeMos.push(mNum);
          }
        }
        currentD.setMonth(currentD.getMonth() + 1);
      }
      setActiveMonths(activeMos);

      // Fetch active categories
      const { data: catData } = await supabase
        .from('categorias_financeiras')
        .select('*')
        .eq('ativo', true)
        .order('display_order', { ascending: true })
        .order('nome', { ascending: true });

      setDbCategories(catData || []);

      // Fetch budgets for the selected year with pagination to avoid 1000 row limits
      let budgetData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error: budgetErr } = await supabase
          .from('finance_budget')
          .select('*')
          .eq('ano', targetYear)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (budgetErr) {
          console.error('Erro ao buscar budgets:', budgetErr);
          break;
        }
        
        if (data && data.length > 0) {
          budgetData = [...budgetData, ...data];
        }
        if (!data || data.length < pageSize) break;
        page++;
      }

      setBudgets(budgetData);

      // Initialize editing budgets
      if (catData) {
        const initialEditing: Record<number, Record<number, string | number>> = {};
        catData.forEach(c => {
          initialEditing[c.id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
        });
        budgetData?.forEach(b => {
          if (initialEditing[b.categoria_id]) {
            initialEditing[b.categoria_id][b.mes] = Number(b.valor_orcado);
          }
        });
        setEditingBudgets(initialEditing);
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
      if (cashFlow) setCashFlowRaw(cashFlow);

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

      const totalExpenseValue = Object.values(catMap).reduce((acc, v) => acc + v, 0);
      setExpenseCategories(Object.entries(catMap).map(([name, value]) => ({ 
        name, 
        value,
        percent: totalExpenseValue > 0 ? (value / totalExpenseValue) : 0
      }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
      );

      const totalIncomeValue = Object.values(incMap).reduce((acc, v) => acc + v, 0);
      setIncomeCategories(Object.entries(incMap).map(([name, value]) => ({ 
        name, 
        value,
        percent: totalIncomeValue > 0 ? (value / totalIncomeValue) : 0
      }))
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
  const labelPrevMonth = `${monthsRefFull[prevMonthD.getMonth()]}/${prevMonthD.getFullYear()}`;
  const isPrevMonthClosed = closedMonths.includes(prevMonthStr);
  // Permission checks
  const canEditBudget = isAdmin || userRole === 'finance_manager' || userRole === 'admin' || userRole === 'site_admin';

  // Category comparison computations
  const categoryComparisons = useMemo(() => {
    if (dbCategories.length === 0) return [];

    const getDescendantIds = (catId: number): number[] => {
      const ids = [catId];
      dbCategories.filter(c => c.parent_id === catId).forEach(child => {
        ids.push(...getDescendantIds(child.id));
      });
      return ids;
    };

    const getActualValue = (catNames: string[]) => {
      return cashFlowRaw
        .filter(entry => entry.categoria && catNames.includes(entry.categoria))
        .reduce((sum, entry) => sum + Number(entry.valor), 0);
    };

    const getBudgetValue = (catIds: number[]) => {
      return budgets
        .filter(b => catIds.includes(b.categoria_id) && activeMonths.includes(b.mes))
        .reduce((sum, b) => sum + Number(b.valor_aprovado ?? 0), 0);
    };

    return dbCategories.map(cat => {
      const descendantIds = getDescendantIds(cat.id);
      const descendantNames = dbCategories
        .filter(c => descendantIds.includes(c.id))
        .map(c => c.nome);

      const actual = getActualValue(descendantNames);
      const budget = getBudgetValue(descendantIds);

      const selfActual = getActualValue([cat.nome]);
      const selfBudget = getBudgetValue([cat.id]);

      return {
        id: cat.id,
        nome: cat.nome,
        tipo: cat.tipo,
        parent_id: cat.parent_id,
        actual,
        budget,
        selfActual,
        selfBudget
      };
    });
  }, [dbCategories, budgets, activeMonths, cashFlowRaw]);

  // Compute active budget totals for revenues and expenses
  const activeBudgetR = useMemo(() => {
    return budgets
      .filter(b => activeMonths.includes(b.mes) && dbCategories.find(c => c.id === b.categoria_id)?.tipo === 'receita')
      .reduce((sum, b) => sum + Number(b.valor_aprovado ?? 0), 0);
  }, [budgets, activeMonths, dbCategories]);

  const activeBudgetD = useMemo(() => {
    return budgets
      .filter(b => activeMonths.includes(b.mes) && dbCategories.find(c => c.id === b.categoria_id)?.tipo === 'despesa')
      .reduce((sum, b) => sum + Number(b.valor_aprovado ?? 0), 0);
  }, [budgets, activeMonths, dbCategories]);

  // Memoized budget totals for the selected year
  const budgetTotals = useMemo(() => {
    let totalReceita = 0;
    let totalDespesa = 0;

    dbCategories.forEach(cat => {
      const isParent = cat.parent_id === null;
      const childrenIds = dbCategories.filter(c => c.parent_id === cat.id).map(c => c.id);
      const isGroupSum = isParent && childrenIds.length > 0;

      if (!isGroupSum) {
        for (let m = 1; m <= 12; m++) {
          const val = parseBrlValue(editingBudgets[cat.id]?.[m] ?? 0);
          if (cat.tipo === 'receita') {
            totalReceita += val;
          } else if (cat.tipo === 'despesa') {
            totalDespesa += val;
          }
        }
      }
    });

    return { totalReceita, totalDespesa };
  }, [dbCategories, editingBudgets]);

  // Memoized approved budget totals for the selected year
  const approvedBudgetTotals = useMemo(() => {
    let totalReceita = 0;
    let totalDespesa = 0;

    dbCategories.forEach(cat => {
      const isParent = cat.parent_id === null;
      const childrenIds = dbCategories.filter(c => c.parent_id === cat.id).map(c => c.id);
      const isGroupSum = isParent && childrenIds.length > 0;

      if (!isGroupSum) {
        for (let m = 1; m <= 12; m++) {
          const record = budgets.find(b => b.categoria_id === cat.id && b.mes === m);
          const val = record ? Number(record.valor_aprovado ?? 0) : 0;
          if (cat.tipo === 'receita') {
            totalReceita += val;
          } else if (cat.tipo === 'despesa') {
            totalDespesa += val;
          }
        }
      }
    });

    return { totalReceita, totalDespesa };
  }, [dbCategories, budgets]);

  // Save budget
  const handleSaveBudget = async () => {
    setIsSavingBudget(true);
    try {
      const upsertData: any[] = [];
      Object.entries(editingBudgets).forEach(([catIdStr, monthsMap]) => {
        const categoria_id = parseInt(catIdStr);
        Object.entries(monthsMap).forEach(([mesStr, valor]) => {
          const mes = parseInt(mesStr);
          const valor_orcado = parseBrlValue(valor);
          upsertData.push({
            ano: parseInt(selectedYear),
            mes,
            categoria_id,
            valor_orcado
          });
        });
      });

      if (upsertData.length === 0) return;

      // Chunk upsertData to avoid large payload limits
      const chunkSize = 500;
      for (let i = 0; i < upsertData.length; i += chunkSize) {
        const chunk = upsertData.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('finance_budget')
          .upsert(chunk, { onConflict: 'ano,mes,categoria_id' });

        if (error) throw error;
      }

      alert('Orçamento salvo com sucesso!');
      await fetchDashboardData();
    } catch (err: any) {
      console.error('Erro ao salvar orçamento:', err);
      alert('Erro ao salvar orçamento: ' + err.message);
    } finally {
      setIsSavingBudget(false);
    }
  };

  // Approve and lock budget
  const handleApproveBudget = async () => {
    if (!confirm(`Deseja realmente aprovar e consolidar o orçamento para o ano de ${selectedYear}? Uma vez aprovado, este passará a ser o oficial da comparação no Dashboard e não poderá ser alterado.`)) {
      return;
    }
    setIsApproving(true);
    try {
      const upsertData: any[] = [];
      Object.entries(editingBudgets).forEach(([catIdStr, monthsMap]) => {
        const categoria_id = parseInt(catIdStr);
        Object.entries(monthsMap).forEach(([mesStr, valor]) => {
          const mes = parseInt(mesStr);
          const valor_orcado = parseBrlValue(valor);
          upsertData.push({
            ano: parseInt(selectedYear),
            mes,
            categoria_id,
            valor_orcado,
            valor_aprovado: valor_orcado
          });
        });
      });

      if (upsertData.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < upsertData.length; i += chunkSize) {
          const chunk = upsertData.slice(i, i + chunkSize);
          const { error } = await supabase
            .from('finance_budget')
            .upsert(chunk, { onConflict: 'ano,mes,categoria_id' });

          if (error) throw error;
        }
      }

      const { data: user } = await supabase.auth.getUser();
      const { error: statusError } = await supabase
        .from('finance_budget_status')
        .upsert({
          ano: parseInt(selectedYear),
          aprovado: true,
          aprovado_em: new Date().toISOString(),
          aprovado_por: user.user?.id
        }, { onConflict: 'ano' });

      if (statusError) throw statusError;

      alert('Orçamento aprovado e consolidado com sucesso!');
      const currentYear = new Date().getFullYear();
      if (parseInt(selectedYear) === currentYear) {
        setSelectedYear((currentYear + 1).toString());
      } else {
        await fetchDashboardData();
      }
    } catch (err: any) {
      console.error('Erro ao aprovar orçamento:', err);
      alert('Erro ao aprovar orçamento: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  // Copy from previous year
  const handleCopyFromPreviousYear = async () => {
    try {
      const prevYear = parseInt(selectedYear) - 1;
      const { data, error } = await supabase
        .from('finance_budget')
        .select('*')
        .eq('ano', prevYear);

      if (error) throw error;
      if (!data || data.length === 0) {
        alert(`Nenhum orçamento encontrado para o ano de ${prevYear}.`);
        return;
      }

      if (confirm(`Deseja copiar o orçamento de ${prevYear} para o ano de ${selectedYear}? Isso substituirá seus valores não salvos na tela.`)) {
        const newEditingBudgets = { ...editingBudgets };
        data.forEach(item => {
          if (!newEditingBudgets[item.categoria_id]) {
            newEditingBudgets[item.categoria_id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
          }
          newEditingBudgets[item.categoria_id][item.mes] = item.valor_orcado;
        });
        setEditingBudgets(newEditingBudgets);
      }
    } catch (err: any) {
      console.error('Erro ao copiar orçamento anterior:', err);
      alert('Erro ao copiar orçamento anterior: ' + err.message);
    }
  };

  // Flattened & sorted categories for the spreadsheet (grouped by tipo: receitas first, then despesas)
  const orderedCategories = useMemo(() => {
    const parentReceitas = dbCategories.filter(c => c.parent_id === null && c.tipo === 'receita');
    const parentDespesas = dbCategories.filter(c => c.parent_id === null && c.tipo === 'despesa');
    
    const result: any[] = [];
    
    // Process Receitas first
    parentReceitas.forEach(p => {
      result.push(p);
      const children = dbCategories.filter(c => c.parent_id === p.id);
      result.push(...children);
    });
    
    // Process Despesas second
    parentDespesas.forEach(p => {
      result.push(p);
      const children = dbCategories.filter(c => c.parent_id === p.id);
      result.push(...children);
    });
    
    return result;
  }, [dbCategories]);

  // Helper to toggle accordion
  const toggleCategoryExpanded = (id: number) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Helper to render progress bar
  const renderProgressBar = (actual: number, budget: number, tipo: 'receita' | 'despesa') => {
    const pct = budget > 0 ? (actual / budget) * 100 : (actual > 0 ? 100 : 0);
    const formattedPct = pct > 100 ? '100%+' : `${pct.toFixed(0)}%`;
    
    let barColor = 'bg-farm-600';
    if (tipo === 'despesa') {
      if (pct > 100) barColor = 'bg-red-500';
      else if (pct > 85) barColor = 'bg-amber-500';
    } else {
      if (pct >= 100) barColor = 'bg-farm-600';
      else if (pct < 50) barColor = 'bg-red-500';
      else barColor = 'bg-amber-500';
    }

    return (
      <div className="flex items-center gap-3 w-full">
        <div className="flex-grow bg-gray-100 h-2 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-gray-500 min-w-[32px] text-right">
          {formattedPct}
        </span>
      </div>
    );
  };

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
            {Array.from({length: 6}, (_, i) => (new Date().getFullYear() + 1) - i).map(y => (
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

      {/* Tab Switcher */}
      <div className="flex border-b border-gray-200 mt-6 mb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'border-farm-600 text-farm-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Painel Geral
        </button>
        <button
          onClick={() => setActiveTab('approved_budget')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'approved_budget' ? 'border-farm-600 text-farm-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Orçamento Aprovado
        </button>
        <button
          onClick={() => setActiveTab('draft_budget')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'draft_budget' ? 'border-farm-600 text-farm-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Elaboração de Orçamento
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
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

          {/* Acompanhamento Orçamentário */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Gráfico Realizado vs Orçado */}
            <div className="lg:col-span-1 bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800 font-serif">Orçado vs. Realizado</h3>
                  <div className="flex flex-wrap gap-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#389f76]"></span> Rec Real</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#a7f3d0]"></span> Rec Orç</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#ef4444]"></span> Desp Real</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#fca5a5]"></span> Desp Orç</span>
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Receitas', Realizado: kpis.receitaTotal, Orçado: activeBudgetR },
                      { name: 'Despesas', Realizado: kpis.despesaTotal, Orçado: activeBudgetD }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} tickFormatter={(value) => `R$ ${value/1000}k`} />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                        formatter={(value: number) => [formatCurrency(value), '']}
                      />
                      <Bar dataKey="Orçado" radius={[6, 6, 0, 0]} barSize={24}>
                        <Cell fill="#a7f3d0" />
                        <Cell fill="#fca5a5" />
                      </Bar>
                      <Bar dataKey="Realizado" radius={[6, 6, 0, 0]} barSize={24}>
                        <Cell fill="#389f76" />
                        <Cell fill="#ef4444" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-center border-t border-gray-50 pt-4">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Desvio Receitas</p>
                  <p className={`text-sm font-bold ${kpis.receitaTotal >= activeBudgetR ? 'text-green-600' : 'text-amber-600'}`}>
                    {activeBudgetR > 0 ? `${((kpis.receitaTotal / activeBudgetR - 1) * 100).toFixed(1)}%` : '0.0%'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Desvio Despesas</p>
                  <p className={`text-sm font-bold ${kpis.despesaTotal <= activeBudgetD ? 'text-green-600' : 'text-red-600'}`}>
                    {activeBudgetD > 0 ? `${((kpis.despesaTotal / activeBudgetD - 1) * 100).toFixed(1)}%` : '0.0%'}
                  </p>
                </div>
              </div>
            </div>

            {/* Barras de Progresso por Categoria */}
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-h-[400px] overflow-y-auto">
              <h3 className="text-xl font-bold text-gray-800 font-serif mb-6">Execução por Categoria</h3>
              
              {/* Receitas Section */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-[#389f76] uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">Receitas</h4>
                <div className="space-y-4">
                  {categoryComparisons.filter(c => c.tipo === 'receita' && c.parent_id === null).map(parent => {
                    const children = categoryComparisons.filter(c => c.parent_id === parent.id);
                    const isExpanded = expandedCategories[parent.id];
                    return (
                      <div key={parent.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleCategoryExpanded(parent.id)}>
                            <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
                            <span className="font-bold text-gray-800 text-sm">{parent.nome}</span>
                          </div>
                          <div className="text-xs text-gray-500 font-medium">
                            {formatCurrency(parent.actual)} de {formatCurrency(parent.budget)}
                          </div>
                        </div>
                        {renderProgressBar(parent.actual, parent.budget, 'receita')}
                        
                        {isExpanded && children.length > 0 && (
                          <div className="mt-3 pl-6 border-l-2 border-gray-100 space-y-3">
                            {children.map(child => (
                              <div key={child.id}>
                                <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                                  <span>{child.nome}</span>
                                  <span>{formatCurrency(child.selfActual)} de {formatCurrency(child.selfBudget)}</span>
                                </div>
                                {renderProgressBar(child.selfActual, child.selfBudget, 'receita')}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Despesas Section */}
              <div>
                <h4 className="text-xs font-bold text-[#ef4444] uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">Despesas</h4>
                <div className="space-y-4">
                  {categoryComparisons.filter(c => c.tipo === 'despesa' && c.parent_id === null).map(parent => {
                    const children = categoryComparisons.filter(c => c.parent_id === parent.id);
                    const isExpanded = expandedCategories[parent.id];
                    return (
                      <div key={parent.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleCategoryExpanded(parent.id)}>
                            <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
                            <span className="font-bold text-gray-800 text-sm">{parent.nome}</span>
                          </div>
                          <div className="text-xs text-gray-500 font-medium">
                            {formatCurrency(parent.actual)} de {formatCurrency(parent.budget)}
                          </div>
                        </div>
                        {renderProgressBar(parent.actual, parent.budget, 'despesa')}
                        
                        {isExpanded && children.length > 0 && (
                          <div className="mt-3 pl-6 border-l-2 border-gray-100 space-y-3">
                            {children.map(child => (
                              <div key={child.id}>
                                <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                                  <span>{child.nome}</span>
                                  <span>{formatCurrency(child.selfActual)} de {formatCurrency(child.selfBudget)}</span>
                                </div>
                                {renderProgressBar(child.selfActual, child.selfBudget, 'despesa')}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
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
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      labelLine={false}
                      label={renderCustomizedLabel}
                    >
                      {expenseCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="focus:outline-none transition-all duration-300 hover:opacity-85" />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                       formatter={(value: number, name: string, props: any) => {
                         const percent = props?.payload?.percent;
                         const formattedVal = formatCurrency(value);
                         return percent !== undefined 
                           ? [`${formattedVal} (${(percent * 100).toFixed(1)}%)`, '']
                           : [formattedVal, ''];
                       }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-6 space-y-3">
                {expenseCategories.map((cat, idx) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs hover:bg-gray-50/50 p-1.5 rounded-lg transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                      <span className="text-gray-600 font-medium truncate max-w-[140px]" title={cat.name}>{cat.name}</span>
                      {cat.percent !== undefined && <span className="text-[10px] font-bold text-gray-400">({(cat.percent * 100).toFixed(0)}%)</span>}
                    </div>
                    <span className="font-bold text-gray-800">{formatCurrency(cat.value)}</span>
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
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      labelLine={false}
                      label={renderCustomizedLabel}
                    >
                      {incomeCategories.map((entry, index) => (
                        <Cell key={`cell-inc-${index}`} fill={COLORS[(index + 2) % COLORS.length]} className="focus:outline-none transition-all duration-300 hover:opacity-85" />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                       formatter={(value: number, name: string, props: any) => {
                         const percent = props?.payload?.percent;
                         const formattedVal = formatCurrency(value);
                         return percent !== undefined 
                           ? [`${formattedVal} (${(percent * 100).toFixed(1)}%)`, '']
                           : [formattedVal, ''];
                       }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {incomeCategories.map((cat, idx) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs hover:bg-gray-50/50 p-1.5 rounded-lg transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[(idx + 2) % COLORS.length] }}></div>
                      <span className="text-gray-600 font-medium truncate max-w-[140px]" title={cat.name}>{cat.name}</span>
                      {cat.percent !== undefined && <span className="text-[10px] font-bold text-gray-400">({(cat.percent * 100).toFixed(0)}%)</span>}
                    </div>
                    <span className="font-bold text-gray-800">{formatCurrency(cat.value)}</span>
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
        </>
      )}
      {activeTab === 'approved_budget' && (
        <div className="space-y-6">
          {isApproved && approvedInfo && (
            <div className="bg-green-50 text-green-800 p-4 rounded-3xl border border-green-100 flex items-center gap-3 text-sm">
              <span className="text-xl">✅</span>
              <div>
                <strong>Orçamento Oficial Consolidado.</strong> Aprovado em {new Date(approvedInfo.aprovado_em).toLocaleDateString('pt-BR')} {approvedInfo.profiles?.full_name ? `por ${approvedInfo.profiles.full_name}` : ''}.
              </div>
            </div>
          )}
          {!isApproved && (
            <div className="bg-amber-50 text-amber-800 p-4 rounded-3xl border border-amber-100 flex items-center gap-3 text-sm">
              <span className="text-xl">⚠️</span>
              <div>
                <strong>Orçamento Oficial Pendente.</strong> O orçamento para o ano de {selectedYear} ainda não foi aprovado. Acesse a aba <strong>Elaboração de Orçamento</strong> para preencher e realizar a aprovação.
              </div>
            </div>
          )}

          {/* Cards de Resumo do Orçamento Aprovado */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="bg-farm-50 p-3 rounded-2xl text-farm-700 text-2xl">
                  📈
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total de Receitas Aprovadas</p>
                  <h4 className="text-2xl font-black text-gray-800">{formatCurrency(approvedBudgetTotals.totalReceita)}</h4>
                  <p className="text-gray-400 text-[10px] mt-1 italic">Meta anual oficial para {selectedYear}</p>
                </div>
              </div>
              <div className="text-[10px] bg-farm-50 text-farm-700 px-2.5 py-1 rounded-full font-bold border border-farm-100">
                RECEITAS
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="bg-red-50 p-3 rounded-2xl text-red-700 text-2xl">
                  📉
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total de Despesas Aprovadas</p>
                  <h4 className="text-2xl font-black text-gray-800">{formatCurrency(approvedBudgetTotals.totalDespesa)}</h4>
                  <p className="text-gray-400 text-[10px] mt-1 italic">Limite anual oficial para {selectedYear}</p>
                </div>
              </div>
              <div className="text-[10px] bg-red-50 text-red-700 px-2.5 py-1 rounded-full font-bold border border-red-100">
                DESPESAS
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl text-2xl ${approvedBudgetTotals.totalReceita - approvedBudgetTotals.totalDespesa >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                  ⚖️
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Saldo Final Orçado</p>
                  <h4 className={`text-2xl font-black ${approvedBudgetTotals.totalReceita - approvedBudgetTotals.totalDespesa >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                    {formatCurrency(approvedBudgetTotals.totalReceita - approvedBudgetTotals.totalDespesa)}
                  </h4>
                  <p className="text-gray-400 text-[10px] mt-1 italic">Resultado consolidado para {selectedYear}</p>
                </div>
              </div>
              <div className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${approvedBudgetTotals.totalReceita - approvedBudgetTotals.totalDespesa >= 0 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                {approvedBudgetTotals.totalReceita - approvedBudgetTotals.totalDespesa >= 0 ? 'SUPERÁVIT' : 'DÉFICIT'}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col min-w-max">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-800 font-serif">Planilha de Orçamento Aprovado</h3>
                <p className="text-gray-500 text-xs mt-1">Valores oficiais e consolidados para o ano de {selectedYear}.</p>
              </div>
              <div className="text-xs font-semibold text-gray-400">
                🔒 Somente Leitura
              </div>
            </div>

            <div className="overflow-x-visible">
              <table className="w-full min-w-[1200px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3 pr-4 sticky left-0 bg-white z-10 w-48 border-r border-gray-100">Categoria</th>
                    <th className="py-3 px-2 text-right">Jan</th>
                    <th className="py-3 px-2 text-right">Fev</th>
                    <th className="py-3 px-2 text-right">Mar</th>
                    <th className="py-3 px-2 text-right">Abr</th>
                    <th className="py-3 px-2 text-right">Mai</th>
                    <th className="py-3 px-2 text-right">Jun</th>
                    <th className="py-3 px-2 text-right">Jul</th>
                    <th className="py-3 px-2 text-right">Ago</th>
                    <th className="py-3 px-2 text-right">Set</th>
                    <th className="py-3 px-2 text-right">Out</th>
                    <th className="py-3 px-2 text-right">Nov</th>
                    <th className="py-3 px-2 text-right">Dez</th>
                    <th className="py-3 pl-2 pr-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orderedCategories.map(cat => {
                    const isParent = cat.parent_id === null;
                    const childrenIds = dbCategories.filter(c => c.parent_id === cat.id).map(c => c.id);
                    const isGroupSum = isParent && childrenIds.length > 0;

                    const annualTotal = Array.from({ length: 12 }, (_, i) => i + 1)
                      .reduce((sum, m) => {
                         if (isGroupSum) {
                           return sum + childrenIds.reduce((cSum, childId) => {
                             const record = budgets.find(b => b.categoria_id === childId && b.mes === m);
                             return cSum + (record ? Number(record.valor_aprovado ?? 0) : 0);
                           }, 0);
                         }
                         const record = budgets.find(b => b.categoria_id === cat.id && b.mes === m);
                         return sum + (record ? Number(record.valor_aprovado ?? 0) : 0);
                      }, 0);

                    return (
                      <tr 
                        key={cat.id} 
                        className={`hover:bg-gray-50/50 transition-colors ${isParent ? 'bg-gray-50/40 font-bold' : ''}`}
                      >
                        <td className={`py-3 pr-4 sticky left-0 z-10 border-r border-gray-100 ${isParent ? 'bg-[#fcfdfd]' : 'bg-white'} ${isParent ? 'pl-2 text-gray-900 text-sm font-bold' : 'pl-6 text-gray-600 text-xs'}`}>
                          {cat.nome}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
                          let displayValue = 0;
                          if (isGroupSum) {
                             displayValue = childrenIds.reduce((sum, childId) => {
                               const record = budgets.find(b => b.categoria_id === childId && b.mes === mes);
                               return sum + (record ? Number(record.valor_aprovado ?? 0) : 0);
                             }, 0);
                          } else {
                             const record = budgets.find(b => b.categoria_id === cat.id && b.mes === mes);
                             displayValue = record ? Number(record.valor_aprovado ?? 0) : 0;
                          }

                          return (
                            <td key={mes} className="py-2 px-1">
                              <span className={`block text-right font-mono text-gray-800 ${isParent ? 'text-sm font-bold' : 'text-xs font-medium'}`}>
                                {formatCurrency(displayValue)}
                              </span>
                            </td>
                          );
                        })}
                        <td className={`py-2 pl-2 pr-4 text-right font-bold font-mono text-gray-800 ${isParent ? 'text-sm' : 'text-xs'}`}>
                          {formatCurrency(annualTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'draft_budget' && (
        <div className="space-y-6">
          {isApproved && (
            <div className="bg-gray-50 text-gray-700 p-4 rounded-3xl border border-gray-200 flex items-center gap-3 text-sm">
              <span className="text-xl">🔒</span>
              <div>
                <strong>Elaboração Bloqueada.</strong> O orçamento de {selectedYear} já foi aprovado e consolidado oficialmente. Não é possível fazer alterações no rascunho de elaboração.
              </div>
            </div>
          )}

          {/* Cards de Resumo do Orçamento em Elaboração */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="bg-farm-50 p-3 rounded-2xl text-farm-700 text-2xl">
                  📈
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total de Receitas Orçadas (Draft)</p>
                  <h4 className="text-2xl font-black text-gray-800">{formatCurrency(budgetTotals.totalReceita)}</h4>
                  <p className="text-gray-400 text-[10px] mt-1 italic">Meta anual em elaboração para {selectedYear}</p>
                </div>
              </div>
              <div className="text-[10px] bg-farm-50 text-farm-700 px-2.5 py-1 rounded-full font-bold border border-farm-100">
                RASCUNHO
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="bg-red-50 p-3 rounded-2xl text-red-700 text-2xl">
                  📉
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total de Despesas Orçadas (Draft)</p>
                  <h4 className="text-2xl font-black text-gray-800">{formatCurrency(budgetTotals.totalDespesa)}</h4>
                  <p className="text-gray-400 text-[10px] mt-1 italic">Limite anual em elaboração para {selectedYear}</p>
                </div>
              </div>
              <div className="text-[10px] bg-red-50 text-red-700 px-2.5 py-1 rounded-full font-bold border border-red-100">
                RASCUNHO
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl text-2xl ${budgetTotals.totalReceita - budgetTotals.totalDespesa >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                  ⚖️
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Saldo Final Orçado (Draft)</p>
                  <h4 className={`text-2xl font-black ${budgetTotals.totalReceita - budgetTotals.totalDespesa >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                    {formatCurrency(budgetTotals.totalReceita - budgetTotals.totalDespesa)}
                  </h4>
                  <p className="text-gray-400 text-[10px] mt-1 italic">Resultado planejado para {selectedYear}</p>
                </div>
              </div>
              <div className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${budgetTotals.totalReceita - budgetTotals.totalDespesa >= 0 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                {budgetTotals.totalReceita - budgetTotals.totalDespesa >= 0 ? 'SUPERÁVIT' : 'DÉFICIT'}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col min-w-max">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-800 font-serif">Planilha de Elaboração de Orçamento</h3>
                <p className="text-gray-500 text-xs mt-1">Edite as metas de orçamento para o ano de {selectedYear}. Após a conclusão, clique em Aprovar Orçamento para torná-lo oficial.</p>
              </div>
              <div className="text-xs font-semibold text-gray-400">
                {canEditBudget && !isApproved ? '✍️ Modo de Edição Habilitado' : '👁️ Modo Somente Leitura'}
              </div>
            </div>

            <div className="overflow-x-visible">
              <table className="w-full min-w-[1200px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3 pr-4 sticky left-0 bg-white z-10 w-48 border-r border-gray-100">Categoria</th>
                    <th className="py-3 px-2 text-right">Jan</th>
                    <th className="py-3 px-2 text-right">Fev</th>
                    <th className="py-3 px-2 text-right">Mar</th>
                    <th className="py-3 px-2 text-right">Abr</th>
                    <th className="py-3 px-2 text-right">Mai</th>
                    <th className="py-3 px-2 text-right">Jun</th>
                    <th className="py-3 px-2 text-right">Jul</th>
                    <th className="py-3 px-2 text-right">Ago</th>
                    <th className="py-3 px-2 text-right">Set</th>
                    <th className="py-3 px-2 text-right">Out</th>
                    <th className="py-3 px-2 text-right">Nov</th>
                    <th className="py-3 px-2 text-right">Dez</th>
                    <th className="py-3 pl-2 pr-4 text-right">Total</th>
                    {canEditBudget && !isApproved && <th className="py-3 px-2 text-center w-24">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orderedCategories.map(cat => {
                    const isParent = cat.parent_id === null;
                    const childrenIds = dbCategories.filter(c => c.parent_id === cat.id).map(c => c.id);
                    const isGroupSum = isParent && childrenIds.length > 0;

                    const annualTotal = Array.from({ length: 12 }, (_, i) => i + 1)
                      .reduce((sum, m) => {
                         if (isGroupSum) {
                           return sum + childrenIds.reduce((cSum, childId) => cSum + parseBrlValue(editingBudgets[childId]?.[m] ?? 0), 0);
                         }
                         return sum + parseBrlValue(editingBudgets[cat.id]?.[m] ?? 0);
                      }, 0);

                    return (
                      <tr 
                        key={cat.id} 
                        className={`hover:bg-gray-50/50 transition-colors ${isParent ? 'bg-gray-50/40 font-bold' : ''}`}
                      >
                        <td className={`py-3 pr-4 sticky left-0 z-10 border-r border-gray-100 ${isParent ? 'bg-[#fcfdfd]' : 'bg-white'} ${isParent ? 'pl-2 text-gray-900 text-sm font-bold' : 'pl-6 text-gray-600 text-xs'}`}>
                          {cat.nome}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
                          const childrenIds = dbCategories.filter(c => c.parent_id === cat.id).map(c => c.id);
                          const isGroupSum = isParent && childrenIds.length > 0;
                          
                          let displayValue = 0;
                          if (isGroupSum) {
                             displayValue = childrenIds.reduce((sum, childId) => sum + parseBrlValue(editingBudgets[childId]?.[mes] ?? 0), 0);
                          } else {
                             displayValue = parseBrlValue(editingBudgets[cat.id]?.[mes] ?? 0);
                          }

                          return (
                          <td key={mes} className="py-2 px-1">
                            {canEditBudget && !isGroupSum && !isApproved ? (
                              <input
                                type="text"
                                value={editingBudgets[cat.id]?.[mes] === 0 || editingBudgets[cat.id]?.[mes] === '0' ? '' : (editingBudgets[cat.id]?.[mes] ?? '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditingBudgets(prev => ({
                                    ...prev,
                                    [cat.id]: {
                                      ...prev[cat.id],
                                      [mes]: val
                                    }
                                  }));
                                }}
                                onPaste={(e) => {
                                  const pasteData = e.clipboardData.getData('text');
                                  let values: string[] = [];
                                  if (pasteData.includes('\t')) {
                                    values = pasteData.split('\t');
                                  } else if (pasteData.includes('\n')) {
                                    values = pasteData.split(/\r?\n/);
                                  } else if (pasteData.includes(';')) {
                                    values = pasteData.split(';');
                                  }
                                  
                                  if (values.length > 1) {
                                    e.preventDefault();
                                    setEditingBudgets(prev => {
                                      const updatedMonths = { ...prev[cat.id] };
                                      let currentMonth = mes;
                                      values.forEach(val => {
                                        const cleanVal = val.trim();
                                        if (currentMonth <= 12) {
                                          updatedMonths[currentMonth] = cleanVal;
                                          currentMonth++;
                                        }
                                      });
                                      return {
                                        ...prev,
                                        [cat.id]: updatedMonths
                                      };
                                    });
                                  }
                                }}
                                className="w-16 px-1.5 py-1 text-xs text-right border border-gray-200 rounded focus:border-farm-500 focus:ring-1 focus:ring-farm-100 outline-none transition-all font-mono"
                                placeholder="0"
                              />
                            ) : (
                              <span className={`block text-right font-mono text-gray-800 ${isParent ? 'text-sm font-bold' : 'text-xs font-medium'}`}>
                                {formatCurrency(displayValue)}
                              </span>
                            )}
                          </td>
                        )})}
                        <td className={`py-2 pl-2 pr-4 text-right font-bold font-mono text-gray-800 ${isParent ? 'text-sm' : 'text-xs'}`}>
                          {formatCurrency(annualTotal)}
                        </td>
                        {canEditBudget && !isApproved && (
                          <td className="py-2 px-2 text-center">
                            {!isGroupSum && (
                              <div className="flex gap-1.5 justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const janVal = editingBudgets[cat.id]?.[1] ?? 0;
                                    setEditingBudgets(prev => {
                                      const updatedMonths = { ...prev[cat.id] };
                                      for (let m = 2; m <= 12; m++) {
                                        updatedMonths[m] = janVal;
                                      }
                                      return {
                                        ...prev,
                                        [cat.id]: updatedMonths
                                      };
                                    });
                                  }}
                                  title="Replicar valor de Janeiro para os outros meses"
                                  className="px-2 py-1 text-[10px] font-bold text-farm-600 hover:text-farm-700 hover:bg-farm-50 rounded transition-colors cursor-pointer border border-farm-200"
                                >
                                  Replicar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Deseja limpar todos os meses da categoria "${cat.nome}"?`)) {
                                      setEditingBudgets(prev => {
                                        const updatedMonths = { ...prev[cat.id] };
                                        for (let m = 1; m <= 12; m++) {
                                          updatedMonths[m] = '';
                                        }
                                        return {
                                          ...prev,
                                          [cat.id]: updatedMonths
                                        };
                                      });
                                    }
                                  }}
                                  title="Limpar todos os meses desta categoria"
                                  className="px-2 py-1 text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer border border-red-200"
                                >
                                  Limpar
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {canEditBudget && !isApproved && (
            <div className="flex flex-wrap gap-4 justify-between items-center bg-white p-6 rounded-3xl border border-gray-100 shadow-sm min-w-max">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopyFromPreviousYear}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl border border-gray-200 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  📋 Copiar do Ano Anterior
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Deseja limpar todos os valores de orçamento exibidos nesta tela? Atenção: isso não salvará no banco de dados automaticamente, você precisará clicar em "Salvar Orçamento" para gravar.')) {
                      setEditingBudgets(prev => {
                        const cleared = { ...prev };
                        Object.keys(cleared).forEach(catIdStr => {
                          const catId = parseInt(catIdStr);
                          cleared[catId] = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '', 9: '', 10: '', 11: '', 12: '' };
                        });
                        return cleared;
                      });
                    }
                  }}
                  className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  🗑️ Limpar Todos os Valores
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveBudget}
                  disabled={isSavingBudget}
                  className="px-6 py-2.5 bg-farm-600 hover:bg-farm-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingBudget ? 'Salvando...' : '💾 Salvar Orçamento'}
                </button>
                {(isAdmin || userRole === 'finance_manager') && (
                  <button
                    type="button"
                    onClick={handleApproveBudget}
                    disabled={isApproving}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isApproving ? 'Aprovando...' : '✅ Aprovar Orçamento Oficial'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
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