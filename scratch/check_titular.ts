import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTitular() {
  const profileId = 'b18c8205-749f-49ad-9722-a4e03d0e5ddb';

  console.log('Querying profiles...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();
    
  console.log('Profile:', profile?.full_name);

  if (profile) {
      console.log('Querying reservations for user_id...');
      const { data: reservations, error: resError } = await supabase
        .from('reservations')
        .select('*, estadias(*)')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(3);
        
      console.log('Recent reservations:', JSON.stringify(reservations, null, 2));
  }
}

checkTitular();
