import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nxnxqwmqeujaiuqajmhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_cwUxYYciPE3BdNGhN-w_RA_3I6BaSBJ';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

async function simulateWebhook() {
  const userId = '153752';
  const pdvId = 2;

  console.log(`[Simulação] Face ID: ${userId}, PDV: ${pdvId}`);

  let { data: estadias, error: estadiaError } = await supabaseClient
    .from('estadias')
    .select('id, hospede_nome, reserva_id')
    .eq('status', 'ativa')
    .eq('controlid_id', String(userId));

  let estadia = estadias && estadias.length > 0 ? estadias[0] : null;

  if (!estadia) {
    console.log('Não achou estadia direta. Buscando profile...');
    let titularId = null;
    let personName = null;

    const { data: titularProfile } = await supabaseClient
      .from('profiles')
      .select('id, full_name')
      .eq('controlid_id', String(userId));

    if (titularProfile && titularProfile.length > 0) {
      titularId = titularProfile[0].id;
      personName = titularProfile[0].full_name;
      console.log('Encontrou como titular:', personName);
    } else {
      const { data: depProfile, error: errDep } = await supabaseClient
        .from('profiles')
        .select('id, dependents')
        .contains('dependents', `[{"controlid_id": "${String(userId)}"}]`);
        
      if (errDep) console.error('Error fetching dep:', errDep);

      if (depProfile && depProfile.length > 0) {
        titularId = depProfile[0].id;
        const deps = depProfile[0].dependents || [];
        const matchedDep = deps.find((d: any) => String(d.controlid_id) === String(userId));
        if (matchedDep) personName = matchedDep.name;
        console.log('Encontrou como dependente:', personName, 'do titular', titularId);
      } else {
        console.log('Não encontrou nenhum profile (titular ou dependente)');
      }
    }

    if (titularId) {
      const { data: reservas } = await supabaseClient
        .from('reservations')
        .select('id')
        .eq('user_id', titularId)
        .in('status', ['confirmed', 'em_curso'])
        .order('created_at', { ascending: false })
        .limit(1);

      console.log('Reservas do titular:', reservas);

      if (reservas && reservas.length > 0) {
        const reservaId = reservas[0].id;
        const { data: titularEstadias } = await supabaseClient
          .from('estadias')
          .select('id, hospede_nome, reserva_id')
          .eq('reserva_id', reservaId)
          .eq('status', 'ativa');

        console.log('Estadias ativas da reserva:', titularEstadias);

        if (titularEstadias && titularEstadias.length > 0) {
          const estadiaMatch = titularEstadias.find((e: any) => 
            e.hospede_nome && personName && e.hospede_nome.toLowerCase().includes(personName.toLowerCase())
          );
          estadia = estadiaMatch || titularEstadias[0];
          console.log(`[Restaurante] FaceID resolvido via Profile. Usuário: ${personName} -> Estadia ${estadia.id} (${estadia.hospede_nome})`);
        }
      }
    }
  }

  if (!estadia) {
    console.log(`FaceID ${userId} ignorado no restaurante: nenhuma estadia ativa ou reserva encontrada.`);
    return;
  }
  
  console.log('Tudo certo! Vai inserir consumo na estadia', estadia.id);
}

simulateWebhook();
