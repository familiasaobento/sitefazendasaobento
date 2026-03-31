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

            // 1. Invite User
            const { data: invitee, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(request.email, {
                data: {
                    full_name: request.full_name,
                    role: 'visitor'
                }
            })
            
            // If user already exists, it might fail or just send the email. 
            // We should find the user ID regardless.
            let userId = invitee?.user?.id;
            if (!userId) {
                const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
                const found = existingUser.users.find(u => u.email === request.email);
                userId = found?.id;
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
                    notes: `Solicitação via formulário público. Anfitrião: ${request.host_member_name}. Obs: ${request.notes || '-'}`
                }])
                .select()
                .single()

            // 4. Generate Invitation Link
            let linkResult;
            try {
                // First try 'invite' type
                linkResult = await supabaseAdmin.auth.admin.generateLink({
                    type: 'invite',
                    email: request.email,
                    options: {
                        // IMPORTANTE: Alterado temporariamente para localhost para teste local do usuário
                        // LEMBRAR DE VOLTAR PARA https://portal.fazendafamiliasaobento.com.br ANTES DO DEPLOY FINAL
                        redirectTo: 'http://localhost:5173',
                        data: {
                            full_name: request.full_name,
                            role: 'visitor'
                        }
                    }
                });

                // If invite fails (likely user already exists), try magiclink
                if (linkResult.error) {
                    await logToDB("Invite link failed, trying magiclink", { error: linkResult.error });
                    linkResult = await supabaseAdmin.auth.admin.generateLink({
                        type: 'magiclink',
                        email: request.email,
                        options: { 
                            // LEMBRAR DE VOLTAR PARA https://portal.fazendafamiliasaobento.com.br ANTES DO DEPLOY FINAL
                            redirectTo: 'http://localhost:5173' 
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
                const emailPayload = {
                    from: 'Fazenda São Bento <reservas@familiasaobento.com>',
                    to: [request.email],
                    subject: `✅ Reserva Confirmada - Voucher Fazenda São Bento`,
                    html: `
                        <div style="font-family:serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:12px;">
                            <h1 style="color:#556C3B;text-align:center;">Voucher de Reserva</h1>
                            <p>Olá <strong>${request.full_name}</strong>,</p>
                            <p>Temos o prazer de informar que sua solicitação de reserva na Fazenda São Bento foi <strong>Aprovada</strong>!</p>
                            
                            <div style="background:#f9f9f9;padding:20px;border-radius:8px;margin:20px 0;">
                                <p><strong>📍 Local:</strong> ${accommodation || 'A definir'}</p>
                                <p><strong>📅 Chegada:</strong> ${request.check_in.split('-').reverse().join('/')}</p>
                                <p><strong>📅 Saída:</strong> ${request.check_out.split('-').reverse().join('/')}</p>
                                <p><strong>👥 Hóspedes:</strong> ${request.num_guests} pessoas</p>
                            </div>
                            
                            <h2 style="color:#556C3B;">Seu Acesso</h2>
                            <p>Para acessar seus QR Codes de entrada, verificar sua comanda e atualizar seu cadastro, você deve agora definir sua senha no nosso portal:</p>
                            <p style="text-align:center;">
                                <a href="${inviteLink}" style="background:#556C3B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Definir Senha e Acessar</a>
                            </p>
                            <p style="font-size:12px;color:#999;">* Utilize o mesmo e-mail desta mensagem para o acesso.</p>
                            
                            <br/>
                            <p>Seja bem-vindo à Fazenda!</p>
                        </div>
                    `
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
