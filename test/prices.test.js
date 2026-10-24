// node test/prices.test.js — WTS/WTB price parsing (real EQ Legends General chat) + store
const P = require('../prices.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const off = (t) => P.parseOffers(t).map(o => o.side + ':' + o.item + '=' + o.pp + (o.qty > 1 ? 'x' + o.qty : '')).join(' | ');
const eq = (t, want) => { const got = off(t); ok(got === want, t + '\n   got:  ' + got + '\n   want: ' + want); };
eq('WTS Blood Fire +4 2k', 'sell:Blood Fire +4=2000');
eq('WTS Gem of Invigoration // Golden Hilt 2k Each', 'sell:Gem of Invigoration=2000 | sell:Golden Hilt=2000');
eq('wts White Dragonscale Cloak 4k, Mithril Champion Arrows +5 4k, dragon cloak jewelry set 2k',
   'sell:White Dragonscale Cloak=4000 | sell:Mithril Champion Arrows +5=4000 | sell:dragon cloak jewelry set=2000');
eq('WTS Verishe Mal Greataxe +10 12k Enchanted Fine Steel Rapier +10 4k', 'sell:Verishe Mal Greataxe +10=12000 | sell:Enchanted Fine Steel Rapier +10=4000');
eq('wts Slime Blood of Cazic-Thule +4 4k Black Sapphire Electrum Earring 1500', 'sell:Slime Blood of Cazic-Thule +4=4000 | sell:Black Sapphire Electrum Earring=1500');
eq('WTS Fleeting Quiver - 15k or 2x HQ Lion Skin', 'sell:Fleeting Quiver=15000');
eq('WTS Bone Chips x1000 - 15k', 'sell:Bone Chips=15x1000');
eq('WTS Black Alloy Medallion +3 9k', 'sell:Black Alloy Medallion +3=9000');
eq('wts Platinum Diamond Wedding Ring + Black Sapphire Platinum Necklace for vox cape quest, 2500pp', '');   // bundle, no per-item price
eq('WTS Bladestopper +2', '');                                                   // no price
eq('anyone selling a windstriker?', '');
eq('WTB Fleeting Quiver 10k, WTS Blood Fire +6 10k', 'buy:Fleeting Quiver=10000 | sell:Blood Fire +6=10000');
eq('WTS Mithril Champion Arrows 1k (can provide +7) - Jewelry for Dragonscale Cloak 2k pst =)', 'sell:Mithril Champion Arrows=1000 | sell:Jewelry for Dragonscale Cloak=2000');
eq('WTS Gold Plated Koshigatana +4 3k', 'sell:Gold Plated Koshigatana +4=3000');
eq('WTS 2.5k Smoldering Brand +4', '');                                          // price first, item after: ambiguous, skipped
eq('WTS White Dragonscale Cloak jewelry set (plat diamond wedding ring, black sapphire necklace) 2k for both (1k a', 'sell:White Dragonscale Cloak jewelry set=2000');
eq('WTB HQ Lion Skins paying 5k each', 'buy:HQ Lion Skins=5000');
eq('WTS Gem of Invigorationx2 6k', 'sell:Gem of Invigoration=3000x2');
// every way people say it
eq('Selling Blood Fire +4 2k', 'sell:Blood Fire +4=2000');
eq('selling my Fleeting Quiver for 15k', 'sell:Fleeting Quiver=15000');
eq('Sell Golden Hilt 2k', 'sell:Golden Hilt=2000');
eq('For sale: Slime Blood of Cazic-Thule +4 4k', 'sell:Slime Blood of Cazic-Thule +4=4000');
eq('FS Darkwood Trunk 2k', 'sell:Darkwood Trunk=2000');
eq("want to sell Ivandyr's Hoop 2k", "sell:Ivandyr's Hoop=2000");
eq('S> Blood Fire +6 10k', 'sell:Blood Fire +6=10000');
eq('Buying HQ Lion Skin 5k each', 'buy:HQ Lion Skin=5000');
eq('want to buy Fleeting Quiver 10k', 'buy:Fleeting Quiver=10000');
eq('B> Golden Hilt 1.5k', 'buy:Golden Hilt=1500');
eq('anyone selling a Fleeting Quiver?', '');
eq('where can I buy a Fleeting Quiver?', '');
eq('LFG Nektropos need 2 more', '');
eq('But at least I am not the clown trying to sell that shield for 95k', '');
eq('LF gather to mistmore will offer 100 plat', '');
eq('sell me a fleetingquiver for 10k', '');
eq('the quest is too hard. Buy one for 50k', '');
eq('Leynor, sell the axe at the vendor its worth 190 plat', '');
eq('looking to buy reaper of the dead paying 10k', 'buy:reaper of the dead=10000');
eq('yeah let me buy the cloak for 50k pp so i can have my 6 second cast levitate', '');
eq('WTS 1 Fleeting Quiver 18k', 'sell:Fleeting Quiver=18000');
eq('WTS one more Fleeting Quiver 20k', 'sell:Fleeting Quiver=20000');
eq('WTS 3 Golden Hilts 6k', 'sell:Golden Hilts=2000x3');
// store
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seqop'));
const st = P.createStore({ dir: () => dir });
const now = Date.now(), H = 3600e3;
const L = (t, from, pp, side = 'sell') => ({ t, from, side, item: 'Blood Fire +4', key: 'blood fire +4', pp, qty: 1 });
ok(st.add([L(now - 1 * H, 'A', 2000), L(now - 2 * H, 'A', 2000), L(now - 3 * H, 'B', 3000), L(now - 30 * H, 'C', 4000), L(now - 9 * 24 * H, 'D', 9000), L(now - H, 'E', 1500, 'buy')]) === 5, 'same seller+price within 6h counted once');
const day = st.query({ days: 1 })[0], week = st.query({ days: 7 })[0], all = st.query({})[0];
ok(day.n === 2 && day.avg === 2500 && day.low === 2000 && day.high === 3000 && day.sellers === 2, 'last day');
ok(week.n === 3 && week.median === 3000, 'last week');
ok(all.n === 4 && all.high === 9000, 'all time');
const d = st.detail('blood fire +4', 7);
ok(d.sell.n === 3 && d.buy && d.buy.avg === 1500 && d.recent.length === 4, 'detail with buy side');
ok(st.query({ q: 'fire' }).length === 1 && st.query({ q: 'quiver' }).length === 0, 'search');
st.flush();
ok(P.createStore({ dir: () => dir }).count() === 5, 'reloads from disk');
st.add([{ t: now - H, from: 'Z', side: 'sell', item: 'Blood Fires +4', key: 'blood fire +4s', pp: 2200, qty: 1 }, { t: now - H, from: 'Y', side: 'sell', item: 'Golden Hilts', key: 'golden hilts', pp: 900, qty: 1 }]);
ok(st.query({ q: 'golden' })[0].key === 'golden hilts', 'a plural alone stays');
st.add([{ t: now - H, from: 'X', side: 'sell', item: 'Golden Hilt', key: 'golden hilt', pp: 1000, qty: 1 }]);
ok(st.query({ q: 'golden' }).length === 1 && st.query({ q: 'golden' })[0].n === 2, 'plural folds into the singular');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
