variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "Name for the ECS cluster and resource prefix"
  type        = string
  default     = "ash"
}

variable "vpc_id" {
  description = "VPC ID to deploy into (uses default VPC if empty)"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Subnet IDs for the NLB and ECS tasks (need at least 2 for NLB). Uses default VPC public subnets if empty."
  type        = list(string)
  default     = []
}

variable "ash_image" {
  description = "Docker image for the Ash server"
  type        = string
  default     = "ghcr.io/ash-ai-org/ash:latest"
}

variable "ecs_cpu" {
  description = "Fargate task CPU units (256, 512, 1024, 2048, 4096)"
  type        = string
  default     = "512"
}

variable "ecs_memory" {
  description = "Fargate task memory in MB"
  type        = string
  default     = "1024"
}

variable "ash_max_sandboxes" {
  description = "Maximum number of concurrent sandboxes"
  type        = string
  default     = "20"
}

variable "ash_api_key" {
  description = "API key for authenticating requests to the Ash server. If empty, the server auto-generates one on first start (check CloudWatch logs for the key)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "ash_internal_secret" {
  description = "Shared secret for coordinator/runner internal communication"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key for agent execution"
  type        = string
  sensitive   = true
}
