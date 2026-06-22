import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { matchCategory } from '../pages/CashFlow';
import { predictTransactionData } from '../lib/categorization';
import { IconLoader, IconCheck, IconPlus, IconFileText, IconRefresh } from './Icons';

interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'entrada' | 'saida';
  originalRow: any;
  status: 'matched' | 'unmatched' | 'ignored';
  matchedSystemId?: number;
  selected?: boolean;
  predictedCategory?: string | null;
  predictedSupplier?: string | null;
  predictedProject?: string | null;
  predictedTags?: string | null;
}

interface SystemEntry {
  id: number;
  data_pagamento: string;
  descricao: string;
  valor: number;
  tipo: string;
  categoria: string;
  status?: string;
  matched?: boolean;
}

interface BankReconciliationProps {
  sessionId?: number | null;
  onReconciled: () => void;
  onClose: () => void;
}

const IconBriefcase = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
);

const NOISE_KEYWORDS = ['saldo anterior', 'saldo', 'resgate', 'aplicação', 'aplicacao', 'fundo', 'renda fixa', 'bb rende', 'bb rf', 'di plus', 'selic', 'poupanca', 'poupança', 'investimento', 'sdo'];

const isNoise = (desc: string) => {
  const lower = desc.toLowerCase();
  return NOISE_KEYWORDS.some(k => lower.includes(k)) && !lower.includes('transferência') && !lower.includes('transferencia');
};

const parseDate = (d: any) => {
  if (!d || typeof d !== 'string') return new Date().toISOString().split('T')[0];
  
  let clean = d.trim().split(/[\sT]/)[0].replace(/\//g, '-');
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  
  const parts = clean.split('-');
  if (parts.length === 2) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }
  
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    
    let year = parts[2];
    if (year.length === 2) {
      year = '20' + year;
    }
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return clean;
};

const getFullMonthRange = (dates: string[]) => {
  if (!dates || dates.length === 0) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return { start, end };
  }

  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  dates.forEach(d => {
    const parsedStr = parseDate(d);
    const parts = parsedStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }
    }
  });

  if (!minDate || !maxDate) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return { start, end };
  }

  const startYear = minDate.getFullYear();
  const startMonth = String(minDate.getMonth() + 1).padStart(2, '0');
  const start = `${startYear}-${startMonth}-01`;

  const endYear = maxDate.getFullYear();
  const endMonth = maxDate.getMonth() + 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { start, end };
};

export const BankReconciliation: React.FC<BankReconciliationProps> = ({ sessionId, onReconciled, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(sessionId || null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [systemEntries, setSystemEntries] = useState<SystemEntry[]>([]);
  
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [mapping, setMapping] = useState<any>({ date: '', description: '', historico: '', amount: '', status: 'pendente', mes_referencia: '' });
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'amount', direction: 'asc' | 'desc' } | null>(null);
  const [sysSortConfig, setSysSortConfig] = useState<{ key: 'date' | 'amount', direction: 'asc' | 'desc' } | null>(null);
  const [searchBank, setSearchBank] = useState('');
  const [searchSys, setSearchSys] = useState('');
  const [searchAudit, setSearchAudit] = useState('');
  const [selectedSysIds, setSelectedSysIds] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [hideReconciled, setHideReconciled] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditData, setAuditData] = useState<any[]>([]);
  const [editingSysEntry, setEditingSysEntry] = useState<any | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from('categorias_financeiras')
        .select('id, nome, tipo, parent_id, ativo')
        .eq('ativo', true);
      if (data) setCategoriesList(data);
    };
    fetchCategories();

    const loadSession = async () => {
      if (!sessionId) return;
      setLoading(true);
      try {
          const { data } = await supabase.from('conciliacao_pendente').select('*').eq('id', sessionId).single();
          if (data && data.transacoes && data.transacoes.length > 0) {
              const txs = data.transacoes;
              setBankTransactions(txs);
              if (data.mapping) {
                  setMapping(data.mapping);
                  if (data.mapping.status === 'concluida') setIsReadOnly(true);
              }
              if (data.nome_arquivo) setFile(new File([], data.nome_arquivo));
              
              const hasPending = txs.some((t: BankTransaction) => t.status === 'unmatched');
              if (hasPending || data.mapping?.status === 'concluida') {
                  const dates = txs.map((t: BankTransaction) => t.date);
                  const { start, end } = getFullMonthRange(dates);
                  const { data: sysData } = await supabase
                      .from('fluxo_caixa')
                      .select('*')
                      .eq('meio_pagamento', 'Banco')
                      .gte('data_pagamento', start)
                      .lte('data_pagamento', end)
                      .or('conciliado.is.null,conciliado.eq.false');
                  
                  if (sysData) {
                      const matchedIds = new Set(txs.filter((t: BankTransaction) => t.status === 'matched').map((t: BankTransaction) => t.matchedSystemId));
                      const sysRecords = sysData.map((d: any) => ({ ...d, matched: matchedIds.has(d.id) }));
                      setSystemEntries(sysRecords);
                  }
                  setStep('review');
              }
          }
      } catch (err) {
          console.error("No pending session", err);
      } finally {
          setLoading(false);
      }
    };
    loadSession();

    const savedMapping = localStorage.getItem('bankReconciliationMapping');
    if (savedMapping) {
      try {
        setMapping(JSON.parse(savedMapping));
      } catch (e) {}
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);

    const isExcel = uploadedFile.name.toLowerCase().endsWith('.xlsx') || uploadedFile.name.toLowerCase().endsWith('.xls');

    const processRawRows = (rawData: any[][]) => {
      let headerRowIndex = -1;
      // Search the first 20 rows for headers
      for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(c => String(c || '').toLowerCase());
        
        const hasDate = rowStr.some(c => c === 'data' || c.includes('data') || c.includes('date'));
        const hasValue = rowStr.some(c => c === 'valor' || c.includes('valor') || c.includes('amount'));
        
        if (hasDate && hasValue) {
            headerRowIndex = i;
            break;
        }
      }

      if (headerRowIndex >= 0) {
        // Build unique headers
        const headers = rawData[headerRowIndex].map((h: any, i: number) => {
            const hStr = String(h || '').trim();
            return hStr ? hStr : `coluna_${i}`;
        });

        // Parse data rows
        const dataRows = rawData.slice(headerRowIndex + 1).filter(r => r && r.length > 0 && r.some(c => c !== '' && c != null));
        
        const data = dataRows.map(row => {
            const obj: any = {};
            headers.forEach((h: string, i: number) => {
                obj[h] = row[i];
            });
            return obj;
        });

        setCsvHeaders(headers);
        setCsvData(data);
        
        // Auto map
        const dateCol = headers.find((h: string) => h.toLowerCase().includes('data') || h.toLowerCase().includes('date'));
        
        // Prioritize exact matches for BB/Standard format
        const exactHist = headers.find((h: string) => h.trim().toLowerCase() === 'historico' || h.trim().toLowerCase() === 'histórico');
        const exactDesc = headers.find((h: string) => h.trim().toLowerCase() === 'detalhamento hist.' || h.trim().toLowerCase() === 'detalhamento hist');

        const histCol = exactHist || headers.find((h: string) => h.toLowerCase().includes('hist') && !h.toLowerCase().includes('cod'));
        const descCol = exactDesc || headers.find((h: string) => h.toLowerCase() === 'descrição' || h.toLowerCase().includes('desc'));
        
        const valCol = headers.find((h: string) => h.toLowerCase().includes('valor') || h.toLowerCase().includes('amount'));
        
        setMapping({
          date: dateCol || '',
          description: descCol || '',
          historico: histCol || '',
          amount: valCol || ''
        });
      } else {
        alert("Não foi possível encontrar automaticamente a linha de cabeçalho. Certifique-se de que a planilha possui as colunas 'Data' e 'Valor'.");
      }
    };

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Read as array of arrays
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][];
        processRawRows(rawData);
      };
      reader.readAsBinaryString(uploadedFile);
    } else {
      Papa.parse(uploadedFile, {
        header: false, // Read as array of arrays
        skipEmptyLines: true,
        complete: (results) => {
          processRawRows(results.data as any[][]);
        }
      });
    }
  };

  const processReconciliation = async () => {
    if (!mapping.date || !mapping.description || !mapping.amount) {
      alert('Por favor, mapeie as colunas do extrato.');
      return;
    }

    localStorage.setItem('bankReconciliationMapping', JSON.stringify(mapping));
    setLoading(true);
    
    try {
      // 1. Map CSV to BankTransactions
      let processed: BankTransaction[] = csvData.map((row, index) => {
        const dateStr = row[mapping.date];
        const descText = row[mapping.description] || '';
        const histText = row[mapping.historico] || '';
        const desc = [histText, descText].filter(Boolean).join(' - ');
        let amountStr = row[mapping.amount] || '0';
        
        let amount = 0;
        let isNegative = false;
        if (typeof amountStr === 'number') {
            amount = amountStr;
            isNegative = amount < 0;
        } else if (typeof amountStr === 'string') {
            const cleanStr = amountStr.trim().replace('R$', '').replace(/\s/g, '');
            const isNegativeAmountStr = cleanStr.startsWith('-') || cleanStr.endsWith('-') || cleanStr.toLowerCase().endsWith('d');
            
            let valStr = cleanStr;
            if (valStr.includes(',') && valStr.includes('.')) {
                if (valStr.lastIndexOf(',') > valStr.lastIndexOf('.')) {
                    valStr = valStr.replace(/\./g, '').replace(',', '.');
                } else {
                    valStr = valStr.replace(/,/g, '');
                }
            } else if (valStr.includes(',')) {
                valStr = valStr.replace(',', '.');
            }
            valStr = valStr.replace(/[^0-9.]/g, '');
            
            amount = parseFloat(valStr);
            if (isNaN(amount)) amount = 0;
            
            // Check for D/C (Débito/Crédito) indicator in other columns
            let isDcNegative = false;
            const dcHeader = csvHeaders.find(h => {
                const lower = h.toLowerCase();
                return lower.includes('tipo') || lower.includes('d/c') || lower.includes('c/d') || 
                       lower.includes('sinal') || lower.includes('deb') || lower.includes('cre') || 
                       lower.includes('situa') || lower === 'd' || lower === 'c';
            });
            
            let dcIndicator = '';
            if (dcHeader) {
                dcIndicator = String(row[dcHeader] || '').trim().toLowerCase();
            } else {
                const valIndex = csvHeaders.indexOf(mapping.amount);
                if (valIndex >= 0 && valIndex + 1 < csvHeaders.length) {
                    const nextHeader = csvHeaders[valIndex + 1];
                    dcIndicator = String(row[nextHeader] || '').trim().toLowerCase();
                }
            }
            
            if (dcIndicator) {
                isDcNegative = dcIndicator === 'd' || dcIndicator.startsWith('deb') || dcIndicator.includes('saida') || dcIndicator.includes('saída') || dcIndicator === '-';
            }
            
            isNegative = isNegativeAmountStr || isDcNegative;
            if (isNegative) amount = -amount;
        }

        const type = amount >= 0 ? 'entrada' : 'saida';
        const absAmount = Math.abs(amount);

        return {
          id: `csv-${index}`,
          date: dateStr,
          description: desc,
          amount: absAmount,
          type,
          originalRow: row,
          status: 'unmatched',
          selected: false
        };
      });

      // 2. Clean Noise
      processed = processed.filter(tx => !isNoise(tx.description) && tx.amount > 0);

      // 3. Remove exact Reversals (estornos) on the same day
      for (let i = 0; i < processed.length; i++) {
        if (processed[i].status === 'ignored') continue;
        for (let j = i + 1; j < processed.length; j++) {
            if (processed[j].status === 'ignored') continue;
            
            if (processed[i].date === processed[j].date && 
                processed[i].amount === processed[j].amount && 
                processed[i].type !== processed[j].type) {
                // It's a reversal pair
                processed[i].status = 'ignored';
                processed[j].status = 'ignored';
                break;
            }
        }
      }

      // 3.5 Predict missing data for unmatched items
      await Promise.all(processed.map(async (tx) => {
        if (tx.status !== 'ignored') {
            const pred = await predictTransactionData(tx.description, tx.type);
            if (pred) {
                tx.predictedCategory = pred.categoria;
                tx.predictedSupplier = pred.cnpj_fornecedor;
                tx.predictedProject = pred.projeto;
                tx.predictedTags = pred.tags;
            }
        }
      }));

      // 4. Load System Cash Flow for comparison based on statement's month range
      const validTxs = processed.filter(tx => tx.status !== 'ignored');
      const dates = validTxs.map(tx => tx.date);
      const { start, end } = getFullMonthRange(dates);
      
      const { data: sysData, error } = await supabase
        .from('fluxo_caixa')
        .select('*')
        .eq('meio_pagamento', 'Banco')
        .gte('data_pagamento', start)
        .lte('data_pagamento', end)
        .or('conciliado.is.null,conciliado.eq.false');

      if (error || !sysData) throw new Error('Não foi possível carregar o fluxo de caixa.');
      
      const systemRecords: SystemEntry[] = sysData.map(d => ({ ...d, matched: false }));

      // 4.5 Generalized Auto-grouping Engine (Muitos para Um)
      const unmatchedSys = systemRecords.filter(s => !s.matched);
      
      for (const sys of unmatchedSys) {
          const sysType = sys.tipo;
          const sysTarget = Math.round(Number(sys.valor) * 100);
          
          const availableTx = processed.filter(tx => tx.status === 'unmatched' && tx.type === sysType);
          if (availableTx.length === 0) continue;
          
          // 1. Group available tx by normalized stems
          const wordGroups: Record<string, BankTransaction[]> = {};
          availableTx.forEach(tx => {
              const text = (tx.description).toLowerCase().replace(/[^a-z0-9]/g, ' ');
              const words = text.split(/\s+/).filter(w => w.length >= 3 || ['pix', 'ted', 'doc', 'tar'].includes(w));
              
              const stems = words.map(w => {
                  if (w.startsWith('cobran')) return 'cobranca';
                  if (w.startsWith('tarif') || w === 'tar') return 'tarifa';
                  if (w.startsWith('transf') || w === 'ted' || w === 'doc') return 'transf';
                  if (w === 'pix') return 'pix';
                  if (w.startsWith('condomin') || w.startsWith('cond.')) return 'condominio';
                  if (w.startsWith('mensalid')) return 'mensalidade';
                  if (w.startsWith('servi')) return 'servico';
                  if (w.startsWith('pacote')) return 'pacote';
                  if (w.startsWith('agrup')) return 'agrupado';
                  return w.endsWith('s') ? w.slice(0, -1) : w;
              });

              // Also create a master bucket for all bank fees just in case
              if (stems.includes('tarifa') || stems.includes('pacote') || stems.includes('agrupado')) stems.push('taxas_bancarias_gerais');
              
              const uniqueWords = Array.from(new Set(stems));
              uniqueWords.forEach(w => {
                  if (!wordGroups[w]) wordGroups[w] = [];
                  wordGroups[w].push(tx);
              });
          });
          
          // Sort words to prioritize words that appear in the sys description/category
          const sysText = (sys.descricao + " " + sys.categoria).toLowerCase().replace(/[^a-z0-9]/g, ' ');
          const sysWords = sysText.split(/\s+/).map(w => w.endsWith('s') ? w.slice(0, -1) : w);
          
          const sortedWords = Object.keys(wordGroups).sort((a, b) => {
              const aInSys = sysWords.some(sw => sw.includes(a) || a.includes(sw)) ? 1 : 0;
              const bInSys = sysWords.some(sw => sw.includes(b) || b.includes(sw)) ? 1 : 0;
              return (bInSys - aInSys) || (wordGroups[b].length - wordGroups[a].length);
          });

          for (const word of sortedWords) {
              const group = wordGroups[word];
              if (group.length < 2) continue; // Only care about "Muitos para Um"
              
              const groupSum = group.reduce((acc, curr) => acc + Math.round(curr.amount * 100), 0);
              if (groupSum === sysTarget) {
                  sys.matched = true;
                  group.forEach(tx => {
                      if (tx.status === 'unmatched') {
                          tx.status = 'matched';
                          tx.matchedSystemId = sys.id;
                      }
                  });
                  break;
              }
          }
      }

      // 5. Smart Matching Engine
      processed.forEach(tx => {
        if (tx.status === 'ignored' || tx.status === 'matched') return;

        const bankDate = new Date(parseDate(tx.date));
        
        let bestMatch = null;
        let bestScore = -1;

        for (let i = 0; i < systemRecords.length; i++) {
            const sys = systemRecords[i];
            if (sys.matched || sys.tipo !== tx.type) continue;
            
            const sysAmount = Math.abs(Number(sys.valor));
            if (Math.abs(sysAmount - tx.amount) > 0.01) continue; // Value MUST match exactly for direct match

            const sysDate = new Date(sys.data_pagamento);
            const diffDays = Math.abs((bankDate.getTime() - sysDate.getTime()) / (1000 * 3600 * 24));
            
            if (diffDays <= 15) { // 15 days window
                let score = 100 - diffDays; // Base score on proximity
                
                // Bonus for name matching
                const descWords = tx.description.toLowerCase().split(' ');
                const sysWords = sys.descricao.toLowerCase().split(' ');
                let wordMatches = descWords.filter(w => w.length > 3 && sysWords.includes(w)).length;
                score += wordMatches * 10;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = sys;
                }
            }
        }

        if (bestMatch) {
            tx.status = 'matched';
            tx.matchedSystemId = bestMatch.id;
            bestMatch.matched = true;
        }
      });

      const finalProcessed = processed.filter(tx => tx.status !== 'ignored');
      setBankTransactions(finalProcessed);
      setSystemEntries(systemRecords);
      setStep('review');

      // Update matched system records in DB directly
      const autoMatchedIds = systemRecords.filter(s => s.matched).map(s => s.id);
      if (autoMatchedIds.length > 0) {
          await supabase.from('fluxo_caixa').update({ status: 'pago', conciliado: true }).in('id', autoMatchedIds);
      }

      // Save session to DB
      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const [y, m] = start.split('-');
      const mes_referencia = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
      
      const newMapping = { ...mapping, status: 'pendente', mes_referencia };
      setMapping(newMapping);
      
      const sessionToSaveId = currentSessionId || Math.floor(Date.now() / 1000);
      if (!currentSessionId) setCurrentSessionId(sessionToSaveId);

      await supabase.from('conciliacao_pendente').upsert({ 
          id: sessionToSaveId, 
          nome_arquivo: file?.name || 'extrato',
          transacoes: finalProcessed, 
          mapping: newMapping, 
          atualizado_em: new Date().toISOString() 
      });
    } catch (err: any) {
      alert('Erro no processamento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSelection = () => {
      setBankTransactions(bankTransactions.map(tx => ({ ...tx, selected: false })));
      setSelectedSysIds(new Set());
  };

  const handleDeleteSysEntry = async (sysId: number) => {
      if (!window.confirm('Tem certeza que deseja apagar este lançamento do sistema permanentemente?')) return;
      setLoading(true);
      try {
          await supabase.from('fluxo_caixa').delete().eq('id', sysId);
          setSystemEntries(systemEntries.filter(s => s.id !== sysId));
          const newSet = new Set(selectedSysIds);
          newSet.delete(sysId);
          setSelectedSysIds(newSet);
      } catch (err: any) {
          alert('Erro ao apagar: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  const handleSaveSysEntry = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingSysEntry) return;
      setLoading(true);
      try {
          const { id, descricao, data_pagamento, valor, tipo, categoria } = editingSysEntry;
          const { error } = await supabase.from('fluxo_caixa').update({
              descricao, data_pagamento, valor, tipo, categoria
          }).eq('id', id);
          
          if (error) throw error;
          
          setSystemEntries(systemEntries.map(s => s.id === id ? { ...s, descricao, data_pagamento, valor, tipo, categoria } : s));
          setEditingSysEntry(null);
      } catch (err: any) {
          alert('Erro ao salvar: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  const handleCreateEntry = async (tx: BankTransaction) => {
    setLoading(true);
    try {
      let finalCategory = tx.predictedCategory || '';

      // Fallback para as regras fixas se o aprendizado não trouxer nada
      if (!finalCategory) {
          finalCategory = matchCategory(null, tx.description, tx.type, categoriesList);
      }

      const { data, error } = await supabase
        .from('fluxo_caixa')
        .insert([{
          descricao: tx.description,
          valor: tx.amount,
          tipo: tx.type,
          data_pagamento: tx.date,
          categoria: finalCategory,
          cnpj_fornecedor: tx.predictedSupplier || null,
          projeto: tx.predictedProject || null,
          tags: tx.predictedTags || null,
          meio_pagamento: 'Banco',
          status: 'pago',
          conciliado: true
        }])
        .select()
        .single();
      
      if (error) throw error;

      // Update bank tx status
      const newTxs = bankTransactions.map(t => {
        if (t.id === tx.id) {
          return { ...t, status: 'matched' as const, matchedSystemId: data.id };
        }
        return t;
      });
      setBankTransactions(newTxs);
      
      // Save session
      await supabase.from('conciliacao_pendente').update({ transacoes: newTxs, atualizado_em: new Date().toISOString() }).eq('id', currentSessionId);
      
      onReconciled();
    } catch (err: any) {
      alert('Erro ao criar lançamento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
      if (isReadOnly) return;
      setBankTransactions(prev => prev.map(t => t.id === id ? { ...t, selected: !t.selected } : t));
  };

  const selectedTxs = bankTransactions.filter(t => t.selected && t.status === 'unmatched');
  const selectedSumEntrada = selectedTxs.filter(t => t.type === 'entrada').reduce((acc, t) => acc + t.amount, 0);
  const selectedSumSaida = selectedTxs.filter(t => t.type === 'saida').reduce((acc, t) => acc + t.amount, 0);

  const selectedSysEntriesList = systemEntries.filter(s => selectedSysIds.has(s.id));
  const selectedSysSumEntrada = selectedSysEntriesList.filter(s => s.tipo === 'entrada').reduce((acc, s) => acc + Math.abs(Number(s.valor)), 0);
  const selectedSysSumSaida = selectedSysEntriesList.filter(s => s.tipo === 'saida').reduce((acc, s) => acc + Math.abs(Number(s.valor)), 0);

  const selectedBankType = selectedTxs.length > 0 ? selectedTxs[0].type : null;
  const selectedSysType = selectedSysEntriesList.length > 0 ? selectedSysEntriesList[0].tipo : null;
  
  const isTypeMatch = selectedBankType && selectedSysType && selectedBankType === selectedSysType;
  const bankSum = selectedBankType === 'entrada' ? selectedSumEntrada : selectedSumSaida;
  const sysSum = selectedSysType === 'entrada' ? selectedSysSumEntrada : selectedSysSumSaida;
  const isSumMatch = isTypeMatch && Math.abs(bankSum - sysSum) < 0.01;
  
  const handleGroupMatch = async (sysEntry: SystemEntry) => {
      // Create children or update the system entry to reflect it was matched by multiple
      // For simplicity here, we mark the system entry as matched and update the UI
      setLoading(true);
      try {
          // Update DB to mark as paid and reconciled
          const { error } = await supabase.from('fluxo_caixa').update({ status: 'pago', conciliado: true }).eq('id', sysEntry.id);
          if (error) throw error;

          setSystemEntries(prev => prev.map(s => s.id === sysEntry.id ? { ...s, matched: true } : s));
          const updatedBankTx = bankTransactions.map(t => {
              if (t.selected && t.status === 'unmatched') {
                  return { ...t, status: 'matched' as const, matchedSystemId: sysEntry.id, selected: false };
              }
              return t;
          });
          setBankTransactions(updatedBankTx);
          await supabase.from('conciliacao_pendente').update({ transacoes: updatedBankTx, atualizado_em: new Date().toISOString() }).eq('id', currentSessionId);
          onReconciled();
      } catch (err: any) {
          alert('Erro ao consolidar: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  const handleCustomMatch = async (txs: BankTransaction[], sysList: SystemEntry[]) => {
      setLoading(true);
      try {
          const sysIds = sysList.map(s => s.id);
          const { error } = await supabase
              .from('fluxo_caixa')
              .update({ status: 'pago', conciliado: true })
              .in('id', sysIds);
          if (error) throw error;

          setSystemEntries(prev => prev.map(s => sysIds.includes(s.id) ? { ...s, matched: true } : s));
          
          const primarySysId = sysIds[0];
          const newTxs = bankTransactions.map(t => {
              const isSelected = txs.some(tx => tx.id === t.id);
              if (isSelected) {
                  return { ...t, status: 'matched' as const, matchedSystemId: primarySysId, selected: false };
              }
              return t;
          });
          
          setBankTransactions(newTxs);
          setSelectedSysIds(new Set());
          
          await supabase.from('conciliacao_pendente').update({ transacoes: newTxs, atualizado_em: new Date().toISOString() }).eq('id', currentSessionId);
          onReconciled();
      } catch (err: any) {
          alert('Erro ao conciliar itens selecionados: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  const toggleSysSelect = (id: number) => {
      if (isReadOnly) return;
      setSelectedSysIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) {
              next.delete(id);
          } else {
              next.add(id);
          }
          return next;
      });
  };

  // Stats
  const stats = useMemo(() => {
      const unmatchedBank = bankTransactions.filter(t => t.status === 'unmatched');
      const matchedBank = bankTransactions.filter(t => t.status === 'matched');
      const unmatchedSys = systemEntries.filter(s => !s.matched);
      const matchedSys = systemEntries.filter(s => s.matched);
      return {
          bankCount: unmatchedBank.length,
          bankValueEntrada: unmatchedBank.filter(t => t.type === 'entrada').reduce((a, b) => a + b.amount, 0),
          bankValueSaida: unmatchedBank.filter(t => t.type === 'saida').reduce((a, b) => a + b.amount, 0),
          matchedCount: matchedBank.length,
          matchedValueEntrada: matchedBank.filter(t => t.type === 'entrada').reduce((a, b) => a + b.amount, 0),
          matchedValueSaida: matchedBank.filter(t => t.type === 'saida').reduce((a, b) => a + b.amount, 0),
          sysCount: unmatchedSys.length,
          sysValueEntrada: unmatchedSys.filter(s => s.tipo === 'entrada').reduce((a, b) => a + Number(b.valor), 0),
          sysValueSaida: unmatchedSys.filter(s => s.tipo === 'saida').reduce((a, b) => a + Number(b.valor), 0),
      };
  }, [bankTransactions, systemEntries]);

  const handleDiscardSession = async () => {
      if (window.confirm('Tem certeza que deseja descartar a conciliação pendente e subir um novo arquivo?')) {
          setLoading(true);
          try {
              const dates = bankTransactions.map(t => t.date);
              
              if (dates.length > 0 && window.confirm('Você quer ZERAR (desfazer) todas as conciliações já salvas no banco de dados para este mês? \n\n(Isso fará com que todos os itens voltem a aparecer na lista para serem conciliados novamente)')) {
                  const { start, end } = getFullMonthRange(dates);
                  await supabase
                      .from('fluxo_caixa')
                      .update({ status: 'aprovado', conciliado: false })
                      .eq('meio_pagamento', 'Banco')
                      .gte('data_pagamento', start)
                      .lte('data_pagamento', end)
                      .eq('conciliado', true);
              } else {
                  const matchedSystemIds = bankTransactions
                      .filter(t => t.status === 'matched' && t.matchedSystemId)
                      .map(t => t.matchedSystemId);
                      
                  if (matchedSystemIds.length > 0) {
                      await supabase
                          .from('fluxo_caixa')
                          .update({ status: 'aprovado', conciliado: false })
                          .in('id', matchedSystemIds);
                  }
              }
              
              if (currentSessionId) {
                  await supabase.from('conciliacao_pendente').delete().eq('id', currentSessionId);
              }
              setBankTransactions([]);
              setFile(null);
              setCsvData([]);
              setStep('upload');
          } catch (err: any) {
              alert('Erro ao descartar sessão: ' + err.message);
          } finally {
              setLoading(false);
          }
      }
  };

  const handleViewAudit = async () => {
      setLoading(true);
      setSearchAudit('');
      try {
          // Pega todos os itens conciliados, mesmo os antigos sem matchedSystemId
          const matchedTxs = bankTransactions.filter(t => t.status === 'matched');
          console.log("Matched Txs:", matchedTxs);
          if (matchedTxs.length === 0) {
              alert('Nenhum item conciliado para exibir na auditoria.');
              return;
          }
          
          const sysIds = Array.from(new Set(matchedTxs.map(t => t.matchedSystemId))).filter(Boolean);
          console.log("sysIds:", sysIds);
          
          let sysData: any[] = [];
          if (sysIds.length > 0) {
              const { data, error } = await supabase
                  .from('fluxo_caixa')
                  .select('*')
                  .in('id', sysIds);
              if (error) throw error;
              sysData = data || [];
          }
          console.log("sysData fetched:", sysData);
          
          const auditGroups = sysData.map(sys => {
              return {
                  systemEntry: sys,
                  bankTxs: matchedTxs.filter(t => String(t.matchedSystemId) === String(sys.id))
              };
          });

          const foundSysIds = new Set(sysData.map(s => String(s.id)));
          const orphanedTxs = matchedTxs.filter(t => !t.matchedSystemId || !foundSysIds.has(String(t.matchedSystemId)));
          console.log("Orphaned/Legacy Txs:", orphanedTxs);
          if (orphanedTxs.length > 0) {
              auditGroups.push({
                  systemEntry: { 
                      descricao: '⚠️ Lançamentos Conciliados (Sessões Antigas ou Apagados)', 
                      valor: orphanedTxs.reduce((sum, tx) => sum + (tx.type === 'entrada' ? tx.amount : -tx.amount), 0), 
                      tipo: 'entrada', 
                      data_pagamento: new Date().toISOString() 
                  },
                  bankTxs: orphanedTxs
              });
          }
          
          console.log("Final Audit Groups:", auditGroups);
          setAuditData(auditGroups);
          setShowAudit(true);
      } catch (err: any) {
          console.error("Audit error:", err);
          alert('Erro ao carregar auditoria: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="bg-gray-100 rounded-3xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col max-h-[90vh]">
      <header className="p-6 border-b flex justify-between items-center bg-farm-900 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-3 rounded-2xl">
            <IconBriefcase className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-serif italic text-farm-50">Conciliação Bancária Avançada</h3>
            <p className="text-farm-200 text-xs">Ajuste inteligente de transações do seu extrato.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {step === 'review' && !isReadOnly && (
            <>
              <button onClick={async () => {
                  if(window.confirm('Marcar sessão como concluída?')) {
                      setLoading(true);
                      try {
                          const newMapping = { ...mapping, status: 'concluida' };
                          await supabase.from('conciliacao_pendente').update({ 
                              mapping: newMapping,
                              transacoes: bankTransactions,
                              atualizado_em: new Date().toISOString()
                          }).eq('id', currentSessionId);
                          setIsReadOnly(true);
                          setMapping(newMapping);
                      } catch (err: any) {
                          alert('Erro ao concluir sessão: ' + err.message);
                      } finally {
                          setLoading(false);
                      }
                  }
              }} className="px-3 py-1.5 border border-green-500/30 text-green-200 hover:bg-green-500/20 hover:text-white rounded-xl text-xs font-bold transition-colors">
                 Concluir Mês
              </button>
              <button onClick={handleDiscardSession} className="px-3 py-1.5 mr-2 border border-red-500/30 text-red-200 hover:bg-red-500/20 hover:text-white rounded-xl text-xs font-bold transition-colors">
                 Descartar Sessão
              </button>
            </>
          )}
          {step === 'review' && isReadOnly && (
             <span className="px-3 py-1 bg-green-500/20 text-green-300 font-bold text-xs rounded-xl mr-2">Sessão Concluída (Auditoria)</span>
          )}
          {step === 'review' && (
              <button onClick={handleViewAudit} className="px-3 py-1.5 mr-2 border border-blue-500/30 text-blue-200 hover:bg-blue-500/20 hover:text-white rounded-xl text-xs font-bold transition-colors">
                  Validação das Conciliações
              </button>
          )}
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6">
        {step === 'upload' ? (
          <div className="max-w-xl mx-auto space-y-8 py-12 w-full bg-white p-8 rounded-3xl shadow-sm">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-farm-50 rounded-full flex items-center justify-center mx-auto mb-6">
                 <IconFileText className="w-10 h-10 text-farm-600" />
              </div>
              <h4 className="text-xl font-bold text-gray-800">Upload do Extrato</h4>
              <p className="text-gray-500 text-sm">Arraste ou selecione o arquivo Excel (.xlsx) ou CSV do seu banco.</p>
            </div>

            <label className="block border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center hover:border-farm-400 transition-colors cursor-pointer group bg-gray-50">
              <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              <div className="space-y-2">
                <span className="text-farm-700 font-bold block group-hover:scale-110 transition-transform">{file ? file.name : 'Selecionar Planilha'}</span>
                <span className="text-gray-400 text-xs italic">O sistema irá filtrar saldos e ruídos automaticamente. (CSV ou Excel)</span>
              </div>
            </label>

            {file && (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 space-y-6 shadow-sm animate-fade-in">
                <h5 className="font-bold text-gray-700 text-sm uppercase tracking-widest">Mapeamento</h5>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Data</label>
                    <select value={mapping.date} onChange={e => setMapping({...mapping, date: e.target.value})} className="w-full p-3 border rounded-xl bg-gray-50 text-sm outline-none">
                      <option value="">Selecione...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Histórico</label>
                    <select value={mapping.historico} onChange={e => setMapping({...mapping, historico: e.target.value})} className="w-full p-3 border rounded-xl bg-gray-50 text-sm outline-none">
                      <option value="">Nenhum...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Descrição/Complemento</label>
                    <select value={mapping.description} onChange={e => setMapping({...mapping, description: e.target.value})} className="w-full p-3 border rounded-xl bg-gray-50 text-sm outline-none">
                      <option value="">Nenhum...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Valor</label>
                    <select value={mapping.amount} onChange={e => setMapping({...mapping, amount: e.target.value})} className="w-full p-3 border rounded-xl bg-gray-50 text-sm outline-none">
                      <option value="">Selecione...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={processReconciliation} 
                  disabled={loading}
                  className="w-full py-4 bg-farm-700 text-white font-black rounded-2xl hover:bg-farm-800 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {loading ? 'Processando dados...' : 'Conciliar Inteligente'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6 animate-fade-in h-full">
            {/* Global Filter Bar */}
            <div className="flex justify-center items-center">
                <div className="bg-white p-1 rounded-2xl border border-gray-100 flex gap-1 shadow-sm">
                    <button 
                        onClick={() => setFilterType('todos')}
                        className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${filterType === 'todos' ? 'bg-farm-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        Todos
                    </button>
                    <button 
                        onClick={() => setFilterType('entrada')}
                        className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${filterType === 'entrada' ? 'bg-green-600 text-white shadow-sm' : 'text-green-600 hover:bg-green-50'}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${filterType === 'entrada' ? 'bg-white' : 'bg-green-400'}`}></span> Receitas (Entradas)
                    </button>
                    <button 
                        onClick={() => setFilterType('saida')}
                        className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${filterType === 'saida' ? 'bg-red-600 text-white shadow-sm' : 'text-red-600 hover:bg-red-50'}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${filterType === 'saida' ? 'bg-white' : 'bg-red-400'}`}></span> Despesas (Saídas)
                    </button>
                    <div className="w-px bg-gray-200 mx-1"></div>
                    <button 
                        onClick={() => setHideReconciled(!hideReconciled)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${hideReconciled ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        {hideReconciled ? 'Mostrar Conciliados' : 'Ocultar Conciliados'}
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-full">
              {/* Left Panel: CSV Entries */}
             <div className="flex-1 flex flex-col gap-4">
                {/* Stats Summary */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Pendentes */}
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                      <div>
                          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Pendentes no Extrato</p>
                          <p className="text-2xl font-black text-gray-800">{stats.bankCount} <span className="text-sm font-normal text-gray-500">itens</span></p>
                      </div>
                      <div className="text-right">
                          <p className="text-xs text-green-600 font-bold">+{stats.bankValueEntrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <p className="text-xs text-red-600 font-bold">-{stats.bankValueSaida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                      </div>
                  </div>
                  {/* Conciliados */}
                  <div className="bg-green-50 p-4 rounded-2xl shadow-sm border border-green-100 flex justify-between items-center">
                      <div>
                          <p className="text-xs text-green-600 font-bold uppercase tracking-wider">Já Conciliados</p>
                          <p className="text-2xl font-black text-green-800">{stats.matchedCount} <span className="text-sm font-normal text-green-600">itens</span></p>
                      </div>
                      <div className="text-right">
                          <p className="text-xs text-green-700 font-bold">+{stats.matchedValueEntrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <p className="text-xs text-red-700 font-bold">-{stats.matchedValueSaida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                      </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 flex-1 overflow-hidden flex flex-col shadow-sm">
                  <div className="p-4 border-b flex flex-col gap-3 bg-gray-50">
                     <div className="flex justify-between items-center">
                         <h4 className="font-bold text-gray-800 flex items-center gap-2">
                            <IconFileText className="w-4 h-4 text-farm-600" /> Extrato Bancário
                         </h4>
                         {(selectedSumEntrada > 0 || selectedSumSaida > 0) && (
                             <div className="px-3 py-1 bg-farm-100 text-farm-800 rounded-lg text-xs font-bold animate-pulse">
                                 Soma Selecionada: {selectedSumEntrada > 0 ? '+' : '-'}{(selectedSumEntrada || selectedSumSaida).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                             </div>
                         )}
                     </div>
                     <input
                         type="text"
                         placeholder="Pesquisar no extrato (descrição, valor ou data)..."
                         value={searchBank}
                         onChange={e => setSearchBank(e.target.value)}
                         className="w-full text-xs p-2 rounded-xl border border-gray-200 outline-none focus:border-farm-500 focus:ring-1 focus:ring-farm-500 bg-white"
                     />
                  </div>
                  
                  {/* Sorting Logic and Headers */}
                  {(() => {
                    const requestSort = (key: 'date' | 'amount') => {
                      let direction: 'asc' | 'desc' = 'asc';
                      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
                        direction = 'desc';
                      }
                      setSortConfig({ key, direction });
                    };

                    const searchLower = searchBank.toLowerCase();
                    const filteredTxs = bankTransactions.filter(tx => 
                        (filterType === 'todos' || tx.type === filterType) && 
                        (!hideReconciled || tx.status !== 'matched') &&
                        (tx.description.toLowerCase().includes(searchLower) || String(tx.amount).includes(searchLower) || tx.date.includes(searchLower))
                    );
                    const sortedTransactions = [...filteredTxs].sort((a, b) => {
                      if (!sortConfig) return 0;
                      if (sortConfig.key === 'date') {
                          const dateA = new Date(parseDate(a.date)).getTime();
                          const dateB = new Date(parseDate(b.date)).getTime();
                          return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                      }
                      if (sortConfig.key === 'amount') {
                          return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
                      }
                      return 0;
                    });

                    return (
                      <div className="flex-1 overflow-y-auto p-2">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[10px] text-gray-400 uppercase bg-white sticky top-0 z-10 shadow-sm">
                            <tr>
                               <th className="p-3 w-8"></th>
                               <th className="p-3 cursor-pointer hover:text-farm-600 transition-colors select-none" onClick={() => requestSort('date')}>
                                   Data {sortConfig?.key === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                               </th>
                               <th className="p-3">Descrição</th>
                               <th className="p-3 text-right cursor-pointer hover:text-farm-600 transition-colors select-none" onClick={() => requestSort('amount')}>
                                   Valor {sortConfig?.key === 'amount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                               </th>
                               <th className="p-3"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {sortedTransactions.map((tx) => (
                              <tr key={tx.id} onClick={() => tx.status === 'unmatched' && toggleSelect(tx.id)} className={`cursor-pointer hover:bg-gray-50 transition-colors ${tx.status === 'matched' ? 'opacity-50 grayscale' : ''} ${tx.selected ? 'bg-farm-50/50' : ''}`}>
                                <td className="p-3 w-8 text-center">
                                   {tx.status === 'matched' ? (
                                       <IconCheck className="w-4 h-4 text-green-500 mx-auto" />
                                   ) : (
                                       <input type="checkbox" checked={tx.selected} onChange={() => toggleSelect(tx.id)} className="rounded text-farm-600 focus:ring-farm-500" />
                                   )}
                                </td>
                                <td className="p-3 font-mono text-[10px] text-gray-400">{tx.date}</td>
                                <td className="p-3">
                                   <div className="font-bold text-gray-700 max-w-[400px] whitespace-normal text-xs" title={tx.description}>{tx.description}</div>
                                   {tx.predictedCategory && tx.status === 'unmatched' && (
                                       <div className="text-[9px] text-farm-500 font-bold mt-1 bg-farm-50 w-fit px-1.5 py-0.5 rounded border border-farm-100 shadow-sm flex items-center gap-1">
                                          <IconCheck className="w-3 h-3" /> Sugestão: {tx.predictedCategory}
                                       </div>
                                   )}
                                </td>
                                <td className={`p-3 text-right font-black ${tx.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                  {tx.type === 'entrada' ? '+' : '-'} {tx.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                                <td className="p-3 text-right">
                                  {tx.status === 'unmatched' && !isReadOnly && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleCreateEntry(tx); }}
                                      className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-farm-600 hover:text-white transition-colors"
                                    >
                                      Lançar
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
             </div>

             {/* Right Panel: System Entries */}
             <div className="w-full lg:w-96 flex flex-col gap-4">
                <div className="bg-farm-50 p-4 rounded-2xl shadow-sm border border-farm-100 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-farm-600 font-bold uppercase tracking-wider">Pendências no Sistema</p>
                        <p className="text-2xl font-black text-farm-900">{stats.sysCount} <span className="text-sm font-normal text-farm-700">itens</span></p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 flex-1 overflow-hidden flex flex-col shadow-sm">
                  <div className="p-4 border-b flex flex-col gap-3 bg-gray-50">
                      <div className="flex justify-between items-center">
                          <h4 className="font-bold text-gray-800 flex items-center gap-2">
                              Lançamentos no Sistema
                          </h4>
                      </div>
                      <input
                          type="text"
                          placeholder="Pesquisar no sistema (descrição ou valor)..."
                          value={searchSys}
                          onChange={e => setSearchSys(e.target.value)}
                          className="w-full text-xs p-2 rounded-xl border border-gray-200 outline-none focus:border-farm-500 focus:ring-1 focus:ring-farm-500 bg-white"
                      />
                  </div>
                  {(() => {
                    const requestSysSort = (key: 'date' | 'amount') => {
                        let direction: 'asc' | 'desc' = 'asc';
                        if (sysSortConfig && sysSortConfig.key === key && sysSortConfig.direction === 'asc') direction = 'desc';
                        setSysSortConfig({ key, direction });
                    };

                    const searchSysLower = searchSys.toLowerCase();
                    const filteredSys = systemEntries
                        .filter(s => !s.matched)
                        .filter(s => filterType === 'todos' || s.tipo === filterType)
                        .filter(s => (s.descricao || '').toLowerCase().includes(searchSysLower) || String(s.valor || '').includes(searchSysLower));
                    const sortedSystemEntries = [...filteredSys].sort((a, b) => {
                        if (!sysSortConfig) return 0;
                        if (sysSortConfig.key === 'date') {
                           const dateA = new Date(a.data_pagamento).getTime();
                           const dateB = new Date(b.data_pagamento).getTime();
                           return sysSortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                        }
                        if (sysSortConfig.key === 'amount') {
                           return sysSortConfig.direction === 'asc' ? Number(a.valor) - Number(b.valor) : Number(b.valor) - Number(a.valor);
                        }
                        return 0;
                    });

                    return (
                      <>
                        <div className="p-4 border-b flex flex-col gap-2 bg-gray-50">
                           <h4 className="font-bold text-gray-800">Sistema (Fluxo)</h4>
                           <div className="flex gap-4 text-[10px] uppercase font-bold text-gray-500 select-none">
                               <button onClick={() => requestSysSort('date')} className="hover:text-farm-600 flex items-center gap-1 transition-colors">
                                   DATA {sysSortConfig?.key === 'date' ? (sysSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                               </button>
                               <button onClick={() => requestSysSort('amount')} className="hover:text-farm-600 flex items-center gap-1 transition-colors">
                                   VALOR {sysSortConfig?.key === 'amount' ? (sysSortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                               </button>
                           </div>
                        </div>

                        {(selectedTxs.length > 0 || selectedSysIds.size > 0) && (
                            <div className="p-3 bg-farm-50 border-b border-farm-100 flex flex-col gap-2">
                                <div className="text-[10px] font-bold text-gray-600 flex flex-col gap-1">
                                    <div className="flex justify-between">
                                        <span>Extrato: {selectedTxs.length} item(ns)</span>
                                        <span>{(selectedSumEntrada || selectedSumSaida).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Sistema: {selectedSysIds.size} item(ns)</span>
                                        <span>{(selectedSysSumEntrada || selectedSysSumSaida).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    {!isSumMatch && (selectedTxs.length > 0 || selectedSysIds.size > 0) && (
                                        <div className="flex justify-between pt-1 mt-1 border-t border-farm-200 text-farm-700">
                                            <span>Falta conciliar:</span>
                                            <span>{Math.abs(bankSum - sysSum).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                        </div>
                                    )}
                                </div>
                                {isSumMatch && !isReadOnly ? (
                                    <button 
                                        onClick={() => handleCustomMatch(selectedTxs, selectedSysEntriesList)}
                                        className="w-full py-2 bg-farm-700 hover:bg-farm-800 text-white rounded-xl text-xs font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1"
                                    >
                                        <IconCheck className="w-4 h-4 text-white" /> Conciliar Selecionados
                                    </button>
                                ) : !isReadOnly ? (
                                    <div className="text-[9px] text-red-500 font-bold italic text-center animate-pulse">
                                        Valores totais ou tipos não coincidem para conciliação.
                                    </div>
                                ) : null}
                                {!isReadOnly && (
                                    <button 
                                        onClick={handleClearSelection}
                                        className="w-full py-2 bg-white hover:bg-gray-50 text-gray-500 border border-gray-200 rounded-xl text-xs font-bold transition-all mt-1"
                                    >
                                        Limpar Seleção
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-2">
                           <div className="space-y-2">
                              {sortedSystemEntries.map(sys => {
                                  const absValue = Math.abs(Number(sys.valor));
                                  const isMatch = (sys.tipo === 'entrada' && Math.abs(selectedSumEntrada - absValue) < 0.01) || 
                                                  (sys.tipo === 'saida' && Math.abs(selectedSumSaida - absValue) < 0.01);
                                  
                                  // Motor de Aprendizado: Fuzzy Match Visual para divergência de valores
                                  let isFuzzyMatch = false;
                                  if (!isMatch && selectedTxs.length === 1 && sys.tipo === selectedTxs[0].type) {
                                      const sysDate = new Date(sys.data_pagamento);
                                      const txDate = new Date(parseDate(selectedTxs[0].date));
                                      const diffDays = Math.abs((txDate.getTime() - sysDate.getTime()) / (1000 * 3600 * 24));
                                      
                                      if (diffDays <= 15) {
                                          const normSys = sys.descricao.toLowerCase().replace(/[^a-z0-9]/g, '');
                                          const normTx = selectedTxs[0].description.toLowerCase().replace(/[^a-z0-9]/g, '');
                                          
                                          if (normSys.length > 5 && (normSys.includes(normTx) || normTx.includes(normSys))) {
                                              isFuzzyMatch = true;
                                          } else {
                                              const sysWords = sys.descricao.toLowerCase().split(' ').filter(w => w.length > 3);
                                              const txWords = selectedTxs[0].description.toLowerCase().split(' ').filter(w => w.length > 3);
                                              const overlap = sysWords.filter(w => txWords.includes(w)).length;
                                              if (overlap >= 2 || (sysWords.length > 0 && overlap === sysWords.length)) {
                                                  isFuzzyMatch = true;
                                              }
                                          }
                                      }
                                  }

                                  return (
                                      <div 
                                          key={sys.id} 
                                          onClick={() => toggleSysSelect(sys.id)}
                                          onDoubleClick={() => !isReadOnly && setEditingSysEntry(sys)}
                                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                              selectedSysIds.has(sys.id) 
                                                  ? 'border-farm-600 bg-farm-50/50 shadow-sm' 
                                                  : isMatch 
                                                      ? 'border-green-400 bg-green-50 shadow-md' 
                                                      : isFuzzyMatch
                                                          ? 'border-yellow-400 bg-yellow-50 shadow-sm ring-1 ring-yellow-400/50'
                                                          : 'border-gray-100 bg-white hover:bg-gray-50'
                                          }`}
                                      >
                                          <div className="flex justify-between items-start mb-2">
                                              <div className="flex items-center gap-2">
                                                  <input 
                                                      type="checkbox" 
                                                      checked={selectedSysIds.has(sys.id)} 
                                                      onChange={() => {}} // onClick handles selection
                                                      className="rounded text-farm-600 focus:ring-farm-500" 
                                                  />
                                                  <div className="font-mono text-[10px] text-gray-400">{parseDate(sys.data_pagamento)}</div>
                                              </div>
                                              <div className={`font-black text-xs ${sys.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                                  {sys.tipo === 'entrada' ? '+' : '-'}{absValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </div>
                                          </div>
                                          <div className="text-sm font-bold text-gray-700 mb-1 line-clamp-2">{sys.descricao}</div>
                                          
                                          {isFuzzyMatch && !isMatch && !selectedSysIds.has(sys.id) && (
                                              <div className="mt-2 text-[10px] text-yellow-700 font-bold bg-yellow-100 px-2 py-1 rounded-md flex items-center gap-1 w-max">
                                                  ⭐ Possível correspondência (Valores divergem)
                                              </div>
                                          )}
                                          <div className="flex justify-between items-center mt-2">
                                              <span className="px-2 py-0.5 bg-gray-100 rounded-md text-[10px] font-bold text-gray-500">{sys.categoria}</span>
                                              {selectedSysIds.has(sys.id) && !isReadOnly && (
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSysEntry(sys.id); }}
                                                    className="px-3 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-600 hover:text-white transition-colors text-xs font-bold"
                                                  >
                                                      Apagar
                                                  </button>
                                              )}
                                          </div>

                                          {isMatch && !selectedSysIds.has(sys.id) && !isReadOnly && (
                                              <button 
                                                  onClick={(e) => { e.stopPropagation(); handleGroupMatch(sys); }}
                                                  className="w-full mt-2 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 shadow-sm"
                                              >
                                                  Vincular {selectedTxs.length} itens a este lançamento
                                              </button>
                                          )}
                                      </div>
                                  );
                              })}
                              {sortedSystemEntries.length === 0 && (
                                  <div className="p-8 text-center text-gray-400 text-sm">
                                      Nenhum lançamento pendente no sistema.
                                  </div>
                              )}
                           </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
             </div>
           </div>
          </div>
        )}
      </div>

      {showAudit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAudit(false)}></div>
              <div className="bg-gray-100 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] relative z-10">
                  <header className="p-6 border-b flex flex-col gap-4 bg-farm-900 text-white">
                      <div className="flex justify-between items-center">
                          <div>
                              <h3 className="text-xl font-bold font-serif italic text-farm-50">Validação das Conciliações</h3>
                              <p className="text-farm-200 text-xs">Verifique os vínculos entre o sistema e o extrato.</p>
                          </div>
                          <button onClick={() => setShowAudit(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                      </div>
                      <input
                          type="text"
                          placeholder="Buscar conciliação por descrição ou valor..."
                          value={searchAudit}
                          onChange={e => setSearchAudit(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border-none outline-none text-gray-800 bg-white/95 focus:bg-white focus:ring-2 focus:ring-farm-400 shadow-inner placeholder-gray-400"
                      />
                  </header>
                  <div className="p-6 overflow-y-auto w-full h-full min-h-[500px]" style={{ flex: '1 1 auto' }}>
                      <div className="flex flex-col gap-4">
                          {(() => {
                              const searchLower = searchAudit.toLowerCase();
                              const filteredAuditData = auditData ? auditData.filter(g => {
                                  if (!searchLower) return true;
                                  const sysMatch = (g.systemEntry?.descricao || '').toLowerCase().includes(searchLower) || String(g.systemEntry?.valor || '').includes(searchLower);
                                  const bankMatch = (g.bankTxs || []).some((t: any) => (t.description || '').toLowerCase().includes(searchLower) || String(t.amount || '').includes(searchLower));
                                  return sysMatch || bankMatch;
                              }) : [];

                              return filteredAuditData.length > 0 ? filteredAuditData.map((group, idx) => (
                              <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex-shrink-0">
                                  <div className="bg-farm-50 p-4 border-b border-farm-100 flex justify-between items-center">
                                      <div>
                                          <span className="text-[10px] font-black text-farm-600 uppercase tracking-wider">Lançamento no Sistema</span>
                                          <h4 className="font-bold text-gray-800 text-sm mt-1">{group?.systemEntry?.descricao || 'Sem descrição'}</h4>
                                          <span className="text-xs text-gray-500">{parseDate(group?.systemEntry?.data_pagamento)}</span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                          <div className={`font-black ${group?.systemEntry?.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                              {group?.systemEntry?.tipo === 'entrada' ? '+' : '-'}{Math.abs(Number(group?.systemEntry?.valor || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </div>
                                          {!isReadOnly && group?.systemEntry?.descricao !== '⚠️ Lançamentos Conciliados (Sessões Antigas ou Apagados)' && (
                                              <button
                                                  onClick={() => {
                                                      if (window.confirm("Deseja desfazer esta conciliação? Os itens voltarão para a lista principal.")) {
                                                          const txIds = group.bankTxs.map((t: any) => t.id);
                                                          setBankTransactions(prev => prev.map(t => txIds.includes(t.id) ? { ...t, status: 'unmatched', matchedSystemId: undefined } : t));
                                                          setSystemEntries(prev => prev.map(s => s.id === group.systemEntry.id ? { ...s, matched: false } : s));
                                                          setAuditData(prev => prev.filter((_, i) => i !== idx));
                                                      }
                                                  }}
                                                  className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                                                  title="Desfazer e voltar para a lista"
                                              >
                                                  Desfazer
                                              </button>
                                          )}
                                      </div>
                                  </div>
                                  <div className="p-4 bg-gray-50 flex flex-col gap-2">
                                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Itens do Extrato Vinculados ({(group?.bankTxs || []).length})</span>
                                      {(group?.bankTxs || []).map((tx: any) => (
                                          <div key={tx?.id || Math.random()} className="flex justify-between items-center bg-white p-2 rounded-xl border border-gray-100 shadow-sm text-xs">
                                              <div className="flex flex-col">
                                                  <span className="font-bold text-gray-700">{tx?.description || 'Item sem descrição'}</span>
                                                  <span className="text-[10px] text-gray-400 font-mono">{parseDate(tx?.date)}</span>
                                              </div>
                                              <div className={`font-bold ${tx?.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                                  {tx?.type === 'entrada' ? '+' : '-'}{Number(tx?.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )) : (
                              <div className="text-center p-8 text-gray-500 font-bold">
                                  {searchAudit ? 'Nenhuma conciliação encontrada com este termo.' : 'Nenhum dado encontrado para exibição.'}
                              </div>
                          );
                          })()}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {editingSysEntry && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingSysEntry(null)}></div>
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative z-10">
                  <header className="p-6 border-b bg-gray-50 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-gray-800">Ajustar Lançamento</h3>
                      <button onClick={() => setEditingSysEntry(null)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </header>
                  <form onSubmit={handleSaveSysEntry} className="p-6 space-y-4">
                      <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Descrição</label>
                          <input type="text" value={editingSysEntry.descricao} onChange={e => setEditingSysEntry({...editingSysEntry, descricao: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-farm-200" required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">Data</label>
                              <input type="date" value={editingSysEntry.data_pagamento} onChange={e => setEditingSysEntry({...editingSysEntry, data_pagamento: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-farm-200" required />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">Valor</label>
                              <input type="number" step="0.01" value={editingSysEntry.valor} onChange={e => setEditingSysEntry({...editingSysEntry, valor: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-farm-200" required />
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">Tipo</label>
                              <select value={editingSysEntry.tipo} onChange={e => setEditingSysEntry({...editingSysEntry, tipo: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-farm-200">
                                  <option value="entrada">Entrada</option>
                                  <option value="saida">Saída</option>
                              </select>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">Categoria</label>
                              <select value={editingSysEntry.categoria} onChange={e => setEditingSysEntry({...editingSysEntry, categoria: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-farm-200">
                                  {categoriesList.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                              </select>
                          </div>
                      </div>
                      <button type="submit" disabled={loading} className="w-full py-4 bg-farm-600 text-white font-bold rounded-xl hover:bg-farm-700 transition shadow-lg mt-4">
                          {loading ? 'Salvando...' : 'Salvar Ajustes'}
                      </button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};
