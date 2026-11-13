# MockDesk one-click on AWS (for testing on laptop and phone)

One click in Jenkins builds a server on AWS (Terraform), installs and starts MockDesk on it (Ansible), and prints a link like **http://54.12.34.56**. Open it on your laptop and on your phone. One more click deletes everything.

```
GitHub -> Jenkins -> Terraform (1 server + firewall + fixed IP) -> Ansible (Node, app, service) -> health check -> http://<ip>
```

## Start here
1. `./scripts/check-ready.sh`: is my laptop ready? (same as for the Kafka kit)
2. Follow `docs/02-SETUP-GUIDE.md` (GitHub, Jenkins job, the click).
3. Test on your phone with `docs/03-TEST-ON-PHONE.md`.
4. After destroying with Jenkins: `./scripts/check-destroyed.sh`.

## Jenkins actions
| ACTION | What it does |
|---|---|
| `deploy` | Builds the server and releases the app. Safe to run again. |
| `update-app` | You changed code and pushed it: puts the new version on the same server (about 2 minutes). Student data is kept. |
| `logs` | Shows the latest server log. In test mode, sign-in codes are printed there. |
| `backup-db` | Copies the database to the Jenkins workspace and keeps it as a build artifact. |
| `destroy` | Deletes everything on AWS. |

## What is inside
| Folder | What it is |
|---|---|
| `app/` | The MockDesk website and server (your code lives here) |
| `terraform/` | The AWS server, firewall, fixed IP, SSH key |
| `ansible/` | One role: install Node.js, create the service, release a version, verify |
| `scripts/` | `check-ready.sh`, `check-destroyed.sh` |
| `docs/` | Infrastructure, setup guide, phone testing, troubleshooting and cost |

Same as the Kafka kit: the Jenkins credential **aws-creds**, region **us-east-1**, server type **t3.small**, Ubuntu 22.04, the SSH key made by Terraform in `keys/`. Different: project name `mockdesk-demo`, Jenkins job name `mockdesk-oneclick`, its own network (10.20.0.0/16), so both kits can exist at the same time.

A test setup: plain HTTP (no certificate), one server, region us-east-1, about **$0.03 per hour** (about $20 a month if left running). Destroy when you finish.
