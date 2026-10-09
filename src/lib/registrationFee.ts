import { PaymentRecord } from '../types';

export type CandidateFeeStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Refunded';

export interface RegistrationFeeSummary {
  expectedFee: number;
  totalPaid: number;          // Gross payments received (Paid + Partial)
  totalRefunded: number;      // Gross refunds issued
  netReceived: number;        // totalPaid - totalRefunded
  outstandingAmount: number;  // max(0, expectedFee - netReceived)
  computedStatus: CandidateFeeStatus;
  isRegistrationFeePaid: boolean; // netReceived >= expectedFee
  canRefund: boolean;         // netReceived > 0
  maxRefundableAmount: number; // Math.max(0, netReceived)
}

export interface RefundValidationResult {
  valid: boolean;
  error?: string;
  maxRefundable: number;
}

/**
 * Calculates registration fee ledger totals and computed status for a candidate.
 * - Respects existing whole INR Rupee accounting semantics.
 * - Calculates gross received vs refunded amounts without mutating past ledger items.
 * - Computes outstanding balance accurately.
 * - Resolves status:
 *   - 'Refunded': Candidate received a refund and net balance is <= 0
 *   - 'Paid': Net received >= expected fee (default ₹200)
 *   - 'Partial': 0 < net received < expected fee
 *   - 'Unpaid': ₹0 net received and no refund history
 */
export interface FeeLedgerItem {
  amount: number;
  type?: string;
  status?: string;
  is_active?: boolean;
}

export function calculateRegistrationFeeStatus(
  records: Array<FeeLedgerItem | Partial<PaymentRecord>>,
  expectedFee: number = 200,
  fallbackPaidFlag: boolean = false
): RegistrationFeeSummary {
  const activeRegRecords = records.filter(
    (r) =>
      r.is_active !== false &&
      (r.type === 'Candidate_Registration' || (!r.type && r.amount !== undefined))
  );

  const totalPaid = activeRegRecords
    .filter((r) => r.status === 'Paid' || r.status === 'Partial')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const totalRefunded = activeRegRecords
    .filter((r) => r.status === 'Refunded')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const netReceived = totalPaid - totalRefunded;
  const outstandingAmount = Math.max(0, expectedFee - netReceived);

  let computedStatus: CandidateFeeStatus = 'Unpaid';
  if (totalRefunded > 0 && netReceived <= 0) {
    computedStatus = 'Refunded';
  } else if (netReceived >= expectedFee) {
    computedStatus = 'Paid';
  } else if (netReceived > 0) {
    computedStatus = 'Partial';
  } else if (fallbackPaidFlag && totalRefunded === 0 && totalPaid === 0) {
    computedStatus = 'Paid';
  }

  const isRegistrationFeePaid =
    netReceived >= expectedFee ||
    (fallbackPaidFlag && totalRefunded === 0 && totalPaid === 0);

  const maxRefundableAmount = Math.max(0, netReceived);

  return {
    expectedFee,
    totalPaid,
    totalRefunded,
    netReceived,
    outstandingAmount,
    computedStatus,
    isRegistrationFeePaid,
    canRefund: maxRefundableAmount > 0,
    maxRefundableAmount,
  };
}

/**
 * Validates whether a candidate can receive a refund for a given amount.
 * - Prevents negative, zero, or non-integer refund values.
 * - Prevents refunding candidates with zero received balance.
 * - Prevents over-refunding (refund amount exceeding current net balance).
 */
export function validateRegistrationRefund(
  records: Array<FeeLedgerItem | Partial<PaymentRecord>>,
  refundAmount: number,
  expectedFee: number = 200
): RefundValidationResult {
  if (refundAmount <= 0) {
    return {
      valid: false,
      error: 'Refund amount must be greater than zero.',
      maxRefundable: 0,
    };
  }

  if (!Number.isFinite(refundAmount) || Math.floor(refundAmount) !== refundAmount) {
    return {
      valid: false,
      error: 'Refund amount must be a whole number in INR Rupees.',
      maxRefundable: 0,
    };
  }

  const summary = calculateRegistrationFeeStatus(records, expectedFee);

  if (summary.netReceived <= 0) {
    return {
      valid: false,
      error: 'No refundable balance available. Candidate has ₹0 net received.',
      maxRefundable: 0,
    };
  }

  if (refundAmount > summary.netReceived) {
    return {
      valid: false,
      error: `Cannot refund ₹${refundAmount}. Maximum refundable balance is ₹${summary.netReceived}.`,
      maxRefundable: summary.netReceived,
    };
  }

  return {
    valid: true,
    maxRefundable: summary.netReceived,
  };
}
