# Minima Hack Runbook

## 30-Second Pitch

Minima is a live Nemotron-powered AI agent that makes AI consumption visible before waste happens. Users ask normal AI prompts, the agent diagnoses prompt waste, calls Nemotron to create a bounded rewrite, projects the energy/token cost of the original versus optimized path, and only generates the final Nemotron answer after user approval.

## Live Judge Flow

1. Open `http://localhost:3000`.
2. Use the default prompt:
   ```text
   Explain all of machine learning to me in detail.
   ```
3. Click `Run Agent`.
4. Point at the agent timeline:
   ```text
   Analyze Prompt -> Skip Answer -> Count Tokens -> Estimate Footprint -> Diagnose Waste -> Optimize Prompt -> Save Memory
   ```
5. Show that answer generation was blocked, while Nemotron generated the optimized rewrite.
6. Point at the AI receipt and footprint sandbox.
7. Move the scale slider to `UCSC`.
8. Point at the policy audit:
   ```text
   HIGH_COST_WORKFLOW_REVIEW flagged
   RUNAWAY_AGENT_LOOP blocked
   ```
9. Click `Apply & Run` on the optimized prompt.
10. Show the live Nemotron answer and the smaller receipt.

## Hackathon Requirement Mapping

- Autonomous agent: the app runs a multi-step workflow from one prompt.
- Nemotron: every agent run requires `NVIDIA_API_KEY` and uses the configured NVIDIA/Nemotron endpoint.
- Persistent memory: `data/memory.json` stores prompt history, habits, and goals.
- Multi-step reasoning: classify, estimate, diagnose, optimize, gate answer generation, save memory.
- Live tool calls: token counter, impact estimator, equivalent converter, Nemotron prompt optimizer, memory writer.
- NemoClaw angle: policy audit panel is ready to map onto NemoClaw/OpenShell policies.

## NVIDIA Setup

```bash
export NVIDIA_API_KEY="paste_key_here"
export NVIDIA_MODEL="nvidia/nemotron-3-nano-30b-a3b"
node server.mjs
```

If the key is missing or the Nemotron request fails, Minima returns an error instead of generating local content.

## What To Say If Asked About Accuracy

The footprint is an educational range, not a precise carbon accounting claim. Real impact depends on model size, serving hardware, data center efficiency, grid mix, cooling, and cache behavior. The point is comparative intuition: vague long prompts, repeated retries, tool-heavy agents, and campus-scale habits compound quickly.

## Final Tagline

CarbonSense helps engineers optimize AI infrastructure. Minima teaches everyday AI users what their AI habits cost and how to reduce waste before running expensive AI workflows.
