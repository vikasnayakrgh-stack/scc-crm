import { Candidate, Job } from '../types';

export interface MatchResult {
  score: number;
  reasons: string[];
  isEligible: boolean;
  skillOverlap: string[];
}

// Normalize a skill string for comparison (e.g. "MS Excel " -> "ms excel")
export const normalizeSkill = (skill: string): string => {
  return skill.toLowerCase().trim().replace(/[-_.]/g, ' ');
};

export const calculateCandidateJobMatch = (
  candidate: Candidate,
  job: Job
): MatchResult => {
  // Disqualify closed jobs
  if (job.status === 'Closed' || !job.is_active) {
    return {
      score: 0,
      reasons: ['Job is currently closed'],
      isEligible: false,
      skillOverlap: [],
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const candSkills = (candidate.skills || []).map(normalizeSkill);
  const jobSkills = (job.skills_req || []).map(normalizeSkill);

  // 1. Skill Match (Max 40 points)
  const matchedSkills: string[] = [];
  jobSkills.forEach((js) => {
    if (candSkills.some((cs) => cs === js || cs.includes(js) || js.includes(cs))) {
      matchedSkills.push(js);
    }
  });

  if (jobSkills.length > 0) {
    const skillRatio = matchedSkills.length / jobSkills.length;
    const skillPoints = Math.round(skillRatio * 40);
    score += skillPoints;
    if (matchedSkills.length > 0) {
      reasons.push(`${matchedSkills.length}/${jobSkills.length} skills matched (${matchedSkills.join(', ')})`);
    } else {
      reasons.push('No required skills matched');
    }
  } else {
    score += 40; // No specific skills required
    reasons.push('General profile (no specific skills mandated)');
  }

  // 2. Experience Match (Max 25 points)
  const exp = Number(candidate.experience || 0);
  const minExp = Number(job.min_exp || 0);
  const maxExp = Number(job.max_exp || 0);

  if (exp >= minExp && exp <= maxExp) {
    score += 25;
    reasons.push(`Experience fits exact range (${exp} yrs in ${minExp}-${maxExp} yrs)`);
  } else if (exp >= Math.max(0, minExp - 1) && exp <= maxExp + 2) {
    score += 15;
    reasons.push(`Experience is close to required range (${exp} yrs)`);
  } else {
    reasons.push(`Experience (${exp} yrs) outside required ${minExp}-${maxExp} yrs`);
  }

  // 3. Location Match (Max 20 points)
  const candLoc = (candidate.location || '').toLowerCase().trim();
  const jobLoc = (job.location || '').toLowerCase().trim();

  if (candLoc && jobLoc && (candLoc === jobLoc || candLoc.includes(jobLoc) || jobLoc.includes(candLoc))) {
    score += 20;
    reasons.push(`Location matched (${candidate.location})`);
  } else if (!candLoc || !jobLoc) {
    score += 10;
    reasons.push('Location not specified');
  } else {
    reasons.push(`Location mismatch (${candidate.location} vs ${job.location})`);
  }

  // 4. Salary Expectation Match (Max 15 points)
  const expected = Number(candidate.expected_salary || 0);
  const maxSalary = Number(job.salary_max || 0);

  if (maxSalary > 0) {
    if (expected <= maxSalary) {
      score += 15;
      reasons.push(`Salary within budget (₹${expected} ≤ ₹${maxSalary})`);
    } else if (expected <= maxSalary * 1.15) {
      score += 8;
      reasons.push(`Salary slightly above budget (+15% negotiable)`);
    } else {
      reasons.push(`Salary expectation exceeds budget (₹${expected} > ₹${maxSalary})`);
    }
  } else {
    score += 15;
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    reasons,
    isEligible: score >= 40,
    skillOverlap: matchedSkills,
  };
};
