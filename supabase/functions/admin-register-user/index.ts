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

    try {
        const body = await req.json()
        const { action, email, full_name, role, member_status, send_email, cpf, phone, birth_date, address, host_name, dependents } = body

        if (action === 'register') {
            if (!email || !full_name || !role) {
                throw new Error('E-mail, nome e cargo são obrigatórios.')
            }

            // 1. Create User in Auth
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: {
                    full_name,
                    role
                }
            })

            if (createError) throw createError
            const userId = newUser?.user?.id

            if (!userId) throw new Error('Não foi possível criar o usuário.')

            // 2. Create Profile with all fields
            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: userId,
                    full_name,
                    role,
                    member_status: member_status || 'Ativo',
                    approved: true,
                    email: email,
                    cpf: cpf || '',
                    phone: phone || '',
                    birth_date: birth_date || null,
                    address: address || '',
                    host_name: host_name || '',
                    dependents: dependents || []
                })

            if (profileError) throw profileError

            // 3. Send Email if requested
            if (send_email) {
                await sendInviteEmail(supabaseAdmin, email, full_name, role);
            }

            return new Response(JSON.stringify({ ok: true, message: send_email ? 'Usuário cadastrado e convite enviado.' : 'Usuário cadastrado com sucesso (E-mail não enviado).' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'send-invite') {
            if (!email || !full_name) throw new Error('E-mail e nome são obrigatórios para o convite.')
            await sendInviteEmail(supabaseAdmin, email, full_name, role);
            return new Response(JSON.stringify({ ok: true, message: 'Convite enviado com sucesso.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        throw new Error('Ação não reconhecida.')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

async function sendInviteEmail(supabaseAdmin: any, email: string, full_name: string, role: string) {
    // Generate Link (Recovery)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
            redirectTo: 'https://www.familiasaobento.com'
        }
    })

    if (linkError) throw linkError
    const inviteLink = linkData?.properties?.action_link

    // Send Welcome Email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey && inviteLink) {
        const roleLabel = (role === 'member' || role === 'consu') ? 'Sócio' : role === 'visitor' ? 'Visitante' : 'Usuário';
        
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`
            },
            body: JSON.stringify({
                from: 'Fazenda São Bento <portaria@familiasaobento.com>',
                to: [email],
                subject: `📍 Convite de Acesso - Fazenda São Bento`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                        <h2 style="color: #1b4332; text-align: center;">Bem-vindo à Fazenda São Bento!</h2>
                        <p>Olá <strong>${full_name}</strong>,</p>
                        <p>Você foi cadastrado como <strong>${roleLabel}</strong> no nosso portal da família.</p>
                        <p>Para começar a utilizar o sistema, realizar seu cadastro facial e fazer reservas, você precisa definir sua senha de acesso no botão abaixo:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${inviteLink}" style="background-color: #556C3B; color: white; padding: 15px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">DEFINIR MINHA SENHA</a>
                        </div>
                        
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #999; text-align: center;">Fazenda São Bento • Portal da Família</p>
                    </div>
                `
            })
        })
    }
}
