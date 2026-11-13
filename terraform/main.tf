# ============================================================================
# Everything Terraform builds on AWS, in reading order:
#   1. SSH key   2. Network   3. Firewall   4. Server + fixed IP   5. Ansible inventory
# One server runs the whole MockDesk site (Node app + SQLite database).
# ============================================================================

# Zones that offer our server type (for example us-east-1e does not offer t3.small)
data "aws_ec2_instance_type_offerings" "web" {
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}

# Latest Ubuntu 22.04 image published by Canonical
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

locals {
  az   = sort(tolist(data.aws_ec2_instance_type_offerings.web.locations))[0]
  tags = { Project = var.project } # every resource gets this tag, so we can find and check it later
}

# ---------- 1. SSH key: created here, saved in keys/, never committed to Git ----------
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "this" {
  key_name   = "${var.project}-key"
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "local_sensitive_file" "pem" {
  content         = tls_private_key.ssh.private_key_pem
  filename        = "${path.module}/../keys/${var.project}.pem"
  file_permission = "0600"
}

# ---------- 2. Network: one VPC, one public subnet ----------
resource "aws_vpc" "this" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  tags                 = merge(local.tags, { Name = "${var.project}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${var.project}-igw" })
}

resource "aws_subnet" "this" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = "10.20.0.0/24"
  availability_zone       = local.az
  map_public_ip_on_launch = true
  tags                    = merge(local.tags, { Name = "${var.project}-subnet" })
}

resource "aws_route_table" "this" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(local.tags, { Name = "${var.project}-rt" })
}

resource "aws_route_table_association" "this" {
  subnet_id      = aws_subnet.this.id
  route_table_id = aws_route_table.this.id
}

# ---------- 3. Firewall (security group) ----------
resource "aws_security_group" "web" {
  name        = "${var.project}-web"
  description = "MockDesk website (80) and SSH (22, key login only)"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "Website for phones and laptops"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.allowed_web_cidr]
  }
  ingress {
    description = "SSH for Jenkins and Ansible"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${var.project}-web-sg" })
}

# ---------- 4. Server and a fixed public IP (the address stays the same if the server restarts) ----------
resource "aws_instance" "web" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.this.id
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.web.id]

  root_block_device {
    volume_size = var.disk_gb
    volume_type = "gp3"
  }

  tags = merge(local.tags, { Name = "${var.project}-web", Role = "web" })
}

resource "aws_eip" "web" {
  domain     = "vpc"
  instance   = aws_instance.web.id
  depends_on = [aws_internet_gateway.this]
  tags       = merge(local.tags, { Name = "${var.project}-ip" })
}

# ---------- 5. Ansible inventory: written from the real IP ----------
resource "local_file" "inventory" {
  filename = "${path.module}/../ansible/inventory.ini"
  content = templatefile("${path.module}/inventory.tftpl", {
    ip       = aws_eip.web.public_ip
    key_path = abspath(local_sensitive_file.pem.filename)
  })
}
