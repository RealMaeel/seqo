// node test/alerts.test.js — custom alert matching, GINA import, sharing
const A = require('../alerts.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const ctx = { charName: 'Maeel' };
const run = (rule, msg) => { const c = A.compileRule(rule, ctx); const h = A.matchLine(c, msg); return h ? A.fill(rule.msg, h, ctx, msg) : null; };

ok(run({ pattern: 'you have been SUMMONED', msg: 'pulled!' }, 'You have been summoned!') === 'pulled!', 'plain text: case-insensitive contains');
ok(run({ pattern: 'summoned', msg: 'x' }, 'You are stunned!') === null, 'plain text: no match');
ok(run({ pattern: 'a.b', msg: 'x' }, 'aXb') === null, 'plain text: dots are literal');
ok(run({ pattern: "^(\\w+) tells you, '(.+)'$", regex: true, msg: '{1}: {2}' }, "Inky tells you, 'BS that u need sneak'") === 'Inky: BS that u need sneak', 'regex positional captures');
ok(run({ pattern: '{S} invites you to join a group.', msg: '{S} wants you' }, 'Brannoc invites you to join a group.') === 'Brannoc wants you', 'GINA {S} lazy in the middle');
ok(run({ pattern: "{S} tells you, '{S1}'", msg: '{S}/{S1}' }, "Inky tells you, 'hi there'") === 'Inky/hi there', 'two {S} tokens, last one greedy');
ok(run({ pattern: '{S} hits {C} for {N} points', msg: '{S} {N}' }, 'A golem hits Maeel for 1,234 points of damage.') === 'A golem 1,234', '{C} is your name, {N} a number');
ok(run({ pattern: '{S} hits {C} for {N>=500} points', msg: '{N}' }, 'A golem hits Maeel for 99 points of damage.') === '99', 'GINA {N>=x} accepted (matches any number)');
ok(run({ pattern: '^(?<who>\\w+) begins casting (?<sp>.+)\\.$', regex: true, msg: '{who} → {sp}' }, 'Maisze begins casting Rampage I.') === 'Maisze → Rampage I', 'named groups');
ok(A.compileRule({ pattern: '(unclosed', regex: true }, ctx) === null, 'bad regex -> null, no throw');
ok(A.compileRule({ pattern: '   ' }, ctx) === null, 'empty pattern refused');
ok(run({ pattern: 'stunned', msg: 'line was: {line}' }, 'You are stunned!') === 'line was: You are stunned!', '{line}');

// sharing round-trip
const code = A.encodeShare([{ name: 'Tell', pattern: "tells you, '", msg: '💬 tell', speak: true, on: true, id: 'x' }]);
const back = A.decodeShare('copy this → ' + code + '  ');
ok(code.startsWith('SEQO-ALERTS:') && back && back.length === 1 && back[0].msg === '💬 tell' && back[0].speak === true && !back[0].id, 'share code round-trip (emoji, no ids)');
ok(A.decodeShare('nope') === null && A.decodeShare('SEQO-ALERTS:@@@') === null, 'bad share codes -> null');

// GINA export XML
const xml = `<?xml version="1.0"?><SharedData><TriggerGroups><TriggerGroup><Name>Raid &amp; Boss</Name><Comments/>
<Triggers><Trigger><Name>Mez break</Name><TriggerText>{S} has been awakened by {S1}.</TriggerText><EnableRegex>False</EnableRegex>
<UseText>True</UseText><DisplayText>{S} woke up</DisplayText><UseTextToVoice>True</UseTextToVoice><TextToVoiceText>mez broke</TextToVoiceText>
<PlayMediaFile>False</PlayMediaFile><TimerType>NoTimer</TimerType><TimerDuration>0</TimerDuration></Trigger>
<Trigger><Name>Slow timer</Name><TriggerText>^(.+) yawns\\.$</TriggerText><EnableRegex>True</EnableRegex><UseText>False</UseText>
<UseTextToVoice>False</UseTextToVoice><PlayMediaFile>True</PlayMediaFile><TimerType>Timer</TimerType><TimerDuration>150</TimerDuration><TimerName>Slow on {S}</TimerName></Trigger>
</Triggers></TriggerGroup></TriggerGroups></SharedData>`;
const g = A.ginaToRules(xml);
ok(g.length === 2, 'two GINA triggers');
ok(g[0].group === 'Raid & Boss' && g[0].msg === '{S} woke up' && g[0].speak && g[0].say === 'mez broke' && !g[0].regex && !g[0].timer, 'GINA text/voice fields');
ok(g[1].regex && g[1].timer === 150 && g[1].sound === 'rare', 'GINA regex + timer + sound');
ok(run(g[0], 'A froglok shaman has been awakened by Brannoc.') === 'A froglok shaman woke up', 'imported GINA trigger matches');
ok(run(g[1], 'A ghoul yawns.') !== null, 'imported GINA regex matches');

// .gtp (zip) reader: build a tiny deflated zip in memory
const zlib = require('zlib');
const body = Buffer.from(xml, 'utf8'), comp = zlib.deflateRawSync(body), nm = Buffer.from('ShareData.xml');
const hdr = Buffer.alloc(30); hdr.writeUInt32LE(0x04034b50, 0); hdr.writeUInt16LE(20, 4); hdr.writeUInt16LE(0, 6); hdr.writeUInt16LE(8, 8);
hdr.writeUInt32LE(comp.length, 18); hdr.writeUInt32LE(body.length, 22); hdr.writeUInt16LE(nm.length, 26); hdr.writeUInt16LE(0, 28);
ok(A.unzipFirstXml(Buffer.concat([hdr, nm, comp])) === xml, '.gtp zip -> ShareData.xml');

// starter rules match the real log lines they were built from
const S = (n) => A.STARTER.find(r => r.name === n);
ok(run(S('Tell received'), "Inky tells you, 'i did get the helm'") === '💬 Inky: i did get the helm', 'starter: tell');
ok(run(S('Summoned'), 'You have been summoned!') !== null && run(S('Stunned'), 'You are stunned!') !== null, 'starter: summoned + stunned');
ok(run(S('Group invite'), 'Brannoc invites you to join a group.') === '👥 Brannoc invites you to a group', 'starter: invite');
// GINA quirks (2.7): hex entities, .NET inline flags, UTF-16 exports
{
  const AL = require('../alerts.js');
  const g = AL.ginaToRules('<Trigger><Name>Hex</Name><TriggerText>{S} tells you, &#x27;hi&#x27;</TriggerText><EnableRegex>False</EnableRegex></Trigger>' +
    '<Trigger><Name>Flags</Name><TriggerText>(?i)^you have been slain(?#by anything)\\Z</TriggerText><EnableRegex>True</EnableRegex></Trigger>');
  const m = (r, l) => !!AL.matchLine(AL.compileRule(r, { charName: 'Maeel' }), l);
  ok(g[0].pattern === "{S} tells you, 'hi'" && m(g[0], "Nekkroh tells you, 'hi'"), 'GINA: &#x27; decoded');
  ok(AL.compileRule(g[1], {}) && m(g[1], 'You have been slain') && !m(g[1], 'You have been slain by a gnoll'), 'GINA: (?i), (?#…) and \\Z understood');
  const xml = '<SharedData><TriggerGroups><TriggerGroup><Name>G</Name><Triggers><Trigger><Name>T</Name><TriggerText>{S} yawns.</TriggerText></Trigger></Triggers></TriggerGroup></TriggerGroups></SharedData>';
  const zlib = require('zlib');
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
  const comp = zlib.deflateRawSync(u16);
  const name = Buffer.from('ShareData.xml');
  const hdr = Buffer.alloc(30); hdr.writeUInt32LE(0x04034b50, 0); hdr.writeUInt16LE(8, 8);
  hdr.writeUInt32LE(comp.length, 18); hdr.writeUInt32LE(u16.length, 22); hdr.writeUInt16LE(name.length, 26);
  const back = AL.unzipFirstXml(Buffer.concat([hdr, name, comp]));
  ok(back && AL.ginaToRules(back)[0].pattern === '{S} yawns.', 'GINA: UTF-16 ShareData.xml inside a .gtp');
}

// any quote mark matches any other (people type " where EQ writes ') — 2.7
{
  const AL = require('../alerts.js');
  const tell = AL.STARTER.find(r => r.name === 'Tell received');
  const hit = (r, l) => AL.matchLine(AL.compileRule(r, {}), l);
  ok(hit(tell, 'Inky tells you, "Hi"') && hit(tell, 'Inky tells you, \u2018Hi\u2019') && hit(tell, "Inky tells you, 'Hi'"), 'quotes: straight, double and curly all match');
  ok(hit({ pattern: "{S} says, 'pull'" }, 'Bob says, "pull"'), 'quotes: plain-text rules too');
  ok(hit({ pattern: "^(\\w+) says, '([^']+)'$", regex: true }, "Bob says, 'hi'"), 'quotes inside [classes] left alone');
}

// timer early warning (2.7): GINA "timer ending", share codes, spawn starters
{
  const AL = require('../alerts.js');
  const g = AL.ginaToRules('<Trigger><Name>Ghoul</Name><TriggerText>a ghoul knight has been slain</TriggerText><EnableRegex>False</EnableRegex>' +
    '<UseText>True</UseText><DisplayText>ghoul down</DisplayText><TimerType>Timer</TimerType><TimerName>Ghoul respawn</TimerName><TimerDuration>400</TimerDuration>' +
    '<UseTimerEnding>True</UseTimerEnding><TimerEndingTime>60</TimerEndingTime><TimerEndingTrigger><UseText>True</UseText><DisplayText>soon</DisplayText></TimerEndingTrigger>' +
    '<UseTimerEnded>True</UseTimerEnded><TimerEndedTrigger><UseText>True</UseText><DisplayText>Ghoul is UP</DisplayText></TimerEndedTrigger></Trigger>');
  ok(g[0].timer === 400 && g[0].timerWarn === 60 && g[0].timerEnd === 'Ghoul is UP' && g[0].msg === 'ghoul down' && g[0].timerName === 'Ghoul respawn', 'GINA timer ending + ended imported: ' + JSON.stringify(g[0]));
  const back = AL.decodeShare(AL.encodeShare([{ name: 'x', pattern: 'y', timer: 400, timerWarn: 60, timerName: '{1} respawn', timerEnd: 'up' }]));
  ok(back[0].timerWarn === 60 && back[0].timerName === '{1} respawn' && back[0].timerEnd === 'up', 'share codes keep the timer warning, name and end text');
  const sp = AL.STARTER.filter(r => /Spawn/.test(r.name));
  ok(sp.length === 2 && sp.every(r => r.on === false && r.timerWarn === 60 && r.timer > 0), 'two spawn starters, added switched off');
  const c = AL.compileRule(sp[0], { charName: 'Maeel' });
  const own = AL.matchLine(c, 'You have slain a ghoul knight!'), other = AL.matchLine(c, 'a ghoul knight has been slain by Kwazimodo!');
  ok(own && other && AL.fill(sp[0].timerName, own, {}, '') === 'a ghoul knight respawn' && !AL.matchLine(c, 'You have slain a ghoul knight priest!'), 'spawn starter: your kill or anyone\'s, that mob only');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
