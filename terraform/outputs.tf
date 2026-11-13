output "public_ip" {
  value = aws_eip.web.public_ip
}

output "site_url" {
  value = "http://${aws_eip.web.public_ip}"
}
