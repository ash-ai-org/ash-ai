output "nlb_dns" {
  description = "DNS name of the NLB"
  value       = aws_lb.ash.dns_name
}

output "ash_url" {
  description = "Full URL for the Ash server"
  value       = "http://${aws_lb.ash.dns_name}:4100"
}

output "ash_api_key" {
  description = "API key for authenticating requests"
  value       = var.ash_api_key
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.ash.name
}

output "log_group_name" {
  description = "CloudWatch log group for the Ash runtime"
  value       = aws_cloudwatch_log_group.runtime.name
}

output "target_group_arn" {
  description = "ARN of the NLB target group"
  value       = aws_lb_target_group.ash.arn
}
