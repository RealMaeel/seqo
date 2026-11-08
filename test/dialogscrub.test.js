// tests for dialogscrub.js (3.0: players' names out of shared NPC dialog)
'use strict';
const assert = require('assert');
const { scrubDialog, repairYou, knownWords } = require('../dialogscrub.js');
const k = knownWords(['Sarkis Ebonblade', 'Antonius Bayle', 'Plane of Sky']);
assert.strictEqual(scrubDialog('Greetings, Soandso.  Have you come here?', k), 'Greetings, {player}.  Have you come here?');
assert.strictEqual(scrubDialog('Thank you, Soandso! This helps.', k), 'Thank you, {player}! This helps.');
assert.strictEqual(scrubDialog('Hail, Antonius Bayle!', k), 'Hail, Antonius Bayle!', 'two-word names are NPCs, not players');
assert.strictEqual(scrubDialog('Hail, Sarkis.', k), 'Hail, Sarkis.', 'known game words stay');
assert.strictEqual(scrubDialog('Thank you, Gnome. This will go a ways', k), 'Thank you, Gnome. This will go a ways', 'races stay');
assert.strictEqual(scrubDialog('Smash eh?  Go.  Smash, smash some more', k), 'Smash eh?  Go.  Smash, smash some more', 'sentence openers are left alone');
assert.strictEqual(scrubDialog('Greetings, {me}.', k), 'Greetings, {me}.');
assert.strictEqual(repairYou('{player} have earned the token.  I have no need for this, {me}. {player} can have it back.'), 'You have earned the token.  I have no need for this, {me}. You can have it back.');
assert.strictEqual(repairYou("{player}'re not welcome in Freeport."), "You're not welcome in Freeport.");
assert.strictEqual(repairYou('Thanks, {player}.'), 'Thanks, {player}.', 'a real {player} stays');
assert.strictEqual(scrubDialog('I have no need for this, Liegezen. You can have it back.', k), 'I have no need for this, {player}. You can have it back.');
assert.strictEqual(scrubDialog('Go to the Plane of Sky, Sarkis!', k), 'Go to the Plane of Sky, Sarkis!');
console.log('dialogscrub tests passed');
