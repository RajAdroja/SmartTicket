import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Message, getKnowledgeBase } from './store';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getSystemPrompt = async () => {
  const kb = await getKnowledgeBase();
  return `
You are the SmartTicket AI Assistant, providing Tier-1 support.
Your goal is to answer generic user queries clearly and professionally using the provided knowledge base.
KNOWLEDGE BASE:
"""
${kb}
"""

If the user asks a question not covered by the knowledge base, do your best to answer, or suggest speaking to a human.
If the user mentions "human", "agent", "escalate", or seems frustrated, you MUST suggest they escalate the ticket by saying something like: "It looks like you'd like to speak with a human agent. I am escalating this ticket for you."
If the user says their problem is solved, says thank you, or indicates the conversation is over, acknowledge it and say exactly: "I am glad I could help! I will close this chat now."
Keep your responses short (1-3 sentences) and conversational.
`;
};

export async function generateChatResponse(history: Message[]): Promise<{ reply: string, suggestEscalation: boolean, suggestResolution: boolean }> {
  try {
    // Format history for Gemini
    // @google/genai expects contents as { role: 'user' | 'model', parts: [{ text: '' }] }
    const contents = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: await getSystemPrompt() }] },
        { role: 'model', parts: [{ text: 'Understood. I will act as the SmartTicket AI Assistant.' }] },
        ...contents
      ]
    });

    const reply = response.text || "I'm having trouble connecting to my knowledge base right now.";
    
    // Simple regex check on the response to see if the AI decided to escalate
    const suggestEscalation = /escalat|human|agent/i.test(reply) && /human|agent|escalat/i.test(history[history.length - 1].text);
    
    // Check if AI decided to close the chat
    const suggestResolution = /glad I could help|close this chat/i.test(reply);

    return { reply, suggestEscalation, suggestResolution };
  } catch (error) {
    console.error('Error generating AI response:', error);
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
    console.error('Error generating summary:', error);
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
    // Extract JSON array
    const match = text.match(/\[.*\]/s);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 3);
      }
    }
    return ['I am looking into this for you.', 'Could you provide more details?', 'Please give me a moment to check.'];
  } catch (error) {
    console.error('Error generating smart replies:', error);
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
    console.error('Error generating tag:', error);
    return 'General';
  }
}
