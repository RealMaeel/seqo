// SEQO — whose charm is it? (v2.7)
// "Innoruuk`s Chosen has been charmed." shows for EVERY charm near you, not just
// yours, so that line alone can't make a mob your pet (Ed, Oct 26 2026: other
// players' charms kept landing on his meter). A charm is yours when YOU began
// casting a charm spell just before it landed; otherwise it belongs to the player
// seen casting one; otherwise to nobody we know — and never to you.
// Pure; the overlay feeds it cast lines and charm landings (02-feed.js).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLCharms = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // curated charm spells (base names; ranks like "Allure VIII" are matched without the numeral)
  const CHARM_SPELLS = new Set(['Charm', 'Beguile', 'Cajoling Whispers', 'Allure',
    "Boltran's Agacerie", 'Dictate', 'Charm Animals', 'Beguile Animals', 'Befriend Animal',
    'Beguile Undead', 'Dominate Undead', 'Cajole Undead', 'Enslave Death', 'Thrall of Bones',
    'Charm Animal', 'Call of Karana', "Tunare's Request", 'Command of Druzzil']);
  const baseName = (s) => String(s || '').replace(/\s+[IVXL]+$/, '').trim();
  const isCharmSpell = (s) => CHARM_SPELLS.has(baseName(s));
  const WINDOW_MS = 15000;   // cast start → landing (charms cast in ~3–5 s; a little slack for lag)

  function create() {
    const casts = [];          // [{ caster, t }] recent charm cast starts, newest last
    const owners = new Map();  // mob -> owner ('You' or a player name)
    return {
      // "You begin casting Allure VIII." / "Zener begins casting Dictate."
      cast(caster, spell, t) {
        if (!isCharmSpell(spell)) return false;
        casts.push({ caster, t });
        while (casts.length > 20 || (casts.length && t - casts[0].t > 60000)) casts.shift();
        return true;
      },
      // "<mob> has been charmed." → { owner: 'You' | name | null }
      landed(mob, t) {
        const recent = casts.filter((c) => t - c.t >= 0 && t - c.t <= WINDOW_MS);
        let owner = null;
        if (recent.some((c) => c.caster === 'You')) owner = 'You';
        else if (recent.length) owner = recent[recent.length - 1].caster;
        // used up: the next landing needs its own cast
        if (owner) { const i = casts.lastIndexOf(recent.filter((c) => c.caster === owner).pop()); if (i >= 0) casts.splice(i, 1); }
        if (owner) owners.set(mob, owner); else owners.delete(mob);
        return { owner };
      },
      // "Your target resisted the Allure spell." / interrupted / fizzled: that cast never lands
      failed(caster) {
        for (let i = casts.length - 1; i >= 0; i--) if (casts[i].caster === caster) { casts.splice(i, 1); return true; }
        return false;
      },
      ownerOf: (mob) => owners.get(mob) || null,
      forget(mob) { owners.delete(mob); },
      others() { return new Map([...owners].filter(([, o]) => o !== 'You')); }
    };
  }

  return { create, isCharmSpell, CHARM_SPELLS, baseName };
});
