# 04 · Troubleshooting, cost, and going to real users

## When something fails
| Symptom | Cause and fix |
|---|---|
| Stage 2 "terraform: command not found" | Jenkins user cannot see the tools. Run `./scripts/check-ready.sh`. |
| Stage 4 "InvalidKeyPair.Duplicate" / key exists | An old run left `mockdesk-demo-key`. Run `ACTION=destroy`, or delete the key pair in EC2 > Key Pairs. |
| Stage 4 "InstanceLimitExceeded" or type not allowed | Account limits. Another Kafka run may still be up (4 servers). Destroy it first. |
| Stage 5 "Timeout waiting for SSH" | The server is still booting. Run `deploy` again. |
| Stage 6 `npm ci` fails | The server cannot reach npmjs.org for a moment. Run `update-app` again. |
| Stage 7 health check fails | Run `ACTION=logs` to see the error. Usually a mistake in a changed file. The site has already switched to the new version, so fix the code, push, and run `update-app` again. |
| Link does not open on the phone | Use `http://` not `https://`. Check `allowed_web_cidr` in `terraform/variables.tf` is `0.0.0.0/0`. |
| "update-app: No server found" | There is no `ansible/inventory.ini` in the Jenkins workspace. Run `deploy` first. |
| Sign-in code does not arrive | Test mode has no email or SMS provider. The code is in the log: `ACTION=logs`. |

## Cost (us-east-1, approximate, check the AWS pricing pages)
| Item | Per hour | Per month if left on |
|---|---|---|
| t3.small server | about $0.021 | about $15 |
| 20 GB gp3 disk | | about $1.60 |
| Public IPv4 address | about $0.005 | about $3.60 |
| Data transfer | first 100 GB out per month free | $0 for testing |
| **Total** | **about $0.03** | **about $20** |

A test of two hours costs a few cents. **Always run destroy and `check-destroyed.sh` when you finish.** An Elastic IP that is not attached costs money, which is why the check script looks for it.

## Moving to real students later
1. **A domain name and HTTPS.** Point a domain at the Elastic IP and put Caddy in front of the app (free certificates from Let's Encrypt). Then set `app_env: production` in `ansible/roles/mockdesk/defaults/main.yml`.
2. **A real OTP sender.** In production mode the app refuses to print codes. Set the SMTP variables (`smtp_host`, `smtp_user`, `smtp_pass`, `mail_from`) for email codes, for example with Amazon SES.
3. **Backups.** Schedule `ACTION=backup-db` or copy the database to S3 every night.
4. **Closing SSH.** Set `allowed_ssh_cidr` to the address of your Jenkins machine.

Ask for the "go live" version of this kit when you are ready: it adds Caddy, a domain, nightly S3 backups and a mobile (PWA) install option.
