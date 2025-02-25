resource "aws_s3_bucket" "artifacts" {
  bucket = var.artifacts_bucket_name
  force_destroy = true  # Permitir borrar el bucket con contenido
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Calcular hash de todo el directorio
data "external" "source_hash" {
  program = ["powershell", "-Command", <<EOT
    $path = Resolve-Path '${var.source_dir}'
    $exclude = @('.env', '.git', '*.test.js', 'node_modules', '*.zip')

    # Redirigir logs a stderr para no interferir con el output JSON
    $files = Get-ChildItem -Path $path -Recurse -File | 
      Where-Object { 
        $file = $_
        -not ($exclude | Where-Object { $file.FullName -like "*$_*" })
      } | Sort-Object FullName

    [Console]::Error.WriteLine("Files to hash:")
    $files | ForEach-Object { [Console]::Error.WriteLine($_.FullName) }

    $hash = ($files | Get-FileHash | Select-Object -ExpandProperty Hash) -join ''
    $hash = Get-FileHash -InputStream ([System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($hash))).Hash

    [Console]::Error.WriteLine("Calculated hash: $hash")
    
    # Solo el JSON va a stdout
    ConvertTo-Json @{ hash = $hash }
  EOT
  ]
}

# Verificar si el archivo existe en S3
data "aws_s3_objects" "check_artifact" {
  bucket = aws_s3_bucket.artifacts.bucket
  prefix = var.artifact_name
}

locals {
  # Forzar build si el archivo no existe en S3
  force_build = length(data.aws_s3_objects.check_artifact.keys) == 0
}

resource "null_resource" "build_artifact" {
  triggers = {
    source_hash = data.external.source_hash.result.hash
    force_build = local.force_build
  }

  provisioner "local-exec" {
    command = <<EOT
      $ErrorActionPreference = 'Stop'
      Set-Location "${var.source_dir}"
      
      # Solo excluir archivos de desarrollo
      $excludeFilter = @('.env', '.git', '.gitignore', '*.test.js', '*.zip')
      $files = Get-ChildItem -Exclude $excludeFilter
      
      if (Test-Path "${var.artifact_name}") {
        Remove-Item "${var.artifact_name}" -Force
      }
      
      Compress-Archive -Path $files -DestinationPath "${var.artifact_name}" -Force
      
      # Subir a S3
      aws s3 cp "${var.artifact_name}" "s3://${aws_s3_bucket.artifacts.id}/${var.artifact_name}"
    EOT
    interpreter = ["powershell", "-Command"]
  }
}

# Esperar después del build
resource "time_sleep" "wait_for_artifact" {
  depends_on = [null_resource.build_artifact]
  create_duration = "15s"

  triggers = {
    # Forzar espera cuando el build se recrea
    build_id = null_resource.build_artifact.id
  }
}

data "aws_s3_object" "lambda_artifact" {
  bucket = aws_s3_bucket.artifacts.id
  key    = var.artifact_name
  depends_on = [
    time_sleep.wait_for_artifact,
    null_resource.build_artifact
  ]
}

# Agregar un output para debug
output "build_id" {
  value = null_resource.build_artifact.id
}

output "artifact_exists" {
  value = local.force_build ? "No" : "Yes"
} 