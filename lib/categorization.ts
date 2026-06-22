import { supabase } from './supabase';

export interface PredictedData {
    categoria: string | null;
    cnpj_fornecedor: string | null;
    tags: string | null;
    projeto: string | null;
}

/**
 * Busca transações passadas similares e retorna a categoria, fornecedor, tags e projeto mais prováveis.
 */
export async function predictTransactionData(descricao: string, tipo: string): Promise<PredictedData | null> {
    if (!descricao) return null;
    
    // 1. Limpa e seleciona as palavras principais (maiores que 3 caracteres)
    const words = descricao.replace(/[^a-zA-Z0-9À-ÿ\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return null;

    const searchWords = words.slice(0, 3).join(' ');

    try {
        // Tenta buscar no histórico recente usando textSearch nas palavras principais
        const { data: textSearchData, error } = await supabase
            .from('fluxo_caixa')
            .select('categoria, cnpj_fornecedor, tags, projeto')
            .eq('tipo', tipo)
            .textSearch('descricao', searchWords.split(' ').join(' | '))
            .not('categoria', 'is', null)
            .order('data_pagamento', { ascending: false })
            .limit(1);

        if (!error && textSearchData && textSearchData.length > 0) {
            return textSearchData[0] as PredictedData;
        }

        // 2. Fallback: Busca via ilike para a primeira palavra significativa
        const firstWord = words[0];
        const { data: ilikeData } = await supabase
            .from('fluxo_caixa')
            .select('categoria, cnpj_fornecedor, tags, projeto')
            .eq('tipo', tipo)
            .ilike('descricao', `%${firstWord}%`)
            .not('categoria', 'is', null)
            .order('data_pagamento', { ascending: false })
            .limit(1);

        if (ilikeData && ilikeData.length > 0) {
            return ilikeData[0] as PredictedData;
        }

        return null;
    } catch (e) {
        console.error('Error predicting transaction data:', e);
        return null;
    }
}
