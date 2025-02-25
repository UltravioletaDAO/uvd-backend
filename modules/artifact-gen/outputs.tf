output "artifact_path" {
  description = "Ruta al archivo zip generado"
  value       = "${var.source_dir}/${var.artifact_name}"
}

output "bucket_name" {
  description = "Nombre del bucket S3"
  value       = aws_s3_bucket.artifacts.id
}

output "artifact_key" {
  description = "Key del artifact en S3"
  value       = data.aws_s3_object.lambda_artifact.key
} 