// SEQO - Plane of Sky quest database
// Quest data compiled from eqlegendstools.com/plane-of-sky-quests/ (with thanks).
// Every quest: turn the listed items + one Wind Rune in to the class NPC.
// Wind Runes drop from trash mobs throughout the plane.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLPosQuests = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const EFREETI = 'Isle eight - the Hand of Veeshan; Isle four - Overseer of Air; Isle 1.5 - Noble Dojorn';
  const RUNE_LOC = 'Trash mobs (anywhere in the plane)';

  // [class, npc, reward, [[item, location], ...], windRune]
  const Q = [
    // ---- Bard - Cilin Spellsinger ----
    ['Bard', 'Cilin Spellsinger', 'Amulet of the Fae', [['Amulet of Woven Hair', 'Isle six - Bazzt Zzzt']], 'Caza'],
    ['Bard', 'Cilin Spellsinger', "Denon's Horn of Disaster", [['Efreeti War Horn', EFREETI], ['Glowing Diamond', 'Isle seven - Sister of the Spire']], 'Fana'],
    ['Bard', 'Cilin Spellsinger', "Ervaj's Flute of Flight", [['Crude Wooden Flute', 'Isle five - The Spiroc Lord']], 'Azia'],
    ['Bard', 'Cilin Spellsinger', 'Mantle of the Songweaver', [['Light Woolen Mantle', 'Isle four - Keeper of Souls']], 'Kala'],
    ['Bard', 'Cilin Spellsinger', 'Mask of Song', [['Light Woolen Mask', 'Isle three - Gorgalosk']], 'Meda'],
    ['Bard', 'Cilin Spellsinger', 'Spear of Harmony', [['Efreeti War Spear', EFREETI], ['Nebulous Diamond', 'Isle eight - Eye of Veeshan']], 'Heda'],
    // ---- Beastlord - Animist Kratho ----
    ['Beastlord', 'Animist Kratho', 'Azarack Skin Wristwraps', [['Azarack Skin', 'Isle two - Protector of Sky']], 'Heda'],
    ['Beastlord', 'Animist Kratho', 'Diaphonous Waistband', [['Silken Wrap', 'Isle six - Bazzt Zzzt']], 'Geza'],
    ['Beastlord', 'Animist Kratho', 'Griffin-Hide Armguards', [['Leather Cord', 'Isle three - Gorgalosk']], 'Kala'],
    ['Beastlord', 'Animist Kratho', 'Spiroc Beak Earcuff', [["Spiroc Elder's Totem", 'Isle five - The Spiroc Lord']], 'Beza'],
    ['Beastlord', 'Animist Kratho', 'Windhowl & Spirit Render', [['Brass Knuckles', EFREETI], ['Mithril Bands', 'Isle eight - Eye of Veeshan'], ['Sphinx Claw', 'Isle seven - Sister of the Spire']], 'Izah'],
    // ---- Berserker - Stragen The Hewer ----
    ['Berserker', 'Stragen The Hewer', 'Blood-Drawn Runes', [['Azarack Blood', 'Isle two - Protector of Sky']], 'Lena'],
    ['Berserker', 'Stragen The Hewer', 'Cudgel of the Fool', [['Efreeti Great Staff', 'Isle eight - Eye of Veeshan'], ["Jester's Mask", 'Isle four - Keeper of Souls']], 'Dena'],
    ['Berserker', 'Stragen The Hewer', 'Molten Coil', [['Pulsating Ruby', 'Isle six - Bazzt Zzzt']], 'Ena'],
    ['Berserker', 'Stragen The Hewer', 'Sash of Ferocity', [['High Quality Raiment', 'Isle five - The Spiroc Lord']], 'Ozah'],
    ['Berserker', 'Stragen The Hewer', 'Shroud of the Sky', [['Feathered Cape', 'Isle three - Gorgalosk']], 'Azia'],
    ['Berserker', 'Stragen The Hewer', 'Skycleaver', [['Efreeti Standard', EFREETI], ['Djinni War Blade', 'Isle seven - Sister of the Spire']], 'Jaka'],
    // ---- Cleric - Josin Faithbringer ----
    ['Cleric', 'Josin Faithbringer', 'Aegis of the Wind', [['Small Shield', 'Isle four - Keeper of Souls']], 'Meda'],
    ['Cleric', 'Josin Faithbringer', 'Baton of the Sky', [['Efreeti Standard', EFREETI], ['Mithril Bands', 'Isle eight - Eye of Veeshan']], 'Ena'],
    ['Cleric', 'Josin Faithbringer', 'Necklace of Resolution', [['Silvered Spiroc Necklace', 'Isle six - Bazzt Zzzt']], 'Neza'],
    ['Cleric', 'Josin Faithbringer', 'Pauldrons of Piety', [['Shiny Pauldrons', 'Isle five - The Spiroc Lord']], 'Caza'],
    ['Cleric', 'Josin Faithbringer', "Theurgist's Star", [['Djinni Aura', 'Isle seven - Sister of the Spire'], ['Efreeti Mace', EFREETI]], 'Kala'],
    ['Cleric', 'Josin Faithbringer', 'Truewind Earring', [['Silver Hoop', 'Isle three - Gorgalosk']], 'Lena'],
    // ---- Druid - Strandar Pinemist ----
    ['Druid', 'Strandar Pinemist', 'Drake-Hide Mask', [['Worn Leather Mask', 'Isle three - Gorgalosk']], 'Meda'],
    ['Druid', 'Strandar Pinemist', 'Espri', [['Efreeti Scimitar', EFREETI], ['Storm Sky Opal', 'Isle eight - Eye of Veeshan']], 'Izah'],
    ['Druid', 'Strandar Pinemist', 'Honeycomb Belt', [['Divine Honeycomb', 'Isle six - Bazzt Zzzt']], 'Dena'],
    ['Druid', 'Strandar Pinemist', "Nature Walker's Mantle", [['Mantle of Woven Grass', 'Isle four - Keeper of Souls']], 'Kala'],
    ['Druid', 'Strandar Pinemist', 'Shillelagh', [['Spiroc Battle Staff', 'Isle five - The Spiroc Lord'], ['Efreeti Statuette', EFREETI]], 'Azia'],
    ['Druid', 'Strandar Pinemist', 'Spiroc Banisher Focus', [['Ethereal Ruby', 'Isle seven - Sister of the Spire'], ["Spiroc Elder's Totem", 'Isle five - The Spiroc Lord']], 'Ena'],
    // ---- Enchanter - Enchanter Jolas ----
    ['Enchanter', 'Enchanter Jolas', 'Earring of Displacement', [['Adamantium Earring', 'Isle six - Bazzt Zzzt']], 'Caza'],
    ['Enchanter', 'Enchanter Jolas', 'Ivory Mask', [['Silken Mask', 'Isle five - The Spiroc Lord']], 'Beza'],
    ['Enchanter', 'Enchanter Jolas', 'Necklace of Whispering Winds', [['Glowing Necklace', 'Isle seven - Sister of the Spire']], 'Fana'],
    ['Enchanter', 'Enchanter Jolas', 'Rod of the Protecting Winds', [['Efreeti Wind Staff', EFREETI], ['Large Sky Sapphire', 'Isle eight - Eye of Veeshan']], 'Izah'],
    ['Enchanter', 'Enchanter Jolas', 'Sphinx Hair Cord', [['Finely Woven Cloth Cord', 'Isle three - Gorgalosk']], 'Meda'],
    ['Enchanter', 'Enchanter Jolas', "Wind Walker's Mantle", [['Light Cloth Mantle', 'Isle four - Keeper of Souls']], 'Ozah'],
    // ---- Magician - Magus Frinon ----
    ['Magician', 'Magus Frinon', 'Bracelet of Clarification', [['Feathered Cape', 'Isle three - Gorgalosk']], 'Lena'],
    ['Magician', 'Magus Frinon', 'Drake-Hide Amice', [['Large Diamond', 'Isle six - Bazzt Zzzt']], 'Dena'],
    ['Magician', 'Magus Frinon', 'Duennan Shielding Ring', [['Golden Efreeti Ring', 'Isle seven - Sister of the Spire']], 'Ena'],
    ['Magician', 'Magus Frinon', 'Gold White Pendant', [['Golden Coffer', 'Isle five - The Spiroc Lord']], 'Azia'],
    ['Magician', 'Magus Frinon', 'Mask of Empowerment', [['Ceramic Mask', 'Isle four - Keeper of Souls']], 'Neza'],
    ['Magician', 'Magus Frinon', 'Staff of Elemental Mastery: Air', [['Crown of Elemental Mastery', 'Isle seven - Sphinx, Drakes, Undine Spirits'], ['Djinni Stave', 'Isle seven - Sister of the Spire'], ['Large Opal', 'Isle eight - Eye of Veeshan']], 'Heda'],
    ['Magician', 'Magus Frinon', 'Staff of the Magister', [['Efreeti Magi Staff', EFREETI], ['Hazy Opal', 'Isle eight - Eye of Veeshan']], 'Jaka'],
    // ---- Monk - Holwin ----
    ['Monk', 'Holwin', 'Back Straps of Mastery', [['Silken Strands', 'Isle three - Gorgalosk']], 'Caza'],
    ['Monk', 'Holwin', 'Golden Sash of Tranquility', [['Tear of Quellious', 'Isle eight - Eye of Veeshan']], 'Lena'],
    ['Monk', 'Holwin', 'Sandals of Alacrity', [['Dove Slippers', 'Isle five - The Spiroc Lord']], 'Jaka'],
    ['Monk', 'Holwin', "Ton Po's Eye Patch", [['Cracked Leather Eyepatch', 'Isle four - Keeper of Souls']], 'Geza'],
    ['Monk', 'Holwin', "Ton Po's Shoulder Wraps", [['Silken Wrap', 'Isle six - Bazzt Zzzt']], 'Beza'],
    ['Monk', 'Holwin', "Wu's Fist of Mastery", [['Brass Knuckles', EFREETI], ['Nebulous Sapphire', 'Isle seven - Sister of the Spire']], 'Neza'],
    // ---- Necromancer - Drakis Bloodcaster ----
    ['Necromancer', 'Drakis Bloodcaster', 'Band of Wailing Winds', [['Ring of Veeshan', 'Isle seven - Sister of the Spire']], 'Caza'],
    ['Necromancer', 'Drakis Bloodcaster', 'Bloodsoaked Raiment', [['Fine Cloth Raiment', 'Isle five - The Spiroc Lord']], 'Ozah'],
    ['Necromancer', 'Drakis Bloodcaster', 'Bloody Griffon-Hide Wrist Guard', [["Griffon's Beak", 'Isle three - Gorgalosk']], 'Lena'],
    ['Necromancer', 'Drakis Bloodcaster', 'Cloak of Spiroc Feathers', [['Black Silk Cape', 'Isle four - Keeper of Souls']], 'Neza'],
    ['Necromancer', 'Drakis Bloodcaster', 'Gorgon Head Staff', [['Efreeti Great Staff', 'Isle eight - Eye of Veeshan'], ['Gorgon Head', 'Isle three - Gorgalosk']], 'Fana'],
    ['Necromancer', 'Drakis Bloodcaster', 'Sphinx Heart Amulet', [['Pulsating Ruby', 'Isle six - Bazzt Zzzt']], 'Azia'],
    // ---- Paladin - Dason Goldblade ----
    ['Paladin', 'Dason Goldblade', 'Aldryn, Blade of the Ocean', [['Bixie Sword Blade', 'Isle six - Bazzt Zzzt']], 'Ozah'],
    ['Paladin', 'Dason Goldblade', 'Girdle of Faith', [['Ivory Sky Diamond', 'Isle five - The Spiroc Lord']], 'Lena'],
    ['Paladin', 'Dason Goldblade', 'Thelvorn, Blade of Light', [['Golden Hilt', 'Isle seven - Sphinx, Drakes, Undine Spirits'], ['Sphinx Claw', 'Isle seven - Sister of the Spire']], 'Geza'],
    ['Paladin', 'Dason Goldblade', 'Truvinan', [['Efreeti Zweihander', EFREETI], ['Large Sky Diamond', 'Isle eight - Eye of Veeshan']], 'Izah'],
    // ---- Ranger - Ranger Spirit ----
    ['Ranger', 'Ranger Spirit', 'Arydryidriyorn', [['Efreeti Long Sword', EFREETI], ['Circlet of Brambles', 'Isle seven - Sister of the Spire']], 'Ena'],
    ['Ranger', 'Ranger Spirit', 'Dark Cloak of the Sky', [['Fine Velvet Cloak', 'Isle four - Keeper of Souls']], 'Neza'],
    ['Ranger', 'Ranger Spirit', "Earthshaker's Mantle", [['Spiroc Earth Totem', 'Isle five - The Spiroc Lord']], 'Kala'],
    ['Ranger', 'Ranger Spirit', 'Griffon Talon Necklace', [['Griffon Talon', 'Isle three - Gorgalosk']], 'Meda'],
    ['Ranger', 'Ranger Spirit', 'Thunderforged Earring', [['White Gold Earring', 'Isle six - Bazzt Zzzt']], 'Azia'],
    ['Ranger', 'Ranger Spirit', 'Windstriker', [['Efreeti War Bow', EFREETI], ['Shimmering Pearl', 'Isle eight - Eye of Veeshan']], 'Heda'],
    // ---- Rogue - Thalik Silenthand ----
    ['Rogue', 'Thalik Silenthand', 'Crystal Mask', [["Jester's Mask", 'Isle four - Keeper of Souls']], 'Dena'],
    ['Rogue', 'Thalik Silenthand', 'Griffon Wing Spaulders', [['Spiroc Sky Totem', 'Isle five - The Spiroc Lord']], 'Ena'],
    ['Rogue', 'Thalik Silenthand', "Renard's Belt of Quickness", [['Sphinxian Circlet', 'Isle seven - Sister of the Spire']], 'Izah'],
    ['Rogue', 'Thalik Silenthand', 'Shimmering Bracer of Protection', [['Fine Wool Cloak', 'Isle six - Bazzt Zzzt']], 'Geza'],
    ['Rogue', 'Thalik Silenthand', 'Thornstinger', [['Bixie Stinger', 'Isle six - Bazzt Zzzt'], ['Bloodsky Sapphire', 'Isle eight - Eye of Veeshan']], 'Jaka'],
    ['Rogue', 'Thalik Silenthand', 'Wispy Choker of Vigor', [['Inlaid Choker', 'Isle three - Gorgalosk']], 'Ozah'],
    // ---- Shadow Knight - Sarkis Ebonblade ----
    ['Shadow Knight', 'Sarkis Ebonblade', 'Amulet of the Sphinx Eye', [['Finely Crafted Amulet', 'Isle three - Gorgalosk']], 'Ozah'],
    ['Shadow Knight', 'Sarkis Ebonblade', 'Blood Sky Face Plate', [['Rusted Pauldrons', 'Isle six - Bazzt Zzzt']], 'Fana'],
    ['Shadow Knight', 'Sarkis Ebonblade', 'Crimson Ring of the Djinni', [['Silvery Ring', 'Isle four - Keeper of Souls']], 'Beza'],
    ['Shadow Knight', 'Sarkis Ebonblade', 'Khyldorn the Blood Drinker', [['Blood Sky Ruby', 'Isle eight - Eye of Veeshan'], ['Efreeti War Axe', EFREETI]], 'Kala'],
    ['Shadow Knight', 'Sarkis Ebonblade', 'Obtenebrate Mithril Guard', [['Efreeti War Shield', EFREETI]], 'Heda'],
    ['Shadow Knight', 'Sarkis Ebonblade', 'Pearlescent Pauldrons', [['Fae Pauldrons', 'Isle eight - Eye of Veeshan'], ['Sphinxian Ring', 'Isle seven - Sister of the Spire']], 'Izah'],
    ['Shadow Knight', 'Sarkis Ebonblade', 'Pegasus-Hide Belt', [['Finely Woven Cloth Belt', 'Isle five - The Spiroc Lord']], 'Dena'],
    // ---- Shaman - Medicine Man Veetra ----
    ['Shaman', 'Medicine Man Veetra', 'Amulet of the Fang', [['Leather Cord', 'Isle three - Gorgalosk']], 'Meda'],
    ['Shaman', 'Medicine Man Veetra', 'Bracelet of the Spirits', [['Ceremonial Belt', 'Isle five - The Spiroc Lord']], 'Kala'],
    ['Shaman', 'Medicine Man Veetra', 'Fairy-Hide Mantle', [['Light Damask Mantle', 'Isle five - The Spiroc Lord']], 'Beza'],
    ['Shaman', 'Medicine Man Veetra', 'Garduk', [['Efreeti War Maul', EFREETI], ['Symbol of Veeshan', 'Isle eight - Eye of Veeshan']], 'Geza'],
    ['Shaman', 'Medicine Man Veetra', 'Vermilion Sky Ring', [['Bixie Essence', 'Isle six - bees'], ["Spiritualist's Ring", 'Isle seven - Sister of the Spire']], 'Heda'],
    ['Shaman', 'Medicine Man Veetra', 'Warhammer of the Wind', [['Corrosive Venom', 'Isle six - Bazzt Zzzt'], ['Efreeti War Club', EFREETI]], 'Ena'],
    // ---- Warrior - Torgon Blademaster ----
    ['Warrior', 'Torgon Blademaster', 'Azure Ruby Ring', [['Azure Ring', 'Isle three - Gorgalosk']], 'Neza'],
    ['Warrior', 'Torgon Blademaster', 'Belt of the Four Winds', [['Efreeti Belt', EFREETI], ['Wind Tablet', 'Isle six - Bazzt Zzzt']], 'Fana'],
    ['Warrior', 'Torgon Blademaster', 'Dagas', [['Djinni War Blade', 'Isle seven - Sister of the Spire'], ['Gem of Invigoration', 'Isle seven - Sphinx, Drakes, Undine Spirits']], 'Jaka'],
    ['Warrior', 'Torgon Blademaster', 'Fangol', [['Efreeti Battle Axe', EFREETI], ['Ethereal Emerald', 'Isle eight - Eye of Veeshan']], 'Dena'],
    ['Warrior', 'Torgon Blademaster', 'Pauldrons of the Blue Sky', [['Spiroc Air Totem', 'Isle five - The Spiroc Lord']], 'Beza'],
    ['Warrior', 'Torgon Blademaster', 'Runed Wind Amulet', [['Stone Amulet', 'Isle four - Keeper of Souls']], 'Azia'],
    // ---- Wizard - Wizard Schrock ----
    ['Wizard', 'Wizard Schrock', "Al`Kabor's Cap of Binding", [['Woven Skull Cap', 'Isle four - Keeper of Souls']], 'Fana'],
    ['Wizard', 'Wizard Schrock', 'Amulet of the Void', [['Amethyst Amulet', 'Isle seven - Sister of the Spire']], 'Jaka'],
    ['Wizard', 'Wizard Schrock', "Augmentor's Mask", [['Grey Damask Cloak', 'Isle three - Gorgalosk']], 'Dena'],
    ['Wizard', 'Wizard Schrock', "Nargon's Staff", [['Efreeti War Staff', EFREETI], ['Large Sky Lapis', 'Isle eight - Eye of Veeshan']], 'Caza'],
    ['Wizard', 'Wizard Schrock', 'Raiment of Thunder', [['High Quality Raiment', 'Isle five - The Spiroc Lord']], 'Geza'],
    ['Wizard', 'Wizard Schrock', 'Solidate Mithril Ring', [['Box of Winds', 'Isle six - Bazzt Zzzt'], ['Efreeti Statuette', EFREETI]], 'Izah'],
  ];

  const quests = Q.map(([cls, npc, reward, items, rune]) => ({
    cls, npc, reward,
    items: items.concat([['Wind Rune ' + rune, RUNE_LOC]])
      .map(([name, loc]) => ({ name, loc })),
    rune
  }));

  const classes = [...new Set(quests.map(q => q.cls))].sort();
  const runes = [...new Set(quests.map(q => q.rune))].sort();

  // isle tag for filtering: "Isle six - Bazzt Zzzt" -> "six"
  const isleOf = (loc) => {
    const m = /^Isle ([\w.]+)/i.exec(loc);
    return m ? m[1].toLowerCase() : null;
  };

  return { quests, classes, runes, isleOf };
});
