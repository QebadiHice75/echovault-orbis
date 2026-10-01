import { NextResponse } from "next/server";

import {
  buildDirectorPrompt,
  fallbackIntelligence,
  type DirectorSettings,
  type EchoIntelligence,
  type VerifiedEvent,
} from "@/lib/echo";

export const runtime = "nodejs";

type RequestBody = {
  mode?: "interpret" | "direct";
  event?: VerifiedEvent;
  intelligence?: EchoIntelligence;
  director?: DirectorSettings;
};

function extractJson(text: string) {
  const trimmed = text.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Claude returned no JSON object");
  return JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>;
}

async function callClaude(system: string, user: string) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    }),
    cache: "no-store",
  });

  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message || `Claude API returned ${response.status}`);
  return body.content?.filter((item) => item.type === "text").map((item) => item.text || "").join("\n").trim() || "";
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.event?.hash) {
    return NextResponse.json({ error: "Verified event data is required." }, { status: 400 });
  }

  if (body.mode === "direct") {
    const intelligence = body.intelligence || fallbackIntelligence(body.event);
    const director = body.director;
    if (!director) return NextResponse.json({ error: "Director settings are required." }, { status: 400 });

    const fallback = buildDirectorPrompt(body.event, intelligence, director);
    try {
      const text = await callClaude(
        "You are EchoVault's cinematic director. Convert verified blockchain facts plus explicit user art direction into a single prompt for Visko Orbis Stable. Never invent blockchain facts. Do not add readable text, logos, UI, cuts, or unrelated plot. Orbis is continuous and steerable, so emphasize coherent motion, camera behavior, spatial continuity, material detail, atmosphere, and a single unbroken shot. Return ONLY the finished prompt as plain text.",
        `VERIFIED EVENT\n${JSON.stringify(body.event, null, 2)}\n\nCURRENT INTERPRETATION\n${JSON.stringify(intelligence, null, 2)}\n\nDIRECTOR SETTINGS\n${JSON.stringify(director, null, 2)}\n\nFallback direction for reference:\n${fallback}`,
      );
      return NextResponse.json({ prompt: text?.trim() || fallback, source: text ? "claude" : "fallback" });
    } catch (caught) {
      console.error("Claude directing failed", caught);
      return NextResponse.json({ prompt: fallback, source: "fallback", warning: "Claude was unavailable; a deterministic director prompt was used." });
    }
  }

  const fallback = fallbackIntelligence(body.event);
  try {
    const text = await callClaude(
      "You are EchoVault's provenance-aware story editor. You receive verified transaction facts. You may interpret their emotional or visual potential, but you must NEVER invent contract names, people, organizations, motives, token identities, or actions not proven by the supplied facts. Return strict JSON with exactly these string keys: title, summary, significance, suggestedPrompt, audioPrompt. suggestedPrompt must be a visually precise single-take cinematic prompt for Visko Orbis Stable with no readable text, no logos, no cuts, and coherent continuous motion. audioPrompt must describe sound only, in one sentence.",
      `VERIFIED EVENT\n${JSON.stringify(body.event, null, 2)}`,
    );
    if (!text) return NextResponse.json({ intelligence: fallback });
    const parsed = extractJson(text);
    const intelligence: EchoIntelligence = {
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 90) : fallback.title,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 420) : fallback.summary,
      significance: typeof parsed.significance === "string" ? parsed.significance.slice(0, 420) : fallback.significance,
      suggestedPrompt: typeof parsed.suggestedPrompt === "string" ? parsed.suggestedPrompt.slice(0, 3500) : fallback.suggestedPrompt,
      audioPrompt: typeof parsed.audioPrompt === "string" ? parsed.audioPrompt.slice(0, 500) : fallback.audioPrompt,
      source: "claude",
    };
    return NextResponse.json({ intelligence });
  } catch (caught) {
    console.error("Claude interpretation failed", caught);
    return NextResponse.json({ intelligence: fallback, warning: "Claude was unavailable; a deterministic interpretation was used." });
  }
}
