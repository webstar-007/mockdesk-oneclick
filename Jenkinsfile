// ONE CLICK: Build with Parameters -> ACTION = deploy
// At the end the website is live at http://<server-ip>  (open it on your laptop AND your phone).
//
// ACTION choices:
//   deploy      build everything (server, firewall, IP) and release the app. Safe to run again: only changes are applied.
//   update-app  you changed the code and pushed to GitHub: put the new version on the existing server (about 2 minutes)
//   logs        show the latest server log (in test mode the sign-in codes are printed there)
//   backup-db   copy the database to the Jenkins workspace (folder backups/) and keep it as a build artifact
//   destroy     delete everything on AWS
//
// Jenkins needs: Terraform, Ansible, AWS CLI, tar, curl for the "jenkins" user, and a credential of
// kind "Username with password" with ID aws-creds (username = access key id, password = secret key).
// It is the SAME credential the kafka-oneclick job uses.

pipeline {
  agent any

  parameters {
    choice(name: 'ACTION', choices: ['deploy', 'update-app', 'logs', 'backup-db', 'destroy'], description: 'What to do')
    string(name: 'AWS_REGION', defaultValue: 'us-east-1', description: 'AWS region')
    string(name: 'ADMIN_EMAILS', defaultValue: '', description: 'Optional. Comma separated emails that become admins when they sign up (for example you@gmail.com). Also see app/admins.txt')
  }

  environment {
    AWS_DEFAULT_REGION  = "${params.AWS_REGION}"
    TF_IN_AUTOMATION    = 'true'
    ANSIBLE_FORCE_COLOR = 'true'
  }

  options {
    timestamps()
    disableConcurrentBuilds()          // two builds must never use the same Terraform state
    timeout(time: 45, unit: 'MINUTES')
  }

  stages {

    stage('1. Get the code') {
      steps { checkout scm }
    }

    stage('2. Check the tools') {
      when { expression { params.ACTION in ['deploy', 'update-app', 'destroy'] } }
      steps {
        sh 'terraform version | head -1 && ansible --version | head -1 && aws --version && tar --version | head -1'
      }
    }

    stage('3. Pack the app') {
      when { expression { params.ACTION in ['deploy', 'update-app'] } }
      steps {
        // node_modules, dist and data are never sent: the server installs and builds them itself.
        sh '''
          rm -f /tmp/mockdesk-app.tgz
          tar czf /tmp/mockdesk-app.tgz -C app --exclude=node_modules --exclude=dist --exclude=data --exclude='*.db*' --exclude=.env .
          ls -lh /tmp/mockdesk-app.tgz
        '''
      }
    }

    stage('4. Terraform: build the server on AWS') {
      when { expression { params.ACTION == 'deploy' } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'aws-creds', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
          sh '''
            terraform -chdir=terraform init -input=false
            terraform -chdir=terraform validate
            terraform -chdir=terraform apply -auto-approve -input=false -var region=${AWS_REGION}
          '''
        }
      }
    }

    stage('5. Ansible: prepare the server') {
      when { expression { params.ACTION == 'deploy' } }
      steps { dir('ansible') { sh 'ansible-playbook site.yml --tags install -e admin_emails="${ADMIN_EMAILS}"' } }
    }

    stage('6. Ansible: release the app') {
      when { expression { params.ACTION in ['deploy', 'update-app'] } }
      steps {
        dir('ansible') {
          sh '''
            test -f inventory.ini || { echo "No server found. Run ACTION=deploy first."; exit 1; }
            ansible-playbook site.yml --tags release -e app_archive=/tmp/mockdesk-app.tgz -e release_id=b${BUILD_NUMBER}-$(date +%Y%m%d%H%M%S) -e admin_emails="${ADMIN_EMAILS}"
          '''
        }
      }
    }

    stage('7. Verify the site') {
      when { expression { params.ACTION in ['deploy', 'update-app'] } }
      steps {
        dir('ansible') { sh 'ansible-playbook site.yml --tags verify' }
        sh '''
          IP=$(awk -F'ansible_host=' '/ansible_host=/{split($2,a," "); print a[1]; exit}' ansible/inventory.ini)
          for i in $(seq 1 15); do
            if curl -fsS -m 5 http://$IP/api/health > /dev/null; then
              echo ""
              echo "=================================================="
              echo " MOCKDESK IS LIVE:  http://$IP"
              echo " Open it on your laptop and on your phone."
              echo "=================================================="
              echo "http://$IP" > site-url.txt
              exit 0
            fi
            sleep 4
          done
          echo "The server is up but port 80 is not reachable from Jenkins. Check the firewall (allowed_web_cidr) and your network."
          exit 1
        '''
        script { currentBuild.description = readFile('site-url.txt').trim() }
      }
    }

    stage('Logs') {
      when { expression { params.ACTION == 'logs' } }
      steps { dir('ansible') { sh 'ansible-playbook site.yml --tags logs' } }
    }

    stage('Backup the database') {
      when { expression { params.ACTION == 'backup-db' } }
      steps {
        dir('ansible') { sh 'ansible-playbook site.yml --tags backup -e release_id=$(date +%Y%m%d-%H%M%S)' }
        archiveArtifacts artifacts: 'backups/*.db', fingerprint: true
      }
    }

    stage('Destroy: delete everything') {
      when { expression { params.ACTION == 'destroy' } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'aws-creds', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
          sh '''
            terraform -chdir=terraform init -input=false
            terraform -chdir=terraform destroy -auto-approve -input=false -var region=${AWS_REGION}
            rm -f site-url.txt
          '''
        }
      }
    }
  }

  post {
    success { echo "Finished: ${params.ACTION}" }
    failure { echo 'FAILED. If the server was created, run again with ACTION=destroy to stop AWS charges.' }
    // No cleanWs() on purpose: the workspace holds the Terraform state and the SSH key.
  }
}
