# These are the only settings you may want to change. Defaults work as they are.

variable "region" {
  type    = string
  default = "us-east-1"
}

# Used in names and tags: mockdesk-demo-vpc, mockdesk-demo-key, ...
variable "project" {
  type    = string
  default = "mockdesk-demo"
}

# t3.small (2 GB) is allowed on new AWS free-plan accounts and is plenty for testing.
variable "instance_type" {
  type    = string
  default = "t3.small"
}

# Who may SSH to the server. "0.0.0.0/0" = anyone, but the login still needs the private key file.
# Jenkins must be able to reach it, so keep it open unless you know your Jenkins IP.
variable "allowed_ssh_cidr" {
  type    = string
  default = "0.0.0.0/0"
}

# Who may open the website (port 80). "0.0.0.0/0" = any phone or laptop.
# For a private test use your own IP, e.g. "203.0.113.7/32" (a phone on mobile data has another IP, so keep it open to test on a phone).
variable "allowed_web_cidr" {
  type    = string
  default = "0.0.0.0/0"
}

variable "disk_gb" {
  type    = number
  default = 20
}
