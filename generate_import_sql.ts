import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname since we are in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase credentials (fallback to the project credentials in lib/supabase.ts)
let supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
let supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';

// Check if credentials exist in .env.local
const envLocalPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
    const envLocal = fs.readFileSync(envLocalPath, 'utf-8');
    const matchedUrl = envLocal.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
    const matchedKey = envLocal.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
    if (matchedUrl) supabaseUrl = matchedUrl;
    if (matchedKey) supabaseAnonKey = matchedKey;
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function parseDateFromBR(dateStr: string) {
    if (!dateStr || dateStr.trim() === '') return null;
    const cleanStr = dateStr.trim().split(' ')[0];
    const parts = cleanStr.split('/');
    if (parts.length === 3) {
        // dd/mm/yyyy -> yyyy-mm-dd
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const ymdParts = cleanStr.split('-');
    if (ymdParts.length === 3) {
        return cleanStr; // already yyyy-mm-dd
    }
    return null;
}

function parseCurrency(valorStr: string) {
    if (!valorStr || valorStr.trim() === '') return 0;
    let v = valorStr.replace(/[R$\s]/g, '').trim();
    if (v.includes(',') && v.includes('.')) {
        v = v.replace(/\./g, '').replace(',', '.');
    } else if (v.includes(',')) {
        v = v.replace(',', '.');
    }
    return parseFloat(v) || 0;
}

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

async function doGenerate() {
    const csvPath = path.join(__dirname, 'consumos.csv');
    if (!fs.existsSync(csvPath)) {
        console.error('Arquivo consumos.csv não encontrado na pasta atual!');
        console.log('Por favor, crie o arquivo consumos.csv e tente novamente.');
        return;
    }

    console.log('Buscando lista de produtos cadastrados no sistema para mapeamento...');
    const { data: dbProducts, error: prodError } = await supabase
        .from('products')
        .select('id, name');

    if (prodError) {
        console.error('Erro ao buscar produtos do banco de dados:', prodError);
        return;
    }

    const productMap = new Map<string, number>();
    dbProducts?.forEach(p => {
        productMap.set(normalizeText(p.name), p.id);
    });

    console.log(`Carregados ${productMap.size} produtos para mapeamento.`);

    const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
    const sqlValues: string[] = [];
    let matchedCount = 0;
    let fallbackCount = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const cols = line.split(';');
        if (cols.length < 4) {
            console.warn(`Linha ${i + 1} ignorada (colunas insuficientes): "${line}"`);
            continue;
        }

        const dateStr = cols[0] || '';
        const productName = (cols[1] || '').trim();
        const quantityStr = cols[2] || '0';
        const priceStr = cols[3] || '0';

        if (!productName) continue;

        const parsedDate = parseDateFromBR(dateStr);
        const quantity = parseFloat(quantityStr.replace(',', '.')) || 0;
        const unitPrice = parseCurrency(priceStr);

        const normalized = normalizeText(productName);
        const itemId = productMap.get(normalized) || null;

        if (itemId) {
            matchedCount++;
        } else {
            fallbackCount++;
        }

        // Sanitize strings for SQL
        const safeProductName = productName.replace(/'/g, "''");
        const safeDate = parsedDate ? `'${parsedDate}T12:00:00Z'` : 'NULL';
        const safeItemId = itemId ? itemId : 'NULL';

        sqlValues.push(`(null, ${safeItemId}, '${safeProductName}', ${quantity}, ${unitPrice}, true, true, ${safeDate}, 'Importado do sistema antigo')`);
    }

    if (sqlValues.length === 0) {
        console.log('Nenhum registro encontrado para gerar SQL.');
        return;
    }

    const sqlScript = `INSERT INTO public.lancamentos_consumo (estadia_id, item_id, nome_item_snapshot, quantidade, valor_unitario_aplicado, pago, aprovado_admin, created_at, observacoes) VALUES\n${sqlValues.join(',\n')};`;

    const sqlOutputPath = path.join(__dirname, 'import.sql');
    fs.writeFileSync(sqlOutputPath, sqlScript, 'utf-8');

    console.log(`\nResumo da leitura do CSV:`);
    console.log(`- Total de linhas lidas: ${sqlValues.length}`);
    console.log(`- Mapeado com produtos cadastrados: ${matchedCount}`);
    console.log(`- Usando nome provisório (não cadastrado): ${fallbackCount}`);
    console.log(`Script SQL gerado com sucesso em: ${sqlOutputPath}`);
}

doGenerate();
