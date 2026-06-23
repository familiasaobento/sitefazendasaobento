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

    // Log every request
    await supabaseClient.from('webhook_logs').insert({ log: `[START] Webhook acionado: ${req.method} url: ${req.url}` });

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const url = new URL(req.url);
    const path = url.pathname;
    const isPush = path.endsWith('/push');
    const isResult = path.endsWith('/result');

    // ==========================================
    // ROTA /push (GET): O dispositivo busca comandos
    // ==========================================
    if (isPush) {
      const deviceId = url.searchParams.get("deviceId") || url.searchParams.get("device_id");
      if (!deviceId) {
        return new Response(JSON.stringify({ error: "Missing deviceId" }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Consulta a tabela de comandos para ver se há alguma captura facial pendente para esse número de série
      const { data: commands, error: cmdError } = await supabaseClient
        .from('controlid_commands')
        .select('*')
        .eq('device_id', String(deviceId))
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

      if (cmdError) {
        console.error("Erro ao buscar comandos pendentes:", cmdError);
        return new Response(null, { status: 200, headers: corsHeaders });
      }

      if (!commands || commands.length === 0) {
        return new Response(null, { status: 200, headers: corsHeaders });
      }

      const command = commands[0];
      const metadata = command.metadata || {};

      // INTERCEPTAÇÃO: Se o comando for de biometria facial ('remote_enroll.fcgi') e o
      // usuário ainda não estiver cadastrado no leitor, nós criamos o usuário primeiro.
      if (command.command === 'remote_enroll.fcgi' && !metadata.user_created) {
        let userName = "Usuario Fazenda";
        try {
          if (metadata.target_type === 'member') {
            const { data: p } = await supabaseClient
              .from('profiles')
              .select('full_name')
              .eq('id', metadata.target_id)
              .single();
            if (p?.full_name) userName = p.full_name;
          } else if (metadata.target_type === 'dependent') {
            userName = metadata.dependent_name || "Dependente Fazenda";
          } else if (metadata.target_type === 'visitor_checkin') {
            userName = metadata.guest_name || "Visitante Fazenda";
          }
        } catch (e) {
          console.log("Erro ao buscar nome do usuário para criação remota:", e.message);
        }

        // Marca como enviado e registra nas metadados que enviamos o create_objects.fcgi
        await supabaseClient
          .from('controlid_commands')
          .update({ 
            status: 'sent', 
            metadata: { ...metadata, sent_command: 'create_objects' },
            updated_at: new Date().toISOString()
          })
          .eq('id', command.id);

        const responsePayload = {
          uuid: command.id,
          verb: "POST",
          endpoint: "create_objects",
          body: {
            object: "users",
            values: [
              {
                id: command.params.user_id,
                name: userName.substring(0, 30), // iDFace limita tamanho do nome
                registration: String(command.params.user_id)
              }
            ]
          }
        };

        console.log(`[Push Intercept] Criando usuário ${userName} (ID ${command.params.user_id}) antes da captura facial.`);
        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fluxo normal: Envia o comando real (remote_enroll.fcgi)
      await supabaseClient
        .from('controlid_commands')
        .update({ 
          status: 'sent', 
          metadata: { ...metadata, sent_command: command.command },
          updated_at: new Date().toISOString()
        })
        .eq('id', command.id);

      // O iDFace Push API não usa a extensão .fcgi no endpoint
      let endpointName = command.command;
      if (endpointName.endsWith('.fcgi')) {
        endpointName = endpointName.replace('.fcgi', '');
      }

      const responsePayload = {
        uuid: command.id,
        verb: "POST",
        endpoint: endpointName,
        body: command.params
      };

      console.log(`Comando enviado para o iDFace (${deviceId}):`, JSON.stringify(responsePayload));
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==========================================
    // ROTA /result (POST): O dispositivo retorna o resultado da execução do comando
    // ==========================================
    if (isResult) {
      let payload: any = {};

      try {
        const rawText = await req.text();
        console.log("Raw body received in /result:", rawText);
        if (rawText) {
          const trimmed = rawText.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            payload = JSON.parse(trimmed);
          } else {
            // Parses form-urlencoded
            const params = new URLSearchParams(trimmed);
            for (const [key, value] of params.entries()) {
              if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                  payload[key] = JSON.parse(value);
                } catch {
                  payload[key] = value;
                }
              } else {
                payload[key] = value;
              }
            }
          }
        }
      } catch (e) {
        console.error("Erro ao ler/parsear corpo do result:", e.message);
      }

      console.log("Resultado de comando recebido do iDFace (Parsed):", JSON.stringify(payload));

      const uuid = payload.uuid || url.searchParams.get("uuid");
      const deviceId = url.searchParams.get("deviceId") || url.searchParams.get("device_id");

      if (!uuid && !deviceId) {
        return new Response(JSON.stringify({ error: "Missing uuid and deviceId" }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      let commands: any[] | null = null;
      let cmdError = null;

      if (uuid && uuid.length > 20) {
        // Tenta buscar pelo UUID real do comando, caso o aparelho envie
        const res = await supabaseClient
          .from('controlid_commands')
          .select('*')
          .eq('id', uuid)
          .limit(1);
        commands = res.data;
        cmdError = res.error;
      }

      if (!commands || commands.length === 0) {
        if (deviceId) {
          // Fallback: Busca o último comando com status 'sent' para este dispositivo
          // (pois o iDFace manda um UUID de sessão curto no result, e não o UUID do comando)
          const res = await supabaseClient
            .from('controlid_commands')
            .select('*')
            .eq('device_id', String(deviceId))
            .eq('status', 'sent')
            .order('updated_at', { ascending: false })
            .limit(1);
          commands = res.data;
          cmdError = res.error;
        }
      }

      if (cmdError || !commands || commands.length === 0) {
        console.error(`Comando ${uuid} não foi localizado ou erro no banco:`, cmdError);
        return new Response(null, { status: 200, headers: corsHeaders });
      }

      const command = commands[0];
      const metadata = command.metadata || {};
      const executedEndpoint = payload.endpoint || url.searchParams.get("endpoint") || metadata.sent_command || command.command;

      // INTERCEPTAÇÃO: Se o leitor acabou de processar a criação de usuário
      if (executedEndpoint === 'create_objects' || executedEndpoint === 'create_objects.fcgi') {
        const isSuccess = !payload.error && (payload.response || url.searchParams.get("error") === null);
        const errorMsg = payload.error || url.searchParams.get("error") || "";

        if (isSuccess) {
          console.log(`[Result Intercept] Usuário criado com sucesso no iDFace. Avançando para a captura facial...`);
          // Reseta o comando para pendente e marca que o usuário foi criado para enviar o enroll na próxima consulta
          await supabaseClient
            .from('controlid_commands')
            .update({ 
              status: 'pending', 
              metadata: { ...metadata, user_created: true },
              updated_at: new Date().toISOString()
            })
            .eq('id', command.id);
        } else {
          console.error(`[Result Intercept] Falha ao criar usuário no leitor: ${errorMsg}`);
          
          // Se falhou porque o usuário já existe (ID duplicado), podemos prosseguir direto para o enroll!
          const isUserAlreadyExists = errorMsg.includes("already") || 
                                     errorMsg.includes("duplicate") || 
                                     errorMsg.includes("primary") || 
                                     errorMsg.includes("unique") || 
                                     errorMsg.includes("existe") || 
                                     errorMsg.includes("Constraint");

          if (isUserAlreadyExists) {
            console.log(`[Result Intercept] Usuário já existe no iDFace. Prosseguindo para o enroll.`);
            await supabaseClient
              .from('controlid_commands')
              .update({ 
                status: 'pending', 
                metadata: { ...metadata, user_created: true },
                updated_at: new Date().toISOString()
              })
              .eq('id', command.id);
          } else {
            // Falha real (rede, etc.): marca o comando como falho
            await supabaseClient
              .from('controlid_commands')
              .update({ 
                status: 'failed', 
                error: errorMsg, 
                updated_at: new Date().toISOString() 
              })
              .eq('id', command.id);
          }
        }

        return new Response(null, { status: 200, headers: corsHeaders });
      }

      // Caso normal: Resposta final do remote_enroll.fcgi
      const isSuccess = !payload.error && (payload.response || url.searchParams.get("error") === null);

      if (isSuccess) {
        await supabaseClient
          .from('controlid_commands')
          .update({ 
            status: 'success', 
            metadata: { ...metadata, response_payload: payload },
            updated_at: new Date().toISOString() 
          })
          .eq('id', command.id);

        const targetType = metadata.target_type;
        const targetId = metadata.target_id;
        const faceId = String(command.params.user_id);

        if (targetType === 'member' && targetId) {
          const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({ controlid_id: faceId })
            .eq('id', targetId);

          if (profileError) console.error("Erro ao salvar ID no perfil do sócio:", profileError);
          else console.log(`Sucesso: ID Facial ${faceId} associado ao sócio titular ${targetId}`);

        } else if (targetType === 'dependent' && metadata.parent_id && metadata.dependent_name) {
          const { data: profileData, error: profileFetchError } = await supabaseClient
            .from('profiles')
            .select('dependents')
            .eq('id', metadata.parent_id)
            .single();

          if (!profileFetchError && profileData) {
            let deps = profileData.dependents;
            if (Array.isArray(deps)) {
              deps = deps.map((d: any) => {
                if (d.name === metadata.dependent_name) {
                  return { ...d, controlid_id: faceId };
                }
                return d;
              });
              const { error: profileError } = await supabaseClient
                .from('profiles')
                .update({ dependents: deps })
                .eq('id', metadata.parent_id);

              if (profileError) console.error("Erro ao salvar ID no dependente do sócio:", profileError);
              else console.log(`Sucesso: ID Facial ${faceId} associado ao dependente ${metadata.dependent_name}`);
            }
          }
        } else if (targetType === 'visitor' && targetId) {
          const { error: stayError } = await supabaseClient
            .from('estadias')
            .update({ controlid_id: faceId })
            .eq('id', targetId);

          if (stayError) console.error("Erro ao salvar ID na estadia do visitante:", stayError);
          else console.log(`Sucesso: ID Facial ${faceId} associado à estadia ${targetId}`);
        }
      } else {
        const errorMsg = payload.error || url.searchParams.get("error") || "Cadastro remoto cancelado ou falhou no leitor.";
        await supabaseClient
          .from('controlid_commands')
          .update({ 
            status: 'failed', 
            error: errorMsg, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', command.id);

        console.log(`Comando ${command.id} marcado como falho. Erro: ${errorMsg}`);
      }

      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // ==========================================
    // ROTA BASE (POST): Recebimento de logs de acessos normais
    // ==========================================
    const payload = await req.json();
    console.log("Logs de acesso recebidos do Control iD:", JSON.stringify(payload));

    const deviceId = payload.device_id;
    if (!deviceId) {
      return new Response(JSON.stringify({ error: "Missing device_id in event payload" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    let logs = [];
    if (payload.access_logs) {
      logs = payload.access_logs;
    } else if (payload.object_changes) {
      logs = payload.object_changes
        .filter((change: any) => change.object === "access_logs")
        .map((change: any) => change.values);
    }

    if (logs.length === 0) {
      return new Response(JSON.stringify({ status: "success", message: "No access logs to process" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Busca o dispositivo ativo correspondente ao número de série na tabela 'idface_dispositivos'
    const { data: devices, error: devError } = await supabaseClient
      .from('idface_dispositivos')
      .select('nome_identificador, pdv_id, ativo')
      .eq('serial_number', String(deviceId))
      .eq('ativo', true);

    if (devError || !devices || devices.length === 0) {
      console.log(`Aparelho Serial ${deviceId} não está cadastrado ou ativo no sistema.`);
      return new Response(JSON.stringify({ status: "success", message: "Device not registered or active" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const device = devices[0];
    const pdvId = device.pdv_id;

    for (const log of logs) {
      const userId = log.user_id;
      if (!userId) continue;

      // ==========================================
      // DISPOSITIVO DO ESCRITÓRIO (Ponto / RH - PDV ID 3)
      // ==========================================
      if (pdvId === 3) {
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

        // Busca a última batida para deduzir o próximo status (Entrada ou Saída)
        const { data: lastEntries } = await supabaseClient
          .from('time_entries')
          .select('entry_type')
          .eq('employee_id', employee.id)
          .order('timestamp', { ascending: false })
          .limit(1);

        let nextEntryType = 'entry';
        if (lastEntries && lastEntries.length > 0) {
          const lastEntry = lastEntries[0].entry_type;
          if (lastEntry === 'entry') nextEntryType = 'exit';
          else nextEntryType = 'entry';
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
        continue;
      }

      // ==========================================
      // DISPOSITIVO DO RESTAURANTE (PDV ID 2)
      // ==========================================
      if (pdvId === 2) {
        // 1. Busca Estadia Ativa vinculada a esse Face ID
        let { data: estadias, error: estadiaError } = await supabaseClient
          .from('estadias')
          .select('id, hospede_nome, reserva_id')
          .eq('status', 'ativa')
          .eq('controlid_id', String(userId));

        let estadia = estadias && estadias.length > 0 ? estadias[0] : null;

        // Se não encontrar diretamente na estadia, tenta resolver pelo profile (Sócio Titular ou Dependente)
        if (!estadia) {
          let titularId = null;
          let personName = null;

          // Busca como titular
          const { data: titularProfile } = await supabaseClient
            .from('profiles')
            .select('id, full_name')
            .eq('controlid_id', String(userId));

          if (titularProfile && titularProfile.length > 0) {
            titularId = titularProfile[0].id;
            personName = titularProfile[0].full_name;
          } else {
            // Busca como dependente
            const { data: depProfile } = await supabaseClient
              .from('profiles')
              .select('id, dependents')
              .contains('dependents', `[{"controlid_id": "${String(userId)}"}]`);

            if (depProfile && depProfile.length > 0) {
              titularId = depProfile[0].id;
              const deps = depProfile[0].dependents || [];
              const matchedDep = deps.find((d: any) => String(d.controlid_id) === String(userId));
              if (matchedDep) personName = matchedDep.name;
            }
          }

          if (titularId) {
            // Encontra a reserva ativa do titular
            const { data: reservas } = await supabaseClient
              .from('reservations')
              .select('id')
              .eq('user_id', titularId)
              .in('status', ['confirmed', 'em_curso'])
              .order('created_at', { ascending: false })
              .limit(1);

            if (reservas && reservas.length > 0) {
              const reservaId = reservas[0].id;
              const { data: titularEstadias } = await supabaseClient
                .from('estadias')
                .select('id, hospede_nome, reserva_id')
                .eq('reserva_id', reservaId)
                .eq('status', 'ativa');

              if (titularEstadias && titularEstadias.length > 0) {
                const estadiaMatch = titularEstadias.find((e: any) => 
                  e.hospede_nome && personName && e.hospede_nome.toLowerCase().includes(personName.toLowerCase())
                );
                estadia = estadiaMatch || titularEstadias[0];
                console.log(`[Restaurante] FaceID resolvido via Profile. Usuário: ${personName} -> Estadia ${estadia.id} (${estadia.hospede_nome})`);
                await supabaseClient.from('webhook_logs').insert({ log: `Resolvido via Profile: ${personName} -> Estadia ${estadia.id}` });
              }
            } else {
              await supabaseClient.from('webhook_logs').insert({ log: `Titular ${titularId} encontrado, mas nenhuma reserva ativa.` });
            }
          } else {
            await supabaseClient.from('webhook_logs').insert({ log: `FaceID ${userId} não encontrado em profiles nem dependents.` });
          }
        }

        if (!estadia) {
          console.log(`FaceID ${userId} ignorado no restaurante: nenhuma estadia ativa ou reserva encontrada.`);
          await supabaseClient.from('webhook_logs').insert({ log: `FaceID ${userId} ignorado no restaurante: nenhuma estadia ativa.` });
          continue;
        }

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
          await supabaseClient.from('webhook_logs').insert({ log: `FaceID ${userId} fora do horário (${hour}:${minutes}).` });
          continue;
        }

        // 3. Busca o preço atual do produto
        const { data: produtos } = await supabaseClient
          .from('products')
          .select('id, name, price')
          .ilike('name', `%${productNameToSearch}%`)
          .limit(1);

        if (!produtos || produtos.length === 0) {
          console.log(`Produto ${productNameToSearch} não encontrado no banco de dados.`);
          await supabaseClient.from('webhook_logs').insert({ log: `Produto ${productNameToSearch} não encontrado.` });
          continue;
        }

        const produto = produtos[0];

        // 4. Grava o consumo
        const nomeParaAnotar = estadia.hospede_nome || 'Desconhecido';
        
        const { error: insertConsumoError } = await supabaseClient
          .from('lancamentos_consumo')
          .insert({
            estadia_id: estadia.id,
            item_id: produto.id,
            nome_item_snapshot: produto.name,
            quantidade: 1,
            valor_unitario_aplicado: produto.price,
            aprovado_admin: true,
            pago: false,
            observacoes: `Buffet de ${productNameToSearch} (Face ID: ${nomeParaAnotar})`
          });

        if (insertConsumoError) {
          console.error("Erro ao inserir consumo:", insertConsumoError);
          await supabaseClient.from('webhook_logs').insert({ log: `Erro ao inserir consumo: ${insertConsumoError.message}` });
        } else {
          console.log(`Sucesso: ${productNameToSearch} cobrado na conta de ${estadia.hospede_nome} (Estadia ${estadia.id})`);
          await supabaseClient.from('webhook_logs').insert({ log: `Sucesso: Consumo registrado para ${nomeParaAnotar} na estadia ${estadia.id}` });
        }
      }
    }

    return new Response(JSON.stringify({ status: "success" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Erro ao processar webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
