import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { z } from 'zod';
import { Message, getKnowledgeBase } from './store';
import { ChatDecisionSchema, EscalationReasonSchema, labelFromScore } from './ai-contract';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getSystemPrompt = async (company?: string) => {
  const globalKb = await getKnowledgeBase('global');
  const companyKb = company && company !== 'global' ? await getKnowledgeBase(company) : '';

  // Build strictly scoped KB context
  const kbContext = companyKb
    ? `--- GLOBAL KNOWLEDGE BASE (applies to all companies) ---\n${globalKb || '(empty)'}\n\n--- PRIVATE KNOWLEDGE BASE FOR: ${company} (STRICTLY CONFIDENTIAL) ---\n${companyKb}`
    : `--- GLOBAL KNOWLEDGE BASE ---\n${globalKb || '(empty)'}`;

  const companyScope = company && company !== 'global'
    ? `You are currently handling a support session for a customer of: **${company}**.`
    : `You are currently handling a general support session (no specific company context).`;

  return `
You are the SmartTicket AI Assistant, providing Tier-1 support for a customer support platform.

${companyScope}

CRITICAL DATA ISOLATION RULES:
1. Use ONLY the PRIVATE KNOWLEDGE BASE for ${company || 'none'}.
2. Use the GLOBAL KNOWLEDGE BASE for general help.
3. NEVER reveal or invent data from other companies.

${kbContext}

INSTRUCTIONS:
- ANSWERING: If the answer to a user's question is in the Knowledge Base (even if it's about pricing, billing, or policies), ALWAYS provide the answer. Do not escalate if the information is right here.
- ESCALATION: Only suggest a human agent if:
  1. The information is NOT in the Knowledge Base provided above.
  2. The user specifically asks for a "human", "agent", or "support".
  3. The user expresses significant frustration (e.g., "this is terrible", "I am angry").
  4. The user is asking for a sensitive ACTION (like "reset my password" or "refund my money") that requires a human to click a button.
- Keep replies short (1-3 sentences) and professional.
`;
};

const ModelChatResponseSchema = z.object({
  reply: z.string().min(1),
  shouldEscalate: z.boolean(),
  shouldResolve: z.boolean(),
  confidenceScore: z.number().int().min(0).max(100),
  escalationReason: EscalationReasonSchema.optional(),
});

type GeneratedChatResponse = {
  reply: string;
  suggestEscalation: boolean;
  suggestResolution: boolean;
  decision: z.infer<typeof ChatDecisionSchema>;
};

const SENSITIVE_REQUEST_RE = /password|refund|billing|invoice|cancel|delete account|change email|payment/i;
const HUMAN_REQUEST_RE = /human|agent|support|escalate|representative/i;
const FRUSTRATION_RE = /not working|still broken|again|frustrated|angry|upset|terrible/i;

function inferEscalationReason(lastUserText: string, shouldEscalate: boolean): z.infer<typeof EscalationReasonSchema> {
  if (!shouldEscalate) return 'none';
  if (HUMAN_REQUEST_RE.test(lastUserText)) return 'user_requested_human';
  if (FRUSTRATION_RE.test(lastUserText)) return 'frustration_detected';
  if (SENSITIVE_REQUEST_RE.test(lastUserText)) return 'sensitive_account_action';
  return 'low_confidence';
}

function extractJson(raw: string) {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function buildDecision(args: {
  shouldEscalate: boolean;
  shouldResolve: boolean;
  lastUserText: string;
  confidenceScore?: number;
  escalationReason?: z.infer<typeof EscalationReasonSchema>;
}) {
  const rawScore = args.confidenceScore;
  const confidenceScore =
    typeof rawScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(rawScore)))
      : args.shouldResolve
        ? 90
        : args.shouldEscalate
          ? 35
          : 72;
  const confidenceLabel = labelFromScore(confidenceScore);
  const escalationReason = args.escalationReason ?? inferEscalationReason(args.lastUserText, args.shouldEscalate);
  const recommendedAction =
    args.shouldEscalate || confidenceLabel === 'low'
      ? 'auto_escalate'
      : confidenceLabel === 'medium'
        ? 'offer_human'
        : 'continue_ai';

  return ChatDecisionSchema.parse({
    confidenceScore,
    confidenceLabel,
    escalationReason,
    recommendedAction,
  });
}

export async function generateChatResponse(history: Message[], company?: string): Promise<GeneratedChatResponse> {
  try {
    const contents = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const allowedReasons = ['none', 'missing_kb_info', 'sensitive_account_action', 'user_requested_human', 'frustration_detected', 'low_confidence'];
    const prompt = `Read the conversation and do two things.
1) Generate a concise, helpful reply to the customer.
2) Decide whether this conversation should be escalated to a human agent, resolved by AI, or continue as is.

Return ONLY a JSON object with these properties:
{
  "reply": "...",
  "shouldEscalate": true or false,
  "shouldResolve": true or false,
  "confidenceScore": number from 0 to 100,
  "escalationReason": one of ${allowedReasons.join(', ')}
}

RULES FOR JSON:
- Set shouldEscalate=true ONLY if you cannot answer from the Knowledge Base or the user asks for a human.
- Set shouldResolve=true ONLY if the customer explicitly says "thanks", "solved", "it works", or "goodbye".
- If the customer is just asking a normal question that you CAN answer, set both to false and confidenceScore to 100.
`; 

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: await getSystemPrompt(company) }] },
        { role: 'model', parts: [{ text: 'Understood. I will act as the SmartTicket AI Assistant.' }] },
        ...contents,
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            shouldEscalate: { type: Type.BOOLEAN },
            shouldResolve: { type: Type.BOOLEAN },
            confidenceScore: { type: Type.INTEGER },
            escalationReason: { type: Type.STRING },
          },
          required: ['reply', 'shouldEscalate', 'shouldResolve', 'confidenceScore', 'escalationReason'],
          propertyOrdering: ['reply', 'shouldEscalate', 'shouldResolve', 'confidenceScore', 'escalationReason'],
        },
      },
    });

    const rawText = response.text || '';
    const parsedJson = extractJson(rawText);
    const parsed = parsedJson ? ModelChatResponseSchema.safeParse(parsedJson) : null;
    const lastUserText = history[history.length - 1]?.text ?? '';

    if (parsed?.success) {
      const decision = buildDecision({
        shouldEscalate: parsed.data.shouldEscalate,
        shouldResolve: parsed.data.shouldResolve,
        lastUserText,
        confidenceScore: parsed.data.confidenceScore,
        escalationReason: parsed.data.escalationReason,
      });
      return {
        reply: parsed.data.reply,
        suggestEscalation: parsed.data.shouldEscalate,
        suggestResolution: parsed.data.shouldResolve,
        decision,
      };
    }

    const reply = rawText || "I'm having trouble connecting to my knowledge base right now.";
    const suggestEscalation = /escalat|human|agent/i.test(reply) && /human|agent|escalat|problem|issue/i.test(lastUserText);
    const suggestResolution = /glad I could help|close this chat|thank you|resolved/i.test(reply);
    const decision = buildDecision({
      shouldEscalate: suggestEscalation,
      shouldResolve: suggestResolution,
      lastUserText,
    });

    return { reply, suggestEscalation, suggestResolution, decision };
  } catch (error) {
    const lastUserText = history[history.length - 1]?.text ?? '';
    const reply = "I'm sorry, I'm experiencing technical difficulties. Would you like to speak to a human agent?";
    return {
      reply,
      suggestEscalation: true,
      suggestResolution: false,
      decision: buildDecision({
        shouldEscalate: true,
        shouldResolve: false,
        lastUserText,
        confidenceScore: 20,
        escalationReason: 'low_confidence',
      }),
    };
  }
}

export async function generateSummary(history: Message[]): Promise<string> {
  try {
    const contents = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: 'Please read the following conversation and provide a 1-sentence executive summary of the customer\'s core issue or request. Do not include any pleasantries, just the summary.' }] },
        { role: 'model', parts: [{ text: 'Understood.' }] },
        ...contents
      ]
    });

    return response.text?.trim() || 'No summary available.';
  } catch (error) {
    return 'Summary unavailable due to technical issues.';
  }
}

export async function generateSmartReplies(history: Message[]): Promise<string[]> {
  try {
    const contents = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: 'You are an AI assistant helping a human support agent. Read the conversation and suggest 3 short, helpful replies the agent could send next. Return ONLY a JSON array of 3 strings. Example: ["How can I help you?", "I am looking into this.", "Please wait a moment."]' }] },
        { role: 'model', parts: [{ text: 'Understood.' }] },
        ...contents
      ]
    });

    const text = response.text || '[]';
    const match = text.match(/\[.*\]/s);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 3);
      }
    }
    return ['I am looking into this for you.', 'Could you provide more details?', 'Please give me a moment to check.'];
  } catch (error) {
    return ['I am looking into this for you.', 'Could you provide more details?', 'Please give me a moment to check.'];
  }
}

export async function generateTag(history: Message[]): Promise<string> {
  try {
    const contents = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: 'Please read the following conversation and assign a single 1-2 word category tag (e.g., Billing, Technical Bug, Sales, Account Info). Return ONLY the tag text.' }] },
        { role: 'model', parts: [{ text: 'Understood.' }] },
        ...contents
      ]
    });

    return response.text?.trim() || 'General';
  } catch (error) {
    return 'General';
  }
}
