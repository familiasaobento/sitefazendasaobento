import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDevices() {
  const { data, error } = await supabase
    .from('idface_dispositivos')
    .select('*');
    
  console.log('Devices:', data, error);
}

checkDevices();
