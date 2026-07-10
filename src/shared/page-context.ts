import type { AtsId } from "./types";

// Best-effort extraction of {company, role} from the job page title, and
// template substitution for saved answers ("I'm excited about {company}…").
// Deterministic: if a placeholder can't be resolved, the caller routes the
// field to review instead of filling a literal "{company}".

export interface PageContext {
  company?: string;
  role?: string;
}

const ROLE_WORDS =
  /\b(engineer|developer|manager|director|analyst|designer|scientist|consultant|lead|intern|architect|specialist|officer|head|vp|president|recruiter|marketer|accountant|nurse|teacher|writer|associate|coordinator|administrator)\b/i;

const NOISE_RE = /\s*[-–—|·]\s*(careers?|jobs?|job board|apply|application|hiring)\s*$/i;

function clean(s: string): string {
  return s.replace(NOISE_RE, "").replace(/\s+/g, " ").trim();
}

export function parseJobPageTitle(title: string, ats: AtsId): PageContext {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return {};

  // Greenhouse: "Job Application for <role> at <company>"
  const gh = /^job application for (.+) at (.+)$/i.exec(t);
  if (gh) return { role: clean(gh[1]!), company: clean(gh[2]!) };

  // "<role> at <company>" (generic + several boards)
  const at = /^(.+?)\s+at\s+(.+)$/i.exec(t);
  if (at && ROLE_WORDS.test(at[1]!)) {
    return { role: clean(at[1]!), company: clean(at[2]!) };
  }

  // "<a> - <b>" / "– " / "| " — decide which side is the role by role words.
  // Lever titles are "<company> - <role>"; many career sites are the reverse.
  const parts = t.split(/\s+[-–—|·]\s+/).map(clean).filter(Boolean);
  if (parts.length >= 2) {
    const [a, b] = [parts[0]!, parts.slice(1).join(", ")];
    const aRole = ROLE_WORDS.test(a);
    const bRole = ROLE_WORDS.test(b);
    if (aRole && !bRole) return { role: a, company: b };
    if (bRole && !aRole) return { role: b, company: a };
    // ambiguous: fall back to the ATS's known ordering
    if (ats === "lever") return { company: a, role: b };
    return { role: a, company: b };
  }

  // single segment: it's a role if it looks like one
  if (ROLE_WORDS.test(t)) return { role: clean(t) };
  return {};
}

const PLACEHOLDER_RE = /\{(company|role)\}/gi;

export function hasTemplatePlaceholders(text: string): boolean {
  return /\{(company|role)\}/i.test(text);
}

/**
 * Substitute {company}/{role} into a template answer.
 * Returns null when a needed placeholder has no value — never fill a literal
 * placeholder into a real application.
 */
export function substituteTemplate(text: string, ctx: PageContext): string | null {
  let ok = true;
  const out = text.replace(PLACEHOLDER_RE, (_m, name: string) => {
    const v = name.toLowerCase() === "company" ? ctx.company : ctx.role;
    if (!v) {
      ok = false;
      return "";
    }
    return v;
  });
  return ok ? out : null;
}
