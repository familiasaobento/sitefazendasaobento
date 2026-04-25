import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Carregar variáveis de ambiente (simulação básica)
const envLocal = fs.readFileSync('.env.local', 'utf-8');
const VITE_SUPABASE_URL = envLocal.match(/VITE_SUPABASE_URL=(.*)/)?.[1] || '';
const VITE_SUPABASE_ANON_KEY = envLocal.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1] || '';

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

function parseDateFromBR(dateStr) {
    if (!dateStr || dateStr.trim() === '') return null;
    // Assume dd/mm/yyyy hh:mm or dd/mm/yyyy
    const parts = dateStr.trim().split(' ')[0].split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return null; // fallback
}

function parseCurrency(valorStr) {
    if (!valorStr || valorStr.trim() === '') return 0;
    // Handle 'R$ 1.234,56' or '1234.56'
    let v = valorStr.replace(/[R$\s]/g, '').trim();
    if (v.includes(',') && v.includes('.')) {
        v = v.replace(/\./g, '').replace(',', '.');
    } else if (v.includes(',')) {
        v = v.replace(',', '.');
    }
    return parseFloat(v) || 0;
}

async function doImport() {
    const filePath = path.join(__dirname, 'planilha.csv');
    if (!fs.existsSync(filePath)) {
        console.error('Arquivo planilha.csv não encontrado na pasta atual!');
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const header = lines[0].split(';'); // Adjust separator if needed
    
    // We assume columns ordered or we can find by index, but let's assume they might be in any order if we use header.
    // Or we just expect the CSV to have the columns exactly as he said.

    const payloads = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        // assuming standard semicolon separator
        const cols = line.split(';');
        if (cols.length < 8) continue; // Skip bad lines

        // Mapping based on user description:
        // tipo (receita, despesa, transferencias), conclusão (pago/aberto), conta (caixa/banco), forma, descrição, vencimento, valor, atualizadoem, criado em, criado por, empresa
        
        // Since we don't know the exact column order, let's assume a generic index based on order mentioned:
        // 0: tipo
        // 1: conclusão
        // 2: conta
        // 3: forma
        // 4: descrição
        // 5: vencimento
        // 6: valor
        // 7: atualizadoem
        // 8: criado em
        // 9: criado por
        // 10: empresa
        
        // If the order is different, we can match by header later if they provide the exact file.

        const tipoStr = (cols[0] || '').toLowerCase();
        let tipo = 'saida';
        if (tipoStr.includes('receita') || tipoStr.includes('entrada')) tipo = 'entrada';

        const conclusaoStr = (cols[1] || '').toLowerCase();
        let status = 'pendente';
        let data_aprovacao = null;
        if (conclusaoStr.includes('pago') || conclusaoStr.includes('conclu')) {
            status = 'aprovado';
            data_aprovacao = parseDateFromBR(cols[8] || cols[5]); // Aprovação no criado_em ou vencimento
        }

        const contaStr = (cols[2] || '').toLowerCase();
        let meio_pagamento = 'Banco';
        if (contaStr.includes('caixa') || contaStr.includes('dinheiro')) meio_pagamento = 'Dinheiro';

        const forma = cols[3] || 'Outros';
        const descricao = cols[4] || 'Sem descrição';
        const vencimento = parseDateFromBR(cols[5]);
        const valor = Math.abs(parseCurrency(cols[6]));
        const criadoEm = parseDateFromBR(cols[8]) || new Date().toISOString().split('T')[0];
        const empresa = cols[10] || '';

        payloads.push({
            tipo,
            categoria: 'Geral', // Default, maybe we could map 'empresa' to category
            valor,
            data_pagamento: criadoEm,
            data_vencimento: vencimento,
            descricao: descricao,
            meio_pagamento,
            conta_origem: meio_pagamento === 'Banco' ? 'Banco Padrão' : 'Caixa Físico', // Placeholder
            forma_pagamento: forma,
            status,
            data_aprovacao,
            observacoes: `Empresa/Contato original: ${empresa}`,
            projeto: empresa // We can put 'empresa' as project or observacoes
        });
    }

    console.log(`Lidas ${payloads.length} linhas válidas. Importando...`);

    // Insert in batches of 50
    for(let i = 0; i < payloads.length; i += 50) {
        const batch = payloads.slice(i, i + 50);
        const { error } = await supabase.from('fluxo_caixa').insert(batch);
        if (error) {
            console.error('Erro ao importar lote:', error);
        } else {
            console.log(`Lote ${i/50 + 1} importado com sucesso!`);
        }
    }

    console.log('Importação concluída!');
}

doImport();
