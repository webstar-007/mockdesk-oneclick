#!/usr/bin/env bash
# SCRIPT 2 of 2: is everything destroyed? Run it after Jenkins ACTION=destroy.
# It only READS things. Run it from the project folder:   ./scripts/check-destroyed.sh

REGION="${REGION:-us-east-1}"
JOB="${JOB:-mockdesk-oneclick}"
FAIL=0; WARN=0
ok()   { echo "  [ OK ]  $1"; }
bad()  { echo "  [FAIL]  $1"; FAIL=$((FAIL+1)); }
warn() { echo "  [WARN]  $1"; WARN=$((WARN+1)); }
count() { aws "$@" --region "$REGION" --output text 2>/dev/null || echo "?"; }
TAG="Name=tag:Project,Values=mockdesk-demo"

if ! aws sts get-caller-identity >/dev/null 2>&1; then echo "AWS login does not work (aws configure). Cannot check."; exit 2; fi
echo "Checking region $REGION for anything tagged Project=mockdesk-demo"

echo "1. AWS resources (all must be 0)"
N=$(count ec2 describe-instances --filters $TAG Name=instance-state-name,Values=pending,running,shutting-down,stopping,stopped --query 'length(Reservations[].Instances[])')
[ "$N" = "0" ] && ok "servers: 0" || bad "servers still present: $N"
N=$(count ec2 describe-vpcs --filters $TAG --query 'length(Vpcs)')
[ "$N" = "0" ] && ok "VPCs: 0" || bad "VPCs still present: $N"
N=$(count ec2 describe-subnets --filters $TAG --query 'length(Subnets)')
[ "$N" = "0" ] && ok "subnets: 0" || bad "subnets still present: $N"
N=$(count ec2 describe-security-groups --filters $TAG --query 'length(SecurityGroups)')
[ "$N" = "0" ] && ok "security groups: 0" || bad "security groups still present: $N"
N=$(count ec2 describe-internet-gateways --filters $TAG --query 'length(InternetGateways)')
[ "$N" = "0" ] && ok "internet gateways: 0" || bad "internet gateways still present: $N"
N=$(count ec2 describe-route-tables --filters $TAG --query 'length(RouteTables)')
[ "$N" = "0" ] && ok "route tables: 0" || bad "route tables still present: $N"
N=$(count ec2 describe-nat-gateways --filter $TAG Name=state,Values=pending,available,deleting --query 'length(NatGateways[?State!=`deleted`])')
[ "$N" = "0" ] && ok "NAT gateways: 0" || bad "NAT gateways present: $N (they cost money)"
if aws ec2 describe-key-pairs --region "$REGION" --key-names mockdesk-demo-key >/dev/null 2>&1; then bad "key pair mockdesk-demo-key still exists"; else ok "key pair: gone"; fi

echo "2. Things that could still cost money"
N=$(count ec2 describe-addresses --query 'length(Addresses)')
N=$(count ec2 describe-addresses --filters $TAG --query 'length(Addresses)')
[ "$N" = "0" ] && ok "Elastic IPs of this project: 0" || bad "Elastic IP still present: $N (it costs money while unused)"
N=$(count ec2 describe-volumes --filters Name=status,Values=available --query 'length(Volumes)')
[ "$N" = "0" ] && ok "unattached disks: 0" || warn "unattached disks: $N (not created by this project, check if they are yours)"

echo "3. Your laptop"
if sudo test -e "/var/lib/jenkins/workspace/$JOB/keys/mockdesk-demo.pem" 2>/dev/null; then bad "the SSH key file still exists in the Jenkins workspace"; else ok "SSH key file removed"; fi
if sudo test -e "/var/lib/jenkins/workspace/$JOB/ansible/inventory.ini" 2>/dev/null; then bad "ansible/inventory.ini still exists in the Jenkins workspace"; else ok "inventory file removed"; fi

echo
if [ $FAIL -eq 0 ]; then
  echo "RESULT: EVERYTHING IS DESTROYED. AWS no longer charges for this project. ($WARN warnings)"
else
  echo "RESULT: NOT CLEAN. $FAIL item(s) left. Run Jenkins ACTION=destroy again, or delete them by hand in the AWS console."
fi
exit $FAIL
