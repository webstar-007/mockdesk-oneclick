# 01 · The infrastructure

One server runs everything: the Node.js app, the website files and the SQLite database.

```
phone / laptop --HTTP:80--> [ AWS server t3.small, Ubuntu 22.04 ]
                              node server/index.js  (systemd service "mockdesk")
                              /opt/mockdesk/current  -> latest release (code)
                              /var/lib/mockdesk      -> database + uploaded images (kept across updates)
```

| Piece | Details |
|---|---|
| Server | 1 x t3.small (2 GB RAM), 20 GB gp3 disk |
| Network | own VPC 10.20.0.0/16, one public subnet, internet gateway |
| Fixed IP | an Elastic IP, so the link does not change if the server restarts |
| Firewall | port 80 from anywhere (website), port 22 from anywhere (SSH, key file required) |
| SSH key | created by Terraform, saved to `keys/mockdesk-demo.pem` |
| Tags | every resource has `Project=mockdesk-demo`, so `check-destroyed.sh` can find leftovers |

## Why one server, no load balancer or database service
MockDesk keeps its data in a SQLite file, so it must run as **one copy with a disk**. That is also why it is cheap. For testing and for a few thousand students this is enough.

## Folders on the server
| Path | Contents | Touched by an update? |
|---|---|---|
| `/opt/mockdesk/releases/<id>/` | one folder per version (the last 3 are kept) | new one added |
| `/opt/mockdesk/current` | link to the active release | switched |
| `/var/lib/mockdesk/mockdesk.db` | all users, attempts, mocks | **never** |
| `/var/lib/mockdesk/uploads/` | images added by the admin | **never** |
| `/etc/mockdesk.env` | settings (port, mode, admin emails, optional SMTP) | rewritten on `deploy` |

## Test mode vs production mode
The service starts with `NODE_ENV=development`:
- Works over plain HTTP (cookies are not marked Secure).
- Without an email or SMS provider, the **one-time code is printed in the log** (use the `logs` action).
- **Password sign-in always works**, so you can test by creating an account with email and password.

Do not use this mode for real students. For them you need HTTPS and a real OTP provider (see doc 04).
