# GitHub Actions Deployment to a Windows Cloud PC

The deployment workflow runs on a self-hosted GitHub Actions runner installed on
the Windows Cloud PC. The runner initiates outbound connections to GitHub, so
the Cloud PC does not need an inbound SSH port for deployments.

The workflow deploys each push to `main` by fast-forwarding the existing clone
and building and restarting the Docker Compose services.

## One-time setup on the Cloud PC

1. Keep the application repository cloned at a permanent path, such as
   `C:\Users\ThangLuu\Projects\rag-chatbot`. The workflow overwrites `.env`
   on every deployment using GitHub Actions variables and secrets. It uses
   `.env.example` only to identify the supported keys, including commented
   optional entries; example values are never copied into `.env`.
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
   `C:\Users\ThangLuu\Projects\rag-chatbot`. Configure the application settings
   and credentials listed below in the same `Prod` environment. The deploy
   job targets `Prod` so it can read these values. If `Prod` has required
   reviewers, GitHub will wait for approval before starting the deployment.

The runner must be online for a deployment to start. Do not configure it to run
workflows from pull requests; this workflow deploys only from `main`.

## GitHub Actions configuration

Use the exact names from `.env.example`. Set non-secret configuration under
**Settings → Environments → Prod → Environment variables** (the workflow
reads these with `${{ vars.NAME }}`):

- Runtime: `NODE_ENV` (set this to `production`).
- Database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`.
- RabbitMQ (optional overrides): `RABBITMQ_EXCHANGE` (defaults to
  `ingest.topic`), `RABBITMQ_IMAGE_QUEUE` (defaults to `ingest.image.queue`),
  `RABBITMQ_PDF_QUEUE` (defaults to `ingest.pdf.queue`).
- Object storage: `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`,
  `OBJECT_STORAGE_BUCKET`.
- LLM: `LLM_PROVIDER`.
- Google sign-in: `GOOGLE_CLIENT_ID`, `GOOGLE_CALLBACK_URL`.

For example, create `LLM_PROVIDER` with value `anthropic`. The corresponding
API key goes under **Settings → Environments → Prod → Environment secrets**
(the workflow reads these with `${{ secrets.NAME }}`):

- `DB_PASS`.
- `RABBITMQ_URL` (the URL contains the broker credentials).
- `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`.
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TAVILY_API_KEY`.
- `LANGFUSE_SECRET_KEY`.
- `GOOGLE_CLIENT_SECRET`, `AUTH_JWT_SECRET`, `RECEIPT_CURSOR_HMAC_SECRET`.

The setup step requires `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`,
`RABBITMQ_URL`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`,
`OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`, `LLM_PROVIDER`,
`OPENAI_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALLBACK_URL`, `AUTH_JWT_SECRET`, and `RECEIPT_CURSOR_HMAC_SECRET`.
`OPENAI_API_KEY` is required for embeddings even when the LLM provider is
Anthropic. Set `ANTHROPIC_API_KEY` when `LLM_PROVIDER=anthropic` (the Python
worker also uses it for receipt processing). Set the Langfuse key pair when
`LANGFUSE_TRACING_ENABLED=true`. For Langfuse, also set the optional variables
`LANGFUSE_PUBLIC_KEY` and `LANGFUSE_BASE_URL` as needed.

Unset optional values are omitted from `.env`, allowing application defaults
to apply. If you do not set the optional RabbitMQ overrides, they default to
the values in `.env.example`. You can also omit `DB_SSL` (`false`),
`OBJECT_STORAGE_FORCE_PATH_STYLE` (`false`), `EMBEDDING_PROVIDER` (`openai`),
`LANGFUSE_TRACING_ENABLED` (`false`), `LANGFUSE_BASE_URL`,
`AUTH_JWT_EXPIRES_IN_SECONDS` (`86400`), and `PORT` (`3000`). Leave `LLM_MODEL`,
`ANTHROPIC_BASE_URL`, and `AUTH_SUCCESS_REDIRECT_URL` unset unless you need to
override their defaults. For Cloudflare R2, set
`OBJECT_STORAGE_REGION=auto` as shown in `.env.example`; the fallback region is
`us-east-1`. Set `GOOGLE_CALLBACK_URL` to the deployed callback URL registered
in Google Cloud. Set `NODE_ENV` to `production` for deployment; the template's
`development` value is for local use. Langfuse tracing is supported only in
`development` or `test`. Values must be single-line strings. No credentials
need to be committed or configured manually in the runner's `.env`.

## Deploy

Merge a change into `main` to deploy automatically. You can also run **Deploy to
Windows Cloud PC** manually from the Actions tab while selecting `main`.

The workflow fails before deployment if `DEPLOY_PATH` or required application
settings are missing, the clone is not on `main`, or the clone has local changes.
It then runs `docker compose up --detach --build --remove-orphans`.

The deployment uses the existing `docker-compose.yml` and the `.env` generated
from GitHub Actions configuration. Cloudflare Tunnel runs separately from this
workflow; a Quick Tunnel remains temporary and its PowerShell process must stay
running. A named Tunnel can later run as a Windows service without changing
this deployment workflow.
