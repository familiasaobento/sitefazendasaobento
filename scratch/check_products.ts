import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price')
    .ilike('name', '%Jantar%');
    
  console.log('Jantar products:', data, error);
}

checkProducts();
