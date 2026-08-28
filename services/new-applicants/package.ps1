$ErrorActionPreference = 'Stop'

# Asegurarse de que estamos en el directorio correcto
Set-Location -Path $PSScriptRoot

Write-Host "Limpiando directorios temporales..."
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "lambda.zip") { Remove-Item -Force "lambda.zip" }

Write-Host "Creando directorio de distribución..."
New-Item -ItemType Directory -Path "dist" -Force

Write-Host "Copiando archivos de la función..."
Copy-Item -Path "app.js" -Destination "dist/index.js"

Write-Host "Copiando módulos del MCP remoto..."
# app.js hace require('./mcp'), que a su vez requiere './mcpTools': si no viajan en el zip,
# la Lambda muere al importar.
Copy-Item -Path "mcp.js" -Destination "dist/"
Copy-Item -Path "mcpTools.js" -Destination "dist/"

Write-Host "Copiando package.json..."
Copy-Item -Path "package.json" -Destination "dist/"

Write-Host "Instalando dependencias en el directorio de distribución..."
Set-Location -Path "dist"
npm install --production

Write-Host "Verificando instalación de dependencias de AWS Secrets Manager..."
if (-not (Test-Path "node_modules/@aws-sdk/client-secrets-manager")) {
    Write-Host "Instalando dependencia de AWS Secrets Manager..."
    npm install --save @aws-sdk/client-secrets-manager
}

Write-Host "Creando archivo ZIP..."
Compress-Archive -Path "*" -DestinationPath "../lambda.zip" -Force

Write-Host "Volviendo al directorio original..."
Set-Location -Path ".."

Write-Host "Paquete lambda.zip creado exitosamente" 