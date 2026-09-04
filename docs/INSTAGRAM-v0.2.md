# Instagram Reel: ApplyOnce 0.2 (prompt script)

Format: 9:16, 1080x1920, 30 fps, 38-42 s, voiceover + burned-in captions
(most Reels play muted at first). Hook must land inside 2 seconds. One idea
per shot, big text, no UI screenshots smaller than half the frame.

Voice: one person, calm, slightly amused, first person plural. No hype words.
Music: low, steady, no drop. Captions: 2-6 words per line, bottom third,
white on a dark pill.

Cover (choose frame at 0:01): "8 resumes in. 0 words out."

## Shot list

| # | Time | Visual (what is on screen) | On-screen text | Voiceover |
|---|------|----------------------------|----------------|-----------|
| 1 | 0:00-0:02 | Phone-shot close-up of a printed resume being photographed. Snap flash. Freeze. | 8 resumes in. 0 words out. | "We fed our resume parser eight random resumes." |
| 2 | 0:02-0:05 | Terminal-style black card. Eight file names appear one by one, each followed by "0 words" in red. | 0 words. 0 words. 0 words. | "All eight came back empty." |
| 3 | 0:05-0:09 | Cut to the actual resume on paper, then a photo of it on a phone. Zoom into the pixels. | They were pictures. | "They weren't broken. They were pictures. Scans. Photos. A text parser reading a photo is you reading a menu with your eyes closed." |
| 4 | 0:09-0:13 | Fast montage, 0.6 s each: a LaTeX resume, a Word resume with tables, a Canva two-column resume, a LinkedIn PDF export, a phone photo. | LaTeX. Word. Canva. LinkedIn. A photo. | "Nobody uploads a clean PDF." |
| 5 | 0:13-0:18 | Screen recording: a resume opens in ApplyOnce and its structure lights up in blue: bold headings, the two columns, the little date cells on the right. | 0.2 reads the layout. | "So ApplyOnce 0.2 reads the layout, not just the words. Headings, columns, date cells." |
| 6 | 0:18-0:23 | Screen recording: a scanned resume is dropped in, a scan line sweeps down, the review screen fills up with fields tagged "check this" in amber. | Scans read on your device. Nothing uploaded. | "Scans and photos get read on your own device. Nothing is uploaded. And every field from a scan says 'check this', because recognised text is never certain." |
| 7 | 0:23-0:28 | Three big numbers stacked, counting up one after another. | 1.000 precision, 1,241 fields / 0.986 on scans / wrong fills 3.7% to 0.4% | "We measure it. Perfect precision on seventy-three generated resumes. Near perfect on scans. Wrong autofills down from almost four percent to under half a percent." |
| 8 | 0:28-0:33 | Screen recording: a job application form. An odd question, "Which country do you call home?", fills in amber with a "check this" tag. | New question? It suggests. Amber. Never silent. | "When a question is new, a small model on your computer suggests an answer. In amber. It never fills anything silently." |
| 9 | 0:33-0:36 | Screen recording: Profile tab, "Import a new resume" button, new file drops in, fields update. | New resume? One click. | "Got a newer resume? Import it. Your answers stay." |
| 10 | 0:36-0:40 | ApplyOnce mark on the light background. Three lines appear. | You review. You submit. Data stays local. | "Same rules as day one. It never submits for you. Your data stays in your browser. ApplyOnce 0.2, free on Chrome and Firefox." |

## Generation prompts (for AI video or b-roll tools, one per shot)

1. "Close-up, shallow depth of field: a hand holds a phone above a printed resume on a wooden desk, taking a photo. Warm daylight. Freeze on the shutter flash. Vertical 9:16."
2. "Minimal dark terminal screen, monospace text, eight filenames appearing line by line, each followed by the words '0 words' in red. Vertical 9:16, no camera movement."
3. "Slow push-in on a smartphone screen showing a photographed resume, until individual pixels and JPEG blocks are visible. Vertical 9:16."
4. "Rapid cuts, 0.6 seconds each, of five different resume designs on a laptop screen: an academic LaTeX resume, a Word resume built from tables, a colourful two-column Canva resume, a LinkedIn PDF export, a phone photo of a printed resume. Vertical 9:16."
5. Screen recording, not generated: open a text-layer resume in ApplyOnce; overlay blue highlights on headings, columns and date cells in edit (After Effects or CapCut keyframes).
6. Screen recording, not generated: drop `fixtures/cv/scan/ats-plain--priya.png` into the extension; capture the review screen with the OCR warning and the "check this" tags.
7. "Three stacked white cards on a pale blue gradient, each with a large blue number counting up and a one-line grey label. Vertical 9:16, clean motion graphics."
8. Screen recording, not generated: a Greenhouse-style form; the country question fills in amber with the "check this" tag (Fill tab on a fixture page).
9. Screen recording, not generated: Profile tab, "Import a new resume", drop a file, watch the work history update.
10. "The ApplyOnce logo (blue rounded square with a white check) on a pale blue radial gradient, three short lines of dark text fading in one after another. Vertical 9:16."

## Caption

Eight random resumes went into our parser. All eight came back with zero words. They were scans. That one afternoon reshaped ApplyOnce 0.2: it now reads the layout of a resume, reads scans and photos on your own device, marks anything uncertain with "check this", and suggests answers to new questions without ever filling silently. It still never submits for you. Free on Chrome and Firefox, link in bio.

#jobsearch #resume #careertips #jobhunt #chromeextension #opensource #buildinpublic #productivity

## Link in bio

https://chromewebstore.google.com/detail/applyonce-job-application/anmljacnioamdkdcohmhbghlbcffbiaf

## Notes

- Shots 5, 6, 8, 9 are real screen recordings; record the side panel at 2x scale and crop to 9:16 in edit. The scan fixture and a fixture form page are in the repo, so no personal data appears.
- If you would rather render the whole Reel, the LinkedIn composition (media/src/Update02.tsx) can be re-laid out at 1080x1920 with the same scenes; say so and it gets a 9:16 variant.
