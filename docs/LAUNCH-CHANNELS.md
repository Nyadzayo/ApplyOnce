# Launch channels for ApplyOnce 0.2 (researched 2026-09-04)

Two audiences, two angles. Developers respond to the engineering story
(layout parsing, OCR in an MV3 offscreen document, the quantization
finding, evals in the repo). Job seekers respond to one promise: it never
submits for you and your data never leaves the browser. Never mix them in
one post. Never post the same text twice.

Ground rules that apply everywhere: read the sidebar/rules of every
community before posting (the 90/10 rule is the norm: nine helpful
contributions per one mention of your own thing), no upvote asks, answer
every comment within two hours on launch day, and link the store for
users but the repo for developers.

## Tier 1: do these in the first two weeks

| Channel | Angle | Post | Notes |
|---|---|---|---|
| Hacker News, Show HN | engineering story | docs: HN comment (ready) | Link the repo, not the store. Weekday 8-10am ET. |
| Product Hunt | product demo | tagline under 60 chars, 3+ screenshots or the LinkedIn video, maker comment = the "8 resumes in, 0 words out" story | Launch 12:01am PT, Tue-Thu. First 2 hours decide the day: line up 20-30 people who will try it and comment. Lead with the Undo demo (from ASO-REPORT) plus the scan import. |
| r/SideProject | maker story | "I built a job-application autofill that never submits for you; 0.2 reads scanned resumes" + what you learned | Self-promotion is the point of the sub; give feedback on other posts the same day. |
| r/chrome_extensions | extension makers | short post, screenshot 6, link to store and repo | Read the flair rules; makers posting their own extension is expected there. |
| r/opensource | open-source project | repo link, the local-first/privacy design, MIT licence, ask for contributors on resume fixtures | Promotion of your own OSS project is allowed if it is actually open source. |
| LinkedIn | story video | docs/LINKEDIN-v0.2.md (ready) | Native video upload; store link in first comment. |
| X / Bluesky / Mastodon | build in public thread | 5-tweet thread: the empty scans, the layout model, the quantization bug, the numbers, the link | Use the thumbnail as the first image. #buildinpublic on X and Bluesky; fediverse dislikes hashtags spam, use two. |
| dev.to and Hashnode | technical write-ups | three separate articles, one finding each (below) | Cross-post with canonical URL set to the site or repo. |

Three technical articles (each is a real, searchable finding):
1. "Dynamic int8 quantization silently destroyed my classifier's calibration" (25% coverage to 1%; weight-only int8 fixed it at the same size).
2. "requestAnimationFrame never fires in a Chrome offscreen document" (PDF.js render hangs; render with print intent; the detached ArrayBuffer trap).
3. "Reading scanned resumes in a browser extension with tesseract.js" (vendoring the wasm cores, the relaxed-SIMD core Chrome asks for, feeding OCR words into a layout model).

## Tier 2: job-seeker communities (value first, rules vary)

| Community | What is allowed | How to use it |
|---|---|---|
| r/jobsearchhacks (334k) | tools are discussed; check current sidebar | Best engagement Wednesday ~4pm ET. Post a genuinely useful piece (e.g. "what ATS forms actually ask: 2,078 questions analysed") and mention the tool once at the end. |
| r/GetEmployed | similar | Answer questions about Greenhouse/Lever forms; mention only when asked. |
| r/jobs, r/resumes, r/cscareerquestions | promotion generally removed | Comment-only. Help with form and resume questions; profile bio carries the link. |
| r/recruitinghell | no promotion | Do not post the tool. The "never auto-submits" stance resonates in comments when auto-apply spam comes up. |
| Job-seeker Discords (cscareers, university career servers) | ask a mod | Offer a walkthrough session rather than a link drop. |

## Tier 3: directories, lists, newsletters (one-time submissions)

- AlternativeTo: list ApplyOnce as an alternative to Simplify, Teal, LazyApply, Jobright. This is where "Simplify alternative" searches land.
- Uneed, Peerlist Launchpad, LaunchTry, Fazier, Microlaunch: free launch directories with their own daily rankings; submit the day after Product Hunt.
- Chrome extension roundups: pitch "open-source Chrome extensions" lists (itsfoss, Tooltivity, Ctrl+Shift+Copy) with the privacy angle; they update these posts.
- GitHub: add repo topics (chrome-extension, firefox-addon, job-search, resume-parser, ocr, onnxruntime-web, local-first); a good README screenshot; a "good first issue" for adding resume fixtures. Trending is a function of stars in a short window, so time the HN and PH days together.
- Newsletters that take submissions: Console.dev (developer tools, free submission, they review), TLDR (paid placements mostly; skip), FOSS Weekly (itsfoss), Chrome Unboxed and Android Police tips lines (consumer), Firefox Add-ons "Recommended" nomination once the AMO listing is live.
- Lobsters: technical article 2 or 1 as a link post (invite-only account needed; ask in the HN thread if someone can invite).
- Indie Hackers: a build log post with the numbers; the audience is founders, keep it about measurement.
- YouTube: docs/YOUTUBE.md package; add a 60-second cut of the LinkedIn video as a Short with the same thumbnail.

## Two-week calendar

- Day 1 (Tue): Show HN at 9am ET. Same morning: LinkedIn video, X thread. Reply all day.
- Day 2 (Wed): r/SideProject, r/chrome_extensions, r/opensource (three different texts). r/jobsearchhacks value post at 4pm ET.
- Day 3 (Thu): dev.to article 2 (offscreen rAF), Bluesky/Mastodon.
- Day 6 (Tue): Product Hunt at 12:01am PT with supporters lined up; Uneed, Peerlist, LaunchTry the next morning.
- Day 8: dev.to article 1 (quantization), Indie Hackers build log.
- Day 10: AlternativeTo entries, GitHub topics, roundup pitches, Console.dev submission.
- Day 12: dev.to article 3 (OCR), YouTube Short.
- Ongoing: answer every store review; comment-only presence in r/jobs, r/resumes, r/cscareerquestions.

## What to skip for now

Paid ads, influencer outreach, TikTok, cold DMs, Reddit ads, and any
"upvote exchange" group (Product Hunt and HN both detect and penalise them).
