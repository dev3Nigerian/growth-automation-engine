import axios from 'axios';

export interface LeadScoreResult {
  score: number | null;
  rationale: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

function clampScore(score: unknown): number | null {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }

  return Math.max(1, Math.min(100, Math.round(score)));
}

export async function scoreLead(lead: Record<string, unknown>): Promise<LeadScoreResult> {
  const apiUrl = process.env.OLAMA_API_URL ?? process.env.OLLAMA_API_URL;
  const apiKey = process.env.OLAMA_API_KEY ?? process.env.OLLAMA_API_KEY;
  const baseUrl = process.env.OLAMA_API_URL ?? 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL ?? 'gpt-oss:120b';
  const endpoint = apiUrl ?? `${baseUrl}/api/chat`;

  try {
    const response = await axios.post<OllamaChatResponse>(
      endpoint,
      {
        model,
        stream: false,
        format: 'json',
        messages: [
          {
            role: 'system',
            content:
              'You score startup leads from 1 to 100 based on influence and outreach value. ' +
              'Use founder credibility, company quality, email availability, and social presence. ' +
              'Return strict JSON with keys score and rationale.',
          },
          {
            role: 'user',
            content: `Score this startup lead:\n${JSON.stringify(lead, null, 2)}`,
          },
        ],
        options: {
          temperature: 0.2,
        },
      },
      {
        headers: apiKey
          ? {
              Authorization: `Bearer ${apiKey}`,
            }
          : undefined,
        timeout: 20_000,
      },
    );

    const content = response.data.message?.content?.trim() ?? '';
    if (!content) {
      return { score: null, rationale: '' };
    }

    const parsed = JSON.parse(content) as { score?: unknown; rationale?: unknown };
    return {
      score: clampScore(parsed.score),
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Scoring] Ollama scoring failed: ${message}`);
    return { score: null, rationale: '' };
  }
}