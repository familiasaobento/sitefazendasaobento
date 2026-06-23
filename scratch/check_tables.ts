import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listTables() {
  // Try to find the user in any table
  console.log('Querying other tables...');
  const tables = ['users', 'members', 'visitantes', 'dependentes', 'socios'];
  for (const table of tables) {
      const { data, error } = await supabase.from(table).select('id').limit(1);
      if (!error) {
          console.log(`Table exists: ${table}`);
      }
  }
}

listTables();
