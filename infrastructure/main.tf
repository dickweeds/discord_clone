terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# --- Security Group ---

resource "aws_security_group" "app" {
  name        = "discweeds-sg"
  description = "allows disc weeds cicd"

  # HTTPS
  ingress {
    description = "web traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP (redirect to HTTPS + ACME challenge)
  ingress {
    description = "Lets Encrypt + redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # TURN/STUN (coturn)
  ingress {
    description = "STUN"
    from_port   = 3478
    to_port     = 3478
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # TURN relay ports (coturn)
  ingress {
    description = "TURN/media relay"
    from_port   = 49152
    to_port     = 49252
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # mediasoup RTP ports (single slot — Swarm stop-first, no blue-green split)
  ingress {
    from_port   = 40000
    to_port     = 40049
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All egress (required for Supabase connectivity, GHCR pulls, SSM)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

}

# --- EC2 Instance ---

resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  vpc_security_group_ids = [aws_security_group.app.id]

  root_block_device {
    volume_size = 20
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Install Docker
    apt-get update
    apt-get install -y ca-certificates curl gnupg jq
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Add ubuntu user to docker group
    usermod -aG docker ubuntu

    # Install SSM Agent
    snap install amazon-ssm-agent --classic
    systemctl enable amazon-ssm-agent
    systemctl start amazon-ssm-agent
  EOF

  tags = {
    Name = "discweeds"
  }

  lifecycle {
    ignore_changes = [ami, user_data, key_name]
  }
}

# --- IAM Role for EC2 (SSM + CloudWatch + SSM Parameter Store) ---

resource "aws_iam_role" "ec2" {
  name = "discord-clone-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "ec2_cloudwatch" {
  name = "cloudwatch-logs"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ]
      Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/discord-clone/*"
    }]
  })
}

resource "aws_iam_role_policy" "ec2_ssm_params" {
  name = "ssm-parameter-store"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/discord-clone/*"
      },
      {
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = "arn:aws:kms:${var.aws_region}:*:key/*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ec2_s3_assets" {
  name = "s3-assets-read"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.assets.arn,
        "${aws_s3_bucket.assets.arn}/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "ec2_s3_soundboard" {
  name = "s3-soundboard-readwrite"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.soundboard.arn,
        "${aws_s3_bucket.soundboard.arn}/*"
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "discord-clone-ec2"
  role = aws_iam_role.ec2.name
}

# --- GitHub Actions OIDC Provider ---

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]

  lifecycle {
    ignore_changes = [tags, tags_all, thumbprint_list]
  }
}

# --- IAM Role for GitHub Actions Deploy ---

resource "aws_iam_role" "deploy" {
  name = "discord-clone-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:environment:production"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy_ssm" {
  name = "ssm-deploy"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:SendCommand",
        ]
        Resource = [
          aws_instance.app.arn,
          "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "deploy_s3" {
  name = "s3-assets-write"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.assets.arn,
        "${aws_s3_bucket.assets.arn}/*"
      ]
    }]
  })
}

# --- S3 Bucket for Download Assets ---

resource "aws_s3_bucket" "assets" {
  bucket = var.assets_bucket_name
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "expire-old-assets"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# --- S3 Bucket for Soundboard Audio ---

resource "aws_s3_bucket" "soundboard" {
  bucket = var.soundboard_bucket_name
}

resource "aws_s3_bucket_public_access_block" "soundboard" {
  bucket                  = aws_s3_bucket.soundboard.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "soundboard" {
  bucket = aws_s3_bucket.soundboard.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "soundboard" {
  bucket = aws_s3_bucket.soundboard.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "soundboard" {
  bucket = aws_s3_bucket.soundboard.id

  rule {
    id     = "cleanup-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "soundboard" {
  bucket = aws_s3_bucket.soundboard.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET"]
    # Electron uses custom protocol origins; presigned URLs are time-limited and IAM-authenticated
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}
