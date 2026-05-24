# Minima
### AI Sustainability Agent — NVIDIA NemoClaw Hackathon @ UCSC

Minima is an autonomous Nemotron-powered agent that intercepts 
wasteful AI prompts before they're sent, estimates the real 
environmental cost, and rewrites them sustainably — saving up 
to 97% energy per prompt.

## Demo
🔴 Live: http://136.117.226.95:4000
📦 Built solo in 24 hours at NemoClaw NVIDIA x ASUS Hackathon

## How It Works
1. User types a prompt
2. Minima intercepts it before sending to the model
3. Analyzes scope and estimates projected energy cost in watt-hours
4. If wasteful, blocks the request and rewrites it using Nemotron
5. User approves the sustainable version
6. Only then does the model generate an answer
7. Saves prompt patterns to persistent memory

## Tech Stack
- NVIDIA Nemotron-3-nano-30b-a3b via NVIDIA NIM
- Node.js backend, vanilla HTML/CSS/JS frontend
- Deployed on NVIDIA Brev Cloud
- 7-step autonomous agent pipeline
- Persistent memory (JSON)

## Results
- Up to 97% energy reduction on wasteful prompts
- Full policy audit log showing every agent decision
- Real-world equivalents: LED bulb minutes, car miles, 
  laptop battery %

## Local Run
export NVIDIA_API_KEY="your_key_here"
export NVIDIA_MODEL="nvidia/nemotron-3-nano-30b-a3b"
node server.mjs
