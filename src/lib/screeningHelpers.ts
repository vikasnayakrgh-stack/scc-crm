import { Candidate, CandidateScreeningResult } from '../types';

/**
 * Evaluates whether a candidate is client-eligible for employer submissions and interview scheduling.
 * - 'Pass': Eligible without warning
 * - 'Hold', 'Fail', 'Pending', or undefined: Ineligible unless explicitly overridden
 */
export function isCandidateClientEligible(
  candidateOrStatus: Candidate | CandidateScreeningResult | 'Pending' | null | undefined,
  allowOverride: boolean = false
): boolean {
  if (allowOverride) return true;
  if (!candidateOrStatus) return false;

  const status = typeof candidateOrStatus === 'string'
    ? candidateOrStatus
    : candidateOrStatus.screening_status;

  return status === 'Pass';
}

/**
 * Validates ratings for office screening (1 to 5).
 * Overall rating supports fractional ratings (e.g. 4.5, 3.5).
 */
export function validateScreeningRatings(ratings: {
  communicationRating?: number | null;
  confidenceRating?: number | null;
  overallRating?: number | null;
}): { valid: boolean; error?: string } {
  const { communicationRating, confidenceRating, overallRating } = ratings;

  if (communicationRating != null && (communicationRating < 1 || communicationRating > 5)) {
    return { valid: false, error: 'Communication rating must be between 1 and 5' };
  }
  if (confidenceRating != null && (confidenceRating < 1 || confidenceRating > 5)) {
    return { valid: false, error: 'Confidence rating must be between 1 and 5' };
  }
  if (overallRating != null && (overallRating < 1.0 || overallRating > 5.0)) {
    return { valid: false, error: 'Overall rating must be between 1.0 and 5.0' };
  }

  return { valid: true };
}
