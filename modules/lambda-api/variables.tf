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

variable "s3_read_buckets" {
  description = "Lista de buckets S3 a los que la Lambda necesita acceso de lectura"
  type        = list(string)
  default     = []
}

variable "debug" {
  description = "Habilitar modo debug en la función Lambda"
  type        = string
  default     = "false"
}

variable "log_level" {
  description = "Nivel de logging de la función Lambda"
  type        = string
  default     = "error"
} 