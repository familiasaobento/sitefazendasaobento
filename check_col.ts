import { supabase } from './lib/supabase';

async function checkReconciledColumn() {
  const { data, error } = await supabase
    .from('fluxo_caixa')
    .select('reconciliado')
    .limit(1);

  if (error && error.message.includes('column "reconciliado" does not exist')) {
    console.log('COLUMN_MISSING');
  } else if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('COLUMN_EXISTS');
  }
}

checkReconciledColumn();
