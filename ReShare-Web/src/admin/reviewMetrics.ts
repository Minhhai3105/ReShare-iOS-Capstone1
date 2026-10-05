import type { DonationAiReviewItem } from './mockDonationAiReview';

export function calculateReviewMetrics(items: DonationAiReviewItem[], from: string, to: string) {
  const inRange = (date?: string) => !!date && date.slice(0, 10) >= from && date.slice(0, 10) <= to;
  const submitted = items.filter(item => inRange(item.createdAt));
  const confirmed = items.filter(item => item.staffConfirmation.status === 'confirmed' && !!item.staffConfirmation.category && inRange(item.staffConfirmedAt));
  const withAi = confirmed.filter(item => item.aiPrediction.available && !!item.aiPrediction.category);
  const matched = withAi.filter(item => item.aiPrediction.category === item.staffConfirmation.category);
  return {
    submitted: submitted.length,
    confirmed: confirmed.length,
    withAi: withAi.length,
    matched: matched.length,
    rate: withAi.length ? Math.round(matched.length / withAi.length * 100) : null,
    noModel: confirmed.length - withAi.length,
    donorManual: confirmed.filter(item => item.donorConfirmation.method === 'manual').length
  };
}
