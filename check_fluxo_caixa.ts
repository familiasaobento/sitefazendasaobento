import { supabase } from './lib/supabase';

async function checkColumns() {
  const { data, error } = await supabase
    .from('fluxo_caixa')
    .select('*')
    .limit(1);

  if (error) {
    console.error(error);
  } else {
    console.log(Object.keys(data[0] || {}));
  }
}

checkColumns();
