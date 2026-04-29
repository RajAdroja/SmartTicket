import { connectDB, FeedbackModel, TicketModel } from './store';

async function seedTickets() {
  await TicketModel.deleteMany({ id: /^verify-/ });

  const baseDate = new Date();
  const tickets = [
    {
      id: 'verify-high-001',
      customerName: 'QA High Confidence',
      status: 'resolved',
      messages: [
        { id: 'm1', sender: 'user', text: 'How do I update billing address?', createdAt: baseDate.toISOString() },
        { id: 'm2', sender: 'bot', text: 'Go to Settings > Billing > Address and save changes.', createdAt: baseDate.toISOString() },
      ],
      escalatedAt: baseDate,
      summary: 'Customer asked a simple billing profile question.',
      tag: 'Billing',
      userProfile: { name: 'QA User', email: 'qa-high@example.com', company: 'Acme Corp' },
      lastAiConfidenceScore: 92,
      lastAiConfidenceLabel: 'high',
      escalationReason: 'none',
      escalationTriggerSource: 'model_signal',
    },
    {
      id: 'verify-low-001',
      customerName: 'QA Low Confidence',
      status: 'open',
      messages: [
        { id: 'm3', sender: 'user', text: 'Your answer is wrong, still broken.', createdAt: baseDate.toISOString() },
      ],
      escalatedAt: baseDate,
      summary: 'Customer remains blocked after repeated attempts.',
      tag: 'Technical Bug',
      userProfile: { name: 'QA User', email: 'qa-low@example.com', company: 'Acme Corp' },
      lastAiConfidenceScore: 34,
      lastAiConfidenceLabel: 'low',
      escalationReason: 'low_confidence',
      escalationTriggerSource: 'confidence_rule',
    },
    {
      id: 'verify-sensitive-001',
      customerName: 'QA Sensitive Request',
      status: 'open',
      messages: [
        { id: 'm4', sender: 'user', text: 'Please reset my password and delete my account.', createdAt: baseDate.toISOString() },
      ],
      escalatedAt: baseDate,
      summary: 'Customer requested account-sensitive operations.',
      tag: 'Account',
      userProfile: { name: 'QA User', email: 'qa-sensitive@example.com', company: 'Acme Corp' },
      lastAiConfidenceScore: 67,
      lastAiConfidenceLabel: 'medium',
      escalationReason: 'sensitive_account_action',
      escalationTriggerSource: 'policy_rule',
    },
  ];

  await TicketModel.insertMany(tickets);
}

async function seedFeedback() {
  await FeedbackModel.deleteMany({ sessionId: /^verify-/ });

  const feedbackRows = [
    {
      sessionId: 'verify-session-helpful-1',
      ticketId: 'verify-high-001',
      company: 'Acme Corp',
      helpful: true,
      reasons: ['clear_answer'],
      comment: 'Straightforward and fast.',
      aiDecision: { confidenceScore: 92, confidenceLabel: 'high', escalationReason: 'none', recommendedAction: 'continue_ai' },
    },
    {
      sessionId: 'verify-session-unhelpful-1',
      ticketId: 'verify-low-001',
      company: 'Acme Corp',
      helpful: false,
      reasons: ['incorrect_answer', 'needed_human_help'],
      comment: 'The first answer did not fix the issue.',
      aiDecision: { confidenceScore: 34, confidenceLabel: 'low', escalationReason: 'low_confidence', recommendedAction: 'auto_escalate' },
    },
    {
      sessionId: 'verify-session-unhelpful-2',
      ticketId: 'verify-sensitive-001',
      company: 'Acme Corp',
      helpful: false,
      reasons: ['missing_context'],
      comment: 'Needed a human for account actions.',
      aiDecision: { confidenceScore: 67, confidenceLabel: 'medium', escalationReason: 'sensitive_account_action', recommendedAction: 'auto_escalate' },
    },
    {
      sessionId: 'verify-session-helpful-low-1',
      ticketId: 'verify-low-001',
      company: 'Acme Corp',
      helpful: true,
      reasons: ['issue_resolved'],
      comment: 'Escalation to human was correct.',
      aiDecision: { confidenceScore: 40, confidenceLabel: 'low', escalationReason: 'low_confidence', recommendedAction: 'auto_escalate' },
    },
  ];

  await FeedbackModel.insertMany(feedbackRows);
}

async function run() {
  await connectDB();
  await seedTickets();
  await seedFeedback();
  console.log('Verification seed data loaded.');
  process.exit(0);
}

run().catch((error) => {
  console.error('Verification seed failed:', error);
  process.exit(1);
});
