# GitHub Actions Deployment to a Windows Cloud PC

The deployment workflow runs on a self-hosted GitHub Actions runner installed on
the Windows Cloud PC. The runner initiates outbound connections to GitHub, so
the Cloud PC does not need an inbound SSH port for deployments.

The workflow deploys each push to `main` by fast-forwarding the existing clone,
building and restarting the Docker Compose services, then checking
`http://localhost:3000/health`.

## One-time setup on the Cloud PC

1. Keep the application repository cloned at a permanent path, such as
   `C:\Users\ThangLuu\Projects\rag-chatbot`. Keep the machine's `.env` in that
   directory; `.env` is ignored by Git and the workflow does not overwrite it.
2. Confirm that this clone is on `main`, has no local source changes, and can
   fetch `origin/main` using the GitHub SSH key available to the runner account.
3. Confirm that Docker and Compose work under the same Windows account that
   will run the GitHub Actions runner:

   ```powershell
   docker compose version
   docker compose -f C:\Users\ThangLuu\Projects\rag-chatbot\docker-compose.yml ps
   ```

4. In the repository on GitHub, open **Settings → Actions → Runners → New
   self-hosted runner**, select **Windows x64**, and follow GitHub's current
   setup commands on the Cloud PC. Configure the runner to run as an account
   that can access the repository clone, its SSH key, and the Docker engine.
5. In **Settings → Environments → Prod → Environment variables**, add the
   variable `DEPLOY_PATH` with the absolute path to the clone, for example
   `C:\Users\ThangLuu\Projects\rag-chatbot`. The deploy job targets the `Prod`
   environment so it can read this variable. If `Prod` has required reviewers,
   GitHub will wait for approval before starting the deployment.

The runner must be online for a deployment to start. Do not configure it to run
workflows from pull requests; this workflow deploys only from `main`.

## Deploy

Merge a change into `main` to deploy automatically. You can also run **Deploy to
Windows Cloud PC** manually from the Actions tab while selecting `main`.

The workflow fails before deployment if `DEPLOY_PATH` is missing, the clone is
not on `main`, or the clone has local changes. It then runs
`docker compose up --detach --build --remove-orphans` and retries the app health
endpoint for up to two minutes.

The deployment uses the existing `docker-compose.yml` and its machine-local
`.env`. Cloudflare Tunnel runs separately from this workflow; a Quick Tunnel
remains temporary and its PowerShell process must stay running. A named Tunnel
can later run as a Windows service without changing this deployment workflow.
