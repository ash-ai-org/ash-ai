resource "aws_security_group" "ash" {
  name        = "${var.cluster_name}-fargate"
  description = "Security group for Ash Fargate tasks"
  vpc_id      = local.vpc_id
}

resource "aws_security_group_rule" "egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ash.id
  description       = "Allow all outbound traffic"
}

resource "aws_security_group_rule" "ingress_ash" {
  type              = "ingress"
  from_port         = 4100
  to_port           = 4100
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ash.id
  description       = "Allow Ash API port from NLB"
}
