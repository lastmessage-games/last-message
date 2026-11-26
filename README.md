# «آخر رسالة» — The Last Message (iOS shell build)

Modern-era iPhone investigation game. Phone shell adapted from the
Mindenry iosSimulator base (copied with `cp`, **`.git` excluded** — no git
commands were run on the base). Story is fully decoupled: it lives in
`story/story.json` and is loaded at runtime. Editing the story needs no rebuild.

## Run it

`file://` fetch is blocked by browsers, so serve it locally:

```bash
cd ios-fork
python3 -m http.server 8000
# open http://localhost:8000/
```

No build step, no network needed: the game makes **zero external requests**
(verified by grep — the only `fetch()` is `./story/story.json`; fake site
URLs in the story are display text only and are never fetched).

## How to play (game day: Saturday 28 Nov 2026)

- التليفون مقفول برمز — والرمز نفسه موجود جوه اللعبة: دور على تلميحاته
  في الصور والمحادثات. لو كتبت رمز غلط، طارق بيفكّر بصوت عالي وبيدّيك
  تلميح، وفي زرار تلميح بيقولك فين تدوّر.
- Explore Messages, Photos, Mail, Notes, Safari, Files, Voice Memos.
  Pin evidence with **📌 ثبّت الدليل** wherever it appears (photos, mails,
  notes, files, audios, chats, Safari pages).
- **Case File** (home-screen icon, or the gold bar on the home screen) shows
  the chapter goal, the 8-item evidence pack progress, and the deductions.
- Chapters gate on play (placement-map): Ch1→Ch2 needs unlock + 1 chat read +
  1 photo opened; Ch2→Ch3 needs D1; Ch3→Ch4 needs T1 + pack ≥ 6/8.
- D1 (pick), T1 (order the 6 Thursday events), D2 (finale: pick one action).
  There are 3 endings — which one you reach depends on your D2 choice and
  on how complete your evidence pack is.
- Scripted events E1–E8 fire once, 5–12s after their trigger
  (unlock, opening a chat/photo/audio, completing D1, pack completion,
  chapter 4 start). Nothing is timed by the wall clock.
- Save: `the-last-message-save-v1` in localStorage (auto-save; an older
  `last-message-save-v1` save is migrated on load).

## النشر على Cloudflare (مجاناً)

اللعبة ملفات ثابتة بس (HTML/CSS/JS + ملف `story.json`)، فبتتنشر على
Cloudflare Pages من غير سيرفر ومن غير أي تكلفة:

1. اعمل حساب مجاني على Cloudflare (من الموقع الرسمي، بالإيميل).
2. من لوحة التحكم ادخل على **Workers & Pages**، وبعدين دوس **Create**.
3. اختار تبويب **Pages**، وبعدين **Upload assets** (رفع ملفات مباشرة،
   من غير Git).
4. اسحب مجلد اللعبة بعد فك الضغط — لازم يكون ملف `index.html` في جذر
   المجلد نفسه (مش جوه مجلد فرعي).
5. دوس **Deploy**، وهيطلعلك لينك شكله `https://<اسم المشروع>.pages.dev`
   — ده لينك اللعبة، ابعته لأي حد يلعب من المتصفح على طول، من غير تحميل.
6. عشان تحدّث اللعبة بعد أي تعديل: ادخل على المشروع من لوحة التحكم
   ودوس **Create new deployment** وارفع المجلد الجديد بنفس الطريقة.

## رفع اللعبة على GitHub

المستودع (repo) على GitHub هو **مصدر الحقيقة للقصة والكود** — أي تعديل
بيتعمل هنا الأول، وبعدين بيتنشر منه على Cloudflare:

1. ادخل على [github.com/ahmed9120](https://github.com/ahmed9120) ودوس
   **New repository**، وسمّيه مثلاً `the-last-message`، وخليه Public.
2. من التيرمينال، جوه مجلد اللعبة (`ios-fork`):

```bash
git init
git add .
git commit -m "آخر رسالة — لعبة تحقيق على آيفون"
git branch -M main
git remote add origin https://github.com/ahmed9120/the-last-message.git
git push -u origin main
```

3. بعد كده أي تعديل جديد: `git add .` ثم `git commit -m "وصف التعديل"`
   ثم `git push` — وبعدها ارفع نسخة جديدة على Cloudflare بنفس خطوات
   النشر اللي فوق (Create new deployment).

## تعديل القصة (story.json) — من غير أي إعادة بناء

القصة كلها في ملف واحد: `story/story.json`. عدّل فيه بأي محرر نصوص
عادي، واحفظ، وبعدين انسخ المجلد من جديد (أو ارفع نسخة جديدة على
Cloudflare). مفيش أي خطوة بناء أو تجميع — اللعبة بتقرأ الملف وهي شغالة.

- **إضافة رسالة في محادثة:** افتح قسم `chats`، ولاقِ المحادثة بالـ `id`
  بتاعها (مثلاً `chat_mostafa`)، وضيف عنصر في مصفوفة `messages`:

```json
{ "from": "mostafa", "text": "سلمى، كلميني ضروري.", "time": "10:30", "date": "2026-11-27" }
```

  `from` لازم يكون `id` شخصية موجودة في `characters` (أو `"me"`).

- **تغيير كابشن صورة:** افتح قسم `photos`، ولاقِ الصورة بالـ `id`
  (مثلاً `photo_cat`)، وغيّر قيمة `caption`:

```json
"caption": "القطة اللي تحت العمارة 😺"
```

- **إضافة دليل في حزمة الأدلة:** افتح قسم `clues`، وضيف عنصر جديد.
  `pack: true` معناه إن الدليل ده من الـ 8 بتوع الحزمة، و`sources`
  هي الحاجات اللي الدليل مربوط بيها (محادثة أو صورة أو ملف...):

```json
{ "id": "clue_new", "title": "عنوان الدليل", "sources": ["photo_pharmacy_stock"], "pack": true, "chapter": 2 }
```

  خد بالك: عدد الحزمة الكلي بيتحدد من عدد العناصر اللي `pack: true`
  — لو زوّدت واحد هتبقى الحزمة 9 مش 8، والنهاية الكاملة هتتغير معاها.

- **تغيير نص إيميل:** افتح قسم `mails`، ولاقِ الإيميل بالـ `id`
  (مثلاً `mail_inspectorate`)، وغيّر قيمة `body` — و`\n` معناها
  سطر جديد:

```json
"body": "عزيزتي المواطنة،\n\nشكراً لتواصلك مع هيئة الدواء المصرية."
```

## Architecture

- `index.html` — phone frame (Dynamic Island, home indicator, Control
  Center, status bar, lock screen) + parent overlays (passcode, guidance
  bar, notification banner, case file, deductions, endings).
- `simulator.js` — shell behaviour (lock/home/apps), stripped of all
  weather fetching and geolocation. Unlock now goes through the passcode.
- `game.js` — the engine. Fetches `story.json` once, holds it as the single
  source of truth, runs chapters/gates, the events engine, deductions,
  the ending resolver, and the save. Iframes receive a **sanitized** copy
  (no `truth`, no `lock`, no events/deductions/endings, characters reduced
  to id/name/age/avatar/color) — director-only data is never rendered and
  never sent to an iframe.
- `apps/app-common.js` / `apps/app-common.css` — postMessage bridge every
  story app uses: parent loads once, iframes post `{type:"ready"}` and
  render from the story they are sent; user actions come back as events.
- `apps/messages.html`, `photos.html`, `mail.html`, `notes.html`,
  `safari.html`, `files.html`, `music.html` (Voice Memos),
  `weather.html` — story renderers, all driven by `story.json`.
- `apps/calculator.html`, `clock.html`, `camera.html`, `settings.html`,
  `maps.html`, `health.html`, `wallet.html`, `appstore.html`,
  `phone.html` — utilities / plausible filler (no story role, never empty
  broken screens). All Google Fonts links and weather API calls removed;
  system font stack everywhere.
- `story/story.json` + `story/assets/` — the real story (byte-identical to
  `~/workspace/phone-investigation/the-last-message/story.json`).

## Real-story schema notes (handled, not assumed)

- Chapter ids are strings (`ch1`…) with numeric `n`; deduction `chapter`
  is a number; deduction `options`/`correct` are **strings** (normalized
  to indices in `game.js`).
- Clue `sources` are **strings** (content ids).
- Characters: `avatar` is a filename in `story/assets/photos/` or `null`
  (Rana, Ziad → initials fallback). Hani's avatar **is** `hani_office.jpg`;
  `profile_hani.jpg` does not exist and is never referenced.
- Photos: 16 of 18 files exist. The 2 `optional:true` entries
  (`profile_hani.jpg`, `profile_ziad.jpg`) are hidden entirely by the
  Photos renderer (and any image that fails to load removes its own tile).
- E7's trigger is pseudo-ref `clue_pack` / type `pack_complete`: it fires
  when the 8-item pack completes.
- `meta` has **no weather**: the lock-screen weather widget is hidden and
  the Weather app shows an honest no-data state.
- Safari: no bookmarks; sites are discovered via links (site URL *or* site
  name mentioned in a chat/mail) or via the in-world search engine
  (`site_search`), which only searches the story's own results pages.
- No reply choices exist in this story: chats are read-only (the UI says so).

## Verification (2026-11-26, this VM — no live browser available)

- `node --check`: `game.js`, `simulator.js`, `apps/app-common.js`, and every
  inline `<script>` in the apps — all OK.
- Grep audits: 0 external URLs, 0 `fetch`/`XMLHttpRequest` besides the
  single `story.json` fetch, 0 Google Fonts / Open-Meteo / geolocation
  references (one comment mentions them), 0 fate-declaring words in code,
  ending text only in `story.json`, no Franco-Arabic tokens in the story.
- Engine traces (`/tmp/engine-trace.js`, Node harness with stubbed DOM):
  **50/50 passed** — save-key migration, lock date format, sanitization,
  wrong/correct passcode, E1 on unlock, Ch1 gate (chat+photo → Ch2),
  D1/T1 correct-index normalization, pack 8/8 → E7, D1 → Ch3, T1+pack → Ch4
  + E8, endings A/B/C resolver, finale + retry-from-Ch4 preserving progress,
  events fire once. (One real bug found and fixed by the traces: the ending
  resolver used the live pinned pack instead of the pack submitted with the
  finale, so B was unreachable while the save was full.)
- HTTP serve check (`python3 -m http.server`): `index.html`, `game.js`,
  `game.css`, `simulator.*`, `story.json`, all 17 app pages → 200; all 16
  photos + 3 audios + all character avatars → 200 (25/25); the 2 missing
  optional photos → 404 as expected. No servers left running.
- **Fix pass 2026-11-26 (this VM):** `node --check` on `game.js`,
  `simulator.js`, `apps/app-common.js` and the inline scripts of the touched
  app pages — all OK; HTTP serve re-check: `index.html`, `story.json`,
  `apps/messages.html`, `apps/photos.html`, `apps/mail.html` → 200, no server
  left running. Mail organisation senders now render Arabic display names
  (from the story's own wording); photo attachments in Messages deep-link to
  the exact photo in Photos (verified by code trace only — no live browser on
  this VM); the inspectorate mail now links to its site.
- **Not verified here:** actual tap/click playthrough in a real browser
  (no live browser on this VM) — needs a human or browser-agent pass:
  unlock → browse apps → pin 8 → D1 → T1 → D2 → each ending, on a real phone.

## Known limits / open items

- Lock-hint sources (`story.lock.hintSources`) are English strings inside the
  Arabic UI. Left as-is on purpose: the Arabic wording would be new story
  text, and it belongs in `story.json` (director's call), not hard-coded in
  `game.js`.
- The coordinator handles final ZIP packaging after independent verification.

## ⚠️ للمخرج فقط — تحذير: اللي جاي فيه حل اللغز — متقراهوش لو هتلعب

رمز القفل وشروط النهايات **مش** في الملف ده — هتلاقيهم في
[`README-DIRECTOR.md`](README-DIRECTOR.md). متبعتش الملف ده لحد هيلعب.
