variable "layer_name" {
  description = "Nombre del Lambda Layer"
  type        = string
}

variable "source_dir" {
  description = "Directorio donde se encuentra el código del layer"
  type        = string
}

variable "artifact_bucket" {
  description = "Bucket S3 para el paquete del layer"
  type        = string
}

variable "artifact_key" {
  description = "Clave del objeto S3 para el layer"
  type        = string
}

variable "compatible_runtimes" {
  description = "Runtimes compatibles con este layer"
  type        = list(string)
  default     = ["nodejs18.x"]
}

variable "description" {
  description = "Descripción del layer"
  type        = string
  default     = ""
}
