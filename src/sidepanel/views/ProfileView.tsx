import { useState } from "react";
import type { VaultHook } from "../App";
import { ExplicitSettingsForm, ProfileForm } from "./ProfileForm";
import { deleteAnswer, deleteDocument, saveDocument } from "@storage/vault";
import { saveAnswer } from "@storage/answers";

// Vault view: profile editor, documents, saved answers, explicit settings.

export function ProfileView({ vault }: { vault: VaultHook }) {
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState(vault.profile);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");

  if (!draft || !vault.profile) return null;

  return (
    <div>
      <h1>Your profile</h1>
      <p className="hint">Stored only on this device.</p>

      <h2>Documents</h2>
      {vault.documents.map((d) => (
        <div className="card" key={d.id}>
          <div className="q">📎 {d.fileName}</div>
          <div className="meta">
            {d.role} · {(d.size / 1024).toFixed(0)} KB
          </div>
          <button
            className="danger"
            onClick={() => void deleteDocument(d.id).then(vault.refresh)}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="btn-row">
        <UploadButton label="Upload resume" role="resume" onDone={vault.refresh} />
        <UploadButton label="Upload cover letter" role="coverLetter" onDone={vault.refresh} />
      </div>

      <ProfileForm
        profile={draft}
        onChange={(p) => {
          setDraft(p);
          setDirty(true);
        }}
      />

      <h2>Explicit answers (work auth, EEO, salary)</h2>
      <ExplicitSettingsForm
        profile={draft}
        onChange={(p) => {
          setDraft(p);
          setDirty(true);
        }}
      />

      <div className="btn-row">
        <button
          className="primary"
          disabled={!dirty}
          onClick={() =>
            void vault.persistProfile(draft).then(() => setDirty(false))
          }
        >
          {dirty ? "Save profile" : "Saved"}
        </button>
      </div>

      <h2>Saved answers ({vault.answers.length})</h2>
      <p className="hint">
        Answers you've saved from past applications. Reused when the same (or a
        very similar) question appears.
      </p>
      {vault.answers.map((a) => (
        <div className="card" key={a.id}>
          <div className="q">{a.questionText}</div>
          <div className="meta">
            used {a.timesUsed}× {a.aliasKeys.length > 0 && `· ${a.aliasKeys.length} variant(s)`}
          </div>
          <div>{a.answer}</div>
          <button
            className="danger"
            onClick={() => void deleteAnswer(a.id).then(vault.refresh)}
          >
            Delete
          </button>
        </div>
      ))}
      <div className="card">
        <div className="q">Add an answer</div>
        <div className="field-row">
          <label>Question (as it appears on forms)</label>
          <input type="text" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Your answer</label>
          <textarea value={newA} onChange={(e) => setNewA(e.target.value)} />
        </div>
        <button
          className="secondary"
          disabled={!newQ || !newA}
          onClick={() =>
            void saveAnswer(newQ, newA).then(() => {
              setNewQ("");
              setNewA("");
              return vault.refresh();
            })
          }
        >
          Save answer
        </button>
      </div>
    </div>
  );
}

function UploadButton({
  label,
  role,
  onDone,
}: {
  label: string;
  role: "resume" | "coverLetter";
  onDone: () => Promise<void>;
}) {
  return (
    <label className="file-btn">
      {label}
      <input
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        style={{ display: "none" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          await saveDocument(role, f.name, f.type, await f.arrayBuffer());
          await onDone();
        }}
      />
    </label>
  );
}
