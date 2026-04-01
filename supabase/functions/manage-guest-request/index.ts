import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const logToDB = async (msg: string, details: any = {}) => {
        console.log(msg, details);
        try {
            await supabaseAdmin.from('logs_sistema').insert({ 
                servico: 'manage-guest-request', 
                mensagem: msg, 
                detalhes: details 
            });
        } catch (e) {
            console.error('Failed to log to DB:', e);
        }
    }

    try {
        const { action, requestId, rejectionReason, accommodation } = await req.json()
        await logToDB(`Início da ação: ${action}`, { requestId });

        if (action === 'notify-admin') {
            // Send email to admin about new request
            const { data: request } = await supabaseAdmin
                .from('guest_reservations')
                .select('*')
                .eq('id', requestId)
                .single()

            if (!request) throw new Error('Request not found')

            const resendApiKey = Deno.env.get('RESEND_API_KEY');
            if (resendApiKey) {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resendApiKey}`
                    },
                    body: JSON.stringify({
                        from: 'Fazenda São Bento <reservas@familiasaobento.com>',
                        to: ['admin@fazendasaobento.com'], // In production, this should be configurable
                        subject: `🔔 Nova Solicitação de Reserva de Convidado: ${request.full_name}`,
                        html: `
                            <h1>Nova Solicitação de Reserva</h1>
                            <p><strong>Solicitante:</strong> ${request.full_name}</p>
                            <p><strong>Email:</strong> ${request.email}</p>
                            <p><strong>WhatsApp:</strong> ${request.phone}</p>
                            <p><strong>Anfitrião:</strong> ${request.host_member_name}</p>
                            <p><strong>Período:</strong> ${request.check_in} até ${request.check_out}</p>
                            <p><strong>Pessoas:</strong> ${request.num_guests}</p>
                            <p><strong>Obs:</strong> ${request.notes || '-'}</p>
                            <br/>
                            <a href="https://portal.fazendafamiliasaobento.com.br/#reservations" style="background:#556C3B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;">Ver e Aprovar no Painel</a>
                        `
                    })
                })
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'approve') {
            const { data: request } = await supabaseAdmin
                .from('guest_reservations')
                .select('*')
                .eq('id', requestId)
                .single()

            if (!request) throw new Error('Request not found')

            // 1. Create or Find User (Silently - avoiding duplicate Supabase email)
            let userId: string | undefined;
            const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
            const found = existingUser.users.find(u => u.email === request.email);
            
            if (found) {
                userId = found.id;
            } else {
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: request.email,
                    email_confirm: true,
                    user_metadata: {
                        full_name: request.full_name,
                        role: 'visitor'
                    }
                });
                if (createError) throw createError;
                userId = newUser?.user?.id;
            }

            if (!userId) throw new Error('Could not create or find user');

            // 2. Update Profile (if not exist)
            await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: userId,
                    full_name: request.full_name,
                    role: 'visitor',
                    cpf: request.cpf,
                    phone: request.phone,
                    birth_date: request.birth_date,
                    host_name: request.host_member_name,
                    approved: true
                })

            // 3. Create Official Reservation
            const { data: reservation } = await supabaseAdmin
                .from('reservations')
                .insert([{
                    user_id: userId,
                    name: request.full_name,
                    check_in: request.check_in,
                    check_out: request.check_out,
                    num_guests: request.num_guests,
                    accommodation: accommodation || 'A definir',
                    status: 'confirmed',
                    guests_details: request.guests_details,
                    notes: `Solicitação via formulário público. Anfitrião: ${request.host_member_name}. Obs: ${request.notes || '-'}`
                }])
                .select()
                .single()

            // 4. Generate Recovery/Setup Link
            let linkResult;
            try {
                // We use 'recovery' because it is the most reliable way to trigger the 
                // PASSWORD_RECOVERY event in the app, allowing the user to set their first password.
                linkResult = await supabaseAdmin.auth.admin.generateLink({
                    type: 'recovery',
                    email: request.email,
                    options: {
                        // PRODUÇÃO
                        redirectTo: 'https://portal.fazendafamiliasaobento.com.br'
                    }
                });

                if (linkResult.error) {
                    await logToDB("Recovery link failed, trying magiclink as fallback", { error: linkResult.error });
                    linkResult = await supabaseAdmin.auth.admin.generateLink({
                        type: 'magiclink',
                        email: request.email,
                        options: { 
                            // PRODUÇÃO
                            redirectTo: 'https://portal.fazendafamiliasaobento.com.br' 
                        }
                    });
                }
            } catch (e) {
                await logToDB("Exception during generateLink", { error: e.message });
            }

            const inviteLink = linkResult?.data?.properties?.action_link || 'https://portal.fazendafamiliasaobento.com.br';
            
            if (!linkResult?.data?.properties?.action_link) {
                await logToDB("AVISO: Link de convite não gerado, usando fallback de URL", { 
                    hasResult: !!linkResult, 
                    hasData: !!linkResult?.data,
                    error: linkResult?.error
                });
            }

            // 5. Update request status
            await supabaseAdmin
                .from('guest_reservations')
                .update({ status: 'approved' })
                .eq('id', requestId)

            // 6. Send Voucher Email
            const resendApiKey = Deno.env.get('RESEND_API_KEY');
            if (resendApiKey) {
                await logToDB("Enviando e-mail de voucher via Resend", { to: request.email, inviteLink });
                
                const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
                    <style>
                        body { margin: 0; padding: 0; background-color: #f4f6f2; }
                        .container { 
                            width: 100%; 
                            max-width: 600px; 
                            margin: 0 auto; 
                            background-color: #f4f6f2; 
                            background-image: url('https://portal.fazendafamiliasaobento.com.br/login-bg.jpg');
                            background-size: cover;
                            background-position: center;
                            border-radius: 24px;
                            overflow: hidden;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.05);
                            margin-top: 40px;
                            margin-bottom: 40px;
                            border: 1px solid #e0e4da;
                        }
                        .header { 
                            background-color: rgba(85, 108, 59, 0.9); 
                            padding: 40px 20px; 
                            text-align: center;
                            color: #ffffff;
                        }
                        .content { 
                            padding: 40px; 
                            font-family: 'Inter', sans-serif; 
                            color: #374151; 
                            line-height: 1.6;
                            background-color: rgba(255, 255, 255, 0.94); /* Branca com leve transparência para ver a imagem atrás */
                            margin: 20px;
                            border-radius: 20px;
                        }
                        .title { 
                            font-family: 'Merriweather', serif; 
                            color: #1b4332; 
                            font-size: 28px; 
                            margin-bottom: 24px; 
                            text-align: center;
                        }
                        .voucher-card { 
                            background-color: #ffffff; 
                            border: 2px dashed #556C3B; 
                            border-radius: 16px; 
                            padding: 30px; 
                            margin: 30px 0;
                            position: relative;
                        }
                        .voucher-label { 
                            font-size: 11px; 
                            text-transform: uppercase; 
                            letter-spacing: 2px; 
                            color: #556C3B; 
                            font-weight: 700;
                            margin-bottom: 8px;
                        }
                        .voucher-value { 
                            font-size: 18px; 
                            font-weight: 600; 
                            color: #1b4332;
                            margin-bottom: 20px;
                        }
                        .btn { 
                            display: block; 
                            background-color: #556C3B; 
                            color: #ffffff !important; 
                            text-decoration: none; 
                            padding: 18px 30px; 
                            border-radius: 12px; 
                            text-align: center; 
                            font-weight: 700;
                            font-size: 16px;
                            letter-spacing: 0.5px;
                            box-shadow: 0 4px 12px rgba(85,108,59,0.2);
                        }
                        .footer { 
                            text-align: center; 
                            padding-bottom: 40px; 
                            color: #9ca3af; 
                            font-size: 12px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2 style="margin:0; font-family: 'Merriweather', serif; letter-spacing: 2px;">FAZENDA SÃO BENTO</h2>
                        </div>
                        <div class="content">
                            <h1 class="title">Sua reserva foi confirmada!</h1>
                            <p>Olá <strong>${request.full_name}</strong>,</p>
                            <p>Temos o prazer de informar que sua solicitação de reserva na Fazenda São Bento foi <strong>aprovada</strong> pela nossa administração.</p>
                            
                            <div class="voucher-card">
                                <div style="border-bottom: 1px solid #f0f2ed; margin-bottom: 20px; padding-bottom: 10px;">
                                    <div class="voucher-label">Acomodação</div>
                                    <div class="voucher-value">${accommodation || 'A definir'}</div>
                                </div>
                                
                                <div style="display: flex; gap: 20px; border-bottom: 1px solid #f0f2ed; margin-bottom: 20px; padding-bottom: 10px;">
                                    <div style="flex: 1;">
                                        <div class="voucher-label">Chegada</div>
                                        <div class="voucher-value">${request.check_in.split('-').reverse().join('/')}</div>
                                    </div>
                                    <div style="flex: 1;">
                                        <div class="voucher-label">Saída</div>
                                        <div class="voucher-value">${request.check_out.split('-').reverse().join('/')}</div>
                                    </div>
                                </div>

                                <div>
                                    <div class="voucher-label">Hóspedes (${request.num_guests})</div>
                                    <div class="voucher-value">
                                        <ul style="margin: 0; padding: 0; list-style: none;">
                                            <li>• ${request.full_name} (Titular)</li>
                                            ${(request.guests_details || [])
                                                .filter((g: any) => g.name && g.name.trim() !== "" && g.name.toLowerCase() !== request.full_name.toLowerCase())
                                                .map((g: any) => `<li>• ${g.name}</li>`)
                                                .join('')}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            
                            <h3 style="color:#1b4332; font-family: 'Merriweather', serif; margin-top: 40px; text-align: center;">Crie seu Acesso</h3>
                            <p style="text-align: center; font-size: 14px;">Para acessar seus QR Codes de entrada e gerenciar sua estadia, defina uma senha de acesso:</p>
                            
                            <div style="margin: 30px 0; text-align: center;">
                                <a href="${inviteLink}" class="btn" style="color: #ffffff !important; display: inline-block;">DEFINIR SENHA E ACESSAR</a>
                            </div>
                            
                            <p style="font-size: 12px; color: #6b7280; text-align: center; font-style: italic;">
                                Seja bem-vindo à nossa família! Estamos ansiosos para recebê-lo.
                            </p>
                        </div>
                    </div>
                    <div class="footer">
                        &copy; 2024 Fazenda São Bento • Portal da Família
                    </div>
                </body>
                </html>
                `;

                const emailPayload = {
                    from: 'Fazenda São Bento <reservas@familiasaobento.com>',
                    to: [request.email],
                    subject: `✅ Reserva Confirmada - Voucher Fazenda São Bento`,
                    html: emailHtml
                };

                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resendApiKey}`
                    },
                    body: JSON.stringify(emailPayload)
                });

                if (resendResponse.ok) {
                    const resData = await resendResponse.json();
                    await logToDB("E-mail enviado com sucesso pelo Resend", { resData });
                } else {
                    const errorDetails = await resendResponse.text();
                    await logToDB("Erro ao enviar e-mail pelo Resend", { errorDetails });
                    console.error("Resend error:", errorDetails);
                }
            } else {
                await logToDB("RESEND_API_KEY não encontrada");
                console.warn("RESEND_API_KEY not found. Skipping voucher email.");
            }

            return new Response(JSON.stringify({ ok: true, message: "Aprovado com sucesso" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        return new Response('Action not found', { status: 404, headers: corsHeaders })

    } catch (error) {
        if (typeof logToDB === 'function') {
            await logToDB(`Erro fatal na função: ${error.message}`, { stack: error.stack });
        }
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
