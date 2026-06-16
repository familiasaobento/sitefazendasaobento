# Script de Simulação - Maquinas Control iD
# Este script envia um webhook falso para a sua Edge Function do Supabase

$supabaseUrl = "https://nxnxqwmqeujaiuqajmhc.supabase.co/functions/v1/controlid-webhook"

Write-Host "Qual aparelho você quer simular?" -ForegroundColor Cyan
Write-Host "1 - Restaurante (Almoço/Jantar)"
Write-Host "2 - Escritório (Bater Ponto)"
$choice = Read-Host "Digite 1 ou 2"

$deviceId = 9999
if ($choice -eq "2") {
    $deviceId = 8888
}

$userId = Read-Host -Prompt "Digite o Face ID do usuario/hospede (ex: 12345)"

$payload = @{
    device_id = $deviceId
    access_logs = @(
        @{
            user_id = $userId
            time = [int][double]::Parse((Get-Date (Get-Date).ToUniversalTime() -UFormat %s))
            event = 7
        }
    )
}

$jsonPayload = $payload | ConvertTo-Json -Depth 10

Write-Host "Enviando rosto $userId a partir da maquina $deviceId..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $supabaseUrl -Method Post -Body $jsonPayload -ContentType "application/json"
    Write-Host "Resposta do Servidor:" -ForegroundColor Green
    $response | ConvertTo-Json | Write-Host
} catch {
    Write-Host "Erro na comunicacao com o servidor:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}

Write-Host "Teste finalizado!" -ForegroundColor Yellow
Pause
