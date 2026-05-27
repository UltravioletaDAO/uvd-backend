resource "null_resource" "build_layer" {
  triggers = {
    force_rebuild = uuid()
  }

  provisioner "local-exec" {
    working_dir = var.source_dir
    command     = <<EOT
      $ErrorActionPreference = 'Stop'

      Write-Host "========== EMPAQUETADO LAMBDA LAYER =========="

      # Limpiar archivos anteriores
      if (Test-Path "nodejs") {
          Write-Host "Eliminando directorio nodejs existente"
          Remove-Item -Recurse -Force "nodejs"
      }
      if (Test-Path "layer.zip") {
          Write-Host "Eliminando layer.zip existente"
          Remove-Item -Force "layer.zip"
      }

      # Crear estructura del layer
      Write-Host "Creando estructura de directorio para el layer"
      New-Item -ItemType Directory -Path "nodejs" -Force | Out-Null

      # Copiar package.json
      Write-Host "Copiando package.json"
      Copy-Item -Path "package.json" -Destination "nodejs/"

      # Instalar dependencias
      Write-Host "Instalando dependencias..."
      Set-Location -Path "nodejs"
      npm install --production --no-optional

      if (-not $?) {
          Write-Error "Error al instalar dependencias"
          exit 1
      }

      Set-Location -Path ".."

      # Empaquetar usando 7zip si está disponible (mucho más rápido)
      Write-Host "Empaquetando layer.zip..."
      if (Get-Command "7z" -ErrorAction SilentlyContinue) {
          Write-Host "Usando 7zip para empaquetar (más rápido)"
          & 7z a -tzip layer.zip nodejs
      } else {
          Write-Host "Usando Compress-Archive"
          Compress-Archive -Path "nodejs" -DestinationPath "layer.zip" -Force
      }

      # Subir a S3
      Write-Host "Eliminando posibles versiones antiguas en S3"
      aws s3 rm s3://${var.artifact_bucket}/${var.artifact_key} --region us-east-2

      Write-Host "Subiendo nuevo layer a S3"
      aws s3 cp layer.zip s3://${var.artifact_bucket}/${var.artifact_key} --region us-east-2

      Write-Host "========== EMPAQUETADO DEL LAYER COMPLETADO =========="
    EOT
    interpreter = ["powershell", "-Command"]
  }
}

resource "time_sleep" "wait_for_layer" {
  depends_on      = [null_resource.build_layer]
  create_duration = "10s"
}

resource "aws_lambda_layer_version" "layer" {
  layer_name          = var.layer_name
  description         = var.description
  compatible_runtimes = var.compatible_runtimes

  s3_bucket = var.artifact_bucket
  s3_key    = var.artifact_key

  depends_on = [time_sleep.wait_for_layer]
}
