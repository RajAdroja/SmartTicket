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

  const systemPrompt = `
You are a highly capable, "Bolder AI" support specialist for the company: ${company || 'General'}.
Your primary goal is to resolve customer issues using the provided Knowledge Base.

${companyScope}

CRITICAL DATA ISOLATION RULES:
1. Use ONLY the PRIVATE KNOWLEDGE BASE for ${company || 'none'}.
2. Use the GLOBAL KNOWLEDGE BASE for general help.
3. NEVER reveal or invent data from other companies.

### STRATEGIC DIRECTIVES:
1. **Prioritize Knowledge Base**: If information exists in the KB (including stats, pricing, or future roadmaps), USE IT. Do not say "I don't know" or "Handing off" if the answer is anywhere in the KB.
2. **Handle Sensitive Topics**: You ARE authorized to discuss corporate statistics, upcoming features (FutureCast), and pricing found in the KB. Do not escalate just because a topic seems "corporate" or "sensitive."
3. **Escalate ONLY when necessary**: Only suggest a human agent if:
   - The information is objectively missing from the KB.
   - The user explicitly asks for a human.
   - The user is extremely frustrated or angry.
   - The user is asking for a sensitive ACTION (e.g., "refund me", "change my password").
4. **Be Proactive**: If a user asks about a general topic, provide a helpful summary based on the KB.

### KNOWLEDGE BASE CONTEXT:
${kbContext}
`;

  return systemPrompt;
};

const ModelChatResponseSchema = z.object({
  reply: z.string().min(1),
  shouldEscalate: z.boolean(),
  shouldResolve: z.boolean(),
  confidenceScore: z.number().int().min(0).max(100),
  escalationReason: EscalationReasonSchema.optional(),
});

export async function generateChatResponse(messages: Message[], company?: string) {
  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            shouldEscalate: { type: Type.BOOLEAN },
            shouldResolve: { type: Type.BOOLEAN },
            confidenceScore: { type: Type.NUMBER },
            escalationReason: {
              type: Type.STRING,
              enum: ['none', 'missing_kb_info', 'sensitive_account_action', 'user_requested_human', 'frustration_detected', 'low_confidence']
            },
          },
          required: ['reply', 'shouldEscalate', 'shouldResolve', 'confidenceScore'],
        },
      },
    });

    const systemPrompt = await getSystemPrompt(company);
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will strictly follow the company-specific Knowledge Base and escalation rules.' }] },
      ],
    });

    // Send full conversation history (excluding the system prompt and its acknowledgment)
    const lastMessage = messages[messages.length - 1];
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    // Start with a new chat for each request to ensure fresh context and no session leakage
    const freshChat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood.' }] },
        ...history
      ],
    });

    const result = await freshChat.sendMessage(lastMessage.text);
    const response = await result.response;
    const text = response.text();
    
    const data = ModelChatResponseSchema.parse(JSON.parse(text));
    
    return {
      reply: data.reply,
      suggestEscalation: data.shouldEscalate,
      suggestResolution: data.shouldResolve,
      decision: {
        confidenceScore: data.confidenceScore,
        confidenceLabel: labelFromScore(data.confidenceScore),
        escalationReason: data.escalationReason || 'none',
      },
    };
  } catch (error) {
    console.error('[Gemini AI Error]:', error);
    return {
      reply: "I'm having trouble connecting to my brain right now. Let me get a human for you.",
      suggestEscalation: true,
      suggestResolution: false,
      decision: {
        confidenceScore: 0,
        confidenceLabel: 'low' as const,
        escalationReason: 'low_confidence' as const,
      },
    };
  }
}

export async function generateSummary(messages: Message[]) {
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Summarize this customer support chat in one sentence:\n\n${messages.map(m => `${m.sender}: ${m.text}`).join('\n')}`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    return 'Summary unavailable';
  }
}

export async function generateTag(messages: Message[]) {
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Based on this chat, provide a single word tag (e.g., Billing, Technical, Feedback):\n\n${messages.map(m => `${m.sender}: ${m.text}`).join('\n')}`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().replace(/[^\w]/g, '');
  } catch (err) {
    return 'General';
  }
}

export async function generateSmartReplies(messages: Message[]) {
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Based on this conversation, suggest 3 short, professional reply options for the AGENT. Return as a JSON array of strings: ["Option 1", "Option 2", "Option 3"]\n\n${messages.map(m => `${m.sender}: ${m.text}`).join('\n')}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
  } catch (err) {
    return [];
  }
}
