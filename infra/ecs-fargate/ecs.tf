# --- ECS Cluster ---

resource "aws_ecs_cluster" "main" {
  name = var.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# --- CloudWatch Log Group ---

resource "aws_cloudwatch_log_group" "runtime" {
  name              = "/${var.cluster_name}/runtime"
  retention_in_days = 30
}

# --- Task Definition ---

resource "aws_ecs_task_definition" "ash" {
  family                   = "${var.cluster_name}-runtime"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "ash"
      image     = var.ash_image
      essential = true

      portMappings = [
        {
          containerPort = 4100
          hostPort      = 4100
          protocol      = "tcp"
        }
      ]

      environment = concat([
        { name = "ASH_MODE", value = "standalone" },
        { name = "ASH_MAX_SANDBOXES", value = var.ash_max_sandboxes },
        { name = "ASH_INTERNAL_SECRET", value = var.ash_internal_secret },
        { name = "ANTHROPIC_API_KEY", value = var.anthropic_api_key },
      ], var.ash_api_key != "" ? [{ name = "ASH_API_KEY", value = var.ash_api_key }] : [])

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.runtime.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ash"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:4100/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# --- ECS Service ---

resource "aws_ecs_service" "ash" {
  name            = "${var.cluster_name}-runtime"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ash.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.subnet_ids
    security_groups  = [aws_security_group.ash.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ash.arn
    container_name   = "ash"
    container_port   = 4100
  }

  depends_on = [aws_lb_listener.ash]
}
