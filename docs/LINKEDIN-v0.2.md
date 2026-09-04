# LinkedIn: ApplyOnce 0.2 release story

Video: media/out/linkedin-v0.2.mp4 (1080x1350, 45 s, no audio; captions are
burned in, so it works muted in the feed). Source: media/src/Update02.tsx.
Thumbnail: media/out/linkedin-v0.2-thumbnail.png (1080x1350). Upload it as
the custom thumbnail where the platform allows; the video's first 2.5 s
are the same title card ("8 resumes in. 0 words out."), so a platform that
ignores thumbnails still opens on it. Post the video natively (upload, not
a link) and put the text below as the post body. First line is the hook
LinkedIn shows before "see more".

## Post (story version)

Eight resumes went into our parser last week. All eight came back empty.

They were random files from a public resume dataset. Zero words each. Not because the parser was bad, but because they were pictures. Scans. Photos of resumes. A text parser can read a scanned page about as well as you can read a photo of a menu with your eyes closed.

That was the moment ApplyOnce 0.2 became a different release.

We had already rebuilt the resume parser to read layout instead of just words: bold headings, two-column sidebars, the little date cell on the right of every job. That fixed the LaTeX resumes, the Word tables, the Canva templates and the LinkedIn exports that used to lose whole sections. On 73 generated resumes across 11 layouts it now scores 1.000 precision on 1,241 fields, and it reads our own real resumes end to end.

But scans needed something else, so 0.2 now runs text recognition on your own machine. The page never leaves your computer. And because recognised text is never certain, every field from a scan is marked "check this" before you save it. Precision on scanned resumes: 0.986.

Two more things shipped with it:

Fewer wrong fills. We measured the question lexicon against 2,078 real application questions and rewrote it. Wrong fills dropped from 3.7% of traffic to 0.4%. Fields we could have filled but skipped dropped from 16% to 5%.

A small on-device model for the questions no rule can name. It only ever suggests, always in amber, never fills silently, and your questions never leave your device. When a question is genuinely yours to answer, it still says so.

Also: you can import a new resume from the Profile tab now. Your saved answers and settings stay.

Same rules as day one. It never submits for you. You review, you press submit. Your data lives in your browser and nowhere else.

ApplyOnce 0.2 is on the Chrome Web Store and Firefox Add-ons. Free and open source. If a resume does not parse right, send it my way and it becomes a test case.

#jobsearch #careers #chromeextension #opensource #buildinpublic

## Post (short version, for a repost or comment)

Most resume parsers read the words. ApplyOnce 0.2 reads the layout, and now reads scans and photos too, on your device, with every uncertain field marked "check this". Wrong autofills down from 3.7% to 0.4% on 2,078 real questions. It still never submits for you. Free, open source, on Chrome and Firefox.

## Video description / alt text

A 45-second animation: a title card reading "8 resumes in. 0 words out.", a question ("Your resume has a text layer. Or does it?"), eight resume icons that each show "0 words", chips naming resume layouts, a document diagram whose headings, columns and date cell light up while a scan line passes, three measured results, a form field filled in amber with a "check this" tag, and the ApplyOnce mark with "You review. You submit. Data stays local."

## Posting notes

- Upload the MP4 natively; LinkedIn ranks native video above links.
- Add the store link in the first comment, not the post body:
  "Chrome Web Store: https://chromewebstore.google.com/detail/applyonce-job-application/anmljacnioamdkdcohmhbghlbcffbiaf
  Source and Firefox build: https://github.com/Nyadzayo/ApplyOnce"
- The numbers are from evals in the repo (evals/), so they are reproducible if anyone asks.
