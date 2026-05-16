# Minima

Minima is a live Nemotron-powered AI agent that analyzes a prompt, shows an environmental "AI receipt," visualizes real-world equivalents, and rewrites wasteful prompts into lower-impact workflows before answer generation.

## Run

```bash
export NVIDIA_API_KEY="your_key_here"
export NVIDIA_MODEL="nvidia/nemotron-3-nano-30b-a3b"
node server.mjs
```

Open:

```text
http://localhost:3000
```

## Required NVIDIA API

Minima fails closed without a NVIDIA NIM / build.nvidia.com API key. It does not generate local answers or local rewrites.

```bash
export NVIDIA_API_KEY="your_key_here"
export NVIDIA_MODEL="nvidia/nemotron-3-nano-30b-a3b"
node server.mjs
```

## Stress Prompt

```text
Explain all of machine learning to me in detail.
```

Run the agent, review the pre-flight receipt, then click `Apply & Run` to approve the optimized Nemotron answer. Move the scale slider from "Me" to "UCSC" to show how casual AI waste becomes visible at campus scale.
