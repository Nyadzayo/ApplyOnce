import { Job } from "@shared/types";

// Job persistence (PLAN.md Phase 1): the SW owns zero long-lived state.
// Every job lives in chrome.storage.session; any component resumes by id.

const KEY = (id: string) => `job.${id}`;

export async function createJob(kind: Job["kind"], tabId?: number): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    kind,
    state: "pending",
    createdAt: Date.now(),
    tabId,
  };
  await chrome.storage.session.set({ [KEY(job.id)]: job });
  return job;
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<Job, "state" | "error">>,
): Promise<Job | null> {
  const got = await chrome.storage.session.get(KEY(id));
  const parsed = Job.safeParse(got?.[KEY(id)]);
  if (!parsed.success) return null;
  const next = { ...parsed.data, ...patch };
  await chrome.storage.session.set({ [KEY(id)]: next });
  return next;
}

export async function getJob(id: string): Promise<Job | null> {
  const got = await chrome.storage.session.get(KEY(id));
  const parsed = Job.safeParse(got?.[KEY(id)]);
  return parsed.success ? parsed.data : null;
}
