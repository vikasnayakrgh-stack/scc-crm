import { Candidate, Application, ApplicationStage } from '../types';

export interface ReconciliationResult {
  candidateId: string;
  previousStatus: Candidate['status'];
  newStatus: Candidate['status'];
  reason: string;
  hasOtherPlacedApps: boolean;
  totalActiveApps: number;
}

/**
 * Reconciles a candidate's availability status when an application transitions stage.
 *
 * Business Rules:
 * 1. If candidate is 'Blacklisted', this administrative status is NEVER altered by stage transitions.
 * 2. If the transitioning application becomes 'Placed', candidate becomes 'Placed'.
 * 3. If an application moves away from 'Placed' (e.g. to 'Rejected', 'Withdrawn', etc.):
 *    - If the candidate still has ANY OTHER active application in 'Placed', status remains 'Placed'.
 *    - If no other applications are 'Placed', candidate reverts to 'Active'.
 * 4. A candidate with multiple active applications (in screening, interview, offer, etc.) remains 'Active'
 *    until an application actually reaches 'Placed'.
 * 5. Soft-deleted applications (is_active === false) are excluded from the placement check.
 * 6. Repeated transitions to the same stage are idempotent.
 */
export function reconcileCandidateStatus(
  candidate: Candidate,
  allApplications: Application[],
  targetAppId: string,
  nextStage: ApplicationStage
): ReconciliationResult {
  // Rule 1: Blacklisted status is administrative and permanent until manual review
  if (candidate.status === 'Blacklisted') {
    return {
      candidateId: candidate.id,
      previousStatus: candidate.status,
      newStatus: 'Blacklisted',
      reason: 'Candidate is blacklisted; status cannot be altered by application stage transitions',
      hasOtherPlacedApps: false,
      totalActiveApps: allApplications.filter(
        (a) => a.candidate_id === candidate.id && a.is_active !== false
      ).length,
    };
  }

  // Active applications for this candidate (excluding soft-deleted)
  const candidateApps = allApplications.filter(
    (app) => app.candidate_id === candidate.id && app.is_active !== false
  );

  // Other applications that are currently in 'Placed' stage (excluding target application)
  const otherPlacedApps = candidateApps.filter(
    (app) => app.id !== targetAppId && app.stage === 'Placed'
  );

  const willHavePlacedApp = nextStage === 'Placed' || otherPlacedApps.length > 0;
  const newStatus: Candidate['status'] = willHavePlacedApp ? 'Placed' : 'Active';

  let reason = '';
  if (willHavePlacedApp) {
    if (nextStage === 'Placed') {
      reason = `Application ${targetAppId} transitioned to Placed`;
    } else {
      reason = `Candidate has ${otherPlacedApps.length} other active application(s) in Placed stage`;
    }
  } else {
    if (candidate.status === 'Placed') {
      reason = `Application ${targetAppId} moved away from Placed to ${nextStage}; no remaining Placed applications`;
    } else {
      reason = `Candidate status remains Active across transition to ${nextStage}`;
    }
  }

  return {
    candidateId: candidate.id,
    previousStatus: candidate.status,
    newStatus,
    reason,
    hasOtherPlacedApps: otherPlacedApps.length > 0,
    totalActiveApps: candidateApps.length,
  };
}
