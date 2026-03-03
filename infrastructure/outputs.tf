output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.app.id
}

output "deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions deploy"
  value       = aws_iam_role.deploy.arn
}

output "instance_public_ip" {
  description = "EC2 public IP address"
  value       = aws_instance.app.public_ip
}

output "assets_bucket_name" {
  description = "S3 bucket for download assets"
  value       = aws_s3_bucket.assets.id
}

output "soundboard_bucket_name" {
  description = "S3 bucket for soundboard audio"
  value       = aws_s3_bucket.soundboard.id
}
