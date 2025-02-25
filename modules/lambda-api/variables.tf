variable "function_name" {
  description = "Nombre de la función Lambda"
  type        = string
}

variable "source_dir" {
  description = "Directorio donde se encuentra el código fuente de la función Lambda"
  type        = string
}

variable "artifact_bucket" {
  description = "Bucket S3 donde se almacenará el paquete de la función Lambda"
  type        = string
}

variable "artifact_key" {
  description = "Clave del objeto S3 para el paquete de la función Lambda"
  type        = string
}

variable "environment_variables" {
  description = "Variables de entorno para la función Lambda"
  type        = map(string)
  default     = {}
} 