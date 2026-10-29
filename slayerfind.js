// SEQO — Slayer: what's closest to done, and "do I still need to kill X?" (2.7.2)
// Pure helpers over the achievements export ({ sections: [{ name, achievements: [{ name, done,
// objectives: [{ text, done, cur?, max? }] }] }] }). UMD: overlay (window.EQLSlayerFind) + tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLSlayerFind = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // real objectives (drop the "This achievement…" footnotes some carry)
  const objs = (a) => (a.objectives || []).filter((o) => !/^This achievement/i.test(o.text));
  const isDone = (a, live) => !!(a.done || (live && live.has && live.has(a.name)));

  // completion 0..1: counted objectives give cur/max, finished ones 1, untouched ones 0
  function pct(a, live) {
    if (isDone(a, live)) return 1;
    const os = objs(a);
    if (!os.length) return 0;
    let got = 0;
    for (const o of os) got += o.done ? 1 : (o.max ? Math.min(1, (o.cur || 0) / o.max) : 0);
    return got / os.length;
  }

  const n = (x) => Number(x || 0).toLocaleString('en-US');
  // what's still missing, short: "5,657 to go" · "Barbarians 3/10 · Wood Elves 3/10 · +2 more"
  function leftText(a, max = 3) {
    const os = objs(a).filter((o) => !o.done && !/^\(Optional\)/i.test(o.text));
    if (!os.length) return '';
    if (os.length === 1 && os[0].max) return n(os[0].max - (os[0].cur || 0)) + ' to go';
    const parts = os.slice(0, max).map((o) => o.text.replace(/^Complete the achievement "(.+)"$/, '$1').replace(/\.$/, '') +
      (o.max ? ' ' + n(o.cur) + '/' + n(o.max) : ''));
    return parts.join(' · ') + (os.length > max ? ' · +' + (os.length - max) + ' more' : '');
  }

  // unfinished achievements in the sections matching `re`, closest to done first
  function closest(data, { re = /^Slayer:/i, count = 8, live } = {}) {
    const out = [];
    for (const s of (data && data.sections) || []) {
      if (!re.test(s.name)) continue;
      for (const a of s.achievements || []) {
        if (isDone(a, live)) continue;
        const p = pct(a, live);
        if (p <= 0) continue;
        out.push({ section: s.name, ach: a, pct: p, left: leftText(a) });
      }
    }
    out.sort((x, y) => y.pct - x.pct || x.ach.name.localeCompare(y.ach.name));
    return out.slice(0, count);
  }

  // every achievement (any section) whose name or an objective mentions `q`
  // → { verdict: 'needed' | 'done' | 'none', hits: [{ section, ach, done, objs: [matching objectives] }] }
  function search(data, q, { live } = {}) {
    const want = String(q || '').trim().toLowerCase();
    if (want.length < 2) return { verdict: 'none', hits: [] };
    const hits = [];
    for (const s of (data && data.sections) || []) {
      for (const a of s.achievements || []) {
        const nameHit = a.name.toLowerCase().includes(want);
        const os = objs(a).filter((o) => o.text.toLowerCase().includes(want));
        if (!nameHit && !os.length) continue;
        hits.push({ section: s.name, ach: a, done: isDone(a, live), nameHit, objs: os });
      }
    }
    // still needed = an unfinished achievement where the match itself isn't ticked off yet
    const needed = (h) => !h.done && (h.objs.length ? h.objs.some((o) => !o.done) : true);
    hits.sort((x, y) => needed(y) - needed(x) || x.section.localeCompare(y.section) || x.ach.name.localeCompare(y.ach.name));
    return { verdict: !hits.length ? 'none' : hits.some(needed) ? 'needed' : 'done', hits: hits.map((h) => ({ ...h, needed: needed(h) })) };
  }

  return { objs, pct, leftText, closest, search };
});
