variable "state_bucket_name" {
  description = "Nombre del bucket para el state"
  type        = string
}

variable "locks_table_name" {
  description = "Nombre de la tabla DynamoDB para locks"
  type        = string
} 