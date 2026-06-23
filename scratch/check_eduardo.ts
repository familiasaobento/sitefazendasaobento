import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkConsumos() {
  const { data, error } = await supabase
    .from('lancamentos_consumo')
    .select('*')
    .limit(1);
    
  console.log('Sample lancamento:', data, error);
}

checkConsumos();
