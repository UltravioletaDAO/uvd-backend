resource "aws_lambda_layer_version" "dependencies" {
  layer_name = "ultravioleta-dependencies"
  description = "Common dependencies for Ultravioleta APIs"
  
  filename = data.archive_file.layer.output_path
  compatible_runtimes = ["nodejs18.x"]

  depends_on = [null_resource.build_layer]
}

resource "null_resource" "build_layer" {
  triggers = {
    package_json = filemd5("${path.module}/../../services/common/package.json"),
    force_rebuild = "2" # Incrementar este valor para forzar la reconstrucción
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../../services/common"
    command     = <<EOT
      $ErrorActionPreference = 'Stop'

      Write-Host "Limpiando directorios..."
      if (Test-Path "nodejs") { Remove-Item -Recurse -Force "nodejs" }
      if (Test-Path "layer.zip") { Remove-Item -Force "layer.zip" }

      Write-Host "Creando estructura de directorios para el layer..."
      New-Item -ItemType Directory -Path "nodejs" -Force
      
      Write-Host "Copiando package.json..."
      Copy-Item -Path "package.json" -Destination "nodejs/"
      
      Write-Host "Instalando dependencias en el directorio nodejs..."
      Set-Location -Path "nodejs"
      npm install --production
      Set-Location -Path ".."
      
      Write-Host "Verificando instalación de express..."
      if (-not (Test-Path "nodejs/node_modules/express")) {
        Write-Error "Express no se instaló correctamente"
        exit 1
      }
      
      Write-Host "Listando contenido del directorio nodejs..."
      Get-ChildItem -Path "nodejs" -Recurse | Select-Object -First 10
      
      Write-Host "Creando layer.zip..."
      Compress-Archive -Path "nodejs/*" -DestinationPath "layer.zip" -Force
      
      Write-Host "Layer creado exitosamente"
    EOT
    interpreter = ["powershell", "-Command"]
  }
}

data "archive_file" "layer" {
  type        = "zip"
  source_dir  = "${path.module}/../../services/common/nodejs"
  output_path = "${path.module}/../../services/common/layer.zip"
  depends_on  = [null_resource.build_layer]
} 