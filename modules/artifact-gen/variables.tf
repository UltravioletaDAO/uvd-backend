variable "artifacts_bucket_name" {
  description = "Nombre del bucket para los artifacts"
  type        = string
}

variable "source_dir" {
  description = "Directorio que contiene el código fuente"
  type        = string
}

variable "artifact_name" {
  description = "Nombre del archivo zip del artifact"
  type        = string
} 