variable "function_name" {
  description = "Nombre de la función Lambda (también nombra la API y el rol)"
  type        = string
  default     = "uvd-stream-search"
}

variable "index_bucket" {
  description = "Bucket S3 donde vive el índice FTS5"
  type        = string
  default     = "ultravioletadao"
}

variable "index_key" {
  description = "Key del índice SQLite dentro del bucket"
  type        = string
  default     = "stream-search/search.db"
}

variable "code_zip_path" {
  description = "Ruta al zip del código (solo referencia; el código se despliega con uvdweb/infra/stream-search/deploy.sh)"
  type        = string
}

variable "log_retention_days" {
  description = "Retención del log group de la Lambda"
  type        = number
  default     = 14
}

variable "cors_allow_origins" {
  description = "Orígenes permitidos por CORS en la API"
  type        = list(string)
  default     = ["https://ultravioletadao.xyz", "https://dev.ultravioletadao.xyz", "http://localhost:3000"]
}
