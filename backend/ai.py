"""
AI module — Optimize Everything V3
All Claude API interactions: literature research, chat, study design,
data analysis interpretation, and paper generation.
"""

import os
import json
from typing import AsyncGenerator, Optional

import anthropic

# ── Clients ───────────────────────────────────────────────────────────────────

_sync_client: Optional[anthropic.Anthropic] = None
_async_client: Optional[anthropic.AsyncAnthropic] = None


def _sync():
    global _sync_client
    if _sync_client is None:
        _sync_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _sync_client


def _async():
    global _async_client
    if _async_client is None:
        _async_client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _async_client


# ── JSON helper ───────────────────────────────────────────────────────────────

def _call_json(
    system: str,
    prompt: str,
    model: str = "claude-opus-4-6",
    max_tokens: int = 2500,
) -> dict:
    """Call Claude and return parsed JSON. Strips markdown fences if present."""
    message = _sync().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = message.content[0].text.strip()
    if text.startswith("```"):
        parts = text.split("```", 2)
        inner = parts[1]
        if inner.startswith("json"):
            inner = inner[4:]
        text = inner.rsplit("```", 1)[0].strip()
    return json.loads(text)


# ── Literature research ───────────────────────────────────────────────────────

_LITERATURE_SYSTEM = (
    "You are an expert scientific researcher with broad knowledge across chemistry, "
    "materials science, biology, engineering, and adjacent disciplines. You provide "
    "accurate, well-structured literature reviews that help researchers understand "
    "the landscape of their field and make informed strategic decisions. "
    "Be specific — cite representative numbers and results where possible."
)


def literature_research(topic: str) -> dict:
    """
    Generate a structured literature report for the given research topic.
    Returns a dict with 'field', 'summary', 'avenues', 'open_questions', 'recommendation'.
    """
    prompt = f"""The researcher wants to: {topic}

Provide a comprehensive, structured literature review. Return ONLY valid JSON (no markdown fences) matching this schema exactly:

{{
  "field": "Name of the research field",
  "summary": "2–3 paragraph overview of the current state, key challenges, and major trends in this area",
  "avenues": [
    {{
      "id": "short_unique_id",
      "name": "Approach / System Name",
      "description": "What this approach is and how it works (2–3 sentences, scientifically precise)",
      "pros": ["Specific advantage with quantitative support where possible", "..."],
      "cons": ["Specific limitation or challenge", "..."],
      "industrial_relevance": "Current industrial status, commercial players, scalability considerations",
      "academic_focus": "What metrics and aspects academic publications typically target",
      "trl": "TRL 1–9 and one-sentence justification",
      "key_results": "Most notable quantitative results reported in the literature"
    }}
  ],
  "open_questions": [
    "A major unresolved scientific or engineering question",
    "..."
  ],
  "recommendation": "Given the stated goal, which avenue(s) are most promising and why (2–4 sentences)"
}}

Provide 3–6 distinct avenues covering the main approaches. Be scientifically accurate and specific with numbers."""

    return _call_json(_LITERATURE_SYSTEM, prompt, max_tokens=3500)


# ── Follow-up chat (streaming) ────────────────────────────────────────────────

_CHAT_SYSTEM = (
    "You are an expert scientific research assistant helping a researcher plan a "
    "Bayesian optimisation study. You have deep knowledge of the relevant literature "
    "and can answer specific questions about methodologies, materials, processes, and "
    "experimental design. Keep answers concise but scientifically accurate. "
    "Use markdown for structure when helpful (bold key terms, bullet lists for comparisons)."
)


async def chat_stream(
    topic: str,
    selected_avenue: Optional[str],
    history: list,
    user_message: str,
) -> AsyncGenerator[str, None]:
    """
    Stream a follow-up chat response as Server-Sent Events.
    Yields SSE-formatted strings ending with [DONE].
    """
    context_lines = [f"Research goal: {topic}"]
    if selected_avenue:
        context_lines.append(f"Selected approach: {selected_avenue}")
    system = _CHAT_SYSTEM + "\n\nContext:\n" + "\n".join(context_lines)

    messages = [{"role": h["role"], "content": h["content"]} for h in history]
    messages.append({"role": "user", "content": user_message})

    client = _async()
    async with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=800,
        system=system,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield f"data: {json.dumps({'text': text})}\n\n"

    yield "data: [DONE]\n\n"


# ── Study design suggestions ──────────────────────────────────────────────────

_DESIGN_SYSTEM = (
    "You are an expert in experimental design and Bayesian optimisation for scientific "
    "research. You suggest practical input variables (factors) and measurable output "
    "objectives for optimisation studies. You understand both academic and industrial "
    "perspectives and tailor your suggestions to the specific system."
)


def suggest_study_design(
    topic: str,
    avenue: str,
    literature_summary: str = "",
) -> dict:
    """
    Suggest variables, objectives and study context for the selected research avenue.
    """
    prompt = f"""Research goal: {topic}
Selected approach to study: {avenue}
Literature context: {literature_summary[:600] if literature_summary else "Not available"}

Suggest an experimental design for a Bayesian optimisation study of this system.
Return ONLY valid JSON matching this schema:

{{
  "context": "2–3 sentences explaining the scientific context and key considerations for this particular study",
  "industry_note": "What industrial practitioners care about most in this application (metrics, cost drivers, process constraints)",
  "academic_note": "What academic researchers typically focus on in publications (performance metrics, benchmarks, datasets)",
  "suggested_variables": [
    {{
      "name": "Variable name (short, clear, no units in name)",
      "min": 0.0,
      "max": 1.0,
      "unit": "SI or common unit",
      "category": "synthesis|process|material|environmental|operational",
      "rationale": "Why this variable matters for the outcome"
    }}
  ],
  "suggested_objectives": [
    {{
      "name": "Objective name (short, clear, no units in name)",
      "type": "maximize|minimize",
      "unit": "SI or common unit",
      "importance": "primary|secondary",
      "rationale": "Why this is a key performance metric"
    }}
  ],
  "constraints": [
    "Important practical or physical constraint to observe"
  ],
  "recommended_initial_samples": 15,
  "recommended_batch_size": 5,
  "notes": "Any other critical considerations for running this study"
}}

Suggest 4–8 variables with realistic, practically achievable ranges.
Suggest 1–4 objectives covering the most important performance indicators.
Consider both industrially relevant and academically standard choices."""

    return _call_json(_DESIGN_SYSTEM, prompt, max_tokens=2500)


# ── Uploaded data analysis ────────────────────────────────────────────────────

def analyze_uploaded_data(
    topic: str,
    avenue: str,
    column_names: list,
    stats: dict,
    n_rows: int,
) -> str:
    """
    Generate a natural-language analysis of an uploaded dataset in research context.
    """
    prompt = f"""Research context: {topic} — focusing on {avenue}

The researcher has uploaded a dataset:
- {n_rows} rows
- Columns: {', '.join(column_names)}

Summary statistics:
{json.dumps(stats, indent=2)}

Provide a concise (4–6 sentence) analysis covering:
1. What the dataset appears to represent
2. Notable patterns, value ranges, or distributions
3. How this data relates to the optimisation goal
4. Specific suggestions for how to use this data in the study (e.g. prior data, constraints, benchmarks)"""

    message = _sync().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=450,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


# ── GP model interpretation ───────────────────────────────────────────────────

def gp_interpretation(stats_text: str) -> str:
    """Interpret GP kernel hyperparameters and produce a natural-language summary."""
    prompt = f"""You are analysing a Bayesian optimisation experiment. A Gaussian process (GP) model \
with an ARD Matérn 5/2 kernel has been fitted to experimental data. The kernel hyperparameters \
below were learned by maximising the marginal log-likelihood.

{stats_text}

Write 3–5 concise sentences interpreting what the GP model has learned. Cover:
1. Which variables are most influential (shorter lengthscale = model changes more rapidly = more sensitive).
2. The direction of each variable's effect on the objective(s).
3. Model confidence — comment on the noise-to-signal ratio.

Use the actual variable and objective names. Write as flowing prose without bullet points or headers. \
Keep the language clear and precise, as for a scientist reviewing optimisation results."""

    message = _sync().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


# ── Paper generation ──────────────────────────────────────────────────────────

_PAPER_SYSTEM = (
    "You are a scientific writer helping to draft a research paper based on Bayesian "
    "optimisation experimental results. You write in clear, formal scientific English "
    "with appropriate technical depth. You focus on the key findings and their "
    "significance. Use passive voice where appropriate. Avoid marketing language."
)


def generate_paper(
    topic: str,
    avenue: str,
    variables: list,
    objectives: list,
    experiments: list,
    best_values: dict,
    literature_summary: str,
) -> dict:
    """
    Generate structured paper sections (title, abstract, introduction, results,
    discussion, conclusion, keywords) from project data.
    """
    complete = [e for e in experiments if e.get("is_complete")]
    n_total = len(experiments)
    n_complete = len(complete)

    var_str = ", ".join(
        f"{v['name']} ({v.get('min', '?')}–{v.get('max', '?')} {v.get('unit', '')})"
        for v in variables
    )
    obj_str = ", ".join(f"{o['name']} ({o['type']})" for o in objectives)

    best_str = "\n".join(
        f"  {name}: {b['value']:.4g} (experiment #{b['experiment_index']})"
        for name, b in best_values.items()
    ) or "  No completed experiments yet."

    sample_rows = []
    for e in complete[:4]:
        row = {**e.get("variable_values", {})}
        row.update({k: v for k, v in (e.get("objective_values") or {}).items() if v is not None})
        sample_rows.append(row)

    prompt = f"""Research goal: {topic}
System studied: {avenue}

Experimental design:
- Input variables: {var_str}
- Optimisation objectives: {obj_str}
- Total experiments: {n_total} ({n_complete} completed)
- Best results found:
{best_str}

Sample data (first {len(sample_rows)} complete experiments):
{json.dumps(sample_rows, indent=2) if sample_rows else "None available yet."}

Field context (from literature):
{literature_summary[:700] if literature_summary else "Not provided."}

Write a scientific paper summary. Return ONLY valid JSON:

{{
  "title": "A concise, descriptive paper title (avoid hype words)",
  "abstract": "~200 word structured abstract: background (1–2 sentences), objective (1 sentence), methods including Bayesian optimisation approach (2–3 sentences), key quantitative results (2–3 sentences), significance (1–2 sentences)",
  "introduction": "~350 word introduction: field background, existing approaches and their limitations, gap in knowledge, specific objective and scope of this study",
  "results": "~400 word results section in scientific prose: experimental design summary, progression of optimisation, key quantitative findings, best conditions identified, observed trends in variable effects",
  "discussion": "~400 word discussion: mechanistic interpretation of variable effects consistent with GP model, comparison to values in literature, study limitations, implications for the field and potential scale-up",
  "conclusion": "~150 word conclusion: key findings stated quantitatively, significance for the field, recommendations for next steps and future work",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}}

Write in formal scientific English. Be specific about numerical results."""

    return _call_json(_PAPER_SYSTEM, prompt, max_tokens=4000)
