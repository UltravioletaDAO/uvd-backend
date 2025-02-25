terraform {
  backend "s3" {
    bucket         = "ultravioleta-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-2"
    encrypt        = true
    dynamodb_table = "ultravioleta-terraform-locks"
  }
} 