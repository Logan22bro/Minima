# Minima

Minima is a live Nemotron-powered AI sustainability agent. It analyzes a prompt, shows an environmental "AI receipt," visualizes real-world equivalents, and rewrites wasteful prompts into lower-impact workflows before answer generation.

Minima fails closed without a live NVIDIA API key. It does not generate local answers. For prompt optimization, it tries Nemotron twice first; if both optimizer attempts fail validation, it uses a deterministic bounded rewrite so the pre-flight workflow never collapses into an API error.

## Local Run

```bash
export NVIDIA_API_KEY="your_key_here"
export NVIDIA_MODEL="nvidia/nemotron-3-nano-30b-a3b"
npm start
```

Open:

```text
http://localhost:3000
```

## Required Environment Variables

```bash
NVIDIA_API_KEY=your_key_here
NVIDIA_MODEL=nvidia/nemotron-3-nano-30b-a3b
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
PORT=3000
HOST_PORT=4000
```

Only `NVIDIA_API_KEY` is required. The other values have defaults. For Docker/Brev, `HOST_PORT` defaults to `4000` and maps to the app's internal container port `3000`.

## Brev Deployment

NVIDIA Brev runs GPU VM instances and supports Docker Compose workloads. Minima is packaged with:

```text
Procfile
Dockerfile
docker-compose.yml
scripts/brev-start.sh
```

### 1. Commit And Push To GitHub

From your local project folder:

```bash
cd /Users/lisareynoso/Documents/Codex/2026-05-14/nvidia-x-asus-hackathon-tomorrow-suggest
npm run check
rg -n --hidden --no-ignore -S "[n]vapi-" . -g '!.git/**'
git add .env.example .gitignore .dockerignore Procfile Dockerfile docker-compose.yml package.json package-lock.json README.md HACK_RUNBOOK.md public server.mjs scripts
git commit -m "Deploy Minima live Nemotron agent"
git branch -M main
```

Create an empty GitHub repo named `minima`, then connect and push:

```bash
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/minima.git
git push -u origin main
```

Do not commit `.env`, `data/memory.json`, or any real API key.

### 2. Install And Log In To Brev

On macOS:

```bash
brew install brevdev/homebrew-brev/brev
brev --version
brev login
```

### 3. Store NVIDIA_API_KEY As A Brev Secret

Run this locally. Brev will prompt you to paste the value securely:

```bash
brev secret create NVIDIA_API_KEY
```

Create this secret before creating the Brev instance so it is injected when the instance starts. If your instance already exists, restart or recreate it after creating the secret.

If the secret already exists and you need to replace it:

```bash
brev secret delete NVIDIA_API_KEY
brev secret create NVIDIA_API_KEY
```

### 4. Create A Brev GPU Instance

This uses Brev smart defaults. If the hackathon gives you a specific GPU, use that instead.

```bash
brev create minima-cloud
brev shell minima-cloud
```

Inside the Brev shell:

```bash
cd /home/ubuntu/workspace
git clone https://github.com/YOUR_GITHUB_USERNAME/minima.git
cd minima
test -n "$NVIDIA_API_KEY" && echo "NVIDIA_API_KEY loaded"
export NVIDIA_MODEL="nvidia/nemotron-3-nano-30b-a3b"
export HOST_PORT=4000
chmod +x scripts/brev-start.sh
./scripts/brev-start.sh
docker compose logs -f minima
```

The container listens on port `3000`; Brev exposes it on host port `4000`.

### 5. Test From Your Laptop

In a second local terminal:

```bash
brev port-forward minima-cloud --port 4000:4000
```

Then open:

```text
http://localhost:4000
```

### 6. Create The Public Hackathon URL

In the Brev web console:

1. Open the `minima-cloud` instance.
2. Go to the Access section.
3. Under Using Tunnels, add port `4000`.
4. Copy the generated tunnel URL.
5. Submit that URL plus the GitHub repo link.

## Docker Commands On Brev

Restart:

```bash
docker compose restart minima
```

View logs:

```bash
docker compose logs -f minima
```

Stop:

```bash
docker compose down
```

Rebuild after pulling changes:

```bash
git pull
docker compose up --build -d
```

## Stress Prompt

```text
Explain all of machine learning to me in detail.
```

Run the agent, review the pre-flight receipt, then click `Apply & Run` to approve the optimized Nemotron answer. Move the scale slider from "Me" to "UCSC" to show how casual AI waste becomes visible at campus scale.

## References

- NVIDIA Brev Quickstart: https://docs.nvidia.com/brev/getting-started/quickstart
- NVIDIA Brev CLI Secrets: https://docs.nvidia.com/brev/cli/advanced-commands
- NVIDIA Brev Connectivity and Tunnels: https://docs.nvidia.com/brev/cli/connectivity
- NVIDIA Brev Docker Compose guide: https://docs.nvidia.com/brev/guides/development-tools/custom-containers
