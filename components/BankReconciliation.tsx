import React, { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { IconLoader, IconCheck, IconPlus, IconFileText, IconRefresh } from './Icons';

interface BankTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'entrada' | 'saida';
  originalRow: any;
  status: 'matched' | 'partial' | 'unmatched';
  matchedId?: number;
}

interface BankReconciliationProps {
  onReconciled: () => void;
  onClose: () => void;
}

const IconBriefcase = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
);

export const BankReconciliation: React.FC<BankReconciliationProps> = ({ onReconciled, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [matchedEntries, setMatchedEntries] = useState<any[]>([]);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [mapping, setMapping] = useState({ date: '', description: '', amount: '' });
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);

    Papa.parse(uploadedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvHeaders(results.meta.fields || []);
        setCsvData(results.data);
        
        // Try to auto-detect mapping
        const headers = results.meta.fields || [];
        const dateCol = headers.find(h => h.toLowerCase().includes('data') || h.toLowerCase().includes('date'));
        const descCol = headers.find(h => h.toLowerCase().includes('desc') || h.toLowerCase().includes('hist'));
        const valCol = headers.find(h => h.toLowerCase().includes('valor') || h.toLowerCase().includes('valor') || h.toLowerCase().includes('amount'));
        
        setMapping({
          date: dateCol || '',
          description: descCol || '',
          amount: valCol || ''
        });
      }
    });
  };

  const processReconciliation = async () => {
    if (!mapping.date || !mapping.description || !mapping.amount) {
      alert('Por favor, mapeie as colunas do extrato.');
      return;
    }

    setLoading(true);
    try {
      // 1. Load System Cash Flow for comparison
      // We'll load the last 60 days to be safe
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const { data: systemEntries } = await supabase
        .from('fluxo_caixa')
        .select('*')
        .gte('data_pagamento', sixtyDaysAgo.toISOString().split('T')[0]);

      if (!systemEntries) throw new Error('Não foi possível carregar o fluxo de caixa.');

      // 2. Map CSV to BankTransactions
      const processed: BankTransaction[] = csvData.map(row => {
        const dateStr = row[mapping.date];
        const desc = row[mapping.description];
        let amountStr = row[mapping.amount] || '0';
        
        // Sanitize amount (handle Portuguese format 1.234,56 or common 1,234.56)
        let amount = 0;
        if (typeof amountStr === 'string') {
            amountStr = amountStr.replace('R$', '').replace(/\s/g, '');
            // Handle Portuguese format 1.234,56
            if (amountStr.includes(',') && amountStr.includes('.')) {
                // Determine which is which. If comma is after dot, it's decimal.
                if (amountStr.lastIndexOf(',') > amountStr.lastIndexOf('.')) {
                    amountStr = amountStr.replace(/\./g, '').replace(',', '.');
                } else {
                    amountStr = amountStr.replace(/,/g, '');
                }
            } else if (amountStr.includes(',')) {
                amountStr = amountStr.replace(',', '.');
            }
            amount = parseFloat(amountStr.replace(/[^-0-9.]/g, ''));
        } else {
            amount = Number(amountStr);
        }

        const type = amount >= 0 ? 'entrada' : 'saida';
        const absAmount = Math.abs(amount);

        // Try to find a match in systemEntries
        // Match criteria: Same absolute amount and date within 3 days
        const bankDate = new Date(dateStr);
        
        let match = systemEntries.find(sys => {
            const sysDate = new Date(sys.data_pagamento);
            const diffDays = Math.abs((bankDate.getTime() - sysDate.getTime()) / (1000 * 3600 * 24));
            return Math.abs(Number(sys.valor) - absAmount) < 0.01 && diffDays <= 3 && sys.tipo === type;
        });

        return {
          date: dateStr,
          description: desc,
          amount: absAmount,
          type,
          originalRow: row,
          status: match ? 'matched' : 'unmatched',
          matchedId: match?.id
        };
      });

      setBankTransactions(processed);
      setStep('review');
    } catch (err: any) {
      alert('Erro no processamento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEntry = async (tx: BankTransaction) => {
    setLoading(true);
    try {
      const parseDate = (d: string) => {
        if (!d) return new Date().toISOString().split('T')[0];
        if (d.includes('/')) {
            const parts = d.split('/');
            if (parts[0].length === 4) return d.replace(/\//g, '-'); // YYYY/MM/DD
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`; // DD/MM/YYYY
        }
        return d;
      };

      const { error } = await supabase
        .from('fluxo_caixa')
        .insert({
          tipo: tx.type,
          valor: tx.amount,
          data_pagamento: parseDate(tx.date),
          descricao: `[EXTRATO] ${tx.description}`,
          categoria: 'Geral' // Default category
        });

      if (error) throw error;
      
      // Update local state to reflect it's now "matched" (simulated)
      setBankTransactions(prev => prev.map(t => t === tx ? { ...t, status: 'matched' } : t));
      onReconciled();
    } catch (err: any) {
      alert('Erro ao criar lançamento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
      <header className="p-8 border-b flex justify-between items-center bg-farm-900 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-3 rounded-2xl">
            <IconBriefcase className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-serif italic text-farm-50">Conciliação Bancária</h3>
            <p className="text-farm-200 text-xs">Ajuste seu fluxo de caixa com o extrato real.</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {step === 'upload' ? (
          <div className="max-w-xl mx-auto space-y-8 py-12">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-farm-50 rounded-full flex items-center justify-center mx-auto mb-6">
                 <IconFileText className="w-10 h-10 text-farm-600" />
              </div>
              <h4 className="text-xl font-bold text-gray-800">Upload do Extrato</h4>
              <p className="text-gray-500 text-sm">Arraste ou selecione o arquivo CSV exportado do seu banco.</p>
            </div>

            <label className="block border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center hover:border-farm-400 transition-colors cursor-pointer group">
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              <div className="space-y-2">
                <span className="text-farm-700 font-bold block group-hover:scale-110 transition-transform">{file ? file.name : 'Selecionar Arquivo CSV'}</span>
                <span className="text-gray-400 text-xs italic">Apenas arquivos .csv são suportados no momento.</span>
              </div>
            </label>

            {file && (
              <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 space-y-6 animate-fade-in">
                <h5 className="font-bold text-gray-700 text-sm uppercase tracking-widest">Mapeamento de Colunas</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Coluna de Data</label>
                    <select value={mapping.date} onChange={e => setMapping({...mapping, date: e.target.value})} className="w-full p-3 border rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-farm-500">
                      <option value="">Selecione...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Coluna de Descrição</label>
                    <select value={mapping.description} onChange={e => setMapping({...mapping, description: e.target.value})} className="w-full p-3 border rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-farm-500">
                      <option value="">Selecione...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Coluna de Valor</label>
                    <select value={mapping.amount} onChange={e => setMapping({...mapping, amount: e.target.value})} className="w-full p-3 border rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-farm-500">
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
                  {loading ? 'Processando dados...' : 'Conciliar Agora'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center mb-6">
               <h4 className="text-xl font-bold text-gray-800 italic font-serif">Conferência do Extrato</h4>
               <div className="flex gap-2">
                 <button onClick={() => setStep('upload')} className="px-4 py-2 border rounded-xl text-sm font-bold hover:bg-gray-50">Voltar</button>
                 <button onClick={processReconciliation} className="px-4 py-2 bg-farm-50 text-farm-700 rounded-xl text-sm font-bold flex items-center gap-2">
                   <IconRefresh className="w-4 h-4" /> Atualizar Match
                 </button>
               </div>
             </div>

             <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold">Data Extrato</th>
                      <th className="px-6 py-3 font-semibold">Descrição</th>
                      <th className="px-6 py-3 font-semibold text-right">Valor</th>
                      <th className="px-6 py-3 font-semibold text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bankTransactions.map((tx, idx) => (
                      <tr key={idx} className={`hover:bg-gray-50 transition-colors ${tx.status === 'matched' ? 'bg-green-50/30' : ''}`}>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            tx.status === 'matched' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {tx.status === 'matched' ? 'Conciliado' : 'Ausente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{tx.date}</td>
                        <td className="px-6 py-4">
                           <div className="font-bold text-gray-800 max-w-xs truncate">{tx.description}</div>
                        </td>
                        <td className={`px-6 py-4 text-right font-black ${tx.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'entrada' ? '+' : '-'} {tx.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {tx.status === 'matched' ? (
                            <span className="text-green-500 font-bold text-xs flex items-center justify-center gap-1">
                              <IconCheck className="w-4 h-4" /> OK
                            </span>
                          ) : (
                            <button 
                              onClick={() => handleCreateEntry(tx)}
                              className="px-4 py-1.5 bg-farm-100 text-farm-700 rounded-lg text-xs font-bold hover:bg-farm-600 hover:text-white transition-all"
                            >
                              Lançar no Caixa
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}
      </div>

      <footer className="p-6 bg-gray-50 border-t flex justify-end gap-4 text-xs text-gray-400">
        <p>A conciliação localiza lançamentos com o mesmo valor e data aproximada (±3 dias).</p>
      </footer>
    </div>
  );
};
