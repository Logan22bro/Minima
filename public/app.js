const promptInput = document.querySelector("#promptInput");
const sendButton = document.querySelector("#sendButton");
const applyOptimizedButton = document.querySelector("#applyOptimizedButton");
const answerOutput = document.querySelector("#answerOutput");
const agentTimeline = document.querySelector("#agentTimeline");
const memoryText = document.querySelector("#memoryText");
const modelStatus = document.querySelector("#modelStatus");
const wasteTag = document.querySelector("#wasteTag");
const failureBadge = document.querySelector("#failureBadge");
const diagnosisText = document.querySelector("#diagnosisText");
const optimizedPrompt = document.querySelector("#optimizedPrompt");
const savingsText = document.querySelector("#savingsText");
const scaleSlider = document.querySelector("#scaleSlider");
const scaleLabel = document.querySelector("#scaleLabel");
const policyLog = document.querySelector("#policyLog");
const toolCallLog = document.querySelector("#toolCallLog");
const comparisonMode = document.querySelector("#comparisonMode");
const comparisonOriginalEnergy = document.querySelector("#comparisonOriginalEnergy");
const comparisonOriginalTokens = document.querySelector("#comparisonOriginalTokens");
const comparisonOptimizedEnergy = document.querySelector("#comparisonOptimizedEnergy");
const comparisonOptimizedTokens = document.querySelector("#comparisonOptimizedTokens");
const comparisonSavedEnergy = document.querySelector("#comparisonSavedEnergy");

const scaleOptions = [
  { label: "Me", multiplier: 1 },
  { label: "Class", multiplier: 100 },
  { label: "UCSC", multiplier: 19775 },
  { label: "UC System", multiplier: 295000 },
];

let latestReceipt = null;
let latestOptimizedPrompt = "";
let latestPreflight = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\b__([^_]+)__\b/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableStart(lines, index) {
  return lines[index]?.includes("|") && isTableSeparator(lines[index + 1] || "");
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function startsSpecialBlock(lines, index) {
  const line = lines[index] || "";
  return (
    line.trim() === "" ||
    line.startsWith("```") ||
    isTableStart(lines, index) ||
    /^#{1,4}\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s*---+\s*$/.test(line)
  );
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.replace(/```/, "").trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre class="code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index]);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      html.push(
        `<div class="table-scroll"><table><thead><tr>${headers
          .map((header) => `<th>${renderInlineMarkdown(header)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${headers
                .map((_, cellIndex) => `<td>${renderInlineMarkdown(row[cellIndex] || "")}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && !startsSpecialBlock(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
  }

  return html.join("");
}

function setAnswerMarkdown(markdown) {
  answerOutput.innerHTML = renderMarkdown(markdown);
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatEnergy(wh) {
  if (wh >= 1000) return `${formatNumber(wh / 1000, 2)} kWh`;
  if (wh >= 10) return `${formatNumber(wh, 0)} Wh`;
  return `${formatNumber(wh, 2)} Wh`;
}

function renderTimeline(trace = []) {
  if (!trace.length) {
    agentTimeline.innerHTML = '<div class="timeline-empty">Agent steps will appear here.</div>';
    return;
  }

  agentTimeline.innerHTML = trace
    .map(
      (item) => `
        <div class="timeline-item ${item.status === "warn" ? "warn" : ""}">
          <div class="timeline-dot"></div>
          <div>
            <div class="timeline-title">${item.label}</div>
            <div class="timeline-detail">${item.detail}</div>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderReceipt(receipt) {
  latestReceipt = receipt;
  const scale = scaleOptions[Number(scaleSlider.value)];
  const multiplier = scale.multiplier;
  const impact = receipt.impact;
  const scaledLow = impact.lowWh * multiplier;
  const scaledLikely = impact.likelyWh * multiplier;
  const scaledHigh = impact.highWh * multiplier;

  document.querySelector("#inputTokens").textContent = formatNumber(receipt.inputTokens);
  document.querySelector("#outputTokens").textContent = formatNumber(receipt.outputTokens);
  document.querySelector("#modelCalls").textContent = receipt.modelCalls;
  document.querySelector("#toolCalls").textContent = receipt.toolCalls;
  document.querySelector("#energyRange").textContent = `${formatEnergy(scaledLow)}-${formatEnergy(scaledHigh)}`;

  document.querySelector("#bulbEquivalent").textContent = `${formatNumber(impact.bulbMinutes * multiplier, 1)} min`;
  document.querySelector("#laptopEquivalent").textContent = `${formatNumber(impact.laptopPercent * multiplier, 1)}%`;
  document.querySelector("#carEquivalent").textContent = `${formatNumber(impact.carMiles * multiplier, 2)} mi`;
  document.querySelector("#homeEquivalent").textContent = `${formatNumber(impact.householdMinutes * multiplier, 1)} min`;

  const meter = Math.min(100, Math.max(4, Math.log10(scaledLikely + 1) * 20));
  document.querySelector("#energyMeter").style.width = `${meter}%`;

  const waterPct = Math.min(100, Math.max(8, Math.log10(impact.waterHighMl * multiplier + 1) * 22));
  document.querySelector("#waterFill").style.height = `${waterPct}%`;

  const carPct = Math.min(92, Math.max(2, Math.log10(impact.carMiles * multiplier + 1) * 26));
  document.querySelector("#car").style.left = `${carPct}%`;

  const glow = Math.min(42, Math.max(8, Math.log10(scaledLikely + 1) * 12));
  document.querySelectorAll(".server").forEach((server, index) => {
    server.style.setProperty("--glow", `${glow + index * 2}px`);
    server.style.transform = scaledLikely > 60 ? "translateY(-5px)" : "translateY(0)";
  });

  const housesOn = Math.min(5, Math.ceil(meter / 20));
  document.querySelectorAll("#houses span").forEach((house, index) => {
    house.classList.toggle("on", index < housesOn);
  });

  scaleLabel.textContent = scale.label;
  const severity = scaledLikely > 80 ? "critical" : scaledLikely > 20 ? "warning" : "";
  failureBadge.textContent = severity === "critical" ? "waste spike" : severity === "warning" ? "elevated" : "stable";
  failureBadge.className = `tiny-tag ${severity}`;
  renderComparison(receipt);
}

function renderComparison(receipt) {
  const scale = scaleOptions[Number(scaleSlider.value)];
  const multiplier = scale.multiplier;
  const originalLikely = receipt.impact.likelyWh * multiplier;
  const optimizedLikely = receipt.optimizedImpact.likelyWh * multiplier;
  const saved = Math.max(0, originalLikely - optimizedLikely);
  const originalTokens = receipt.inputTokens + receipt.outputTokens;
  const optimizedTokens = receipt.optimizedTokens || receipt.optimizedImpact.totalTokens;

  comparisonMode.textContent = receipt.projected ? "projected" : "actual";
  comparisonMode.className = `tiny-tag ${receipt.projected ? "warning" : ""}`;
  comparisonOriginalEnergy.textContent = formatEnergy(originalLikely);
  comparisonOptimizedEnergy.textContent = formatEnergy(optimizedLikely);
  comparisonSavedEnergy.textContent = `${formatEnergy(saved)} (${receipt.savings?.savedPercent ?? 0}%)`;
  comparisonOriginalTokens.textContent = `${formatNumber(originalTokens)} ${receipt.projected ? "projected" : "actual"} tokens`;
  comparisonOptimizedTokens.textContent = `${formatNumber(optimizedTokens)} projected tokens`;
}

function renderOptimization(data) {
  latestOptimizedPrompt = data.optimizedPrompt;
  latestPreflight = data.mode === "preflight" ? data : null;
  optimizedPrompt.textContent = data.optimizedPrompt;
  diagnosisText.textContent = data.analysis?.wasteReason || data.diagnosis || "Prompt analyzed.";
  wasteTag.textContent = data.analysis?.likelyWaste ? "waste detected" : "efficient";
  wasteTag.className = `tiny-tag ${data.analysis?.likelyWaste ? "warning" : ""}`;

  if (data.receipt) {
    const original = data.receipt.impact.likelyWh;
    const optimized = data.receipt.optimizedImpact.likelyWh;
    const savings = Math.max(0, Math.round((1 - optimized / original) * 100));
    savingsText.textContent = `${savings}%`;
  } else if (data.savings) {
    savingsText.textContent = `${data.savings}%`;
  }
}

function renderPolicyLog(log = []) {
  if (!log.length) {
    policyLog.innerHTML = '<div class="policy-empty">Policy events will appear after the agent runs.</div>';
    return;
  }

  policyLog.innerHTML = log
    .map(
      (item) => `
        <div class="policy-item ${item.result}">
          <div class="policy-rule">
            <span>${item.rule}</span>
            <span class="policy-result">${item.result}</span>
          </div>
          <div class="policy-detail">${item.detail}</div>
        </div>
      `,
    )
    .join("");
}

function renderToolCallLog(log = []) {
  if (!log.length) {
    toolCallLog.innerHTML = '<div class="policy-empty">Tool calls will appear after the agent runs.</div>';
    return;
  }

  toolCallLog.innerHTML = log
    .map(
      (item) => `
        <div class="tool-item ${item.status}">
          <div class="tool-rule">
            <span>${item.name}</span>
            <span class="tool-result">${item.status}</span>
          </div>
          <div class="tool-io"><strong>in:</strong> ${item.input}</div>
          <div class="tool-detail"><strong>out:</strong> ${item.output}</div>
        </div>
      `,
    )
    .join("");
}

function renderMemory(memory) {
  if (!memory) return;
  memoryText.textContent = `${memory.totalPrompts} prompts tracked. Pattern: ${memory.commonPattern}. Goal: ${memory.goal}.`;
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "Running..." : "Run Agent";
}

async function runAgent() {
  return runPrompt(promptInput.value.trim(), { approved: false });
}

async function runPrompt(prompt, { approved = false } = {}) {
  if (!prompt) return;

  setLoading(true);
  setAnswerMarkdown(approved ? "Sending optimized prompt to Nemotron..." : "Analyzing prompt before spending answer tokens...");
  renderTimeline([
    { label: "Analyze Prompt", detail: "starting", status: "done" },
    { label: approved ? "Generate Answer" : "Pre-flight Receipt", detail: approved ? "waiting on model" : "checking waste first", status: "done" },
  ]);
  renderToolCallLog([
    { name: "agent_start", status: "live", input: "user prompt", output: "workflow initialized" },
  ]);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, approved }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Agent failed.");

    setAnswerMarkdown(data.answer);
    modelStatus.textContent = data.mode === "preflight"
      ? data.usedNemotron ? "Nemotron pre-flight" : "rewrite recovered"
      : data.model;
    renderTimeline(data.trace);
    renderReceipt(data.receipt);
    renderOptimization(data);
    renderPolicyLog(data.policyLog);
    renderToolCallLog(data.toolCallLog);
    renderMemory(data.memory);
  } catch (error) {
    setAnswerMarkdown(`**Error:** ${error.message}`);
    modelStatus.textContent = "API error";
  } finally {
    setLoading(false);
  }
}

sendButton.addEventListener("click", runAgent);

promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    runAgent();
  }
});

applyOptimizedButton.addEventListener("click", () => {
  if (!latestOptimizedPrompt) return;
  promptInput.value = latestOptimizedPrompt;
  runPrompt(latestOptimizedPrompt, { approved: true });
});

scaleSlider.addEventListener("input", () => {
  if (latestReceipt) renderReceipt(latestReceipt);
  else scaleLabel.textContent = scaleOptions[Number(scaleSlider.value)].label;
});
