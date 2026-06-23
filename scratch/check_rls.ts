import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
// Since I don't have the service role key, I will query as the admin user.
// But wait, the admin user is logged in the web app, not here.
// Let's just check if lancamentos_consumo has RLS:
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

async function checkRLS() {
  const { data, error } = await supabaseClient
    .from('lancamentos_consumo')
    .select('id')
    .limit(1);
    
  console.log('Consumos:', data, error);
}

checkRLS();
