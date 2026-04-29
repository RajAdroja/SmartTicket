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

CRITICAL DATA ISOLATION RULES — YOU MUST FOLLOW THESE EXACTLY:
1. You MUST ONLY use the PRIVATE KNOWLEDGE BASE that belongs to the current company (${company || 'none'}).
2. You MUST NEVER reveal, reference, or use knowledge from any other company's private knowledge base.
3. If a user asks about another company's products, policies, or data, you MUST say you do not have that information.
4. The GLOBAL KNOWLEDGE BASE is shared and safe to use for any session.
5. You MUST NOT acknowledge that a private knowledge base for any other company exists.

${kbContext}

Use only the knowledge given here. Do not invent facts. If the user asks for account-specific details, billing, passwords, or other sensitive operations, suggest a human agent.
If the user asks for a human, mentions "agent", "escalate", "support", or shows frustration, set escalation preference to true.
If the user confirms the issue is solved, says thank you, or indicates the conversation is over, set resolution preference to true and respond with: "I am glad I could help! I will close this chat now."
Keep your replies short (1-3 sentences), helpful, and professional.
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
2) Decide whether this conversation should be escalated to a human agent or resolved by AI.

Return ONLY a JSON object with these properties:
{
  "reply": "...",
  "shouldEscalate": true or false,
  "shouldResolve": true or false,
  "confidenceScore": number from 0 to 100,
  "escalationReason": one of ${allowedReasons.join(', ')}
}

The reply must be short (1-3 sentences) and use the knowledge base if possible.
If the customer asks for a human, expresses frustration, says the issue is unresolved, or the problem requires account-specific or complex workflow handling, set shouldEscalate to true.
If the customer confirms the issue is solved or the conversation is complete, set shouldResolve to true.
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
