# 02 · Setup guide: from zero to one click

You already did most of this for the Kafka kit (Jenkins, tools, the `aws-creds` credential). Only the repository and the job are new. Total: about 30 minutes, of which about 8 to 10 minutes is the pipeline running.

---
## Part A · Is my laptop ready? (3 min)
```
cd mockdesk-oneclick
code .
./scripts/check-ready.sh
```
**Check:** the last line says `RESULT: READY`. Fix every `[FAIL]`. `[WARN]` lines are fine.

---
## Part B · Put the project on GitHub (5 min)
1. On github.com click **New repository**, name it `mockdesk-oneclick`, no README.
2. In the VS Code terminal:
```
git init -b main
git add .
git status                   # keys/, tfstate, inventory.ini, node_modules must NOT be listed
git commit -m "MockDesk one-click"
git remote add origin https://github.com/<your-user>/mockdesk-oneclick.git
git push -u origin main      # user = your GitHub name, password = your token
```
**Check:** the files, including the `app` folder, are on github.com.

Why GitHub: Jenkins downloads the project from there at the start of every build. After any change you must `git add . && git commit -m "change" && git push`, otherwise Jenkins deploys the old version.

---
## Part C · Create the Jenkins job (5 min)
The credential `aws-creds` is the same one the Kafka job uses. Nothing to add.
(If the repo is private, use the same `github-token` credential as before.)

1. Dashboard > **New Item**, name `mockdesk-oneclick`, type **Pipeline**, OK.
2. Pipeline section:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/<your-user>/mockdesk-oneclick.git`
   - Credentials: `github-token` (or none if public)
   - Branch Specifier: `*/main`
   - Script Path: `Jenkinsfile`
3. **Save**.

---
## Part D · The one click (8 to 10 min)
1. Click **Build Now** once. It may stop fast: Jenkins only learns the parameters. First time only.
2. **Build with Parameters**: `ACTION = deploy`, `AWS_REGION = us-east-1`.
   `ADMIN_EMAILS` = your email (optional). Whoever signs up with that email becomes an admin.
3. **Build**. Open **Console Output** to watch.

**Check:** all stages are green and the end of the log shows
```
 MOCKDESK IS LIVE:  http://<ip>
```
The same link is shown as the build description in the Jenkins build list.

---
## Part E · Use it
Open the link on your laptop and phone (see `03-TEST-ON-PHONE.md`).
If you set ADMIN_EMAILS: create an account with that email, then open `<link>/admin`.

---
## Part F · Change something and apply it
1. Edit files inside `app/` (for example a question in `app/content/...`, or the screens in `app/src/...`).
2. `git add . && git commit -m "what I changed" && git push`
3. Jenkins > Build with Parameters > `ACTION = update-app`.

About 2 minutes. The new version is installed and built in a new folder, and the site is switched over only after that succeeds. If the install or build fails, the old version keeps running. If the new version starts but crashes, fix the code and run `update-app` again. **Users, attempts and uploaded images are not touched.**

---
## Part G · Destroy and check (5 min)
1. Build with Parameters > `ACTION = destroy` > Build. Wait for green.
2. `./scripts/check-destroyed.sh`

**Check:** `RESULT: EVERYTHING IS DESTROYED`.

If you want the data first: run `ACTION = backup-db` before destroying. The database file appears under **Build Artifacts** of that build.

---
## Quick reference
| I want to... | Jenkins: Build with Parameters |
|---|---|
| Build everything | ACTION = deploy |
| Apply my code changes | push to GitHub, then ACTION = update-app |
| See sign-in codes or errors | ACTION = logs |
| Save the database | ACTION = backup-db |
| Delete everything | ACTION = destroy, then `./scripts/check-destroyed.sh` |
