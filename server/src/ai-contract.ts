import { z } from 'zod';

export const CONFIDENCE_LABELS = ['high', 'medium', 'low'] as const;
export const ESCALATION_REASONS = [
  'none',
  'missing_kb_info',
  'sensitive_account_action',
  'user_requested_human',
  'frustration_detected',
  'low_confidence',
] as const;
export const RECOMMENDED_ACTIONS = ['continue_ai', 'offer_human', 'auto_escalate'] as const;

export const POSITIVE_FEEDBACK_REASONS = [
  'clear_answer',
  'quick_response',
  'easy_steps',
  'issue_resolved',
] as const;

export const NEGATIVE_FEEDBACK_REASONS = [
  'incorrect_answer',
  'unclear_answer',
  'missing_context',
  'too_slow',
  'needed_human_help',
] as const;

export const ConfidenceLabelSchema = z.enum(CONFIDENCE_LABELS);
export const EscalationReasonSchema = z.enum(ESCALATION_REASONS);
export const RecommendedActionSchema = z.enum(RECOMMENDED_ACTIONS);

export const FeedbackOptionsSchema = z.object({
  helpfulPrompt: z.string(),
  positiveReasonOptions: z.array(z.enum(POSITIVE_FEEDBACK_REASONS)),
  negativeReasonOptions: z.array(z.enum(NEGATIVE_FEEDBACK_REASONS)),
});

export const ChatDecisionSchema = z.object({
  confidenceScore: z.number().int().min(0).max(100),
  confidenceLabel: ConfidenceLabelSchema,
  escalationReason: EscalationReasonSchema,
  recommendedAction: RecommendedActionSchema,
});

export const ChatApiResponseSchema = z.object({
  reply: z.string(),
  suggestEscalation: z.boolean(),
  suggestResolution: z.boolean(),
  decision: ChatDecisionSchema,
  feedbackOptions: FeedbackOptionsSchema,
});

export type ConfidenceLabel = z.infer<typeof ConfidenceLabelSchema>;
export type EscalationReason = z.infer<typeof EscalationReasonSchema>;
export type ChatApiResponse = z.infer<typeof ChatApiResponseSchema>;

export function labelFromScore(score: number): ConfidenceLabel {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export const DEFAULT_FEEDBACK_OPTIONS = FeedbackOptionsSchema.parse({
  helpfulPrompt: 'Was this AI response helpful?',
  positiveReasonOptions: [...POSITIVE_FEEDBACK_REASONS],
  negativeReasonOptions: [...NEGATIVE_FEEDBACK_REASONS],
});
