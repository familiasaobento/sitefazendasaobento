import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    console.log("Payload recebido do Control iD:", JSON.stringify(payload));

    const logs = payload.access_logs || [];
    if (logs.length === 0) {
        return new Response(JSON.stringify({ status: "success", message: "No access logs to process" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    const deviceId = payload.device_id;

    for (const log of logs) {
        const userId = log.user_id;
        if (!userId) continue;

        // ==========================================
        // PORTA B: RELÓGIO DE PONTO (ID 8888)
        // ==========================================
        if (deviceId == 8888) {
            // Busca o funcionário
            const { data: employees, error: empError } = await supabaseClient
                .from('employees')
                .select('id, name')
                .eq('controlid_id', String(userId));

            if (empError || !employees || employees.length === 0) {
                console.log(`Ponto ignorado: FaceID ${userId} não pertence a nenhum funcionário.`);
                continue;
            }

            const employee = employees[0];

            // Busca as batidas de hoje para deduzir o próximo status
            const todayStr = new Date().toISOString().split('T')[0];
            const startOfDay = `${todayStr}T00:00:00Z`;
            const endOfDay = `${todayStr}T23:59:59Z`;

            const { data: todaysEntries } = await supabaseClient
                .from('time_entries')
                .select('entry_type')
                .eq('employee_id', employee.id)
                .gte('timestamp', startOfDay)
                .lte('timestamp', endOfDay)
                .order('timestamp', { ascending: true });

            let nextEntryType = 'entrada';
            if (todaysEntries && todaysEntries.length > 0) {
                const lastEntry = todaysEntries[todaysEntries.length - 1].entry_type;
                if (lastEntry === 'entrada') nextEntryType = 'saida_intervalo';
                else if (lastEntry === 'saida_intervalo') nextEntryType = 'retorno_intervalo';
                else if (lastEntry === 'retorno_intervalo') nextEntryType = 'saida';
                else if (lastEntry === 'saida') nextEntryType = 'entrada'; // Se o cara fizer hora extra depois de sair
            }

            const { error: insertPontoError } = await supabaseClient
                .from('time_entries')
                .insert({
                    employee_id: employee.id,
                    entry_type: nextEntryType,
                    timestamp: new Date().toISOString(),
                    location: 'Escritório (Biometria)'
                });

            if (insertPontoError) {
                console.error("Erro ao inserir ponto:", insertPontoError);
            } else {
                console.log(`Sucesso: Ponto de ${employee.name} registrado como ${nextEntryType}.`);
            }

            continue; // Pula a lógica de restaurante e vai pro próximo log
        }

        // ==========================================
        // PORTA A: RESTAURANTE (ID 9999)
        // ==========================================
        if (deviceId == 9999) {
            // 1. Busca Estadia Ativa vinculada a esse Face ID
            const { data: estadias, error: estadiaError } = await supabaseClient
                .from('estadias')
                .select('id, hospede_nome, reserva_id')
                .eq('status', 'ativa')
                .eq('controlid_id', String(userId));

            if (estadiaError || !estadias || estadias.length === 0) {
                console.log(`FaceID ${userId} ignorado no restaurante: nenhuma estadia ativa encontrada.`);
                continue;
            }

            const estadia = estadias[0];

            // 2. Lógica de Horário para Restaurante (Fuso Horário BRT UTC-3)
            const now = new Date();
            const brazilTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
            const hour = brazilTime.getUTCHours();
            const minutes = brazilTime.getUTCMinutes();
            const timeVal = hour + (minutes / 60);

            let productNameToSearch = null;

            if (timeVal >= 11.5 && timeVal <= 15.5) {
                productNameToSearch = 'Almoço';
            } else if (timeVal >= 18.0 && timeVal <= 22.5) {
                productNameToSearch = 'Jantar';
            }

            if (!productNameToSearch) {
                 console.log(`FaceID ${userId} reconhecido no restaurante, mas fora do horário de refeições (${hour}:${minutes}).`);
                 continue;
            }

            // 3. Busca o preço atual do produto
            const { data: produtos } = await supabaseClient
                .from('produtos')
                .select('id, nome, preco')
                .ilike('nome', `%${productNameToSearch}%`)
                .limit(1);

            if (!produtos || produtos.length === 0) {
                console.log(`Produto ${productNameToSearch} não encontrado no banco de dados.`);
                continue;
            }

            const produto = produtos[0];

            // 4. Grava o consumo
            const { error: insertConsumoError } = await supabaseClient
                .from('lancamentos_consumo')
                .insert({
                    estadia_id: estadia.id,
                    item_tipo: 'produto',
                    item_id: produto.id,
                    descricao: `Buffet de ${productNameToSearch} (Reconhecimento Facial)`,
                    quantidade: 1,
                    valor_unitario: produto.preco,
                    data_hora: new Date().toISOString()
                });

            if (insertConsumoError) {
                 console.error("Erro ao inserir consumo:", insertConsumoError);
            } else {
                 console.log(`Sucesso: ${productNameToSearch} cobrado na conta de ${estadia.hospede_nome} (Estadia ${estadia.id})`);
            }
        }
    }

    return new Response(JSON.stringify({ status: "success" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Erro ao processar webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
