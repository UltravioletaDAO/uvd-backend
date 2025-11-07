#!/usr/bin/env pwsh
# Script de despliegue automatizado para la función Lambda Stream Summaries

$ErrorActionPreference = 'Stop'
Write-Host "=== INICIANDO DESPLIEGUE DE STREAM SUMMARIES LAMBDA ==="

# Paso 1: Empaquetar la función
Write-Host "Paso 1: Empaquetando la función Lambda..."
& "$PSScriptRoot/package.ps1"

if (-not $?) {
    Write-Error "Error al empaquetar la función Lambda"
    exit 1
}

# Paso 2: Subir el paquete a S3
Write-Host "Paso 2: Subiendo el paquete a S3..."
$BUCKET_NAME = "ultravioleta-artifacts-20250225"
$KEY_NAME = "stream-summaries/lambda.zip"

aws s3 rm s3://$BUCKET_NAME/$KEY_NAME --region us-east-2
aws s3 cp lambda.zip s3://$BUCKET_NAME/$KEY_NAME --region us-east-2

if (-not $?) {
    Write-Error "Error al subir el paquete a S3"
    exit 1
}

# Paso 3: Actualizar la función Lambda
Write-Host "Paso 3: Actualizando la función Lambda en AWS..."
aws lambda update-function-code --function-name ultravioleta-stream-summaries --s3-bucket $BUCKET_NAME --s3-key $KEY_NAME --region us-east-2

if (-not $?) {
    Write-Error "Error al actualizar la función Lambda"
    exit 1
}

Write-Host "=== DESPLIEGUE COMPLETADO EXITOSAMENTE ==="
