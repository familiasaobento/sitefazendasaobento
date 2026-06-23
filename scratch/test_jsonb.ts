import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testJsonb() {
  const userId = '153752';
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .contains('dependents', `[{"controlid_id": "${userId}"}]`);
    
  console.log('Error if any:', error);
}

testJsonb();
