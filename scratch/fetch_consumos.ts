import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fetchConsumos() {
  const { data, error } = await supabase
    .from('lancamentos_consumo')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
    
  console.log('Recent consumos:', data, error);
}

fetchConsumos();
