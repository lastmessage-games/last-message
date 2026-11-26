/* ============================================================================
   «آخر رسالة» — The Last Message — parent engine (game.js).
   Single source of truth: ./story/story.json (schema phone-investigation-story/1),
   fetched ONCE at boot. No story text is hard-coded here except neutral
   chrome strings. No external URLs, no fetches other than story.json.
   Save key: story.meta.saveKey ("the-last-message-save-v1"); an older
   "last-message-save-v1" save is migrated on load.

   REAL-SCHEMA NOTES (vs the earlier sample):
   - chapters: id is a STRING ("ch1") + numeric n. save.chapter stores the id.
   - deductions: options/correct are STRINGS (correct = array of option
     strings). pick = choose exactly the correct set; order = tap in order.
   - D2 finale: options are 4 ACTION strings (no culprit field). Resolver:
     A = correct D2 choice + full 8-item pack; B = correct choice + pack
     incomplete; C = wrong D2 choice. Endings' `condition` is a display
     string, NOT a resolver input.
   - clues: sources are STRINGS (content ids), not {kind,id} objects.
   - events: story trigger types are unlock / open_chat / open_photo /
     open_audio / complete_deduction / pack_complete / chapter_start.
     Iframe reports (chat_opened, photo_opened, ...) are translated via
     TRIGGER_MAP below. E7 (pack_complete, ref clue_pack) fires when the
     8-item evidence pack completes.
   - chapters gates (placement-map.md): ch1->ch2 = unlocked + 1 chat read
     + 1 photo opened; ch2->ch3 = D1 done; ch3->ch4 = T1 done + pack >= 6/8.
   - characters: avatar is a FILENAME in story/assets/photos/ or null
     (Rana, Ziad -> initials fallback). Hani's avatar IS hani_office.jpg.
   - photos: 2 entries are optional:true and their files are ABSENT
     (profile_hani.jpg, profile_ziad.jpg) — the Photos renderer hides
     them entirely; nothing gates on them.
   - story.meta has NO weather: lock weather widget is hidden, Weather app
     shows a no-data state. Game date comes from meta.gameDate/gameWeekday.
   - DIRECTOR-ONLY DATA: story.truth (and lock.derivation, character
     role/description/secrets) is NEVER sent to iframes and NEVER rendered.
     sendStory() ships a sanitized copy (see sanitizeStory).
   Protocol with app iframes (postMessage, same origin):
     iframe -> parent: {type:'ready',app} | {type:'event',event:{type,ref}}
                         {type:'pin',clueId} | {type:'reply',chatId,choiceId}
                         {type:'openApp',app,opts?} | {type:'openSite',siteId,path}
                       (opts e.g. {photo:'photo_wedding_dress'} deep-links Photos.)
     parent -> iframe: {type:'story',story,save} (SANITIZED story)
                       {type:'update',save,chatId?,siteId?,path?}
   ============================================================================ */
(function () {
  'use strict';
  var DEFAULT_SAVE_KEY = 'last-message-save-v1';
  var SAVE_KEY = DEFAULT_SAVE_KEY;
  var story = null;
  var save = null;
  var iframeWin = {};   // appId -> contentWindow
  var storyReady = false;
  var pendingReady = [];

  /* Story trigger type per iframe-reported event type. Null = tracked only. */
  var TRIGGER_MAP = {
    chat_opened: 'open_chat',
    photo_opened: 'open_photo',
    audio_played: 'open_audio',
    deduction_completed: 'complete_deduction',
    chapter_started: 'chapter_start'
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function chapterN(id) { var m = { ch1: 1, ch2: 2, ch3: 3, ch4: 4 }; return m[id] || 1; }
  function chapterId(n) { return 'ch' + n; }

  /* ---------------- save ---------------- */
  function defaultSave() {
    return {
      chapter: 'ch1', unlocked: false, readChats: [], openedPhotos: [],
      fired: [], pinned: [], deductions: {}, endingsSeen: [],
      replyChoices: {}, injected: {}, revealed: [], visitedSites: [],
      finale: null, startedAt: new Date().toISOString()
    };
  }
  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) { var s = JSON.parse(raw); if (s && typeof s.chapter === 'string') return s; }
    } catch (e) { /* corrupted save -> fresh */ }
    return defaultSave();
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    save = loadSave();
    fetch('./story/story.json')
      .then(function (r) {
        if (!r.ok) throw new Error('story.json HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        story = j;
        storyReady = true;
        // Migrate save key if the story declares its own.
        var want = story.meta && story.meta.saveKey;
        if (want && want !== SAVE_KEY) {
          try {
            var existing = localStorage.getItem(want);
            if (existing) { var s2 = JSON.parse(existing); if (s2 && typeof s2.chapter === 'string') save = s2; }
          } catch (e) { /* keep current save */ }
          SAVE_KEY = want;
          persist();
        }
        applyStoryToShell();
        renderGuidance();
        pendingReady.forEach(function (app) { sendStory(app); });
        pendingReady = [];
      })
      .catch(function (err) {
        var el = $('lock-hint');
        if (el) el.textContent = 'تعذّر تحميل القصة (story.json). شغّل اللعبة من سيرفر محلي: python3 -m http.server';
        console.error('story load failed:', err);
      });
    window.addEventListener('message', onIframeMessage);
  }

  function applyStoryToShell() {
    var meta = story.meta || {};
    // Lock date from meta.gameDate ("2026-11-28") + meta.gameWeekday.
    if (meta.gameDate) {
      var parts = String(meta.gameDate).split('-');
      var months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      var label = (meta.gameWeekday || '') + ', ' +
        months[(+parts[1] || 1) - 1] + ' ' + (+parts[2] || '') + ', ' + parts[0];
      var d = $('lock-date');
      if (d) d.textContent = label;
    }
    // No weather in the real story: hide the lock widget, dash the icon temp.
    var w = meta.weather;
    var widget = document.querySelector('.widget-temp');
    if (w) {
      if (widget) widget.textContent = w.temp + '°';
      var loc = document.querySelector('.widget-location');
      if (loc) loc.textContent = w.city || 'Cairo';
      var td = document.querySelector('.temp-display');
      if (td) td.textContent = w.temp + '°';
    } else {
      var ww = $('lock-weather-widget');
      if (ww) ww.style.display = 'none';
      var td2 = document.querySelector('.temp-display');
      if (td2) td2.textContent = '—';
    }
    document.title = meta.titleAr || 'آخر رسالة';
  }

  /* Strip everything director-only / unneeded before sending to iframes. */
  function sanitizeStory(s) {
    var c = JSON.parse(JSON.stringify(s));
    delete c.truth;
    delete c.events;
    delete c.deductions;
    delete c.endings;
    delete c.lock;
    if (c.meta) {
      c.meta = {
        title: c.meta.title, titleAr: c.meta.titleAr, player: c.meta.player,
        gameDate: c.meta.gameDate, gameWeekday: c.meta.gameWeekday,
        era: c.meta.era, fictionalNotice: c.meta.fictionalNotice,
        weather: c.meta.weather || null
      };
    }
    c.characters = (c.characters || []).map(function (ch) {
      return { id: ch.id, name: ch.name, age: ch.age, avatar: ch.avatar || null, color: ch.color, avatarFallback: ch.avatarFallback || 'initials' };
    });
    (c.clues || []).forEach(function (cl) { delete cl.description; });
    return c;
  }

  /* ---------------- lock / passcode ---------------- */
  var entered = '';
  function showPasscode() {
    if (!storyReady) { toast('القصة لسه بتتحمل… جرّب تاني بعد ثانية'); return; }
    var ov = $('passcode-overlay');
    if (!ov) return;
    entered = '';
    renderDots();
    $('passcode-error').textContent = '';
    $('passcode-hint').style.display = 'none';
    ov.classList.add('open');
  }
  function hidePasscode() { var ov = $('passcode-overlay'); if (ov) ov.classList.remove('open'); }
  function renderDots() {
    var dots = document.querySelectorAll('#passcode-dots .dot');
    dots.forEach(function (d, i) { d.classList.toggle('filled', i < entered.length); });
  }
  function pressKey(k) {
    if (k === 'del') { entered = entered.slice(0, -1); renderDots(); return; }
    if (k === 'cancel') { hidePasscode(); return; }
    if (entered.length >= 6) return;
    entered += k;
    renderDots();
    var want = String(story.lock && story.lock.passcode || '');
    if (entered.length >= want.length) {
      if (entered === want) {
        hidePasscode();
        save.unlocked = true; persist();
        if (window.__simUnlock) window.__simUnlock();
        fireTrigger('unlock', 'lock');
        fireTrigger('chapter_start', 'ch1');
        checkChapterAdvance();
        toast('أهلاً بيك');
      } else {
        entered = '';
        var ov = $('passcode-overlay');
        ov.classList.remove('shake'); void ov.offsetWidth; ov.classList.add('shake');
        $('passcode-error').textContent = 'رمز خاطئ — جرّب تاني';
        $('passcode-hint-btn').style.display = 'inline-block';
        renderDots();
      }
    }
  }
  function showPasscodeHint() {
    var h = $('passcode-hint');
    var srcs = (story.lock && story.lock.hintSources) || [];
    var wrong = (story.lock && story.lock.wrongHint) || '';
    h.innerHTML = (wrong ? esc(wrong) + '<br><br>' : '') +
      (srcs.length ? '<b>فين تلاقي الرمز؟</b><br>' + srcs.map(esc).join('<br>') : 'دور في محتويات التليفون على حاجة تلمّح للرمز.');
    h.style.display = 'block';
  }

  /* ---------------- events engine ---------------- */
  // trigger: story trigger {type, ref}. Fires once, after delaySec.
  function fireTrigger(type, ref) {
    if (!story) return;
    (story.events || []).forEach(function (ev) {
      if (!ev.trigger || ev.trigger.type !== type) return;
      if (ev.trigger.ref && ev.trigger.ref !== '*' && ev.trigger.ref !== ref) return;
      if (save.fired.indexOf(ev.id) !== -1) return;
      save.fired.push(ev.id); persist();
      var delay = (ev.delaySec || 5) * 1000;
      setTimeout(function () { applyEvent(ev); }, delay);
    });
  }
  function applyEvent(ev) {
    (ev.actions || []).forEach(function (a) {
      if (a.type === 'message' && a.chatId && a.message) {
        save.injected[a.chatId] = save.injected[a.chatId] || [];
        save.injected[a.chatId].push(a.message);
        persist();
        var who = charName(a.message.from) || 'رسالة جديدة';
        showBanner('Messages — ' + who, a.message.text);
        sendUpdate('messages', { chatId: a.chatId });
      } else if (a.type === 'notification') {
        showBanner(a.title || 'تنبيه', a.body || '');
      } else if (a.type === 'reveal' && a.ref) {
        if (save.revealed.indexOf(a.ref) === -1) { save.revealed.push(a.ref); persist(); }
        broadcastUpdate({});
      }
    });
  }
  function charName(id) {
    if (!story) return null;
    if (id === 'me') return 'أنت';
    var c = (story.characters || []).find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }

  /* ---------------- postMessage ---------------- */
  function onIframeMessage(e) {
    var d = e.data || {};
    if (!d.type) return;
    if (d.type === 'ready' && d.app) {
      iframeWin[d.app] = e.source;
      if (storyReady) sendStory(d.app); else if (pendingReady.indexOf(d.app) === -1) pendingReady.push(d.app);
    } else if (d.type === 'event' && d.event) {
      var t = d.event.type, ref = d.event.ref;
      if (t === 'chat_opened' && save.readChats.indexOf(ref) === -1) { save.readChats.push(ref); persist(); }
      if (t === 'photo_opened' && save.openedPhotos.indexOf(ref) === -1) { save.openedPhotos.push(ref); persist(); }
      var mapped = TRIGGER_MAP[t];
      if (mapped) fireTrigger(mapped, ref);
      checkChapterAdvance();
    } else if (d.type === 'pin' && d.clueId) {
      if (save.pinned.indexOf(d.clueId) === -1) {
        save.pinned.push(d.clueId); persist();
        toast('تم تثبيت الدليل ✓');
        broadcastUpdate({});
        // E7: pack_complete fires when all 8 pack clues are pinned.
        if (packPinnedCount() >= packTotal()) fireTrigger('pack_complete', 'clue_pack');
        checkChapterAdvance();
      }
    } else if (d.type === 'reply' && d.chatId && d.choiceId) {
      save.replyChoices[d.chatId] = d.choiceId; persist();
    } else if (d.type === 'openApp' && d.app) {
      if (typeof openApp === 'function') openApp(d.app, d.opts || null);
    } else if (d.type === 'openSite' && d.siteId) {
      if (save.visitedSites.indexOf(d.siteId) === -1) { save.visitedSites.push(d.siteId); persist(); }
      if (typeof openApp === 'function') openApp('safari');
      setTimeout(function () { sendUpdate('safari', { siteId: d.siteId, path: d.path || '/' }); }, 600);
    }
  }
  function sendStory(app) {
    var w = iframeWin[app];
    if (w) w.postMessage({ type: 'story', story: sanitizeStory(story), save: save }, '*');
  }
  function sendUpdate(app, extra) {
    var w = iframeWin[app];
    if (w) w.postMessage(Object.assign({ type: 'update', save: save }, extra || {}), '*');
  }
  function broadcastUpdate(extra) {
    Object.keys(iframeWin).forEach(function (app) { sendUpdate(app, extra); });
  }

  /* ---------------- evidence pack ---------------- */
  function packClues() { return (story.clues || []).filter(function (c) { return c.pack; }); }
  function packTotal() { return packClues().length; }
  function packPinnedCount() {
    return packClues().filter(function (c) { return save.pinned.indexOf(c.id) !== -1; }).length;
  }
  function packIsFull() { return packTotal() > 0 && packPinnedCount() >= packTotal(); }

  /* ---------------- guidance / chapters / gates ---------------- */
  function currentChapter() {
    if (!story) return null;
    return (story.chapters || []).find(function (c) { return c.id === save.chapter; }) || story.chapters[0] || null;
  }
  function renderGuidance() {
    var ch = currentChapter();
    var bar = $('guidance-bar');
    if (!bar || !ch) return;
    bar.querySelector('.g-chapter').textContent = 'الفصل ' + (ch.n || chapterN(ch.id)) + ' — ' + (ch.title || '');
    bar.querySelector('.g-goal').textContent = ch.goal || '';
  }
  /* Gates from placement-map.md. */
  function checkChapterAdvance() {
    if (!story) return;
    var n = chapterN(save.chapter);
    var can = false;
    if (n === 1) {
      can = save.unlocked && save.readChats.length >= 1 && save.openedPhotos.length >= 1;
    } else if (n === 2) {
      can = !!(save.deductions['D1'] && save.deductions['D1'].done);
    } else if (n === 3) {
      can = !!(save.deductions['T1'] && save.deductions['T1'].done) && packPinnedCount() >= 6;
    }
    if (can && n < (story.chapters || []).length) {
      save.chapter = chapterId(n + 1); persist();
      renderGuidance();
      var next = currentChapter();
      showBanner('فصل جديد', next ? ('الفصل ' + next.n + ' — ' + next.title) : '');
      fireTrigger('chapter_start', save.chapter);
    }
  }

  /* ---------------- deductions ---------------- */
  function deductionGate(d) {
    if (!d) return { ok: false, why: 'استنتاج غير معروف' };
    if (d.chapter > chapterN(save.chapter)) return { ok: false, why: 'الفصل ده لسه ما اتفتحش' };
    var missing = (d.requiresClues || []).filter(function (c) { return save.pinned.indexOf(c) === -1; });
    if (missing.length) return { ok: false, why: 'لازم تثبّت الأدلة دي الأول: ' + missing.length + ' دليل ناقص' };
    return { ok: true };
  }
  /* Real schema: correct = array of OPTION STRINGS. Normalize to indices. */
  function correctIndices(d) {
    return (d.correct || []).map(function (s) { return (d.options || []).indexOf(s); }).filter(function (i) { return i !== -1; });
  }
  function completeDeduction(id, answer) {
    save.deductions[id] = { done: true, answer: answer, at: new Date().toISOString() };
    persist();
    fireTrigger('complete_deduction', id);
    checkChapterAdvance();
    renderCaseFile();
  }

  /* ---------------- endings ---------------- */
  // Resolver (placement-map): A = correct D2 choice + full 8-item pack;
  // B = correct D2 choice + pack incomplete; C = wrong D2 choice.
  // Endings' `condition` field is a display string, not resolver input.
  function resolveEnding(finale) {
    var d2 = (story.deductions || []).find(function (x) { return x.id === 'D2'; });
    var correctChoice = d2 && d2.correct && d2.correct[0];
    var endings = story.endings || [];
    function byId(id) { return endings.find(function (e) { return e.id === id; }); }
    var isCorrect = finale && finale.choice === correctChoice;
    // Fullness comes from the pack submitted with the finale when present
    // (the pack at decision time), else from the currently pinned pack.
    var submitted = finale && Array.isArray(finale.pack) ? finale.pack : null;
    var isFull = submitted
      ? (packTotal() > 0 && packClues().every(function (c) { return submitted.indexOf(c.id) !== -1; }))
      : packIsFull();
    if (isCorrect && isFull) return byId('A') || endings[0] || null;
    if (isCorrect) return byId('B') || endings[1] || null;
    return byId('C') || endings[endings.length - 1] || null;
  }
  function submitFinale(answer) {
    save.finale = answer; persist();
    var ending = resolveEnding(answer);
    if (ending && save.endingsSeen.indexOf(ending.id) === -1) { save.endingsSeen.push(ending.id); persist(); }
    completeDeduction('D2', answer);
    showEnding(ending);
  }
  function showEnding(ending) {
    var ov = $('ending-overlay');
    if (!ov || !ending) return;
    $('ending-title').textContent = ending.title || '';
    $('ending-text').textContent = ending.text || '';
    ov.classList.add('open');
  }
  function retryFromCh4() {
    save.chapter = 'ch4';
    delete save.deductions['D2'];
    save.finale = null;
    persist();
    $('ending-overlay').classList.remove('open');
    renderGuidance();
    renderCaseFile();
    toast('رجعت للفصل 4 — تقدّمك محفوظ');
  }

  /* ---------------- case file overlay ---------------- */
  function openCaseFile() {
    if (!storyReady) { toast('القصة لسه بتتحمل…'); return; }
    renderCaseFile();
    $('case-overlay').classList.add('open');
  }
  function closeCaseFile() { $('case-overlay').classList.remove('open'); }
  function renderCaseFile() {
    var box = $('case-content');
    if (!box || !story) return;
    var ch = currentChapter();
    var html = '';
    html += '<div class="cf-sec"><b>الفصل الحالي:</b> ' + esc(ch ? (ch.n + ' — ' + (ch.title || '')) : '—') + '<br>' +
      '<span class="cf-goal">' + esc(ch ? ch.goal || '' : '') + '</span></div>';
    html += '<div class="cf-sec"><b>تلميح:</b> ' + esc(ch ? ch.hint || 'دور في التطبيقات على أي حاجة جديدة.' : '') + '</div>';
    html += '<div class="cf-sec"><b>حزمة الأدلة (' + packPinnedCount() + ' من ' + packTotal() + '):</b><ul>' +
      (packClues().map(function (c) {
        var pinned = save.pinned.indexOf(c.id) !== -1;
        return '<li>' + (pinned ? '✓ ' : '○ ') + '<b>' + esc(c.title) + '</b></li>';
      }).join('')) + '</ul>' +
      '<div style="margin-top:8px;color:#8e8e93;font-size:13px">أدلة مثبّتة إجمالاً: ' + save.pinned.length + ' من ' + (story.clues || []).length + '</div></div>';
    html += '<div class="cf-sec"><b>الاستنتاجات:</b>';
    (story.deductions || []).forEach(function (d) {
      var done = save.deductions[d.id] && save.deductions[d.id].done;
      var gate = deductionGate(d);
      html += '<div class="cf-ded"><div><b>' + esc(d.title) + '</b> (الفصل ' + d.chapter + ')' +
        (done ? ' — <span class="cf-done">تم ✓</span>' : '') + '</div>' +
        (done ? '' : '<button class="cf-btn" data-ded="' + esc(d.id) + '"' + (gate.ok ? '' : ' disabled') + '>' +
          (gate.ok ? 'ابدأ الاستنتاج' : esc(gate.why)) + '</button>') + '</div>';
    });
    html += '</div>';
    html += '<div class="cf-sec cf-note">النهايات: ' + save.endingsSeen.length + ' من ' + (story.endings || []).length + ' اتشافت.</div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-ded]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDeduction(btn.getAttribute('data-ded')); });
    });
  }

  /* ---------------- deduction overlay ---------------- */
  var activeDed = null, pickSel = [], orderSel = [], finaleSel = null;
  function openDeduction(id) {
    var d = (story.deductions || []).find(function (x) { return x.id === id; });
    if (!d) return;
    var gate = deductionGate(d);
    if (!gate.ok) { toast(gate.why); return; }
    activeDed = d; pickSel = []; orderSel = []; finaleSel = null;
    $('ded-title').textContent = d.title || '';
    $('ded-q').textContent = d.title || '';
    $('ded-hint').textContent = '';
    var body = $('ded-body');
    var correctIdx = correctIndices(d);
    if (d.type === 'pick') {
      body.innerHTML = '<p class="ded-note">اختار ' + correctIdx.length + ' من الاختيارات:</p>' +
        (d.options || []).map(function (o, i) {
          return '<button class="ded-opt" data-i="' + i + '">' + esc(o) + '</button>';
        }).join('');
      body.querySelectorAll('.ded-opt').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-i');
          var k = pickSel.indexOf(i);
          if (k === -1) pickSel.push(i); else pickSel.splice(k, 1);
          b.classList.toggle('sel', k === -1);
        });
      });
    } else if (d.type === 'order') {
      body.innerHTML = '<p class="ded-note">رتّب الأحداث بالترتيب الصح — دوس عليها بالترتيب:</p><div id="ded-order-picked" class="ded-picked"></div>' +
        (d.options || []).map(function (o, i) {
          return '<button class="ded-opt" data-i="' + i + '">' + esc(o) + '</button>';
        }).join('');
      body.querySelectorAll('.ded-opt').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-i');
          if (orderSel.indexOf(i) !== -1) return;
          orderSel.push(i); b.classList.add('sel');
          $('ded-order-picked').textContent = orderSel.map(function (j) { return d.options[j]; }).join(' ← ');
        });
      });
    } else if (d.type === 'finale') {
      body.innerHTML =
        '<p class="ded-note">حزمة الأدلة: ' + packPinnedCount() + ' من ' + packTotal() + ' مثبّتة' +
        (packIsFull() ? ' — كاملة ✓' : ' — النهاية الكاملة محتاجة الـ8 كلهم.') + '</p>' +
        '<p class="ded-note">هتعمل إيه بالأدلة؟ اختار خطوة واحدة:</p>' +
        (d.options || []).map(function (o, i) {
          return '<button class="ded-opt" data-i="' + i + '">' + esc(o) + '</button>';
        }).join('');
      body.querySelectorAll('.ded-opt').forEach(function (b) {
        b.addEventListener('click', function () {
          body.querySelectorAll('.ded-opt').forEach(function (x) { x.classList.remove('sel'); });
          b.classList.add('sel');
          finaleSel = (d.options || [])[+b.getAttribute('data-i')];
        });
      });
      $('ded-submit').onclick = function () {
        if (!finaleSel) { $('ded-hint').textContent = 'اختار هتعمل إيه الأول.'; return; }
        var answer = { choice: finaleSel, pack: packClues().filter(function (c) { return save.pinned.indexOf(c.id) !== -1; }).map(function (c) { return c.id; }) };
        $('ded-overlay').classList.remove('open');
        closeCaseFile();
        submitFinale(answer);
      };
      $('ded-overlay').classList.add('open');
      return;
    }
    $('ded-submit').onclick = function () { submitDeduction(); };
    $('ded-overlay').classList.add('open');
  }
  function submitDeduction() {
    var d = activeDed;
    if (!d) return;
    var correctIdx = correctIndices(d);
    var ok = false;
    if (d.type === 'pick') {
      var a = pickSel.slice().sort().join(',');
      var b = correctIdx.slice().sort().join(',');
      ok = a === b && pickSel.length === correctIdx.length;
    } else if (d.type === 'order') {
      ok = orderSel.join(',') === correctIdx.join(',');
    }
    if (ok) {
      $('ded-overlay').classList.remove('open');
      completeDeduction(d.id, d.type === 'pick' ? pickSel : orderSel);
      toast('استنتاج صحيح ✓');
    } else {
      $('ded-hint').textContent = d.hint || 'مش دي الإجابة — راجع الأدلة المثبّتة وحاول تاني.';
    }
  }

  /* ---------------- ui helpers ---------------- */
  function toast(msg) {
    var t = $('toast'), m = $('toast-message');
    if (!t || !m) return;
    m.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function showBanner(title, body) {
    var b = $('notify-banner');
    if (!b) return;
    b.querySelector('.nb-title').textContent = title || '';
    b.querySelector('.nb-body').textContent = body || '';
    b.classList.add('show');
    setTimeout(function () { b.classList.remove('show'); }, 5000);
    b.onclick = function () { b.classList.remove('show'); };
  }

  /* ---------------- public API ---------------- */
  window.Game = {
    boot: boot,
    showPasscode: showPasscode,
    pressKey: pressKey,
    showPasscodeHint: showPasscodeHint,
    onAppOpened: function (appId) { /* tracked by iframes; no story trigger */ },
    openCaseFile: openCaseFile,
    closeCaseFile: closeCaseFile,
    closeDeduction: function () { $('ded-overlay').classList.remove('open'); },
    retryFromCh4: retryFromCh4,
    closeEnding: function () { $('ending-overlay').classList.remove('open'); },
    // exposed for verification traces
    _resolveEnding: function (finale) { return story ? resolveEnding(finale) : null; },
    _fireTrigger: fireTrigger,
    _packCount: function () { return story ? packPinnedCount() : 0; },
    _checkAdvance: checkChapterAdvance,
    _completeDeduction: completeDeduction,
    _submitFinale: submitFinale,
    _correctIndices: function (id) {
      if (!story) return null;
      var d = (story.deductions || []).find(function (x) { return x.id === id; });
      return d ? correctIndices(d) : null;
    },
    _state: function () { return { story: !!story, save: save }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
