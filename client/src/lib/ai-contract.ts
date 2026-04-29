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

export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];
export type EscalationReason = (typeof ESCALATION_REASONS)[number];
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];
export type PositiveFeedbackReason = (typeof POSITIVE_FEEDBACK_REASONS)[number];
export type NegativeFeedbackReason = (typeof NEGATIVE_FEEDBACK_REASONS)[number];

export interface ChatDecisionContract {
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  escalationReason: EscalationReason;
  recommendedAction: RecommendedAction;
}

export interface FeedbackOptionsContract {
  helpfulPrompt: string;
  positiveReasonOptions: PositiveFeedbackReason[];
  negativeReasonOptions: NegativeFeedbackReason[];
}

export interface ChatApiResponseContract {
  reply: string;
  suggestEscalation: boolean;
  suggestResolution: boolean;
  decision: ChatDecisionContract;
  feedbackOptions: FeedbackOptionsContract;
}
