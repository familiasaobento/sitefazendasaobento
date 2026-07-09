import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

async function processAccessLog(log: any, deviceId: string, supabaseClient: any) {
  const userId = log.user_id;
  if (!userId) {
     await supabaseClient.from('webhook_logs').insert({ log: `processAccessLog: Sem userId no log ${JSON.stringify(log)}` });
     return;
  }

  // Filtra apenas eventos de acesso autorizado (event 7 = Biometria OK / Acesso liberado)
  // event 3 = acesso negado / não identificado — ignorar
  const event = Number(log.event);
  if (event !== 7) {
    return; // Não registra acessos negados ou outros eventos
  }

  const { data: devices, error: devError } = await supabaseClient
    .from('idface_dispositivos')
    .select('id, nome_identificador, pdv_id, ativo')
    .eq('serial_number', String(deviceId))
    .limit(1);

  if (devError || !devices || devices.length === 0) {
     await supabaseClient.from('webhook_logs').insert({ log: `processAccessLog: Device ${deviceId} não encontrado` });
     return;
  }
  const pdvId = devices[0].pdv_id;
  await supabaseClient.from('webhook_logs').insert({ log: `processAccessLog: Iniciando para user ${userId} no pdv ${pdvId}` });

  if (pdvId === 3) {
    const { data: employees } = await supabaseClient
      .from('employees')
      .select('id, full_name')
      .eq('controlid_id', String(userId))
      .limit(1);

    if (employees && employees.length > 0) {
      const employeeId = employees[0].id;
      const { data: lastEntries } = await supabaseClient
        .from('time_entries')
        .select('entry_type')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(1);

      let nextType = 'entry';
      if (lastEntries && lastEntries.length > 0) {
        nextType = lastEntries[0].entry_type === 'entry' ? 'exit' : 'entry';
      }

      const { error: insertError } = await supabaseClient.from('time_entries').insert({
        employee_id: employeeId,
        entry_type: nextType,
        timestamp: new Date().toISOString(),
        location: 'Escritório (Biometria)',
        device_id: devices[0].id
      });
      
      if (insertError) {
          await supabaseClient.from('webhook_logs').insert({ log: `Insert Error: ${JSON.stringify(insertError)}` });
      } else {
          await supabaseClient.from('webhook_logs').insert({ log: `Sucesso Ponto inserido para ${employees[0].full_name} (${nextType})` });
      }
    } else {
      await supabaseClient.from('webhook_logs').insert({ log: `Nenhum employee com controlid_id ${userId}` });
    }
  } else if (pdvId === 2) {
    let estadia = null;
    let personName: string | null = null;
    let { data: estadias } = await supabaseClient
      .from('estadias')
      .select('id, hospede_nome, reserva_id')
      .eq('status', 'ativa')
      .eq('controlid_id', String(userId));
      
    estadia = estadias && estadias.length > 0 ? estadias[0] : null;

    if (!estadia) {
      let titularId = null;
      personName = null;

      const { data: titularProfile } = await supabaseClient
        .from('profiles')
        .select('id, full_name')
        .eq('controlid_id', String(userId));

      if (titularProfile && titularProfile.length > 0) {
        titularId = titularProfile[0].id;
        personName = titularProfile[0].full_name;
      } else {
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
            await supabaseClient.from('webhook_logs').insert({ log: `Resolvido via Profile: ${personName} -> Estadia ${estadia.id}` });
          }
        }
      }
    }

    if (estadia) {
      const now = new Date();
      const brazilTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
      const hour = brazilTime.getUTCHours();
      const minutes = brazilTime.getUTCMinutes();
      const timeVal = hour + (minutes / 60);

      let productNameToSearch = null;
      if (timeVal >= 11.5 && timeVal <= 15.5) productNameToSearch = 'Almoço';
      else if (timeVal >= 18.0 && timeVal <= 22.5) productNameToSearch = 'Jantar';

      if (productNameToSearch) {
        const { data: produtos } = await supabaseClient
          .from('products')
          .select('id, name, price')
          .ilike('name', `%${productNameToSearch}%`)
          .limit(1);

        if (produtos && produtos.length > 0) {
          const produto = produtos[0];
          const nomeParaAnotar = personName || estadia.hospede_nome || 'Desconhecido';
          const todayStart = new Date(brazilTime);
          todayStart.setUTCHours(0, 0, 0, 0);
          const todayEnd = new Date(brazilTime);
          todayEnd.setUTCHours(23, 59, 59, 999);

          const utcStart = new Date(todayStart.getTime() + (3 * 60 * 60 * 1000)).toISOString();
          const utcEnd = new Date(todayEnd.getTime() + (3 * 60 * 60 * 1000)).toISOString();

          const { data: existingMeals } = await supabaseClient
            .from('lancamentos_consumo')
            .select('id')
            .eq('estadia_id', estadia.id)
            .eq('item_id', produto.id)
            .gte('created_at', utcStart)
            .lte('created_at', utcEnd);

          const isDuplicate = existingMeals && existingMeals.length > 0;
          const valorAplicado = isDuplicate ? 0 : produto.price;
          const obs = `Buffet de ${productNameToSearch} (Face ID: ${nomeParaAnotar}${isDuplicate ? ' - Repetido' : ''})`;

          const { error: insertErr } = await supabaseClient.from('lancamentos_consumo').insert({
              estadia_id: estadia.id,
              item_id: produto.id,
              nome_item_snapshot: produto.name,
              quantidade: 1,
              valor_unitario_aplicado: valorAplicado,
              aprovado_admin: true,
              pago: false,
              observacoes: obs
          });

          if (insertErr) {
            await supabaseClient.from('webhook_logs').insert({ log: `Erro ao inserir consumo para estadia ${estadia.id}: ${JSON.stringify(insertErr)}` });
          } else {
            await supabaseClient.from('webhook_logs').insert({ log: `Sucesso: Consumo de ${productNameToSearch} lançado para estadia ${estadia.id} (${nomeParaAnotar}) - valor R$ ${valorAplicado}` });
          }
        } else {
          await supabaseClient.from('webhook_logs').insert({ log: `Produto ${productNameToSearch} não encontrado na tabela products` });
        }
      }
    }
  }
}

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
    const isMonitor = path.endsWith('/dao'); // Monitor do iDFace envia events para {path}/dao

    // ==========================================
    // ROTA /push: O dispositivo busca comandos (GET) ou envia eventos (POST)
    // ==========================================
    if (isPush) {
      const deviceId = url.searchParams.get("deviceId") || url.searchParams.get("device_id");
      if (!deviceId) {
        return new Response(JSON.stringify({ error: "Missing deviceId" }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Se for POST, o dispositivo está enviando object_changes (logs de acesso)
      if (req.method === 'POST') {
        let payload: any = {};
        try {
          const rawText = await req.text();
          await supabaseClient.from('webhook_logs').insert({ log: `[PUSH RAW] ${rawText.substring(0, 500)}` });
          if (rawText) {
            payload = JSON.parse(rawText);
          }
        } catch (e) {
          console.log("Empty or non-JSON body in POST /push");
        }

        if (payload && payload.object_changes && payload.object_changes[0] && payload.object_changes[0].object === 'access_logs') {
          const logs = payload.object_changes[0].values;
          for (const log of logs) {
            await processAccessLog(log, deviceId, supabaseClient);
          }
        }
      }

      // Após processar possível payload, envia os comandos pendentes se houver
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
        // Sem comandos pendentes: busca logs novos automaticamente desde o último processado
        // Para evitar flood, só faz polling a cada 10 segundos
        const { data: recentPolls } = await supabaseClient
          .from('controlid_commands')
          .select('id, created_at')
          .eq('device_id', String(deviceId))
          .eq('command', 'load_objects.fcgi')
          .order('created_at', { ascending: false })
          .limit(1);

        let shouldPoll = true;
        if (recentPolls && recentPolls.length > 0) {
          const lastPollTime = new Date(recentPolls[0].created_at).getTime();
          const now = Date.now();
          if (now - lastPollTime < 10000) {
            shouldPoll = false;
          }
        }

        if (!shouldPoll) {
           return new Response(null, { status: 200, headers: corsHeaders });
        }

        const { data: deviceData } = await supabaseClient
          .from('idface_dispositivos')
          .select('id, last_log_id')
          .eq('serial_number', String(deviceId))
          .limit(1);

        const lastLogId = deviceData?.[0]?.last_log_id ?? 0;

        const commandId = crypto.randomUUID();
        // A cada GET sem comando (limitado a 10s), envia load_objects para buscar logs novos
        // O dispositivo responde via POST /result com os access_logs
        const pollPayload = {
          uuid: commandId,
          verb: "POST",
          endpoint: "load_objects",
          body: {
            object: "access_logs",
            where: [
              {
                object: "access_logs",
                field: "id",
                operator: ">",
                value: lastLogId
              }
            ]
          }
        };

        // Registra o comando de polling no banco para o /result processar a resposta
        await supabaseClient.from('controlid_commands').insert({
          id: commandId,
          device_id: String(deviceId),
          command: 'load_objects.fcgi',
          params: { 
            object: 'access_logs', 
            where: [
              {
                object: "access_logs",
                field: "id",
                operator: ">",
                value: lastLogId
              }
            ] 
          },
          status: 'sent',
          metadata: { sent_command: 'load_objects', is_auto_poll: true }
        });

        return new Response(JSON.stringify(pollPayload), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
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
            userName = metadata.guest_name || "Convidado Fazenda";
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

      // Caso normal: Resposta final do remote_enroll.fcgi ou load_objects.fcgi
      const isSuccess = !payload.error && (payload.response || url.searchParams.get("error") === null);

      if (isSuccess) {
        if (executedEndpoint === 'load_objects' || executedEndpoint === 'load_objects.fcgi') {
          await supabaseClient.from('webhook_logs').insert({ log: `FULL PAYLOAD: ${JSON.stringify(payload).substring(0, 1500)}` });
          
          let logsToProcess = null;
          if (payload.access_logs && Array.isArray(payload.access_logs)) {
             logsToProcess = payload.access_logs;
          } else if (payload.response && payload.response.access_logs && Array.isArray(payload.response.access_logs)) {
             logsToProcess = payload.response.access_logs;
          } else if (typeof payload.access_logs === 'string') {
             try { logsToProcess = JSON.parse(payload.access_logs); } catch (e) {}
          } else if (typeof payload.response === 'string') {
             try { 
               const parsedRes = JSON.parse(payload.response);
               if (parsedRes.access_logs) logsToProcess = parsedRes.access_logs;
             } catch (e) {}
          }

          if (logsToProcess && Array.isArray(logsToProcess) && logsToProcess.length > 0) {
            for (const log of logsToProcess) {
              await processAccessLog(log, String(deviceId), supabaseClient);
            }
            // Atualiza o last_log_id para que o próximo auto-poll busque apenas logs novos
            const maxId = Math.max(...logsToProcess.map((l: any) => Number(l.id) || 0));
            if (maxId > 0) {
              await supabaseClient
                .from('idface_dispositivos')
                .update({ last_log_id: maxId })
                .eq('serial_number', String(deviceId));
            }
          }
        }

        await supabaseClient
          .from('controlid_commands')
          .update({ 
            status: 'success', 
            metadata: { ...metadata, response_payload: payload },
            updated_at: new Date().toISOString() 
          })
          .eq('id', command.id);

        // Se for auto-poll, não executa lógica de enrollment
        if (metadata.is_auto_poll) {
          return new Response(null, { status: 200, headers: corsHeaders });
        }

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

          if (stayError) console.error("Erro ao salvar ID na estadia do convidado:", stayError);
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
    // ROTA /dao: Monitor do iDFace envia eventos em tempo real (POST)
    // Formato: { object_changes: [{ object: 'access_logs', type: 'inserted', values: {...} }] }
    // ==========================================
    if (isMonitor && req.method === 'POST') {
      let payload: any = {};
      try {
        const rawText = await req.text();
        await supabaseClient.from('webhook_logs').insert({ log: `[MONITOR /dao] ${rawText.substring(0, 800)}` });
        if (rawText) {
          payload = JSON.parse(rawText);
        }
      } catch (e) {
        console.log("Empty or non-JSON body in /dao");
      }

      if (payload.object_changes && Array.isArray(payload.object_changes)) {
        // O Monitor não envia deviceId na query string — está no payload ou inferimos do serial
        // O device_id dentro dos logs é o número de série do dispositivo (ex: 4408801109304872)
        const changes = payload.object_changes.filter((change: any) => change.object === 'access_logs');
        for (const change of changes) {
          // values pode ser objeto único ou array — normalizamos
          const values = change.values;
          const logsArray = Array.isArray(values) ? values : [values];
          for (const logEntry of logsArray) {
            // device_id no log é o serial number do dispositivo
            const logDeviceId = String(logEntry.device_id || '');
            if (logDeviceId) {
              await processAccessLog(logEntry, logDeviceId, supabaseClient);
            }
          }
        }
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ==========================================
    // ROTA BASE (POST): Recebimento de logs de acessos normais
    // ==========================================
    let payload: any = {};
    try {
      const rawText = await req.text();
      await supabaseClient.from('webhook_logs').insert({ log: `[BASE PUSH RAW] ${rawText.substring(0, 500)}` });
      if (rawText) {
        payload = JSON.parse(rawText);
      }
    } catch (e) {
      console.log("Empty or non-JSON body in base route");
    }

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
      const changes = payload.object_changes.filter((change: any) => change.object === "access_logs");
      if (changes.length > 0) {
        // values pode ser objeto ou array
        for (const change of changes) {
          const vals = change.values;
          const arr = Array.isArray(vals) ? vals : [vals];
          logs = logs.concat(arr);
        }
      }
    }

    if (logs.length > 0) {
      for (const log of logs) {
        await processAccessLog(log, String(deviceId), supabaseClient);
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
