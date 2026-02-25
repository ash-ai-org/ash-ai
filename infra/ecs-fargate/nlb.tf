# --- Network Load Balancer ---

resource "aws_lb" "ash" {
  name               = "${var.cluster_name}-nlb"
  internal           = false
  load_balancer_type = "network"
  subnets            = local.subnet_ids
}

# --- Target Group ---

resource "aws_lb_target_group" "ash" {
  name        = "${var.cluster_name}-tg"
  port        = 4100
  protocol    = "TCP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    protocol            = "HTTP"
    path                = "/health"
    port                = "4100"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    interval            = 30
  }
}

# --- Listener ---

resource "aws_lb_listener" "ash" {
  load_balancer_arn = aws_lb.ash.arn
  port              = 4100
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ash.arn
  }
}
