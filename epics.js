// SEQO - Epic quest preparation tracker data for EverQuest Legends.
//
// Item names, quantities and sources follow the community checklist
// "Epic Items To Keep" by Manlaan on eqlwiki.com
// (https://eqlwiki.com/User:Manlaan/Epic_Items_To_Keep) — please support
// the wiki and its editors. Entries the checklist marks unverified carry
// u: true (shown as ⚠ in the app). The wiki also hosts per-class
// "<Class> Epic Quest" pages for the full walkthroughs.
//
// items[]: n = exact in-game item name · q = quantity (default 1)
//          src = where it comes from · u = unverified on the wiki

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLEpics = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const EPICS = {
    'Bard': {
      epic: 'Singing Short Sword',
      items: [
        { n: 'White Dragon Scales', src: 'Lady Vox (raid), Permafrost' },
        { n: 'Amygdalan Tendril', src: 'Amygdalan warrior, Plane of Fear' },
        { n: 'Red Dragon Scales', src: "Lord Nagafen (raid), Nagafen's Lair" },
        { n: 'Kedge Backbone', src: 'Phinigel Autropos (raid), Kedge Keep', u: true },
        { n: 'Onyx Drake Gut', src: 'Blackwing, Rathe Mountains', u: true },
        { n: 'Alluring Horn', src: 'Quag Maelstrom, Ocean of Tears', u: true }
      ],
      notes: ''
    },
    'Beastlord': {
      epic: 'Epic Quest',
      items: [],
      notes: 'The wiki has no Beastlord epic page yet — nothing confirmed to pre-farm.'
    },
    'Berserker': {
      epic: 'Epic Quest',
      items: [
        { n: 'Gnashing Kobold Paw', src: 'Gnashing Kobold, Stonebrunt Mountains', u: true },
        { n: 'Skunk Scent Gland', src: 'a skunk, Toxxulia Forest' }
      ],
      notes: ''
    },
    'Cleric': {
      epic: 'Water Sprinkler of Nem Ankh',
      items: [
        { n: "Lord Bergurgle's Crown", src: 'Lord Bergurgle, Lake Rathetear' },
        { n: "Lord Gimblox's Signet Ring", src: "Lord Gimblox, Solusek's Eye" }
      ],
      notes: ''
    },
    'Druid': {
      epic: "Nature Walker's Scimitar",
      items: [
        { n: 'Clean Lakewater', src: 'Tainted Aquagoblin / Corrupted Shaman, Lake Rathetear' },
        { n: 'Chunk of Tundra', src: 'tainted/corrupted wooly mammoth, Everfrost', u: true },
        { n: 'Ancient Rock', src: 'tainted/corrupted hill giant, Rathe Mountains' },
        { n: 'Kedge Cave Crystals', src: 'tainted/Corrupted Seahorse, Kedge Keep' },
        { n: 'Ocean of Tears Seavines', src: 'Tainted/Corrupted seafury cyclops, Ocean of Tears', u: true },
        { n: 'Green Heartwood Branch', src: 'Brownie Scouts / Corrupted brownie, Lesser Faydark', u: true },
        { n: 'Chilled Tundra Root', src: 'foraged in Everfrost', u: true },
        { n: 'Ripened Heartfruit', src: 'foraged in Greater Faydark' },
        { n: 'Speckled Molded Mushroom', src: 'foraged in Innothule Swamp' },
        { n: 'Sweetened Mudroot', src: 'foraged in Misty Thicket', u: true }
      ],
      notes: 'Cleansed Spirit of Antonica / of Faydwer chains.'
    },
    'Enchanter': {
      epic: 'Staff of the Serpent',
      items: [
        { n: 'Shining Metallic Robes', src: 'The ghoul arch magi, Lower Guk' },
        { n: 'Spoon', src: 'Cazel, Oasis', u: true },
        { n: 'Charm and Sacrifice', src: 'Plane of Sky ground pickup (+1300, +560)' },
        { n: 'Head of the Serpent', src: 'Wraith of a Shissir, Plane of Fear', u: true },
        { n: 'Essence of a Vampire', src: 'a forsaken revenant, Plane of Hate' }
      ],
      notes: ''
    },
    'Magician': {
      epic: 'Orb of Mastery',
      items: [
        { n: 'Torn Page of Magi`kot pg. 1', src: 'enraged dread wolf, Kithicor Forest' },
        { n: 'Torn Page of Magi`kot pg. 2', src: 'tentacle terror, Estate of Unrest', u: true },
        { n: 'Torn Page of Magi`kot pg. 3', src: 'bloodthirsty ghoul, Lower Guk' },
        { n: 'Torn Page of Mastery Earth', src: 'Najena / Temple of Cazic-Thule', u: true },
        { n: 'Torn Page of Mastery Fire', src: 'Najena / Temple of Cazic-Thule', u: true },
        { n: 'Torn Page of Mastery Water', src: 'Najena / Temple of Cazic-Thule', u: true },
        { n: 'Torn Page of Mastery Wind', src: 'Najena / Temple of Cazic-Thule', u: true },
        { n: 'Power of Wind', src: 'gypsy dancer, Mistmoore' },
        { n: 'Power of Earth', src: 'Fairy Guard, Lesser Faydark' },
        { n: 'Power of Fire', src: "Lava/Blazing elemental, Solusek's Eye", u: true },
        { n: 'Blazing Wand', src: 'Undertow, Kedge Keep', u: true },
        { n: 'Staff of Elemental Mastery: Earth', src: 'Magi P`Tasa (raid), Plane of Hate' },
        { n: 'Staff of Elemental Mastery: Water', src: 'Phinigel Autropos (raid), Kedge Keep' },
        { n: 'Crown of Elemental Mastery', src: 'Plane of Sky, Island 7' },
        { n: 'Elemental Binder', src: 'elementals, The Hole' },
        { n: 'Pegasus Feather Cloak', src: 'Quillmane, South Karana', u: true }
      ],
      notes: 'Words of Magi`kot / Words of Mastery chains.'
    },
    'Monk': {
      epic: 'Celestial Fists',
      items: [
        { n: 'Gnoll Pup Scalp', q: 4, src: 'gnoll pups (various zones)' },
        { n: 'Putrid Rib Bone', q: 3, src: 'putrid skeleton, Qeynos Hills' },
        { n: 'Blackburrow Gnoll Pelt', q: 2, src: 'gnolls, Blackburrow' },
        { n: 'Blackburrow Gnoll Skin', src: 'gnolls, Blackburrow' },
        { n: "Dareb's Skull", src: 'High Shaman Phido, Southern Karana' },
        { n: 'Head of Shen', src: 'High Shaman Grisok, Southern Karana' },
        { n: 'Head of Ghanex Drah', src: 'Ghanex Drah, Southern Karana' },
        { n: 'Skull of Jhen`Tra', src: 'gnoll embalmer, Lake Rathetear' },
        { n: 'Dagger of Marnek', src: 'thaumaturgist, Befallen' },
        { n: "Zaharn's Coronet", src: 'High Priest Zaharn, Permafrost' },
        { n: 'Code of Zan Fi', src: "Targin the Rock, Nagafen's Lair" },
        { n: 'The Idol', src: 'Raster of Guk, Lower Guk' },
        { n: 'Deathfist Pawn Scalp', q: 2, src: 'deathfist pawn, West Freeport' },
        { n: 'Snake Fang', src: 'snakes (various)' },
        { n: 'Bone Chips', src: 'skeletons (various)' },
        { n: 'Deathfist Slashed Belt', src: 'Orc Centurion, East Commons' },
        { n: 'Giant Snake Rattle', src: 'darkweed snake, East Commons' },
        { n: 'Desert Tarantula Chitin', src: 'desert tarantula, North Ro' },
        { n: "Legionnaire's Bracer", src: 'orc legionnaire, Crushbone' },
        { n: 'Greater Lightstone', src: 'willowisps (various)' },
        { n: 'Cutthroat Insignia Ring', src: 'Dervish Cutthroat, North Ro' },
        { n: 'Blackened Sapphire', src: 'Ekeros, Najena' },
        { n: 'Blackened Wand', src: 'Priest Amiaz, Befallen' },
        { n: 'Shadow Silk', src: 'crafted (Tailoring 36)' },
        { n: 'Robe of the Lost Circle', src: 'crafted (no-fail) / Whistling Fists chain' }
      ],
      notes: 'Monks of the Whistling Fist + headband + sash chains — the longest prep list.'
    },
    'Necromancer': {
      epic: 'Scythe of the Shadowed Soul',
      items: [
        { n: 'Flowing Black Robe', src: 'Najena (the NPC), Najena' },
        { n: 'Head of Sir Edwin Motte', src: 'Sir Edwin Motte, Qeynos Hills' },
        { n: 'Eye of Innoruuk', src: 'Dread/Fright/Terror (raid), Plane of Fear' },
        { n: 'Slime Blood of Cazic Thule', src: 'Dread/Fright/Terror (raid), Plane of Fear' },
        { n: 'Silver Disc', src: 'Plane of Sky, Island 2' },
        { n: 'Spiroc Feathers', src: 'Plane of Sky, Island 3' },
        { n: 'Black Silk Cape', src: 'Keeper of Souls, Plane of Sky' }
      ],
      notes: ''
    },
    'Paladin': {
      epic: 'Fiery Defender',
      items: [
        { n: 'Ghoulbane', src: 'The froglok shin lord, Upper Guk' },
        { n: 'A Spider Venom Sac', src: 'spiders (various zones)' },
        { n: 'Glowing Sword Hilt', src: 'Xicotl, Mistmoore' },
        { n: 'Testimony of Truth', src: "Sir Lucan D'Lere, East Freeport" },
        { n: 'Torn, burnt book', src: "Lord Nagafen (raid), Nagafen's Lair" },
        { n: 'Torn, Frost covered book', src: 'Lady Vox (raid), Permafrost' },
        { n: "Drom's Champagne", q: 4, src: 'purchased' },
        { n: 'Bog Juice', src: 'crafted (Brewing 21)' },
        { n: 'Edible Goo', src: 'crafted (Baking 21)' }
      ],
      notes: 'SoulFire (Zimel’s Blades) → Fiery Avenger → Fiery Defender chain.'
    },
    'Ranger': {
      epic: 'Earthcaller & Swiftwind',
      items: [
        { n: 'Swirling Sphere of Color', src: 'An Essence Tamer, Plane of Sky' },
        { n: 'Shattered Emerald of Corruption', src: 'mini bosses, Plane of Hate' },
        { n: 'Ripened Heartfruit', src: 'foraged in Greater Faydark', u: true },
        { n: 'Speckled Molded Mushroom', src: 'foraged in Innothule Swamp' },
        { n: 'Sweetened Mudroot', src: 'foraged in Misty Thicket', u: true }
      ],
      notes: ''
    },
    'Rogue': {
      epic: 'Ragebringer',
      items: [
        { n: 'Robe of the Kedge', src: 'Phinigel Autropos (raid), Kedge Keep' },
        { n: 'Shining Metallic Robes', src: 'The ghoul arch magi, Lower Guk' },
        { n: 'Mithril Two-Handed Sword', src: 'The froglok king, Lower Guk' },
        { n: 'Fleshripper', src: "Solusek kobold king, Nagafen's Lair" },
        { n: 'Painbringer', src: "Kobold champion, Nagafen's Lair" },
        { n: 'Robe of the Ishva', src: 'The Ishva Mal, Splitpaw' },
        { n: 'Robe of the Oracle', src: 'Oracle of K`Arnon, Ocean of Tears' },
        { n: 'Gigantic Zweihander', src: 'Karg Icebear, Everfrost Peaks' },
        { n: 'Stained Parchment Top', src: 'pickpocket Founy Jestands, North Kaladim', u: true },
        { n: 'Stained Parchment Bottom', src: 'pickpocket Tani N`Mar, Neriak Third Gate', u: true },
        { n: 'Book of Souls', src: 'Plane of Hate ground pickup (-60, +325)' }
      ],
      notes: ''
    },
    'Shadow Knight': {
      epic: "Innoruuk's Curse",
      items: [
        { n: 'Decayed Chainmail', src: 'A Lizard Crusader / ritualist, Temple of Cazic-Thule' },
        { n: 'Decayed Breastplate', src: 'A Lizard Crusader / ritualist, Temple of Cazic-Thule' },
        { n: 'Decayed Left Legplate', src: 'A Lizard Crusader / ritualist, Temple of Cazic-Thule' },
        { n: 'Decayed Right Legplate', src: 'A Lizard Crusader / ritualist, Temple of Cazic-Thule' },
        { n: 'Decayed Helm', src: 'A Lizard Crusader / ritualist, Temple of Cazic-Thule' },
        { n: 'Decayed Visor', src: 'A Lizard Crusader / ritualist, Temple of Cazic-Thule' },
        { n: 'Damaged Militia Helm', q: 2, src: 'Freeport guards' },
        { n: 'Enchanted Platinum Bar', q: 2, src: 'bought + enchanted' },
        { n: 'Melatite', q: 2, src: 'bought' },
        { n: 'Ghoulbane', src: 'The froglok shin lord, Upper Guk' },
        { n: 'Soul Leech, Dark Sword of Blood', src: 'Cazic Thule (raid), Plane of Fear' },
        { n: 'Blade of Abrogation', src: 'Plane of Sky' },
        { n: 'Drake Spine', src: 'Rharzar, Rathe Mountains', u: true },
        { n: 'Decrepit Hide', src: 'an ashenbone drake, Plane of Hate' },
        { n: 'Cell Key', src: 'A mimic, The Hole', u: true }
      ],
      notes: 'Decayed pieces feed the Darkforge Armor Quests (Breastplate/Greaves/Helm rewards).'
    },
    'Shaman': {
      epic: 'Spear of Fate',
      items: [
        { n: 'Envy', src: 'Glaron the Wicked, Rathe Mountains', u: true },
        { n: 'Woe', src: 'Glaron the Wicked, Rathe Mountains', u: true },
        { n: "Marr's Promise", src: 'Tabien the Goodly, Rathe Mountains', u: true },
        { n: 'Black Dire Pelt', src: 'Black Dire, Mistmoore (trigger mob not currently up)', u: true }
      ],
      notes: ''
    },
    'Warrior': {
      epic: 'Jagged Blade of War',
      items: [
        { n: 'Unjeweled Dragon Head Hilt', src: 'ground pickup, Lake Rathetear' },
        { n: 'Ball of Everliving Golem', src: 'Fright/Dread/Terror (raid), Plane of Fear' },
        { n: 'Block of Permafrost', src: 'An Ice Giant, Permafrost' },
        { n: 'Red Dragon Scales', src: "Lord Nagafen (raid), Nagafen's Lair" },
        { n: 'Spiroc Wingblade', src: 'Spiroc Lord, Plane of Sky' },
        { n: 'Heart of Frost', src: 'A goblin wizard, Permafrost' },
        { n: 'Hand of the Maestro', src: 'Maestro, Plane of Hate' }
      ],
      notes: ''
    },
    'Wizard': {
      epic: 'Staff of the Four',
      items: [
        { n: 'Blue Crystal Staff', src: 'Phinigel Autropos (raid), Kedge Keep — wiki notes it does not currently drop', u: true }
      ],
      notes: ''
    }
  };

  const CREDIT = {
    by: "Manlaan's 'Epic Items To Keep' — eqlwiki.com",
    url: 'https://eqlwiki.com/User:Manlaan/Epic_Items_To_Keep',
    note: "epic prep checklist courtesy of Manlaan on eqlwiki.com — please support the wiki's editors"
  };

  return { EPICS, CREDIT };
});
