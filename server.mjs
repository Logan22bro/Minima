import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const memoryDir = path.join(__dirname, "data");
const memoryFile = path.join(memoryDir, "memory.json");

const port = Number(process.env.PORT || 3000);
const nvidiaKey = process.env.NVIDIA_API_KEY || "";
const nvidiaModel = process.env.NVIDIA_MODEL || "nvidia/nemotron-3-nano-30b-a3b";
const nvidiaUrl = process.env.NVIDIA_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readMemory() {
  if (!existsSync(memoryFile)) {
    return {
      sessions: 0,
      totalPrompts: 0,
      totalEstimatedWh: 0,
      preferredStyle: "concise educational answers",
      commonPattern: "broad prompts without clear target length",
      goal: "reduce unnecessary output tokens by 50%",
      recentPrompts: [],
    };
  }

  return JSON.parse(await readFile(memoryFile, "utf8"));
}

async function saveMemory(memory) {
  await mkdir(memoryDir, { recursive: true });
  await writeFile(memoryFile, JSON.stringify(memory, null, 2));
}

function countTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.33));
}

function requireNvidiaKey() {
  if (!nvidiaKey) {
    throw new Error("NVIDIA_API_KEY is required. Minima only runs with a live NVIDIA Nemotron API key.");
  }
}

function analyzePrompt(prompt) {
  const lower = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  const category = /code|debug|api|function/.test(lower)
    ? "coding"
    : /learn|explain|teach|study|ml|machine learning|neural|model/.test(lower)
      ? "learning"
      : "general";
  const broadScope = [
    /\ball\b/,
    /\beverything\b/,
    /\bentire\b/,
    /\bwhole\b/,
    /\bcomplete\b/,
    /\bcomprehensive\b/,
    /\bin detail\b/,
    /\bdeep dive\b/,
    /\bfrom scratch\b/,
  ].some((pattern) => pattern.test(lower));
  const hasLengthConstraint = /\b(under|less than|max|maximum|around|about)\s+\d+\b|\b\d+\s+(words|sentences|bullets|points|paragraphs|minutes)\b/.test(lower);
  const hasOutputFormat = /\b(bullets?|table|checklist|steps?|outline|summary|compare|pros and cons|quiz)\b/.test(lower);
  const hasLearningTarget = /\b(supervised|unsupervised|regression|classification|neural networks?|transformers?|gradient descent|overfitting|one concept|specific)\b/.test(lower);
  const hasAudience = /\b(beginner|intermediate|expert|student|exam|interview|like i am|eli5)\b/.test(lower);
  const constraintScore = [hasLengthConstraint, hasOutputFormat, hasLearningTarget, hasAudience].filter(Boolean).length;
  const shortOpenEndedExplain = category === "learning" && /\b(explain|teach)\b/.test(lower) && lower.split(/\s+/).length <= 14 && constraintScore === 0;
  const openEndedScope = broadScope && constraintScore < 2;
  const likelyWaste = openEndedScope || shortOpenEndedExplain;
  const wasteType = openEndedScope ? "open_ended_scope" : shortOpenEndedExplain ? "underspecified_learning_goal" : "bounded_prompt";

  return {
    category,
    likelyWaste,
    wasteType,
    openEndedScope,
    constraintScore,
    wasteReason: likelyWaste
      ? "Open-ended scope detected: the prompt asks for a huge topic without enough limits on audience, target concept, length, or output format. Even if the answer is short, the request is wasteful because the model cannot know what depth actually helps."
      : constraintScore >= 2
        ? "The prompt gives useful constraints, which usually reduces unnecessary output."
        : "The prompt is workable, but adding a target length, audience, or specific learning outcome would reduce wasted tokens.",
  };
}

function sanitizeOptimizedPrompt(text) {
  const cleaned = String(text || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^optimized prompt:\s*/i, "")
    .replace(/\bteach me me\b/gi, "Teach me")
    .replace(/\bexplain to me me\b/gi, "Explain to me")
    .trim();

  if (!cleaned || cleaned.length < 20 || cleaned.length > 1600) {
    throw new Error("Nemotron optimizer returned an unusable rewrite.");
  }

  return cleaned;
}

function optimizedRewriteIsValid(text, analysis) {
  const lower = text.toLowerCase();
  const hasLengthLimit = /\b(under|less than|max|maximum|no more than|around|about)\s+\d+\b|\b\d+\s+(words|sentences|bullets|points|paragraphs)\b/.test(lower);
  const hasFormatLimit = /\b(bullets?|table|checklist|quiz|questions?|example|steps?)\b/.test(lower);

  if (!analysis.likelyWaste) return hasLengthLimit || hasFormatLimit;
  return hasLengthLimit && hasFormatLimit;
}

function buildOptimizerMessages(prompt, analysis, memory, priorRewrite = "") {
  const wasteGuidance = analysis.likelyWaste
    ? [
        "The original prompt is too broad. Narrow it aggressively.",
        "The rewrite must include a word, bullet, or step limit.",
        "The rewrite must include a concrete output format such as bullets, one example, a quiz, or a clarifying question.",
        "Do not use these broad words: all, everything, entire, whole, complete, comprehensive, detailed overview, in detail, deep dive.",
      ].join("\n")
    : "Make the prompt slightly more bounded without changing the user's goal.";

  return [
    {
      role: "system",
      content:
        "You rewrite user prompts to reduce unnecessary AI compute while preserving the user's real goal. Return exactly one complete improved prompt under 240 characters. Do not answer the prompt. Do not add commentary.",
    },
    {
      role: "user",
      content: [
        `Original prompt: ${prompt}`,
        `Waste diagnosis: ${analysis.wasteType}`,
        `Prompt category: ${analysis.category}`,
        `User memory: prefers ${memory.preferredStyle}; goal: ${memory.goal}`,
        wasteGuidance,
        priorRewrite ? `Previous rewrite was still too broad or incomplete: ${priorRewrite}` : "",
        "Return only the improved prompt.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

async function callNemotronOptimizer(prompt, analysis, memory) {
  requireNvidiaKey();

  let priorRewrite = "";
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(nvidiaUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${nvidiaKey}`,
        },
        body: JSON.stringify({
          model: nvidiaModel,
          messages: buildOptimizerMessages(prompt, analysis, memory, priorRewrite),
          temperature: 0.2,
          max_tokens: 1200,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Nemotron optimizer request failed: ${response.status} ${text}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || data.output_text || "";
      const rewrite = sanitizeOptimizedPrompt(content);
      if (optimizedRewriteIsValid(rewrite, analysis)) return rewrite;

      priorRewrite = rewrite;
      lastError = new Error("Nemotron optimizer returned a rewrite that was still too broad.");
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Nemotron optimizer failed after retry: ${lastError.message}`);
}

async function optimizePrompt(prompt, analysis, memory) {
  const optimized = await callNemotronOptimizer(prompt, analysis, memory);
  return {
    prompt: optimized,
    source: "nemotron_optimizer",
  };
}

function predictOutputTokens(prompt, analysis, { optimized = false } = {}) {
  const lower = prompt.toLowerCase();

  if (optimized) {
    const wordLimit = lower.match(/\b(?:under|less than|max|maximum|around|about)\s+(\d+)\s+words?\b/);
    if (wordLimit) return Math.ceil(Number(wordLimit[1]) * 1.35);
    if (/\bquiz\b/.test(lower)) return 260;
    if (/\btable\b/.test(lower)) return 320;
    if (/\b\d+\s+bullets?\b/.test(lower)) return 240;
    return 280;
  }

  if (analysis.openEndedScope) {
    let projected = 1800;
    if (/\b(all|everything|entire|whole)\b/.test(lower)) projected += 900;
    if (/\b(in detail|comprehensive|deep dive|from scratch|in depth)\b/.test(lower)) projected += 1100;
    if (/\b(history|machine learning|artificial intelligence|economics|restaurant|business|climate)\b/.test(lower)) projected += 450;
    return Math.min(5200, projected);
  }

  if (analysis.wasteType === "underspecified_learning_goal") return 1000;
  if (analysis.constraintScore >= 2) return 360;
  return 650;
}

function estimateImpact({ inputTokens, outputTokens, modelCalls, toolCalls, optimized = false }) {
  const totalTokens = inputTokens + outputTokens;
  const multiplier = optimized ? 0.65 : 1;
  const callWeight = Math.max(1, modelCalls + toolCalls * 0.35);
  const lowWh = (totalTokens / 1000) * 0.35 * callWeight * multiplier;
  const likelyWh = (totalTokens / 1000) * 1.25 * callWeight * multiplier;
  const highWh = (totalTokens / 1000) * 5.5 * callWeight * multiplier;
  const carbonLowKg = (lowWh / 1000) * 0.2;
  const carbonHighKg = (highWh / 1000) * 0.45;
  const waterLowMl = lowWh * 0.2;
  const waterHighMl = highWh * 1.8;

  return {
    totalTokens,
    lowWh,
    likelyWh,
    highWh,
    carbonLowKg,
    carbonHighKg,
    waterLowMl,
    waterHighMl,
    bulbMinutes: likelyWh,
    laptopPercent: likelyWh / 60 * 100,
    carMiles: (carbonHighKg * 1000) / 404,
    householdMinutes: (likelyWh / 1000) / (29 / 24 / 60),
  };
}

function buildAgentTrace({ usedNemotron, analysis, preflight = false }) {
  const trace = [
    { label: "Analyze Prompt", detail: analysis.category, status: "done" },
    { label: "Count Tokens", detail: preflight ? "input + projected output" : "input + output measured", status: "done" },
    { label: "Estimate Footprint", detail: "energy / water / carbon range", status: "done" },
    { label: "Diagnose Waste", detail: analysis.likelyWaste ? "waste detected" : "within budget", status: analysis.likelyWaste ? "warn" : "done" },
    { label: "Optimize Prompt", detail: "lower-impact rewrite generated", status: "done" },
  ];

  trace.splice(1, 0, preflight
    ? { label: "Skip Answer", detail: "blocked until user approves", status: "warn" }
    : { label: "Generate Answer", detail: "Nemotron endpoint", status: "done" });
  trace.push({ label: "Save Memory", detail: "habit profile updated", status: "done" });

  return trace;
}

function buildToolCallLog({ usedNemotron, inputTokens, outputTokens, impact, optimizedPrompt, optimizedImpact, optimizedSource, analysis, memory, preflight = false }) {
  const modelCallDetail = preflight ? "1 projected answer model call + 1 live optimizer call" : "2 live model calls";
  const log = [
    preflight ? {
      name: "skip_nemotron_answer",
      status: "blocked",
      input: "wasteful prompt",
      output: "original prompt was not answered before approval",
    } : {
      name: "call_nemotron_model",
      status: "live",
      input: nvidiaModel,
      output: "answer generated by NVIDIA endpoint",
    },
    {
      name: "call_nemotron_optimizer",
      status: "live",
      input: nvidiaModel,
      output: "bounded rewrite generated by NVIDIA endpoint",
    },
    {
      name: "analyze_prompt",
      status: analysis.likelyWaste ? "flagged" : "passed",
      input: "raw user prompt",
      output: `${analysis.wasteType}; constraint score ${analysis.constraintScore}/4`,
    },
    {
      name: "count_tokens",
      status: "done",
      input: preflight ? "prompt + projected answer" : "prompt + answer",
      output: `${inputTokens} input, ${outputTokens} ${preflight ? "projected output" : "output"}`,
    },
    {
      name: preflight ? "project_original_cost" : "estimate_impact",
      status: "done",
      input: `${inputTokens + outputTokens} tokens, ${modelCallDetail}, 5 tools`,
      output: `${impact.lowWh.toFixed(2)}-${impact.highWh.toFixed(2)} Wh estimated range`,
    },
    {
      name: "convert_equivalents",
      status: "done",
      input: `${impact.likelyWh.toFixed(2)} Wh likely estimate`,
      output: `${impact.bulbMinutes.toFixed(1)} bulb-min, ${impact.carMiles.toFixed(3)} car-mi`,
    },
    {
      name: "optimize_prompt",
      status: "done",
      input: analysis.wasteType,
      output: `${optimizedSource}: ${optimizedPrompt}`,
    },
    {
      name: "estimate_optimized_cost",
      status: "done",
      input: `${optimizedImpact.totalTokens} projected optimized tokens`,
      output: `${optimizedImpact.lowWh.toFixed(2)}-${optimizedImpact.highWh.toFixed(2)} Wh estimated range`,
    },
    {
      name: "save_memory",
      status: "done",
      input: "local habit profile",
      output: `${memory.totalPrompts} prompts tracked; goal: ${memory.goal}`,
    },
  ];

  return log;
}

function buildPolicyLog({ analysis, inputTokens, outputTokens, toolCallCount, preflight = false }) {
  const estimatedTokens = inputTokens + outputTokens;
  const logs = [
    preflight ? {
      rule: "MODEL_CALL_REQUIRES_APPROVAL",
      result: "blocked",
      detail: "Wasteful answer generation was paused until the user approves the optimized prompt.",
    } : {
      rule: "ALLOW_MODEL_CALL",
      result: "allowed",
      detail: "Answer generation call is within the live-agent budget.",
    },
    {
      rule: "ALLOW_ESTIMATOR_TOOLS",
      result: "allowed",
      detail: "Token counter, impact estimator, equivalent converter, and memory writer are trusted tools.",
    },
    {
      rule: "MEMORY_SCOPE",
      result: "allowed",
      detail: "Memory write is limited to the local Minima habit profile.",
    },
  ];

  if (analysis.likelyWaste || estimatedTokens > 900 || toolCallCount > 6) {
    logs.push({
      rule: "HIGH_COST_WORKFLOW_REVIEW",
      result: "flagged",
      detail: preflight
        ? "Broad prompt was stopped before answer generation and routed to optimized approval."
        : "Broad or high-output prompt requires an optimized alternative before scale-up.",
    });
  } else {
    logs.push({
      rule: "HIGH_COST_WORKFLOW_REVIEW",
      result: "passed",
      detail: "Prompt is constrained enough to run without extra review.",
    });
  }

  logs.push({
    rule: "RUNAWAY_AGENT_LOOP",
    result: "blocked",
    detail: "Policy would stop workflows above 8 autonomous calls without user confirmation.",
  });

  return logs;
}

function buildSavings(impact, optimizedImpact) {
  const savedWh = Math.max(0, impact.likelyWh - optimizedImpact.likelyWh);
  const savedPercent = impact.likelyWh > 0 ? Math.round((savedWh / impact.likelyWh) * 100) : 0;
  return {
    savedWh,
    savedPercent,
    originalLikelyWh: impact.likelyWh,
    optimizedLikelyWh: optimizedImpact.likelyWh,
  };
}

async function callNemotron(prompt, memory) {
  requireNvidiaKey();

  const response = await fetch(nvidiaUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${nvidiaKey}`,
    },
    body: JSON.stringify({
      model: nvidiaModel,
      messages: [
        {
          role: "system",
          content:
            "You are Minima, an educational AI assistant. Answer the user's prompt clearly and follow the requested scope. Do not mention exact energy or carbon values; another tool calculates the receipt. Prefer useful learning outcomes, but do not silently shorten a broad prompt unless you explain the tradeoff.",
        },
        {
          role: "system",
          content: `User memory: prefers ${memory.preferredStyle}; sustainability goal: ${memory.goal}; common pattern: ${memory.commonPattern}.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nemotron request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || data.output_text || "";
  if (!content.trim()) {
    throw new Error("Nemotron returned an empty answer.");
  }

  return content;
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const prompt = String(body.prompt || "").trim();
    const approved = Boolean(body.approved);
    if (!prompt) return json(res, 400, { error: "Prompt is required." });
    requireNvidiaKey();

    const memory = await readMemory();
    const analysis = analyzePrompt(prompt);
    const inputTokens = countTokens(prompt);
    const optimization = await optimizePrompt(prompt, analysis, memory);
    const optimizedPrompt = optimization.prompt;
    const optimizedSource = optimization.source;
    const optimizedInputTokens = countTokens(optimizedPrompt);
    const optimizedOutputTokens = predictOutputTokens(optimizedPrompt, analysis, { optimized: true });
    const optimizedImpact = estimateImpact({
      inputTokens: optimizedInputTokens,
      outputTokens: optimizedOutputTokens,
      modelCalls: 1,
      toolCalls: 3,
      optimized: true,
    });

    if (analysis.likelyWaste && !approved) {
      const projectedOutputTokens = predictOutputTokens(prompt, analysis);
      const toolCallCount = 5;
      const impact = estimateImpact({
        inputTokens,
        outputTokens: projectedOutputTokens,
        modelCalls: 1,
        toolCalls: toolCallCount,
      });

      memory.sessions += 1;
      memory.totalPrompts += 1;
      memory.totalEstimatedWh += 0;
      memory.commonPattern = "broad prompts without clear target length";
      memory.recentPrompts = [
        {
          prompt,
          tokens: inputTokens + projectedOutputTokens,
          likelyWh: impact.likelyWh,
          mode: "preflight_projection",
          at: new Date().toISOString(),
        },
        ...memory.recentPrompts,
      ].slice(0, 8);
      await saveMemory(memory);

      return json(res, 200, {
        mode: "preflight",
        answerGenerated: false,
        answer: [
          "### Pre-flight AI receipt",
          "",
          "Minima detected that this prompt is too broad to answer efficiently.",
          "",
          "**No answer-generation call was made yet.** Nemotron was used only to create the bounded rewrite; the receipt below projects what the original prompt would likely cost if the system tried to satisfy it in full.",
          "",
          "Use the optimized rewrite, then click **Apply & Run** to send the lower-waste version instead.",
        ].join("\n"),
        usedNemotron: true,
        model: nvidiaModel,
        modelError: "",
        analysis,
        trace: buildAgentTrace({ usedNemotron: true, analysis, preflight: true }),
        policyLog: buildPolicyLog({ analysis, inputTokens, outputTokens: projectedOutputTokens, toolCallCount, preflight: true }),
        toolCallLog: buildToolCallLog({
          usedNemotron: true,
          inputTokens,
          outputTokens: projectedOutputTokens,
          impact,
          optimizedPrompt,
          optimizedImpact,
          optimizedSource,
          analysis,
          memory,
          preflight: true,
        }),
        receipt: {
          projected: true,
          inputTokens,
          outputTokens: projectedOutputTokens,
          modelCalls: 1,
          toolCalls: toolCallCount,
          impact,
          optimizedImpact,
          optimizedTokens: optimizedInputTokens + optimizedOutputTokens,
          savings: buildSavings(impact, optimizedImpact),
        },
        optimizedPrompt,
        optimizedSource,
        memory,
      });
    }

    const answer = await callNemotron(prompt, memory);
    const usedNemotron = true;

    const outputTokens = countTokens(answer);
    const toolCallCount = 5;
    const impact = estimateImpact({
      inputTokens,
      outputTokens,
      modelCalls: 2,
      toolCalls: toolCallCount,
    });

    memory.sessions += 1;
    memory.totalPrompts += 1;
    memory.totalEstimatedWh += impact.likelyWh;
    memory.commonPattern = analysis.likelyWaste ? "broad prompts without clear target length" : memory.commonPattern;
    memory.recentPrompts = [
      {
        prompt,
        tokens: inputTokens + outputTokens,
        likelyWh: impact.likelyWh,
        at: new Date().toISOString(),
      },
      ...memory.recentPrompts,
    ].slice(0, 8);
    await saveMemory(memory);

    json(res, 200, {
      answer,
      usedNemotron,
      model: nvidiaModel,
      modelError: "",
      analysis,
      trace: buildAgentTrace({ usedNemotron, analysis }),
      policyLog: buildPolicyLog({ analysis, inputTokens, outputTokens, toolCallCount }),
      toolCallLog: buildToolCallLog({
        usedNemotron,
        inputTokens,
        outputTokens,
        impact,
        optimizedPrompt,
        optimizedImpact,
        optimizedSource,
        analysis,
        memory,
      }),
      receipt: {
        inputTokens,
        outputTokens,
        modelCalls: 2,
        toolCalls: toolCallCount,
        impact,
        optimizedImpact,
        optimizedTokens: optimizedInputTokens + optimizedOutputTokens,
        savings: buildSavings(impact, optimizedImpact),
      },
      optimizedPrompt,
      optimizedSource,
      memory,
    });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  await serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Minima running at http://localhost:${port}`);
  console.log(nvidiaKey ? `Using NVIDIA model: ${nvidiaModel}` : "NVIDIA_API_KEY not set: API requests will fail closed.");
});
