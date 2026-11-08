// dialogscrub.js — SEQO 3.0: take players' names out of NPC dialog before it is shared.
// The same file is server/tools/dialogscrub.cjs (the compile uses it too) — keep the two in step.
'use strict';
// Player names in NPC dialog (3.0): an NPC answering whoever hailed it says "Greetings, Soandso." —
// a name SEQO never saw in chat. A one-word capitalised name right after a greeting is replaced with
// {player} unless it's a known game word (zones, mobs, NPCs, factions, items, tasks) or an everyday word.
const SAFE_OPENERS = new Set(('Ah Aha Ahh Alas Alright Aye Bah Begone Beware Bless Careful Come Die Excellent Excuse Farewell Fine Finally ' +
  'Fool Go Good Great Greetings Ha Hah Hail Halt Hark Hello Hey Hm Hmm Hmmm Hold Hurry Indeed Interesting Just Kneel Leave Listen Look ' +
  'Mortal Mortals Nay Next No Nonsense Now Oh Ok Okay Oooh Patience Perfect Please Quick Quickly Quiet Rest Right Run Silence Sir Madam ' +
  'So Sorry Splendid Stop Stranger Surely Thanks Then There Traveler Traveller True Very Wait Well Welcome Well Why Wonderful Yes Yeah ' +
  'You Young Friend Friends Child Brother Sister Citizen Adventurer Adventurers Hero Heroes Outsider Peasant Fools Unless ' +
  // races and classes an NPC calls you by
  'Human Humans Barbarian Erudite Elf Elves Halfling Dwarf Dwarves Gnome Gnomes Troll Trolls Ogre Ogres Iksar Froglok Vahshir Drakkin ' +
  'Warrior Cleric Paladin Ranger Shadowknight Druid Monk Bard Rogue Shaman Necromancer Wizard Magician Enchanter Beastlord Berserker Knight').split(/\s+/));
const GREETING = /\b(Hail|Greetings|Hello|Welcome|Farewell|Thank you|Thanks|Well met|Good day|Good evening|Good morning|Goodbye|Sorry),?\s+([A-Z][a-z]{2,14})\b(?!\s+[A-Z])/g;

// only these two forms are replaced: a name OPENING a sentence is too often a game word ("Smash eh?",
// "Disempowerment, destroying…") to guess at without a dictionary
// …or a name closing a clause after a comma: "I have no need for this, Soandso." / "Thank you, Soandso!"
const VOCATIVE_END = /,\s+([A-Z][a-z]{2,14})(?=[.!?])/g;
function scrubDialog(text, known = new Set()) {
  const keep = (w) => SAFE_OPENERS.has(w) || known.has(w.toLowerCase());
  return String(text || '')
    .replace(GREETING, (all, g, w) => (keep(w) ? all : all.slice(0, all.length - w.length) + '{player}'))
    .replace(VOCATIVE_END, (all, w) => (keep(w) ? all : all.slice(0, all.length - w.length) + '{player}'));
}

// SEQO 2.7.5 / early 3.0 test builds counted "You" said in chat as a player, so "You have earned…"
// was saved as "{player} have earned…". Put "You" back where the next word shows that's what it was.
const YOU_VERB = /\{player\}(?=('re|'ve|'ll| (?:are|have|had|will|would|can|could|may|might|must|should|shall|see|go|do|did|were|was|need|seem|look|dare|know|think|appear|wish)\b))/g;
function repairYou(text) { return String(text || '').replace(YOU_VERB, 'You'); }

// every word of the game's own names, lower case (zones, mobs, NPCs, factions, items, tasks)
function knownWords(names) {
  const out = new Set();
  for (const n of names) for (const w of String(n || '').split(/[^A-Za-z']+/)) if (w.length > 2) out.add(w.toLowerCase());
  return out;
}
module.exports = { scrubDialog, repairYou, knownWords, SAFE_OPENERS };
