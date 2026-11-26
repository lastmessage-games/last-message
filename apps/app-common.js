/* Shared bridge for story-driven app iframes. No external URLs.
   Usage in each app: APP='messages'; ready('messages'); then define
   onStory() to render from STORY/SAVE. Parent replies with {type:'story'}
   (SANITIZED story: no truth, no lock, no events/deductions/endings,
   characters carry only id/name/age/avatar/color) and later {type:'update'}.
   Avatars: character.avatar is a FILENAME in ../story/assets/photos/ or
   null -> initials fallback (Rana, Ziad). */
var STORY = null, SAVE = null, APP = '';
function $(s) { return document.querySelector(s); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function send(msg) { msg.app = APP; parent.postMessage(msg, '*'); }
function ready(app) {
  APP = app;
  send({ type: 'ready' });
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'story') { STORY = d.story; SAVE = d.save; if (window.onStory) window.onStory(); }
    if (d.type === 'update') { SAVE = d.save; if (window.onUpdate) window.onUpdate(d); }
  });
}
function report(type, ref) { send({ type: 'event', event: { type: type, ref: ref } }); }
function pinClue(clueId) { send({ type: 'pin', clueId: clueId }); }
function openApp(app, opts) { var m = { type: 'openApp', app: app }; if (opts) m.opts = opts; send(m); }
function openSite(siteId, path) { send({ type: 'openSite', siteId: siteId, path: path || '/' }); }
function charById(id) {
  if (!STORY) return null;
  if (id === 'me') return { id: 'me', name: 'أنت', color: '#0a84ff', avatar: null };
  return (STORY.characters || []).find(function (c) { return c.id === id; }) || null;
}
function charName(id) {
  var c = charById(id);
  if (c) return c.name;
  return ORG_NAMES[id] || id;
}
/* Organisation senders have no character entry in story.json, so charName()
   would fall back to the raw id ("bank", "course", ...). Display names below
   are taken from the story's own wording (mail signatures/bodies). */
var ORG_NAMES = {
  bank: 'بنك الأمل',
  course: 'أكاديمية الدواء للتدريب',
  dress_shop: 'محل فساتين الفرح',
  inspectorate: 'هيئة الدواء المصرية',
  hr: 'إدارة الموارد البشرية',
  spam: 'بريد مزعج'
};
/* Avatar inner HTML for a character: photo when avatar file exists,
   otherwise the first letter of the name on the character color.
   The <img> removes itself on error, revealing the initial underneath. */
function avatarInner(ch) {
  var name = (ch && ch.name) || '?';
  var initial = esc(name.trim().charAt(0));
  var color = (ch && ch.color) || '#0a84ff';
  var img = '';
  if (ch && ch.avatar) {
    img = '<img src="../story/assets/photos/' + esc(ch.avatar) + '" alt="" onerror="this.remove()">';
  }
  return '<span class="av-initial">' + initial + '</span>' + img;
}
/* Find the clue (if any) whose string sources include sourceId. */
function clueFor(sourceId) {
  if (!STORY) return null;
  return (STORY.clues || []).find(function (c) {
    return (c.sources || []).indexOf(sourceId) !== -1;
  }) || null;
}
function cluesFor(sourceId) {
  if (!STORY) return [];
  return (STORY.clues || []).filter(function (c) {
    return (c.sources || []).indexOf(sourceId) !== -1;
  });
}
function isPinned(clueId) { return SAVE && SAVE.pinned && SAVE.pinned.indexOf(clueId) !== -1; }
/* Pin button HTML for an item linked to a clue; call wirePin(container) after insert. */
function pinButtonHtml(clue) {
  if (!clue) return '';
  if (isPinned(clue.id)) return '<span class="pin-state">📌 مثبّت ✓</span>';
  return '<button class="pin-btn" data-clue="' + esc(clue.id) + '">📌 ثبّت الدليل</button>';
}
function pinButtonsHtml(clues) {
  return (clues || []).map(pinButtonHtml).join(' ');
}
function wirePin(root) {
  (root || document).querySelectorAll('.pin-btn').forEach(function (b) {
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      pinClue(b.getAttribute('data-clue'));
      b.outerHTML = '<span class="pin-state">📌 مثبّت ✓</span>';
    });
  });
}
