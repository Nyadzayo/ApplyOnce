import type { CandidateProfile, EducationEntry, WorkEntry } from "@shared/types";

// Shared click-to-edit profile form used by onboarding review and the vault.

export function ProfileForm({
  profile,
  onChange,
}: {
  profile: CandidateProfile;
  onChange: (p: CandidateProfile) => void;
}) {
  const set = (fn: (p: CandidateProfile) => void) => {
    const copy = structuredClone(profile);
    fn(copy);
    onChange(copy);
  };

  return (
    <div>
      <h2>Basics</h2>
      <div className="split">
        <Text label="First name" value={profile.basics.firstName} onChange={(v) => set((p) => { p.basics.firstName = v; })} />
        <Text label="Last name" value={profile.basics.lastName} onChange={(v) => set((p) => { p.basics.lastName = v; })} />
      </div>
      <Text label="Email" value={profile.basics.email} onChange={(v) => set((p) => { p.basics.email = v; })} />
      <Text label="Phone" value={profile.basics.phone} onChange={(v) => set((p) => { p.basics.phone = v; })} />
      <Text label="Pronouns (optional)" value={profile.basics.pronouns} onChange={(v) => set((p) => { p.basics.pronouns = v; })} />

      <h2>Location</h2>
      <Text label="Street address (optional)" value={profile.location.street} onChange={(v) => set((p) => { p.location.street = v; })} />
      <div className="split">
        <Text label="City" value={profile.location.city} onChange={(v) => set((p) => { p.location.city = v; })} />
        <Text label="State/Region" value={profile.location.region} onChange={(v) => set((p) => { p.location.region = v; })} />
      </div>
      <div className="split">
        <Text label="Country" value={profile.location.country} onChange={(v) => set((p) => { p.location.country = v; })} />
        <Text label="Postal code" value={profile.location.postalCode} onChange={(v) => set((p) => { p.location.postalCode = v; })} />
      </div>

      <h2>Links</h2>
      <Text label="LinkedIn" value={profile.links.linkedin} onChange={(v) => set((p) => { p.links.linkedin = v; })} />
      <Text label="GitHub" value={profile.links.github} onChange={(v) => set((p) => { p.links.github = v; })} />
      <Text label="Portfolio" value={profile.links.portfolio} onChange={(v) => set((p) => { p.links.portfolio = v; })} />
      <Text label="Website" value={profile.links.website} onChange={(v) => set((p) => { p.links.website = v; })} />

      <h2>Work experience <span className="hint">(most recent first)</span></h2>
      {profile.work.map((w, i) => (
        <WorkCard
          key={i}
          entry={w}
          onChange={(e) => set((p) => { p.work[i] = e; })}
          onRemove={() => set((p) => { p.work.splice(i, 1); })}
        />
      ))}
      <button
        className="secondary"
        onClick={() => set((p) => { p.work.push({ company: "", title: "", start: "", end: "", current: false, location: "", description: "" }); })}
      >
        + Add role
      </button>

      <h2>Education</h2>
      {profile.education.map((e, i) => (
        <EduCard
          key={i}
          entry={e}
          onChange={(x) => set((p) => { p.education[i] = x; })}
          onRemove={() => set((p) => { p.education.splice(i, 1); })}
        />
      ))}
      <button
        className="secondary"
        onClick={() => set((p) => { p.education.push({ school: "", degree: "", field: "", start: "", end: "", gpa: "" }); })}
      >
        + Add education
      </button>

      <h2>Skills</h2>
      <div className="field-row">
        <label>Comma-separated</label>
        <textarea
          value={profile.skills.join(", ")}
          onChange={(e) =>
            set((p) => {
              p.skills = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            })
          }
        />
      </div>
    </div>
  );
}

export function ExplicitSettingsForm({
  profile,
  onChange,
}: {
  profile: CandidateProfile;
  onChange: (p: CandidateProfile) => void;
}) {
  const set = (key: keyof CandidateProfile["explicit"], v: string) => {
    const copy = structuredClone(profile);
    copy.explicit[key] = v === "" ? null : v;
    onChange(copy);
  };
  const ex = profile.explicit;

  return (
    <div>
      <p className="hint">
        These answers are only ever filled from what you choose here — never
        guessed. Leave anything blank to always answer it yourself.
      </p>
      <Choice label="Legally authorized to work (in your target country)?" value={ex.workAuth} options={["Yes", "No"]} onChange={(v) => set("workAuth", v)} />
      <Choice label="Will you require visa sponsorship?" value={ex.requiresSponsorship} options={["Yes", "No"]} onChange={(v) => set("requiresSponsorship", v)} />
      <FreeText label="Salary expectation (exact text to fill)" value={ex.salary} onChange={(v) => set("salary", v)} />
      <div className="split">
        <FreeText label="Salary range: minimum" value={ex.salaryMin} onChange={(v) => set("salaryMin", v)} />
        <FreeText label="Salary range: maximum" value={ex.salaryMax} onChange={(v) => set("salaryMax", v)} />
      </div>
      <FreeText label="Earliest start date (YYYY-MM-DD)" value={ex.startDate} onChange={(v) => set("startDate", v)} />
      <Choice label="Open to relocation?" value={ex.relocation} options={["Yes", "No"]} onChange={(v) => set("relocation", v)} />
      <Choice label="Remote preference" value={ex.remote} options={["Remote", "Hybrid", "Onsite"]} onChange={(v) => set("remote", v)} />
      <FreeText label="Notice period" value={ex.noticePeriod} onChange={(v) => set("noticePeriod", v)} />

      <h2>EEO self-identification <span className="hint">(all optional)</span></h2>
      <Choice label="Gender" value={ex.gender} options={["Male", "Female", "Non-binary", "Prefer not to say"]} onChange={(v) => set("gender", v)} />
      <Choice label="Hispanic or Latino?" value={ex.hispanic} options={["Yes", "No", "Prefer not to say"]} onChange={(v) => set("hispanic", v)} />
      <FreeText label="Race/ethnicity (exact option text you want picked)" value={ex.race} onChange={(v) => set("race", v)} />
      <Choice label="Veteran status" value={ex.veteran} options={["I am not a protected veteran", "I identify as one or more of the classifications of a protected veteran", "Prefer not to say"]} onChange={(v) => set("veteran", v)} />
      <Choice label="Disability status" value={ex.disability} options={["No, I do not have a disability", "Yes, I have a disability", "Prefer not to say"]} onChange={(v) => set("disability", v)} />
    </div>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FreeText({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="(not set, always ask me)" />
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">(not set, always ask me)</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function WorkCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: WorkEntry;
  onChange: (e: WorkEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="card">
      <div className="split">
        <Text label="Title" value={entry.title} onChange={(v) => onChange({ ...entry, title: v })} />
        <Text label="Company" value={entry.company} onChange={(v) => onChange({ ...entry, company: v })} />
      </div>
      <div className="split">
        <Text label="Start (YYYY-MM)" value={entry.start} onChange={(v) => onChange({ ...entry, start: v })} />
        <Text label="End (YYYY-MM)" value={entry.end} onChange={(v) => onChange({ ...entry, end: v, current: v === "" ? entry.current : false })} />
      </div>
      <div className="checkline">
        <input
          type="checkbox"
          id={`cur-${entry.company}-${entry.start}`}
          checked={entry.current}
          onChange={(e) => onChange({ ...entry, current: e.target.checked, end: e.target.checked ? "" : entry.end })}
        />
        <label htmlFor={`cur-${entry.company}-${entry.start}`}>I currently work here</label>
      </div>
      <div className="field-row">
        <label>Description</label>
        <textarea value={entry.description} onChange={(e) => onChange({ ...entry, description: e.target.value })} />
      </div>
      <button className="danger" onClick={onRemove}>Remove</button>
    </div>
  );
}

function EduCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: EducationEntry;
  onChange: (e: EducationEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="card">
      <Text label="School" value={entry.school} onChange={(v) => onChange({ ...entry, school: v })} />
      <div className="split">
        <Text label="Degree" value={entry.degree} onChange={(v) => onChange({ ...entry, degree: v })} />
        <Text label="Field of study" value={entry.field} onChange={(v) => onChange({ ...entry, field: v })} />
      </div>
      <div className="split">
        <Text label="End year (YYYY-MM)" value={entry.end} onChange={(v) => onChange({ ...entry, end: v })} />
        <Text label="GPA" value={entry.gpa} onChange={(v) => onChange({ ...entry, gpa: v })} />
      </div>
      <button className="danger" onClick={onRemove}>Remove</button>
    </div>
  );
}
