import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Message, getKnowledgeBase } from './store';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getSystemPrompt = async (company?: string) => {
  const globalKb = await getKnowledgeBase('global');
  const companyKb = company && company !== 'global' ? await getKnowledgeBase(company) : '';
  
  const combinedKb = companyKb 
    ? `GLOBAL KNOWLEDGE:\n${globalKb}\n\nCOMPANY-SPECIFIC KNOWLEDGE (${company}):\n${companyKb}`
    : `KNOWLEDGE BASE:\n${globalKb}`;

  return `
You are the SmartTicket AI Assistant, providing Tier-1 support for a customer support platform.
Your primary task is to answer customer questions using the company-specific knowledge base first, then the global knowledge base.
If the company knowledge base contains a direct answer, use it. If the answer is not available, be honest and escalate when appropriate.

${combinedKb}

Use only the knowledge given here. Do not invent facts. If the user asks for account-specific details, billing, passwords, or other sensitive operations, suggest a human agent.
If the user asks for a human, mentions "agent", "escalate", "support", or shows frustration, set escalation preference to true.
If the user confirms the issue is solved, says thank you, or indicates the conversation is over, set resolution preference to true and respond with: "I am glad I could help! I will close this chat now."
Keep your replies short (1-3 sentences), helpful, and professional.
`;
};

const parseAssistantResponse = (raw: string) => {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.reply === 'string' && typeof parsed.shouldEscalate === 'boolean' && typeof parsed.shouldResolve === 'boolean') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export async function generateChatResponse(history: Message[], company?: string): Promise<{ reply: string, suggestEscalation: boolean, suggestResolution: boolean }> {
  try {
    const contents = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const prompt = `Read the conversation and do two things.
1) Generate a concise, helpful reply to the customer.
2) Decide whether this conversation should be escalated to a human agent or resolved by AI.

Return ONLY a JSON object with these properties:
{
  "reply": "...",
  "shouldEscalate": true or false,
  "shouldResolve": true or false
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
      ]
    });

    const rawText = response.text || '';
    const parsed = parseAssistantResponse(rawText);

    if (parsed) {
      return {
        reply: parsed.reply,
        suggestEscalation: parsed.shouldEscalate,
        suggestResolution: parsed.shouldResolve
      };
    }

    const reply = rawText || "I'm having trouble connecting to my knowledge base right now.";
    const suggestEscalation = /escalat|human|agent/i.test(reply) && /human|agent|escalat|problem|issue/i.test(history[history.length - 1].text);
    const suggestResolution = /glad I could help|close this chat|thank you|resolved/i.test(reply);

    return { reply, suggestEscalation, suggestResolution };
  } catch (error) {
    return {
      reply: "I'm sorry, I'm experiencing technical difficulties. Would you like to speak to a human agent?",
      suggestEscalation: true,
      suggestResolution: false
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
