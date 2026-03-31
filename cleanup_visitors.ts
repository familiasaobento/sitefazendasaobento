import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function cleanupVisitors() {
    console.log('--- Cleaning up Visitor Data ---');

    // 1. Delete transactions and stays related to visitors
    // We'll just delete ALL test data from those tables to be safe as previously requested
    const tables = [
        'fluxo_caixa',
        'lancamentos_consumo',
        'estadias',
        'reservations',
        'guest_reservations',
        'notificacoes_admin'
    ];

    for (const table of tables) {
        const { error } = await supabase.from(table).delete().neq('id', 'placeholder_id_that_does_not_exist');
        if (error) console.error(`Error cleaning ${table}:`, error.message);
        else console.log(`Table ${table} cleaned.`);
    }

    // 2. Identify visitor users in Auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
        console.error('Error listing users:', listError.message);
        return;
    }

    const visitors = users.filter(u => u.user_metadata?.role === 'visitor' || u.email?.includes('teste'));
    console.log(`Found ${visitors.length} visitor users to delete.`);

    for (const user of visitors) {
        // Delete profile first (though it might have cascade if setup)
        await supabase.from('profiles').delete().eq('id', user.id);
        
        // Delete auth user
        const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
        if (delError) console.error(`Error deleting user ${user.email}:`, delError.message);
        else console.log(`User ${user.email} deleted.`);
    }

    // 3. Delete profiles with role 'visitor' just in case
    const { error: profileError } = await supabase.from('profiles').delete().eq('role', 'visitor');
    if (profileError) console.error('Error cleaning visitor profiles:', profileError.message);

    console.log('--- Cleanup Finished ---');
}

cleanupVisitors();
