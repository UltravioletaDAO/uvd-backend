#!/usr/bin/env pwsh
# Script para empaquetar la función Lambda Stream Summaries

$ErrorActionPreference = 'Stop'
Write-Host "=== EMPAQUETANDO STREAM SUMMARIES LAMBDA ==="

# Limpiar archivos anteriores
Write-Host "Limpiando archivos anteriores..."
if (Test-Path "lambda.zip") {
    Remove-Item "lambda.zip" -Force
}
if (Test-Path "package") {
    Remove-Item -Recurse -Force "package"
}

# Crear directorio temporal
Write-Host "Creando directorio temporal..."
New-Item -ItemType Directory -Force -Path "package" | Out-Null

# Copiar código fuente
Write-Host "Copiando código fuente..."
Copy-Item "app.js" -Destination "package/"
Copy-Item "package.json" -Destination "package/"

# Instalar dependencias de producción
Write-Host "Instalando dependencias de producción..."
Push-Location "package"
npm install --production --no-package-lock
Pop-Location

# Crear archivo ZIP
Write-Host "Creando archivo ZIP..."
Push-Location "package"
Compress-Archive -Path * -DestinationPath "../lambda.zip" -Force
Pop-Location

# Limpiar
Write-Host "Limpiando archivos temporales..."
Remove-Item -Recurse -Force "package"

Write-Host "=== EMPAQUETADO COMPLETADO ==="
Write-Host "Archivo creado: lambda.zip"
