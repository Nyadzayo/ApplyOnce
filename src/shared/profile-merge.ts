import type { CandidateProfile } from "./types";

// Re-importing a resume (PLAN.md Phase 6, v0.2): the new parse replaces what
// the resume knows (work, education, skills, contact details it found) and
// keeps what only the user knows (explicit answers, and any contact or link
// field the new parse left empty).

export function mergeImportedProfile(existing: CandidateProfile, imported: CandidateProfile): CandidateProfile {
  const pick = <T extends Record<string, string>>(base: T, next: T): T => {
    const out = { ...base };
    for (const key of Object.keys(next) as (keyof T)[]) {
      if (next[key]) out[key] = next[key];
    }
    return out;
  };
  return {
    ...existing,
    basics: pick(existing.basics, imported.basics),
    location: pick(existing.location, imported.location),
    links: pick(existing.links, imported.links),
    work: imported.work.length > 0 ? imported.work : existing.work,
    education: imported.education.length > 0 ? imported.education : existing.education,
    skills: imported.skills.length > 0 ? imported.skills : existing.skills,
    explicit: existing.explicit,
  };
}
