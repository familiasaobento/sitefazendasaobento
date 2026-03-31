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

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const today = new Date().toISOString().split('T')[0]

        // 1. Get Guests Today
        const { data: guests } = await supabaseClient
            .from('estadias')
            .select('id, reservations(num_guests)')
            .eq('status', 'ativa')

        const totalGuests = guests?.reduce((acc, curr) => acc + (curr.reservations?.num_guests || 0), 0) || 0

        // 2. Get Sales Today (Approved only)
        const { data: sales } = await supabaseClient
            .from('lancamentos_consumo')
            .select('quantidade, valor_unitario_aplicado')
            .eq('aprovado_admin', true)
            .gte('created_at', today)

        const totalSales = sales?.reduce((acc, curr) => acc + (curr.quantidade * curr.valor_unitario_aplicado), 0) || 0

        // 3. Pending Purchase Requests
        const { count: pendingRC } = await supabaseClient
            .from('requisicoes_compra')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pendente')

        // 4. Send Email (Example using Resend or similar)
        // To enable this, you need an API key from a provider.
        // 4. Send Email if RESEND_API_KEY is configured
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resendApiKey}`
                    },
                    body: JSON.stringify({
                        from: 'Fazenda São Bento <reservas@familiasaobento.com>',
                        to: ['admin@fazendasaobento.com'], // In production, this should be an env var or list from DB
                        subject: `📊 Resumo Diário - ${today}`,
                        html: `
                          <h1>Relatório do Dia: ${today}</h1>
                          <p><strong>👥 Hóspedes na Fazenda:</strong> ${totalGuests}</p>
                          <p><strong>💰 Vendas Processadas (Hoje):</strong> R$ ${totalSales.toFixed(2)}</p>
                          <p><strong>🛒 Pedidos de Compra Pendentes:</strong> ${pendingRC}</p>
                          <br/>
                          <p>Att, <br/>Sistema de Gestão</p>
                        `
                    })
                });
                console.log("Email sent successfully.");
            } catch (emailError) {
                console.error("Failed to send email:", emailError);
            }
        } else {
            console.log("RESEND_API_KEY not found. Email summary skipped.");
        }

        return new Response(JSON.stringify({
            totalGuests,
            totalSales,
            pendingRC,
            message: "Snapshot calculated successfully"
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
