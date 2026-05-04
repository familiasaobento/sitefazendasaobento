import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function resetRenata() {
  console.log('Resetting Renata Villar Muller...')
  
  // 1. Update guest_reservations status to pending
  const { error: updateError } = await supabase
    .from('guest_reservations')
    .update({ status: 'pending' })
    .ilike('full_name', '%Renata Villar%')

  if (updateError) {
    console.error('Error updating guest_reservations:', updateError)
    return
  }
  console.log('guest_reservations status updated to pending.')

  // 2. Delete the official reservation
  const { error: deleteError } = await supabase
    .from('reservations')
    .delete()
    .ilike('name', '%Renata Villar%')

  if (deleteError) {
    console.error('Error deleting reservation:', deleteError)
    return
  }
  console.log('Official reservation deleted.')
}

resetRenata()
