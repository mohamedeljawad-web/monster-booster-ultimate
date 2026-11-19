// ===================================================================
//  MONSTER BOOSTER ULTIMATE — jeu de cartes en ligne (serveur Node + page du jeu)
//  Lancer : node monster-booster-ultimate.js   (aucune dépendance à installer)
//  Sauvegarde : Upstash Redis si UPSTASH_REDIS_REST_URL / _TOKEN sont
//  réglées, sinon fichier local monster-booster-ultimate-data.json
// ===================================================================
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

// ===================== DONNÉES DU JEU MONSTER BOOSTER ULTIMATE =====================
// Toutes les créatures sont ORIGINALES (noms et dessins inventés).

const RARITIES = [
  { id: 'commun', n: 'Commun', c: '#9aa3ad', w: 50 },
  { id: 'peucommun', n: 'Peu commun', c: '#5fbf6a', w: 25 },
  { id: 'rare', n: 'Rare', c: '#3d8bff', w: 12 },
  { id: 'tresrare', n: 'Très rare', c: '#2bd1d9', w: 6 },
  { id: 'epique', n: 'Épique', c: '#a259ff', w: 3.5 },
  { id: 'mythique', n: 'Mythique', c: '#ff4fa3', w: 1.8 },
  { id: 'legendaire', n: 'Légendaire', c: '#ff9a1f', w: 0.9 },
  { id: 'divin', n: 'Divin', c: '#fff3a8', w: 0.4 },
  { id: 'chromatique', n: 'Chromatique', c: 'rainbow', w: 0.2 },
  { id: 'or', n: 'Or', c: '#ffd700', w: 0.1 },
  { id: 'diamant', n: 'Diamant', c: '#b9f2ff', w: 0.05 },
  { id: 'demon', n: 'Démon', c: '#c1121f', w: 0.025 },
  { id: 'angel', n: 'Angel', c: '#fffdf0', w: 0.012 },
  { id: 'univers', n: 'Univers', c: '#4b2bff', w: 0.006 },
  { id: 'god', n: 'God', c: '#ffffff', w: 0.003 },
  { id: 'exclusif', n: 'Exclusif', c: '#ff00ea', w: 0 },
];
const EXCLUSIVE_CHANCE = 0.000001; // 0,0001 %
const EXCLUSIVE_MAX = 3; // joueurs normaux

const TYPES = {
  feu: { n: 'Feu', c: '#ff5a1f', i: '🔥' },
  eau: { n: 'Eau', c: '#1f8bff', i: '💧' },
  terre: { n: 'Terre', c: '#9b6a35', i: '🪨' },
  vol: { n: 'Vol', c: '#8fd3ff', i: '🪶' },
  psy: { n: 'Psy', c: '#d14bff', i: '🔮' },
  ombre: { n: 'Ombre', c: '#5b3a8c', i: '🌑' },
  dragon: { n: 'Dragon', c: '#2fb36b', i: '🐉' },
  metal: { n: 'Métal', c: '#a7b4c2', i: '⚙️' },
  normal: { n: 'Normal', c: '#d8c9a3', i: '⭐' },
};
// faible contre le type suivant, résiste au type précédent
const CYCLE = ['feu', 'eau', 'terre', 'vol', 'psy', 'ombre', 'dragon', 'metal'];
function weakOf(t) { if (t === 'normal') return 'psy'; return CYCLE[(CYCLE.indexOf(t) + 1) % 8]; }
function resistOf(t) { if (t === 'normal') return null; return CYCLE[(CYCLE.indexOf(t) + 7) % 8]; }

const ATK_NAMES = {
  feu: ['Flammèche', 'Souffle Ardent', 'Brasier', 'Lave Fusion', 'Éruption', 'Poing Braise', 'Tornade de Feu', 'Météore Ardent'],
  eau: ['Bulle', 'Jet d\'Eau', 'Vague Folle', 'Hydro-Canon', 'Raz-de-Marée', 'Pluie Douce', 'Tourbillon', 'Geyser'],
  terre: ['Jet de Sable', 'Coup de Roc', 'Avalanche', 'Séisme', 'Poing Granite', 'Faille', 'Glissement', 'Colonne de Pierre'],
  vol: ['Picpic', 'Rafale', 'Bourrasque', 'Piqué Céleste', 'Lame d\'Air', 'Cyclone', 'Plume Tranchante', 'Ouragan'],
  psy: ['Choc Mental', 'Onde Psy', 'Hypnose', 'Rayon Prisme', 'Psycho-Lame', 'Illusion', 'Tempête Astrale', 'Esprit Brisé'],
  ombre: ['Griffe Sombre', 'Murmure', 'Toxine Noire', 'Voile d\'Ombre', 'Morsure Nocturne', 'Néant', 'Cauchemar', 'Éclipse'],
  dragon: ['Griffe Dragon', 'Souffle Draconique', 'Queue Fléau', 'Colère du Dragon', 'Rugissement', 'Charge Écaille', 'Comète Draco', 'Furie Ancienne'],
  metal: ['Coup d\'Acier', 'Engrenage', 'Laser Chrome', 'Marteau Titane', 'Aimant', 'Lame d\'Acier', 'Canon Rivet', 'Blindage'],
  normal: ['Charge', 'Coup de Patte', 'Plaquage', 'Ruade', 'Cri Perçant', 'Coup de Boule', 'Câlin Écrasant', 'Pirouette'],
};
// effet de la 2e attaque selon le type
const TYPE_EFFECT = { feu: 'burn', eau: 'heal', terre: 'coin', vol: 'bench', psy: 'paralyze', ombre: 'poison', dragon: 'recoil', metal: 'shield', normal: 'draw' };
const EFFECT_TXT = {
  burn: 'Brûle l\'adversaire (20 dégâts par tour).',
  heal: 'Soigne 30 PV à ce monstre.',
  coin: 'Pile ou face : si face, +40 dégâts.',
  bench: 'Fait 20 dégâts à chaque monstre de banc adverse.',
  paralyze: 'Pile ou face : si face, l\'adversaire est paralysé.',
  poison: 'Empoisonne l\'adversaire (10 dégâts par tour).',
  recoil: 'Ce monstre se fait 20 dégâts.',
  shield: 'Bouclier : -30 dégâts reçus au prochain tour.',
  draw: 'Pioche 2 cartes.',
  energy: 'Ajoute 1 énergie à ce monstre.',
  heal_all: 'Soigne 50 PV à tous tes monstres.',
  nuke: 'Fait 50 dégâts à chaque monstre de banc adverse.',
};

// lignes d'évolution : [stade 0, stade 1, stade 2]
const LINES = {
  feu: [['Flammiche', 'Brasillon', 'Infernoxe'], ['Tisonnet', 'Cendrak', 'Volcarion'], ['Pyrouette', 'Pyrodanse', 'Pyrémire'], ['Braisot', 'Brasorc', 'Fournaigre'], ['Étincelou', 'Fulgaflam', 'Solarax'], ['Chaudrille', 'Magmadil', 'Calderos']],
  eau: [['Gouttin', 'Ondulin', 'Torrentis'], ['Bullot', 'Bulléon', 'Abyssor'], ['Vaguinou', 'Ressacor', 'Tsunamiar'], ['Coquilou', 'Nacrevin', 'Perlarque'], ['Mousseline', 'Écumark', 'Marémoth'], ['Plouffi', 'Rivièrex', 'Cascadrion']],
  terre: [['Cailloutin', 'Rocaille', 'Montagrok'], ['Glaisot', 'Argilor', 'Terracolosse'], ['Sablin', 'Dunerak', 'Désertitan'], ['Racinou', 'Souchemor', 'Sylvaterre'], ['Gravillon', 'Éboulix', 'Séismeroc'], ['Taupinet', 'Fouissor', 'Galeriox']],
  vol: [['Plumet', 'Rafalon', 'Ouragrif'], ['Piafou', 'Ventorin', 'Zéphyrax'], ['Hirondi', 'Cirrhus', 'Stratorage'], ['Plumelle', 'Alavent', 'Célestaile'], ['Moustik', 'Bourdonix', 'Tornadard'], ['Nuageot', 'Cumulor', 'Tempestor']],
  psy: [['Psylou', 'Méditor', 'Cogitarque'], ['Rêvelin', 'Songeor', 'Hypnorax'], ['Prismou', 'Prismage', 'Kaléidor'], ['Auranet', 'Auralis', 'Astralynx'], ['Pendulin', 'Hypnopend', 'Chronopsy'], ['Lunatik', 'Lunaris', 'Séléniax']],
  ombre: [['Ombrelin', 'Ténébrix', 'Nocturnax'], ['Spectrou', 'Fantomar', 'Spectrallum'], ['Sombrot', 'Obscurok', 'Néantor'], ['Chuchotin', 'Murmurex', 'Mutisombre'], ['Crépuscou', 'Brumombre', 'Éclipsard'], ['Nuitou', 'Minuitar', 'Abîmenuit']],
  dragon: [['Drakelin', 'Drakonis', 'Draconarque'], ['Écaillot', 'Écailleur', 'Squamarex'], ['Wyvernot', 'Wyvrak', 'Wyvernoth'], ['Serpentin', 'Serpendra', 'Serpenthrone'], ['Griffaillon', 'Griffdrak', 'Griffaltar'], ['Ailedrac', 'Draquila', 'Draguémire']],
  metal: [['Boulonnet', 'Ferrailleur', 'Titanacier'], ['Rouagin', 'Engrenor', 'Mécanaute'], ['Aimantin', 'Magnetor', 'Polarion'], ['Chromi', 'Chromatel', 'Chromefort'], ['Lamelle', 'Lamier', 'Lamesacre'], ['Blindou', 'Blindor', 'Bastionix']],
  normal: [['Pelotin', 'Pelochon', 'Pelomax'], ['Ronronet', 'Ronrax', 'Ronrotitan'], ['Couinou', 'Couinard', 'Couimégas']],
};
// rareté par (ligne, stade) : index dans RARITIES
const LINE_RAR = [[0, 2, 4], [0, 2, 5], [1, 3, 5], [1, 3, 6], [0, 3, 4], [1, 2, 6]];

// cartes spéciales (de base, très fortes)
const SPECIALS = [
  ['divin', 'feu', 'Séraphlamme'], ['divin', 'eau', 'Divaguone'], ['divin', 'terre', 'Gaïarque'], ['divin', 'vol', 'Sainteplume'],
  ['chromatique', 'dragon', 'Prismagon'], ['chromatique', 'eau', 'Iriscale'], ['chromatique', 'psy', 'Chromalis'],
  ['or', 'dragon', 'Aurodrak'], ['or', 'metal', 'Lingotor'], ['or', 'terre', 'Midascarab'],
  ['diamant', 'psy', 'Diamanthe'], ['diamant', 'terre', 'Cristalgor'], ['diamant', 'metal', 'Adamantis'],
  ['demon', 'feu', 'Belzébraise'], ['demon', 'ombre', 'Malombre'], ['demon', 'ombre', 'Infernyx'],
  ['angel', 'vol', 'Angélyre'], ['angel', 'eau', 'Archangivre'], ['angel', 'psy', 'Luminaëlle'],
  ['univers', 'dragon', 'Cosmodrak'], ['univers', 'psy', 'Nébulor'], ['univers', 'vol', 'Galaxion'],
  ['god', 'psy', 'Omnithéos'], ['god', 'dragon', 'Primordrak'], ['god', 'normal', 'Créathor'],
];
const EXCLUSIVES = [
  ['normal', 'Lanecorne Galactique', 'Ruade Stellaire', 'Corne de l\'Infini'], ['dragon', 'Zokutitan', 'Griffe Zénith', 'Règne du Titan'], ['psy', 'Éternyx', 'Boucle Éternelle', 'Temps Figé'],
  ['vol', 'Zénithar', 'Vent Absolu', 'Chute des Cieux'], ['dragon', 'Infinidrak', 'Souffle Infini', 'Big Bang'], ['ombre', 'Absolum', 'Ombre Totale', 'Néant Absolu'],
  ['psy', 'Paradoxis', 'Paradoxe', 'Réalité Brisée'], ['metal', 'Singularion', 'Noyau Dense', 'Singularité'], ['feu', 'Apocalypsar', 'Flamme Finale', 'Apocalypse'], ['eau', 'Genèsis', 'Source Primordiale', 'Déluge Originel'],
];
// cartes d'event (seulement pendant l'event)
const EVENT_THEMES = {
  hiver: { n: 'Hiver Glacé', i: '❄️', c: '#bfe9ff', cards: [['eau', 'Flocounet', 2], ['eau', 'Givrelune', 4], ['vol', 'Blizzardor', 6], ['metal', 'Glaciarque', 8]] },
  halloween: { n: 'Nuit des Citrouilles', i: '🎃', c: '#ff8a00', cards: [['feu', 'Citrouillard', 2], ['ombre', 'Squelettin', 4], ['psy', 'Sorcielle', 6], ['ombre', 'Hantecrâne', 11]] },
  ete: { n: 'Plage Solaire', i: '🏖️', c: '#ffd34d', cards: [['feu', 'Solairette', 2], ['eau', 'Crabouillon', 4], ['terre', 'Palmistrel', 6], ['feu', 'Soleilmax', 9]] },
  galaxie: { n: 'Pluie d\'Étoiles', i: '🌠', c: '#7a5cff', cards: [['psy', 'Étoilou', 3], ['vol', 'Comètaile', 5], ['dragon', 'Astéraptor', 7], ['psy', 'Supernovæ', 13]] },
};
// boss
const BOSSES = {
  titan: { n: 'Titan des Abysses', t: 'eau', hp: 30000, dmg: 90, drop: 'boss_titan', dropName: 'Éclat du Titan', dropR: 7 },
  roidemon: { n: 'Roi Démon Vorgath', t: 'ombre', hp: 60000, dmg: 120, drop: 'boss_roidemon', dropName: 'Vorgathin', dropR: 11 },
  primordial: { n: 'Dragon Primordial', t: 'dragon', hp: 100000, dmg: 150, drop: 'boss_primordial', dropName: 'Œuf Primordial', dropR: 13 },
  colosse: { n: 'Colosse de Rouille', t: 'metal', hp: 20000, dmg: 70, drop: 'boss_colosse', dropName: 'Boulon Royal', dropR: 6 },
};

function r10(x) { return Math.max(10, Math.round(x / 10) * 10); }
function slug(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function makeCard(o) {
  // o: {id,name,type,r,stage,from,special,exclusive,event,boss}
  const h = hashStr(o.name);
  const names = ATK_NAMES[o.type];
  const a1n = names[h % names.length];
  let a2n = names[(h >>> 4) % names.length]; if (a2n === a1n) a2n = names[(h % names.length + 3) % names.length];
  const r = o.r, s = o.stage || 0;
  let hp, d1, d2, c1, c2, eff2 = TYPE_EFFECT[o.type], eff1 = null;
  if (o.exclusive) { hp = 500; d1 = 120; d2 = 300; c1 = 1; c2 = 2; eff1 = 'energy'; eff2 = 'nuke'; o.an = o.an || ['Pouvoir Interdit', 'Fin des Mondes']; }
  else if (r >= 7) { // spéciales
    const k = r - 7;
    hp = r10(130 + k * 25); d1 = r10(40 + k * 12); d2 = r10(100 + k * 25); c1 = 1; c2 = k >= 6 ? 2 : 3;
    if (k >= 4) eff1 = 'energy';
    if (r === 12) eff2 = 'heal_all';
  } else {
    hp = r10(40 + s * 35 + r * 10); d1 = r10(10 + r * 4 + s * 10); d2 = r10(30 + s * 30 + r * 8); c1 = 1; c2 = Math.min(3, 2 + s);
  }
  return {
    id: o.id, name: o.name, type: o.type, r, stage: s, from: o.from || null,
    hp, retreat: o.exclusive ? 0 : Math.min(3, s + (r >= 7 ? 1 : 0)),
    weak: weakOf(o.type), resist: resistOf(o.type),
    atk: [{ n: o.an ? o.an[0] : a1n, c: c1, d: d1, e: eff1 }, { n: o.an ? o.an[1] : a2n, c: c2, d: d2, e: eff2 }],
    special: !!o.special, exclusive: !!o.exclusive, event: o.event || null, boss: !!o.boss,
  };
}

function buildCards() {
  const cards = {}; let num = 1;
  const add = (o) => { const c = makeCard(o); c.num = num++; cards[c.id] = c; return c; };
  for (const t of Object.keys(LINES)) {
    LINES[t].forEach((line, li) => {
      let prev = null;
      line.forEach((nm, s) => {
        const rr = LINE_RAR[li % LINE_RAR.length][s];
        const c = add({ id: slug(nm), name: nm, type: t, r: rr, stage: s, from: prev });
        prev = c.id;
      });
    });
  }
  for (const [rid, t, nm] of SPECIALS) add({ id: slug(nm), name: nm, type: t, r: RARITIES.findIndex(x => x.id === rid), special: true });
  for (const [t, nm, a1, a2] of EXCLUSIVES) add({ id: slug(nm), name: nm, type: t, r: 15, exclusive: true, an: [a1, a2] });
  for (const ek of Object.keys(EVENT_THEMES)) for (const [t, nm, rr] of EVENT_THEMES[ek].cards) add({ id: slug(nm), name: nm, type: t, r: rr, special: rr >= 7, event: ek });
  for (const bk of Object.keys(BOSSES)) { const b = BOSSES[bk]; add({ id: b.drop, name: b.dropName, type: b.t, r: b.dropR, special: b.dropR >= 7, event: 'boss' }); }
  return cards;
}
const CARDS = buildCards();

// carte "boss" (utilisée seulement en combat)
function bossCard(key, hp) {
  const b = BOSSES[key];
  return { id: 'BOSS_' + key, name: b.n, type: b.t, r: 14, stage: 2, hp, retreat: 9, weak: null, resist: null,
    atk: [{ n: 'Frappe Titanesque', c: 0, d: b.dmg, e: null }, { n: 'Cataclysme', c: 0, d: Math.round(b.dmg * 0.6), e: 'bench' }], boss: true };
}

// DECKS (boutique)
const DECKS = [
  { id: 'base', n: 'Deck de Base', price: 20000, pool: 'all', guar: 2 },
  { id: 'terre', n: 'Deck Terre', price: 35000, pool: 'terre', guar: 4 },
  { id: 'eau', n: 'Deck Eau', price: 50000, pool: 'eau', guar: 4 },
  { id: 'feu', n: 'Deck Feu', price: 75000, pool: 'feu', guar: 4 },
  { id: 'psy', n: 'Deck Psy', price: 110000, pool: 'psy', guar: 4 },
  { id: 'ombre', n: 'Deck Ombre', price: 160000, pool: 'ombre', guar: 5 },
  { id: 'dragon', n: 'Deck Dragon', price: 250000, pool: 'dragon', guar: 5 },
  { id: 'vol', n: 'Deck Vol', price: 400000, pool: 'vol', guar: 5 },
  { id: 'metal', n: 'Deck Métal', price: 650000, pool: 'metal', guar: 6 },
  { id: 'chromatique', n: 'Deck Chromatique', price: 1000000, pool: 'all', guar: 8, gold: true },
  { id: 'diamond', n: 'Deck Diamond', price: 3000000, pool: 'all', guar: 10, gold: true },
  { id: 'demon', n: 'Deck Démon', price: 8000000, pool: 'all', guar: 11, gold: true },
  { id: 'angel', n: 'Deck Angel', price: 25000000, pool: 'all', guar: 12, gold: true },
  { id: 'god', n: 'Deck God', price: 100000000, pool: 'all', guar: 14, gold: true },
];
const STAFF_DECK = { id: 'galactique', n: 'Deck Galactique (staff)', price: 0, staff: true };
const DECK_SIZE = 20;
const STARTER = ['flammiche', 'flammiche', 'tisonnet', 'brasillon', 'gouttin', 'gouttin', 'bullot', 'ondulin', 'cailloutin', 'cailloutin', 'glaisot', 'rocaille', 'plumet', 'plumet', 'piafou', 'rafalon', 'pelotin', 'pelotin', 'ronronet', 'pelochon'];
const TRAINING = ['pelotin', 'pelotin', 'pelotin', 'ronronet', 'ronronet', 'ronronet', 'couinou', 'couinou', 'couinou', 'pelochon', 'ronrax', 'couinard'];

// NIVEAUX
const RANKS = ['Bronze', 'Argent', 'Or', 'Diamant', 'Mythique', 'Démons', 'Anges', 'Univers', 'God'];
const RANK_ICONS = ['🥉', '🥈', '🥇', '💎', '🔱', '😈', '😇', '🌌', '👁️'];
function xpNeed(level) { // XP pour passer de level à level+1
  if (level < 100) return Math.round(80 * Math.pow(level + 1, 1.6) + 100);
  const k = level - 100; // rangs 0..8
  return Math.round(250000 * Math.pow(2.2, k));
}
const MAX_LEVEL = 109; // 100 + 9 rangs (109 = God)
function levelName(level, staff) {
  if (staff) return '🌠 GALACTIQUE';
  if (level <= 100) return 'Niveau ' + level;
  return RANK_ICONS[level - 101] + ' ' + RANKS[level - 101];
}



const PAGE = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no\">\n<title>Monster Booster Ultimate — le jeu de cartes</title>\n<style>\n:root{--bg:#0d0b1a;--bg2:#17142b;--bg3:#221d3d;--line:#352d5c;--tx:#efeaff;--mut:#9d94c4;--acc:#ffb703;--acc2:#7b5cff;--good:#3ddc84;--bad:#ff4d6d}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\nhtml,body{margin:0;height:100%;background:radial-gradient(1200px 700px at 70% -10%,#2a1f5c 0,var(--bg) 60%);color:var(--tx);font-family:\"Trebuchet MS\",\"Segoe UI\",system-ui,sans-serif;overflow:hidden}\nbutton{font:inherit;color:inherit;cursor:pointer;border:0;border-radius:12px;padding:10px 16px;background:var(--bg3);border:1px solid var(--line);transition:transform .1s,filter .15s}\nbutton:hover{filter:brightness(1.2)}button:active{transform:scale(.96)}button:disabled{opacity:.4;cursor:not-allowed;filter:none;transform:none}\nbutton.pri{background:linear-gradient(180deg,#ffcf4a,#f59e0b);color:#2a1600;border:0;font-weight:800}\nbutton.vio{background:linear-gradient(180deg,#9a7dff,#6a45f5);border:0;font-weight:700}\nbutton.red{background:linear-gradient(180deg,#ff6b81,#e0284f);border:0;font-weight:700}\nbutton.grn{background:linear-gradient(180deg,#4ff0a0,#16a864);color:#002a14;border:0;font-weight:800}\nbutton.sm{padding:6px 10px;font-size:13px;border-radius:9px}\ninput,select{font:inherit;color:var(--tx);background:#0f0c20;border:1px solid var(--line);border-radius:10px;padding:10px 12px;outline:none}\ninput:focus,select:focus{border-color:var(--acc2)}\nh1,h2,h3{margin:0 0 10px}\n.mut{color:var(--mut)}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.col{display:flex;flex-direction:column;gap:10px}\n.panel{background:linear-gradient(180deg,#1c1836,#151229);border:1px solid var(--line);border-radius:18px;padding:16px}\n.hide{display:none!important}\n#app{height:100%;display:flex;flex-direction:column}\n/* barre du haut */\n#top{display:flex;align-items:center;gap:12px;padding:8px 14px;background:rgba(10,8,22,.85);border-bottom:1px solid var(--line);backdrop-filter:blur(6px);z-index:5}\n.logo{font-weight:900;font-size:18px;white-space:nowrap;letter-spacing:1px;background:linear-gradient(90deg,#ffb703,#ff4fa3,#7b5cff,#2bd1d9);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 #0008)}\n#nav{display:flex;gap:4px;margin-left:10px;flex:1;overflow-x:auto}\n#nav button{background:transparent;border:0;padding:8px 12px;border-radius:10px;white-space:nowrap;color:var(--mut);font-weight:700}\n#nav button.on{background:var(--bg3);color:var(--tx);box-shadow:inset 0 -3px 0 var(--acc)}\n.chip{background:var(--bg3);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-weight:800;white-space:nowrap}\n.lvl{display:flex;flex-direction:column;min-width:130px}\n.xpbar{height:7px;background:#0007;border-radius:9px;overflow:hidden;margin-top:3px}.xpbar>i{display:block;height:100%;background:linear-gradient(90deg,#7b5cff,#2bd1d9)}\n#main{flex:1;overflow:auto;padding:16px;position:relative}\n.page{max-width:1250px;margin:0 auto}\n@media(max-width:820px){#nav{position:fixed;bottom:0;left:0;right:0;margin:0;background:#0b0918f2;border-top:1px solid var(--line);padding:6px;justify-content:space-around;z-index:20}#nav button{font-size:12px;padding:8px 6px}#main{padding-bottom:80px}.lvl{min-width:90px}.logo{font-size:15px}}\n/* cartes */\n.card{--w:190px;width:var(--w);height:calc(var(--w)*1.4);border-radius:calc(var(--w)*.06);position:relative;flex:none;padding:calc(var(--w)*.035);background:var(--rc);box-shadow:0 6px 18px #0009;font-size:calc(var(--w)*.058);cursor:pointer;user-select:none;transition:transform .15s}\n.card:hover{transform:translateY(-3px)}\n.card .in{height:100%;border-radius:calc(var(--w)*.04);background:linear-gradient(170deg,var(--tc2),#14102a 85%);display:flex;flex-direction:column;overflow:hidden;position:relative}\n.card .hd{display:flex;justify-content:space-between;align-items:center;padding:3% 5% 1%;font-weight:900;gap:4px}\n.card .hd .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px #000}\n.card .hd .hp{white-space:nowrap;color:#ffdede;font-size:.92em}\n.card .art{margin:0 5%;height:42%;border-radius:6px;overflow:hidden;border:2px solid #ffffff40;background:#000}\n.card .art svg{width:100%;height:100%;display:block}\n.card .st{font-size:.7em;color:#ffffffb0;padding:1% 6%;display:flex;justify-content:space-between}\n.card .ak{padding:0 5%;display:flex;flex-direction:column;gap:2px;flex:1}\n.card .a{display:flex;align-items:center;gap:4px;font-weight:800;font-size:.9em;line-height:1.1}\n.card .a .en{display:flex;gap:1px}.card .a .en i{width:.8em;height:.8em;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,var(--tc) 60%);display:inline-block;border:1px solid #0006}\n.card .a .d{margin-left:auto;font-size:1.05em}\n.card .fx{font-size:.62em;color:#d7d0f5;font-weight:400;margin:-1px 0 1px}\n.card .ft{display:flex;justify-content:space-between;font-size:.62em;padding:2% 5%;background:#0005;color:#ddd}\n.card .rb{position:absolute;bottom:.6%;left:50%;transform:translate(-50%,0);font-size:.58em;font-weight:900;letter-spacing:.5px;text-transform:uppercase;white-space:nowrap;padding:0 6px;border-radius:6px;background:#000a;color:var(--rcc)}\n.card .cnt{position:absolute;top:-8px;right:-8px;background:var(--acc);color:#2a1600;font-weight:900;border-radius:999px;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px #000a;z-index:2}\n.card.no{filter:grayscale(1) brightness(.35)}\n.card.mini{--w:110px}.card.tiny{--w:84px}\n.card.mini .fx,.card.tiny .fx,.card.tiny .st,.card.tiny .ft{display:none}\n.card.big{--w:300px}\n/* raretés */\n.r0{--rc:#9aa3ad;--rcc:#cfd5db}.r1{--rc:#5fbf6a;--rcc:#9af0a5}.r2{--rc:#3d8bff;--rcc:#8fc0ff}.r3{--rc:#2bd1d9;--rcc:#9ff5f9}.r4{--rc:#a259ff;--rcc:#d2b0ff}.r5{--rc:#ff4fa3;--rcc:#ffa6d1}.r6{--rc:linear-gradient(135deg,#ff9a1f,#ffcf6b,#ff7a00);--rcc:#ffc46b}\n.r7{--rc:linear-gradient(135deg,#fffbe0,#ffe98a,#fff8d0);--rcc:#fff3a8;box-shadow:0 0 18px #fff3a888}\n.r8{--rc:linear-gradient(90deg,red,orange,yellow,lime,cyan,blue,violet,red);--rcc:#fff;background-size:300% 100%!important;animation:rb 4s linear infinite}\n.r9{--rc:linear-gradient(135deg,#b8860b,#ffd700,#fff3a0,#ffd700,#b8860b);--rcc:#ffd700;box-shadow:0 0 18px #ffd70088}\n.r10{--rc:linear-gradient(135deg,#e0fbff,#7fdcff,#fff,#9ee8ff);--rcc:#b9f2ff;box-shadow:0 0 20px #b9f2ffaa}\n.r11{--rc:linear-gradient(135deg,#2b0000,#c1121f,#ff3b3b,#2b0000);--rcc:#ff5a5a;box-shadow:0 0 22px #ff000099;animation:flick 2.5s infinite}\n.r12{--rc:linear-gradient(135deg,#fff,#fffbe8,#ffe9a8,#fff);--rcc:#fff;box-shadow:0 0 28px #fffbe0cc}\n.r13{--rc:linear-gradient(135deg,#0a0030,#4b2bff,#c06bff,#0a0030);--rcc:#c9b8ff;box-shadow:0 0 26px #6b4bffcc}\n.r14{--rc:linear-gradient(135deg,#fff,#ffd700,#fff,#ffe680,#fff);--rcc:#fff;box-shadow:0 0 36px #fff,0 0 60px #ffd70099;background-size:200% 200%!important;animation:rb 3s linear infinite}\n.r15{--rc:conic-gradient(from 0deg,#ff00ea,#00e5ff,#7bff00,#ffea00,#ff00ea);--rcc:#fff;box-shadow:0 0 30px #ff00ea,0 0 60px #00e5ff88;animation:hue 3s linear infinite}\n.card[class*=\" r\"]{background:var(--rc)}\n@keyframes rb{to{background-position:300% 0}}@keyframes hue{to{filter:hue-rotate(360deg)}}@keyframes flick{50%{box-shadow:0 0 34px #ff0000cc}}\n.shine::after{content:\"\";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(115deg,transparent 30%,#ffffff55 45%,transparent 60%);background-size:250% 100%;animation:shine 3s infinite;pointer-events:none}\n@keyframes shine{from{background-position:150% 0}to{background-position:-100% 0}}\n.grid{display:flex;flex-wrap:wrap;gap:16px;justify-content:center}\n/* modale */\n#modal{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}\n#modal .box{max-width:min(720px,96vw);max-height:92vh;overflow:auto}\n#toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:80;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}\n#toast div{background:#1e1940f2;border:1px solid var(--line);padding:10px 16px;border-radius:12px;font-weight:700;box-shadow:0 6px 20px #000a;animation:pop .25s}\n#toast div.err{border-color:var(--bad);color:#ffc2cc}\n@keyframes pop{from{transform:scale(.8);opacity:0}}\n/* login */\n#login{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:40;padding:16px}\n#login .panel{width:min(420px,100%)}\n.bigcode{font-size:40px;font-weight:900;letter-spacing:8px;color:var(--acc);text-align:center;font-family:monospace}\n/* bannières */\n.banner{border-radius:16px;padding:14px 16px;border:1px solid var(--line);display:flex;gap:14px;align-items:center;flex-wrap:wrap}\n.hpbar{height:16px;background:#0008;border-radius:9px;overflow:hidden;flex:1;min-width:160px;border:1px solid #fff2}.hpbar>i{display:block;height:100%;background:linear-gradient(90deg,#ff2d55,#ff9a1f)}\n/* boutique */\n.deckbox{width:220px;border-radius:18px;padding:14px;background:linear-gradient(170deg,var(--dc),#14102a 75%);border:2px solid #ffffff20;display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;position:relative}\n.deckbox.gold{border:3px solid #ffd700;box-shadow:0 0 22px #ffd70066}\n.deckbox .pk{width:120px;height:150px;border-radius:14px;background:var(--dc);display:flex;align-items:center;justify-content:center;font-size:56px;box-shadow:inset 0 0 0 4px #ffffff30,0 8px 18px #000a;position:relative;overflow:hidden}\n.deckbox .price{font-weight:900;color:var(--acc);font-size:18px}\n/* ouverture */\n#opening{position:fixed;inset:0;background:radial-gradient(circle,#2a1f5c,#05040c);z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:10px}\n#opening .stage{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:1100px;max-height:70vh;overflow:auto;padding:10px}\n.flip{animation:flipin .5s both}\n@keyframes flipin{from{transform:rotateY(90deg) scale(.6);opacity:0}}\n.bigreveal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:70;background:#000c;flex-direction:column;gap:14px}\n.bigreveal .card{animation:flipin .7s both}\n/* combat */\n#battle{position:fixed;inset:0;z-index:30;background:radial-gradient(900px 500px at 50% 50%,#1d3a2a,#0b1410 70%);display:flex;flex-direction:column}\n#battle.boss{background:radial-gradient(900px 500px at 50% 30%,#4a0d1a,#0b0508 70%)}\n.bf{flex:1;display:grid;grid-template-columns:1fr 260px;gap:8px;padding:8px;min-height:0}\n.field{display:flex;flex-direction:column;justify-content:space-around;gap:6px;min-height:0;position:relative}\n.side{display:flex;flex-direction:column;align-items:center;gap:6px}\n.benchrow{display:flex;gap:10px;justify-content:center;align-items:center;min-height:60px;flex-wrap:wrap}\n.prow{display:flex;gap:28px;align-items:center;justify-content:center;padding-bottom:26px}\n.field{overflow:auto}\n.pinfo{display:flex;gap:10px;align-items:center;justify-content:center;font-weight:800;font-size:14px}\n.prize{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid #fff6;margin-left:3px}.prize.on{background:var(--acc);border-color:var(--acc)}\n.mon{position:relative;border-radius:12px;transition:transform .2s}\n.mon.tgt{outline:3px dashed var(--acc);outline-offset:3px;animation:pulse 1s infinite}\n@keyframes pulse{50%{outline-color:#fff}}\n.mon .bar{position:absolute;left:6%;right:6%;bottom:-9px;height:10px;background:#000a;border-radius:9px;overflow:hidden;border:1px solid #fff4;z-index:3}\n.mon .bar i{display:block;height:100%;background:linear-gradient(90deg,#3ddc84,#b6f36b);transition:width .4s}\n.mon .bar i.low{background:linear-gradient(90deg,#ff2d55,#ff9a1f)}\n.mon .hpt{position:absolute;bottom:-28px;left:0;right:0;text-align:center;font-weight:900;font-size:12px;text-shadow:0 1px 2px #000}\n.mon .pips{position:absolute;top:-10px;left:4px;display:flex;gap:2px;z-index:3}\n.mon .pips i{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#ffcc00 60%,#b37400);border:1px solid #000;box-shadow:0 0 6px #ffcc00}\n.mon .sts{position:absolute;top:-12px;right:2px;font-size:16px;z-index:3}\n.mon.hit{animation:hit .5s}\n@keyframes hit{20%{transform:translateX(-8px) rotate(-3deg);filter:brightness(2) saturate(0)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}}\n.dmgnum{position:absolute;left:50%;top:30%;transform:translateX(-50%);font-size:34px;font-weight:900;color:#ffdf3d;text-shadow:0 3px 0 #b30000,0 0 12px #000;animation:fly 1.2s forwards;z-index:9;pointer-events:none}\n@keyframes fly{to{transform:translate(-50%,-70px);opacity:0}}\n.hand{display:flex;gap:6px;overflow-x:auto;padding:12px 8px 6px;background:#0007;border-top:1px solid #fff2;min-height:140px;align-items:flex-end}\n.hand .card.sel{transform:translateY(-14px);box-shadow:0 0 0 3px var(--acc),0 10px 24px #000}\n.acts{display:flex;gap:6px;padding:6px 8px;background:#000a;flex-wrap:wrap;align-items:center;justify-content:center}\n.acts button{padding:8px 12px;font-size:14px}\n.atkbtn{display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;min-width:150px}\n.atkbtn small{font-weight:400;opacity:.85}\n.log{background:#0009;border-radius:12px;padding:8px;overflow:auto;font-size:13px;display:flex;flex-direction:column;gap:3px;border:1px solid #fff1}\n.log div{padding:2px 4px;border-radius:6px}.log .turn{color:var(--acc);font-weight:800;margin-top:4px}.log .atk{color:#ffd9a8}.log .ko{color:#ff8fa3;font-weight:800}.log .big{color:#fff;font-weight:900;background:#ffffff14}.log .good{color:#a6ffcf}.log .bad{color:#ff8fa3}\n.turnflag{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:clamp(28px,6vw,60px);font-weight:900;color:#fff;text-shadow:0 4px 0 #6a45f5,0 0 20px #000;pointer-events:none;animation:tf 1.3s forwards;z-index:9;white-space:nowrap}\n@keyframes tf{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}20%{transform:translate(-50%,-50%) scale(1.1);opacity:1}80%{opacity:1}100%{opacity:0}}\n.result{position:absolute;inset:0;background:#000c;display:flex;align-items:center;justify-content:center;z-index:20}\n@media(max-width:900px){.bf{grid-template-columns:1fr}.bf .log{max-height:90px;order:2}.card.mini{--w:86px}.card.tiny{--w:66px}.hand{min-height:120px}.atkbtn{min-width:120px}}\n.tabs2{display:flex;gap:6px;flex-wrap:wrap}.tabs2 button.on{background:var(--acc2);border-color:var(--acc2)}\ntable{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}\n.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#555;margin-right:6px}.dot.on{background:var(--good);box-shadow:0 0 6px var(--good)}\n.crown{filter:drop-shadow(0 0 4px gold)}\n.galact{background:linear-gradient(90deg,#ff00ea,#00e5ff,#ffea00,#ff00ea);background-size:300%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:rb 3s linear infinite;font-weight:900}\n.dl{display:flex;flex-direction:column;gap:4px;max-height:60vh;overflow:auto}\n.dl .it{display:flex;align-items:center;gap:8px;background:var(--bg3);border-radius:10px;padding:4px 8px}\n.dl .it .sw{width:12px;height:28px;border-radius:4px;background:var(--rc)}\n</style>\n</head>\n<body>\n<div id=\"login\" class=\"hide\">\n  <div class=\"panel col\">\n    <div style=\"text-align:center\"><div class=\"logo\" style=\"font-size:46px;text-align:center;line-height:1.05\">MONSTER<br>BOOSTER<br>ULTIMATE</div><div class=\"mut\">Le jeu de cartes de créatures</div></div>\n    <div id=\"cardsdemo\" class=\"row\" style=\"justify-content:center;gap:6px\"></div>\n    <input id=\"lname\" placeholder=\"Pseudo\" maxlength=\"16\" autocomplete=\"username\">\n    <input id=\"lpass\" placeholder=\"Mot de passe\" type=\"password\" autocomplete=\"current-password\">\n    <input id=\"lsecret\" class=\"hide\" placeholder=\"Code secret (compte réservé)\">\n    <div class=\"row\"><button class=\"pri\" style=\"flex:1\" onclick=\"doLogin()\">Connexion</button><button class=\"vio\" style=\"flex:1\" onclick=\"doRegister()\">Créer un compte</button></div>\n    <div id=\"lerr\" style=\"color:var(--bad);min-height:20px;font-weight:700\"></div>\n  </div>\n</div>\n<div id=\"app\" class=\"hide\">\n  <div id=\"top\">\n    <div class=\"logo\">MONSTER BOOSTER ULTIMATE</div>\n    <div id=\"nav\"></div>\n    <div class=\"chip\" id=\"credits\">💰 0</div>\n    <div class=\"lvl\"><div id=\"lvltxt\" style=\"font-weight:800;font-size:13px\"></div><div class=\"xpbar\"><i id=\"xpbar\"></i></div></div>\n    <div class=\"chip\" id=\"whoami\" style=\"cursor:pointer\" onclick=\"go('home')\"></div>\n  </div>\n  <div id=\"main\"><div class=\"page\" id=\"page\"></div></div>\n</div>\n<div id=\"battle\" class=\"hide\"></div>\n<div id=\"modal\" class=\"hide\" onclick=\"if(event.target===this)closeModal()\"><div class=\"box panel\" id=\"modalbox\"></div></div>\n<div id=\"opening\" class=\"hide\"></div>\n<div id=\"toast\"></div>\n<script>\n// ======================= OUTILS =======================\nlet TOKEN = null; try { TOKEN = localStorage.getItem('bu_token'); } catch (e) { }\nlet D = null, ME = null, STATE = null, PAGE_ID = 'home';\nconst $ = (s) => document.querySelector(s);\nconst esc = (s) => String(s == null ? '' : s).replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\nconst fmt = (n) => Math.round(n).toLocaleString('fr-FR');\nasync function api(name, q = {}) {\n  try {\n    const r = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: TOKEN }, q)) });\n    const j = await r.json(); if (j.logout) { logout(true); } return j;\n  } catch (e) { return { err: 'Connexion au serveur perdue…' }; }\n}\nfunction toast(msg, err) { const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err'; $('#toast').appendChild(d); setTimeout(() => d.remove(), 3500); }\nfunction blurAll() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }\ndocument.addEventListener('click', (e) => { if (e.target.closest('button')) setTimeout(blurAll, 0); });\nfunction openModal(html) { $('#modalbox').innerHTML = html; $('#modal').classList.remove('hide'); }\nfunction closeModal() { $('#modal').classList.add('hide'); }\nfunction timeLeft(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + 'j ' : '') + (d || h ? h + 'h ' : '') + m + 'min ' + (d ? '' : (s % 60) + 's'); }\n\n// ======================= DESSINS DES CRÉATURES (SVG originaux) =======================\nfunction hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }\nfunction prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }\nconst PAL = { feu: [12, 30], eau: [200, 225], terre: [25, 40], vol: [185, 205], psy: [280, 310], ombre: [255, 275], dragon: [130, 160], metal: [205, 220], normal: [35, 50] };\nconst ART_CACHE = {};\nfunction art(c) {\n  if (ART_CACHE[c.id]) return ART_CACHE[c.id];\n  const R = prng(hashStr(c.id + '#art')); const t = c.type, s = c.stage || 0, r = c.r;\n  const [h1, h2] = PAL[t] || [0, 360]; const hue = h1 + R() * (h2 - h1);\n  const sat = t === 'metal' ? 12 : t === 'ombre' ? 35 : 70, lig = t === 'ombre' ? 30 : t === 'metal' ? 62 : 55;\n  let body = `hsl(${hue},${sat}%,${lig}%)`, dark = `hsl(${hue},${sat}%,${lig - 22}%)`, light = `hsl(${hue},${sat}%,${Math.min(90, lig + 22)}%)`;\n  if (r === 9) { body = '#f5c518'; dark = '#a57800'; light = '#fff2a0'; }\n  if (r === 10) { body = '#bdf3ff'; dark = '#5ab8d6'; light = '#ffffff'; }\n  if (r === 11) { body = '#b3121f'; dark = '#3d0006'; light = '#ff5a5a'; }\n  if (r === 12) { body = '#fffaf0'; dark = '#d8c48a'; light = '#ffffff'; }\n  if (r === 13) { body = '#3b1fb8'; dark = '#12064a'; light = '#9d84ff'; }\n  if (r === 14) { body = '#fffbe6'; dark = '#d4a300'; light = '#ffffff'; }\n  const id = 'g' + hashStr(c.id); const cx = 100, cy = 82 - s * 2; const size = 30 + s * 9 + (r >= 7 ? 6 : 0) + R() * 5;\n  // fond\n  let bg = `<defs><radialGradient id=\"${id}b\" cx=\"50%\" cy=\"45%\" r=\"75%\"><stop offset=\"0\" stop-color=\"hsl(${hue},60%,${t === 'ombre' ? 25 : 45}%)\"/><stop offset=\"1\" stop-color=\"hsl(${hue},50%,8%)\"/></radialGradient>\n  <radialGradient id=\"${id}c\" cx=\"38%\" cy=\"32%\" r=\"75%\"><stop offset=\"0\" stop-color=\"${light}\"/><stop offset=\".55\" stop-color=\"${body}\"/><stop offset=\"1\" stop-color=\"${dark}\"/></radialGradient>\n  ${r === 8 || r === 15 ? `<linearGradient id=\"${id}r\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff3b3b\"/><stop offset=\".25\" stop-color=\"#ffd23b\"/><stop offset=\".5\" stop-color=\"#3bff7a\"/><stop offset=\".75\" stop-color=\"#3bb4ff\"/><stop offset=\"1\" stop-color=\"#c03bff\"/></linearGradient>` : ''}</defs>\n  <rect width=\"200\" height=\"140\" fill=\"url(#${id}b)\"/>`;\n  if (r === 13 || r === 15 || c.type === 'psy' && r >= 7) { for (let i = 0; i < 40; i++) bg += `<circle cx=\"${R() * 200}\" cy=\"${R() * 140}\" r=\"${R() * 1.4 + .3}\" fill=\"#fff\" opacity=\"${R() * .8 + .2}\"/>`; }\n  if (r === 11) bg += `<path d=\"M0 140 Q20 100 35 140 Q55 95 75 140 Q100 90 125 140 Q150 100 170 140 Q185 105 200 140Z\" fill=\"#ff3b0055\"/>`;\n  if (r === 12 || r === 14) bg += `<g opacity=\".35\">${Array.from({ length: 12 }, (_, i) => `<path d=\"M100 70 L${100 + Math.cos(i / 12 * 6.283) * 160} ${70 + Math.sin(i / 12 * 6.283) * 160} L${100 + Math.cos((i + .5) / 12 * 6.283) * 160} ${70 + Math.sin((i + .5) / 12 * 6.283) * 160}Z\" fill=\"#fff8c0\"/>`).join('')}</g>`;\n  // sol\n  bg += `<ellipse cx=\"100\" cy=\"${cy + size + 8}\" rx=\"${size * 1.1}\" ry=\"7\" fill=\"#0006\"/>`;\n  const fill = (r === 8) ? `url(#${id}r)` : `url(#${id}c)`;\n  let back = '', front = '';\n  // ailes (vol, dragon, angel, demon)\n  if (t === 'vol' || (t === 'dragon' && s >= 1) || r === 12 || r === 11) {\n    const wc = r === 12 ? '#ffffff' : r === 11 ? '#2a0004' : dark; const ws = size * (1 + s * .25);\n    const feather = t === 'vol' || r === 12;\n    for (const sd of [-1, 1]) {\n      if (feather) back += `<path d=\"M${cx + sd * size * .5} ${cy - 4} Q${cx + sd * (ws + 25)} ${cy - ws * .9} ${cx + sd * (ws + 38)} ${cy - 8} Q${cx + sd * (ws + 20)} ${cy - 2} ${cx + sd * (ws + 28)} ${cy + 8} Q${cx + sd * (ws + 10)} ${cy + 6} ${cx + sd * (ws + 14)} ${cy + 18} Q${cx + sd * ws * .7} ${cy + 10} ${cx + sd * size * .5} ${cy + 8}Z\" fill=\"${wc}\" stroke=\"#0005\" stroke-width=\"1.5\"/>`;\n      else back += `<path d=\"M${cx + sd * size * .5} ${cy - 2} L${cx + sd * (ws + 30)} ${cy - ws * .8} L${cx + sd * (ws + 22)} ${cy + 2} L${cx + sd * (ws + 12)} ${cy - 6} L${cx + sd * (ws + 6)} ${cy + 10} L${cx + sd * ws * .6} ${cy} L${cx + sd * size * .5} ${cy + 10}Z\" fill=\"${wc}\" stroke=\"#0006\" stroke-width=\"1.5\"/>`;\n    }\n  }\n  // queue\n  if (t === 'dragon' || t === 'feu' || t === 'normal' || t === 'terre') {\n    const sd = R() < .5 ? -1 : 1; const tl = size * (1.1 + s * .2);\n    back += `<path d=\"M${cx + sd * size * .6} ${cy + size * .55} Q${cx + sd * tl * 1.3} ${cy + size * .7} ${cx + sd * tl * 1.4} ${cy - size * .1}\" stroke=\"${dark}\" stroke-width=\"${7 + s * 2}\" fill=\"none\" stroke-linecap=\"round\"/>`;\n    if (t === 'feu') back += `<path d=\"M${cx + sd * tl * 1.4} ${cy - size * .1} q${sd * 6} -18 ${sd * -2} -26 q${sd * 2} 12 ${sd * -8} 16 q-2 -10 2 -14 q${sd * -10} 8 ${sd * 8} 24z\" fill=\"#ffd23b\" stroke=\"#ff5a1f\" stroke-width=\"2\"/>`;\n  }\n  // aura psy\n  if (t === 'psy' || r === 13) back += `<circle cx=\"${cx}\" cy=\"${cy}\" r=\"${size * 1.45}\" fill=\"none\" stroke=\"${light}\" stroke-width=\"2\" opacity=\".55\" stroke-dasharray=\"4 6\"/><circle cx=\"${cx}\" cy=\"${cy}\" r=\"${size * 1.25}\" fill=\"none\" stroke=\"${light}\" stroke-width=\"1.5\" opacity=\".35\"/>`;\n  // corps (blob)\n  const N = 7 + Math.floor(R() * 5); const pts = [];\n  const squash = .8 + R() * .35;\n  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2 - Math.PI / 2; const rr = size * (0.82 + R() * .3); pts.push([cx + Math.cos(a) * rr * (t === 'metal' ? 1 : 1), cy + Math.sin(a) * rr * squash + (Math.sin(a) > 0 ? size * .1 : 0)]); }\n  let path = '';\n  if (t === 'metal') { path = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + 'Z'; }\n  else { const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let m0 = mid(pts[N - 1], pts[0]); path = `M${m0[0].toFixed(1)} ${m0[1].toFixed(1)}`; for (let i = 0; i < N; i++) { const p = pts[i], m = mid(p, pts[(i + 1) % N]); path += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`; } path += 'Z'; }\n  // pattes\n  let legs = ''; const nl = t === 'vol' || t === 'ombre' ? 0 : 2;\n  for (let i = 0; i < nl; i++) { const lx = cx + (i ? 1 : -1) * size * .45; legs += `<rect x=\"${lx - 6 - s}\" y=\"${cy + size * squash * .7}\" width=\"${12 + s * 2}\" height=\"${12 + s * 2}\" rx=\"5\" fill=\"${dark}\"/>`; }\n  let bodyS = `<path d=\"${path}\" fill=\"${fill}\" stroke=\"${t === 'ombre' ? '#c9a8ff' : '#0008'}\" stroke-width=\"${t === 'ombre' ? 1.5 : 2.5}\" ${t === 'ombre' ? 'opacity=\".92\"' : ''}/>`;\n  // ventre\n  bodyS += `<ellipse cx=\"${cx}\" cy=\"${cy + size * .3}\" rx=\"${size * .45}\" ry=\"${size * .32}\" fill=\"${light}\" opacity=\".45\"/>`;\n  // détails de type\n  const top = cy - size * squash * .95;\n  if (t === 'feu') { for (let i = -1; i <= 1; i++) front += `<path d=\"M${cx + i * size * .35} ${top + 8} q${-8} -14 ${0} -${20 + s * 8 + (i ? 0 : 10)} q${4} 10 ${10} 6 q2 10 -10 14z\" fill=\"${i ? '#ffb703' : '#ff5a1f'}\" stroke=\"#d62828\" stroke-width=\"1.5\"/>`; }\n  if (t === 'eau') { front += `<path d=\"M${cx - 6} ${top + 6} q6 -${22 + s * 6} ${16} -${6} q-6 4 -16 6z\" fill=\"${light}\" stroke=\"${dark}\" stroke-width=\"2\"/>`; for (let i = 0; i < 3; i++) front += `<circle cx=\"${cx + size * 1.1 + R() * 14}\" cy=\"${cy - 10 - i * 14}\" r=\"${3 + R() * 4}\" fill=\"none\" stroke=\"#bfe9ff\" stroke-width=\"1.5\"/>`; for (const sd of [-1, 1]) front += `<path d=\"M${cx + sd * size * .85} ${cy} l${sd * 14} -6 l${-sd * 4} 16z\" fill=\"${dark}\"/>`; }\n  if (t === 'terre') { for (let i = 0; i < 3 + s; i++) { const a = -Math.PI / 2 + (i - (2 + s) / 2) * .45; const x = cx + Math.cos(a) * size * .9, y = cy + Math.sin(a) * size * squash * .9; front += `<path d=\"M${x - 7} ${y + 4} L${x + Math.cos(a) * 14} ${y + Math.sin(a) * 14} L${x + 7} ${y + 4}Z\" fill=\"#8a7a6a\" stroke=\"#3b2d20\" stroke-width=\"1.5\"/>`; } }\n  if (t === 'metal') { for (let i = 0; i < 4; i++) front += `<circle cx=\"${cx + (i % 2 ? 1 : -1) * size * .5}\" cy=\"${cy + (i < 2 ? -1 : 1) * size * .35}\" r=\"3\" fill=\"#ddd\" stroke=\"#333\"/>`; front += `<line x1=\"${cx}\" y1=\"${top + 4}\" x2=\"${cx}\" y2=\"${top - 14 - s * 6}\" stroke=\"#555\" stroke-width=\"3\"/><circle cx=\"${cx}\" cy=\"${top - 16 - s * 6}\" r=\"5\" fill=\"#ff3b3b\" stroke=\"#000\"/>`; }\n  if (t === 'ombre') { for (let i = 0; i < 4; i++) back += `<path d=\"M${cx - size * .8 + i * size * .5} ${cy + size * .6} q${R() * 10 - 5} 20 ${R() * 16 - 8} 34\" stroke=\"${body}\" stroke-width=\"7\" fill=\"none\" stroke-linecap=\"round\" opacity=\".7\"/>`; }\n  if (t === 'dragon') { for (const sd of [-1, 1]) front += `<path d=\"M${cx + sd * size * .3} ${top + 8} q${sd * 6} -${18 + s * 6} ${sd * 18} -${24 + s * 8} q${-sd * 4} 14 ${-sd * 10} ${28 + s * 6}z\" fill=\"#f1e3c4\" stroke=\"#5a4a2a\" stroke-width=\"1.5\"/>`; for (let i = 0; i < 3; i++) front += `<path d=\"M${cx - 10 + i * 10} ${cy + size * .55} l5 -8 l5 8z\" fill=\"${light}\" opacity=\".7\"/>`; }\n  if (t === 'normal') { for (const sd of [-1, 1]) front += `<path d=\"M${cx + sd * size * .35} ${top + 10} l${sd * 12} -${22 + s * 4} l${-sd * 2} ${26 + s * 4}z\" fill=\"${body}\" stroke=\"#0008\" stroke-width=\"2\"/><path d=\"M${cx + sd * size * .38} ${top + 6} l${sd * 7} -${12 + s * 2} l${-sd * 1} ${14}z\" fill=\"#ffb3c7\"/>`; }\n  if (t === 'vol') { front += `<path d=\"M${cx - 4} ${top + 4} q-6 -16 4 -${18 + s * 4} q-2 10 6 12z\" fill=\"${light}\" stroke=\"${dark}\"/>`; }\n  // yeux\n  const ne = t === 'psy' && R() < .5 ? 3 : (R() < .15 ? 1 : 2); const eY = cy - size * .15; const eS = 5 + s * 1.2 + R() * 3; const angry = s >= 2 || r >= 7;\n  const eyeCol = t === 'ombre' ? '#ffe600' : r === 11 ? '#ff0000' : r === 13 || r === 15 ? '#7affff' : '#fff';\n  const eyes = ne === 1 ? [[cx, eY]] : ne === 3 ? [[cx - size * .32, eY], [cx + size * .32, eY], [cx, eY - size * .32]] : [[cx - size * .3, eY], [cx + size * .3, eY]];\n  for (const [ex, ey] of eyes) {\n    front += `<ellipse cx=\"${ex}\" cy=\"${ey}\" rx=\"${eS * 1.05}\" ry=\"${eS * 1.25}\" fill=\"${eyeCol}\" stroke=\"#000\" stroke-width=\"1.5\"/>`;\n    if (t !== 'ombre' && r !== 11) front += `<circle cx=\"${ex + 1}\" cy=\"${ey + 1}\" r=\"${eS * .55}\" fill=\"#111\"/><circle cx=\"${ex - eS * .2}\" cy=\"${ey - eS * .35}\" r=\"${eS * .22}\" fill=\"#fff\"/>`;\n    else front += `<ellipse cx=\"${ex}\" cy=\"${ey}\" rx=\"${eS * .25}\" ry=\"${eS * .9}\" fill=\"#000\"/>`;\n    if (angry) front += `<path d=\"M${ex - eS * 1.4} ${ey - eS * 1.7} L${ex + eS * 1.3} ${ey - eS * .9}\" stroke=\"#000\" stroke-width=\"3\" stroke-linecap=\"round\" transform=\"${ex > cx ? `scale(-1,1) translate(${-2 * ex},0)` : ''}\"/>`;\n  }\n  // bouche\n  const mY = cy + size * .2; const mw = size * .35;\n  if (angry || t === 'dragon') front += `<path d=\"M${cx - mw} ${mY} Q${cx} ${mY + 12} ${cx + mw} ${mY}\" fill=\"#3a0010\" stroke=\"#000\" stroke-width=\"2\"/><path d=\"M${cx - mw * .6} ${mY + 2} l4 6 l4 -5 M${cx + mw * .6} ${mY + 2} l-4 6 l-4 -5\" fill=\"#fff\" stroke=\"#fff\" stroke-width=\"1\"/>`;\n  else front += `<path d=\"M${cx - mw * .6} ${mY} Q${cx} ${mY + 9} ${cx + mw * .6} ${mY}\" fill=\"none\" stroke=\"#000\" stroke-width=\"2.5\" stroke-linecap=\"round\"/>`;\n  if (R() < .5 && !angry) front += `<ellipse cx=\"${cx - size * .55}\" cy=\"${mY - 4}\" rx=\"5\" ry=\"3\" fill=\"#ff6b9a\" opacity=\".6\"/><ellipse cx=\"${cx + size * .55}\" cy=\"${mY - 4}\" rx=\"5\" ry=\"3\" fill=\"#ff6b9a\" opacity=\".6\"/>`;\n  // décorations de rareté\n  if (r === 14 || r === 15) front += `<path d=\"M${cx - 18} ${top - 4} l6 -16 l6 10 l6 -14 l6 14 l6 -10 l6 16z\" fill=\"#ffd700\" stroke=\"#8a6500\" stroke-width=\"1.5\"/><circle cx=\"${cx}\" cy=\"${top - 16}\" r=\"3\" fill=\"#ff2d55\"/>`;\n  if (r === 15) back += `<ellipse cx=\"${cx}\" cy=\"${cy}\" rx=\"${size * 1.7}\" ry=\"${size * .45}\" fill=\"none\" stroke=\"url(#${id}r)\" stroke-width=\"5\" opacity=\".9\" transform=\"rotate(-15 ${cx} ${cy})\"/>`;\n  if (r === 12) front += `<ellipse cx=\"${cx}\" cy=\"${top - 10}\" rx=\"${size * .55}\" ry=\"6\" fill=\"none\" stroke=\"#ffe066\" stroke-width=\"4\"/>`;\n  if (r === 11) for (const sd of [-1, 1]) front += `<path d=\"M${cx + sd * size * .45} ${top + 10} q${sd * 18} -10 ${sd * 14} -32 q${-sd * 2} 18 ${-sd * 16} 30z\" fill=\"#1a0000\" stroke=\"#ff3b3b\" stroke-width=\"1.5\"/>`;\n  if (r === 10) for (let i = 0; i < 5; i++) front += `<path d=\"M${30 + R() * 140} ${15 + R() * 40} l4 -7 l4 7 l-4 7z\" fill=\"#fff\" opacity=\".9\"/>`;\n  if (r === 9) for (let i = 0; i < 6; i++) front += `<circle cx=\"${20 + R() * 160}\" cy=\"${10 + R() * 120}\" r=\"${1 + R() * 2}\" fill=\"#fff6b0\"/>`;\n  const svg = `<svg viewBox=\"0 0 200 140\" xmlns=\"http://www.w3.org/2000/svg\">${bg}${back}${legs}${bodyS}${front}</svg>`;\n  ART_CACHE[c.id] = svg; return svg;\n}\n\n// ======================= CARTE =======================\nfunction cardData(id, extra) { return (extra && extra.card) || D.CARDS[id]; }\nfunction stageTxt(c) { if (c.boss) return 'BOSS'; if (c.exclusive) return 'EXCLUSIF'; if (c.special) return 'Spécial'; if (!c.stage) return 'Base'; const f = D.CARDS[c.from]; return 'Évol. ' + c.stage + (f ? ' de ' + f.name : ''); }\nfunction cardHTML(id, o = {}) {\n  const c = o.card || D.CARDS[id]; if (!c) return '';\n  const T = D.TYPES[c.type] || { c: '#888', i: '?' }; const R = D.RARITIES[c.r];\n  const ens = (n) => n >= 90 ? '' : Array.from({ length: n }, () => '<i></i>').join('');\n  const atks = c.atk.map(a => `<div class=\"a\"><span class=\"en\">${ens(a.c)}</span><span>${esc(a.n)}</span><span class=\"d\">${a.d || ''}</span></div>${a.e ? `<div class=\"fx\">${esc(D.EFFECT_TXT[a.e] || '')}</div>` : ''}`).join('');\n  const shine = c.r >= 7 ? ' shine' : '';\n  return `<div class=\"card r${c.r} ${o.size || ''}${shine}${o.no ? ' no' : ''}${o.cls ? ' ' + o.cls : ''}\" style=\"--tc:${T.c};--tc2:${T.c}55\" ${o.attr || ''} ${o.click !== false ? `onclick=\"${o.onclick || `zoomCard('${c.id}')`}\"` : ''}>\n   ${o.count ? `<div class=\"cnt\">x${o.count}</div>` : ''}\n   <div class=\"in\"><div class=\"hd\"><span class=\"nm\">${esc(c.name)}</span><span class=\"hp\">${c.hp} PV ${T.i}</span></div>\n   <div class=\"art\">${art(c)}</div>\n   <div class=\"st\"><span>${stageTxt(c)}</span><span>#${c.num || '★'}</span></div>\n   <div class=\"ak\">${atks}</div>\n   <div class=\"ft\"><span>Faible: ${c.weak ? D.TYPES[c.weak].i : '—'}</span><span>Rés: ${c.resist ? D.TYPES[c.resist].i : '—'}</span><span>Retr: ${c.retreat > 5 ? '∞' : c.retreat}</span></div>\n   </div><div class=\"rb\">${R ? R.n : ''}</div></div>`;\n}\nfunction zoomCard(id) {\n  const c = D.CARDS[id]; const n = ownedN(id); const T = D.TYPES[c.type];\n  const friends = (STATE.friends || []);\n  const canGift = ME.staff || n >= 2;\n  openModal(`<div class=\"row\" style=\"align-items:flex-start;gap:20px;justify-content:center\">${cardHTML(id, { size: 'big', click: false })}\n   <div class=\"col\" style=\"min-width:220px;max-width:300px\"><h2>${esc(c.name)}</h2>\n   <div>${T.i} Type ${T.n} · <b style=\"color:${D.RARITIES[c.r].c === 'rainbow' ? '#ff9af0' : D.RARITIES[c.r].c}\">${D.RARITIES[c.r].n}</b></div>\n   <div class=\"mut\">${stageTxt(c)}${c.event ? ' · carte d\\'event' : ''}</div>\n   <div>Tu en as : <b>${ME.staff ? '∞' : n}</b></div>\n   ${c.exclusive && !ME.staff ? `<div class=\"mut\">Max ${D.EXCLUSIVE_MAX} exclusives par joueur (tu en as ${ME.exc}).</div>` : ''}\n   <hr style=\"border-color:var(--line);width:100%\">\n   <b>🎁 Offrir à un ami</b>\n   ${!canGift ? '<div class=\"mut\">Il faut l\\'avoir en double (2 ou plus) pour l\\'offrir.</div>' : friends.length || ME.staff ? `<select id=\"giftTo\">${friends.map(f => `<option>${esc(f.name)}</option>`).join('')}</select>${ME.staff ? '<input id=\"giftToFree\" placeholder=\"ou n\\'importe quel pseudo (staff)\">' : ''}<button class=\"pri\" onclick=\"giftCard('${id}')\">Offrir 1 carte</button>` : '<div class=\"mut\">Ajoute des amis d\\'abord !</div>'}\n   <button onclick=\"closeModal()\">Fermer</button></div></div>`);\n}\nasync function giftCard(id) {\n  const free = $('#giftToFree') && $('#giftToFree').value.trim(); const to = free || ($('#giftTo') && $('#giftTo').value);\n  if (!to) return toast('Choisis un ami.', 1);\n  const r = await api('gift', { to, card: id }); if (r.err) return toast(r.err, 1); toast(r.ok); closeModal(); await refresh(); render();\n}\nfunction ownedN(id) { if (!ME) return 0; if (ME.cards === 'all') return 99; return ME.cards[id] || 0; }\n\n// ======================= CONNEXION =======================\nfunction showLogin() { $('#app').classList.add('hide'); $('#login').classList.remove('hide'); const demo = ['infernoxe', 'omnitheos', 'abyssor']; $('#cardsdemo').innerHTML = demo.map(id => D.CARDS[id] ? cardHTML(id, { size: 'tiny', click: false }) : '').join(''); }\nasync function doLogin() { const r = await api('login', { name: $('#lname').value, pass: $('#lpass').value }); if (r.err) { $('#lerr').textContent = r.err; return; } setToken(r.token); start(); }\nasync function doRegister() {\n  const r = await api('register', { name: $('#lname').value, pass: $('#lpass').value, secret: $('#lsecret').value });\n  if (r.err) { $('#lerr').textContent = r.err; if (r.needSecret) $('#lsecret').classList.remove('hide'); return; } setToken(r.token); start();\n}\nfunction setToken(t) { TOKEN = t; try { localStorage.setItem('bu_token', t); } catch (e) { } }\nfunction logout(silent) { if (!silent) api('logout'); TOKEN = null; try { localStorage.removeItem('bu_token'); } catch (e) { } ME = null; showLogin(); }\n$('#lpass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });\n\n// ======================= NAVIGATION =======================\nconst PAGES = [['home', '🏠 Accueil'], ['fight', '⚔️ Combat'], ['coll', '📚 Collection'], ['deck', '🃏 Mon deck'], ['shop', '🛒 Boutique'], ['friends', '👥 Amis'], ['staff', '👑 Staff']];\nfunction go(p) { PAGE_ID = p; closeModal(); render(); $('#main').scrollTop = 0; }\nasync function refresh() {\n  const r = await api('me'); if (r.err) return false; STATE = r; ME = r.user;\n  $('#credits').textContent = '💰 ' + (ME.staff ? '∞' : fmt(ME.credits));\n  $('#lvltxt').innerHTML = ME.staff ? '🌠 <span class=\"galact\">GALACTIQUE</span>' : esc(ME.levelName) + (ME.need ? ` <span class=\"mut\">${fmt(ME.xp)}/${fmt(ME.need)} XP</span>` : '');\n  $('#xpbar').style.width = ME.staff ? '100%' : (ME.need ? Math.min(100, ME.xp / ME.need * 100) : 100) + '%';\n  $('#whoami').innerHTML = (ME.role === 'creator' ? '<span class=\"crown\">👑</span> ' : ME.role === 'admin' ? '<span class=\"crown\">🛡️</span> ' : '') + esc(ME.name) + (STATE.reqs.length || ME.inbox.length ? ' 🔔' : '');\n  $('#nav').innerHTML = PAGES.filter(p => p[0] !== 'staff' || ME.staff).map(p => `<button class=\"${PAGE_ID === p[0] ? 'on' : ''}\" onclick=\"go('${p[0]}')\">${p[1]}${p[0] === 'friends' && (STATE.reqs.length) ? ' 🔴' : ''}</button>`).join('');\n  // invitations de combat\n  for (const inv of STATE.invites) { if (!SEEN_INV[inv.code]) { SEEN_INV[inv.code] = 1; openModal(`<div class=\"col\" style=\"text-align:center\"><h2>⚔️ ${esc(inv.from)} te défie !</h2><div class=\"bigcode\">${inv.code}</div><div class=\"row\" style=\"justify-content:center\"><button class=\"grn\" onclick=\"joinRoom('${inv.code}')\">Accepter le combat</button><button onclick=\"closeModal()\">Plus tard</button></div></div>`); } }\n  if (STATE.battle && !BT.id) openBattle(STATE.battle);\n  return true;\n}\nconst SEEN_INV = {};\nasync function start() {\n  if (!D) D = await (await fetch('/api/data', { method: 'POST' })).json();\n  if (!TOKEN) return showLogin();\n  const ok = await refresh(); if (!ok) return showLogin();\n  $('#login').classList.add('hide'); $('#app').classList.remove('hide'); render();\n}\nsetInterval(async () => { if (TOKEN && ME && !BT.id) { const before = JSON.stringify([STATE && STATE.G, STATE && STATE.friends, STATE && STATE.reqs, ME && ME.inbox, ME && ME.credits]); await refresh(); const after = JSON.stringify([STATE.G, STATE.friends, STATE.reqs, ME.inbox, ME.credits]); if (before !== after && ['home', 'friends'].includes(PAGE_ID) && !document.activeElement.matches('input,select')) render(); } }, 5000);\nsetInterval(() => { document.querySelectorAll('[data-until]').forEach(e => e.textContent = timeLeft(+e.dataset.until - Date.now())); }, 1000);\n\nfunction render() {\n  if (!ME) return;\n  $('#nav').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', b.getAttribute('onclick') === `go('${PAGE_ID}')`));\n  const P = { home: pHome, fight: pFight, coll: pColl, deck: pDeck, shop: pShop, friends: pFriends, staff: pStaff }[PAGE_ID] || pHome;\n  $('#page').innerHTML = P();\n  if (PAGE_ID === 'coll') drawColl(); if (PAGE_ID === 'deck') drawDeck(); if (PAGE_ID === 'staff') staffUsers();\n}\n\n// ======================= ACCUEIL =======================\nfunction eventBanners() {\n  const g = STATE.G; let h = '';\n  if (g.boost) h += `<div class=\"banner\" style=\"background:linear-gradient(90deg,#3a2a00,#1a1530)\"><div style=\"font-size:36px\">🚀</div><div><b>${esc(g.boost.label)}</b><div>XP x${g.boost.xp} · Crédits x${g.boost.credits} · Chance x${g.boost.luck}</div><div class=\"mut\">Fin dans <span data-until=\"${g.boost.until}\">${timeLeft(g.boost.until - Date.now())}</span></div></div></div>`;\n  if (g.event) { const th = g.event.info; h += `<div class=\"banner\" style=\"background:linear-gradient(90deg,${th.c}55,#1a1530)\"><div style=\"font-size:36px\">${th.i}</div><div style=\"flex:1\"><b>Event : ${esc(th.n)}</b><div>${g.event.on ? 'EN COURS ! Fin dans <span data-until=\"' + g.event.end + '\">' + timeLeft(g.event.end - Date.now()) + '</span>' : 'Commence dans <span data-until=\"' + g.event.start + '\">' + timeLeft(g.event.start - Date.now()) + '</span>'}</div><div class=\"mut\">Cartes limitées : ${th.cards.map(x => esc(x[1])).join(', ')}</div></div>${g.event.on ? '<button class=\"pri\" onclick=\"go(\\'shop\\')\">Voir le deck d\\'event</button>' : ''}</div>`; }\n  if (g.boss) { const b = g.boss; h += `<div class=\"banner\" style=\"background:linear-gradient(90deg,#5a0010,#1a1530)\"><div style=\"font-size:40px\">👹</div><div style=\"flex:1;min-width:220px\"><b>BOSS : ${esc(b.info.n)}</b> ${D.TYPES[b.info.t].i}<div class=\"row\"><div class=\"hpbar\"><i style=\"width:${b.hp / b.max * 100}%\"></i></div><b>${fmt(b.hp)} / ${fmt(b.max)} PV</b></div><div class=\"mut\">Part dans <span data-until=\"${b.until}\">${timeLeft(b.until - Date.now())}</span>${b.top.length ? ' · Top : ' + b.top.map((x, i) => (i + 1) + '. ' + esc(x[0]) + ' (' + fmt(x[1]) + ')').join(' ') : ''}</div></div><button class=\"red\" onclick=\"startFight('boss')\">⚔️ Attaquer le boss</button></div>`; }\n  return h;\n}\nfunction pHome() {\n  const g = STATE.G; const deckOk = ME.useGalactique || (ME.active && ME.active.length >= 10);\n  return `<div class=\"col\">\n   <div class=\"panel row\" style=\"justify-content:space-between\">\n     <div><h1>Salut ${esc(ME.name)} ${ME.role === 'creator' ? '👑 <span class=\"galact\">CRÉATEUR</span>' : ME.role === 'admin' ? '🛡️ <span class=\"galact\">ADMIN</span>' : ''}</h1>\n     <div>${ME.staff ? '🌠 <span class=\"galact\" style=\"font-size:22px\">Niveau GALACTIQUE</span>' : `<b style=\"font-size:20px\">${esc(ME.levelName)}</b>`} · 🏆 ${ME.wins} victoires · ${ME.losses} défaites</div>\n     ${!ME.staff && ME.level < 5 ? `<div class=\"mut\" style=\"margin-top:6px\">🎁 Deck de départ au niveau 5 ! Pour l'instant tu joues avec le deck d'entraînement.</div>` : ''}\n     ${!ME.staff && ME.level < 100 ? `<div class=\"mut\">Après le niveau 100 : ${D.RANKS.map((r, i) => D.RANK_ICONS[i] + ' ' + r).join(' → ')}</div>` : ''}\n     <div class=\"mut\" style=\"margin-top:4px\">Ton code ami : <b style=\"color:var(--acc);letter-spacing:2px\">${ME.code}</b></div></div>\n     <div class=\"row\"><button class=\"pri\" style=\"font-size:20px;padding:16px 26px\" onclick=\"go('fight')\">⚔️ COMBATTRE</button><button class=\"sm\" onclick=\"logout()\">Déconnexion</button></div>\n   </div>\n   ${eventBanners()}\n   ${g.announces.length ? `<div class=\"panel\"><h3>📢 Annonces</h3>${g.announces.map(a => `<div style=\"padding:4px 0\">${esc(a.msg)} <span class=\"mut\" style=\"font-size:12px\">— ${esc(a.by)}, ${new Date(a.t).toLocaleString('fr')}</span></div>`).join('')}</div>` : ''}\n   <div class=\"panel\"><div class=\"row\" style=\"justify-content:space-between\"><h3>🔔 Messages</h3>${ME.inbox.length ? '<button class=\"sm\" onclick=\"api(\\'readInbox\\').then(refresh).then(render)\">Tout effacer</button>' : ''}</div>\n   ${ME.inbox.length ? ME.inbox.map(m => `<div style=\"padding:5px 0;border-bottom:1px solid var(--line)\">${esc(m.txt)} <span class=\"mut\" style=\"font-size:12px\">${new Date(m.t).toLocaleString('fr')}</span></div>`).join('') : '<div class=\"mut\">Aucun message.</div>'}\n   ${STATE.reqs.length ? `<div style=\"margin-top:8px\"><b>${STATE.reqs.length} demande(s) d'ami</b> <button class=\"sm vio\" onclick=\"go('friends')\">Voir</button></div>` : ''}</div>\n   <div class=\"panel\"><h3>Comment jouer ?</h3><div class=\"mut\" style=\"line-height:1.6\">\n   • Chaque tour : tu pioches, tu poses tes créatures de base, tu fais évoluer, tu donnes <b>1 énergie</b> à un monstre, puis tu <b>attaques</b>.<br>\n   • Les attaques coûtent des énergies (les ronds jaunes). Fais <b>3 K.O.</b> pour gagner !<br>\n   • Faiblesse = dégâts x2. Résistance = -20. Brûlure, poison, paralysie, bouclier…<br>\n   • Les combats donnent de l'<b>XP</b> et des <b>crédits</b>. Avec les crédits, achète des decks à la Boutique.</div></div>\n  </div>`;\n}\n\n// ======================= COMBAT (menu) =======================\nlet ROOM = null;\nfunction pFight() {\n  const diffs = D.DIFFS.map((d, i) => `<button class=\"${['grn', 'vio', 'pri', 'red', 'red'][i]}\" style=\"min-width:150px;padding:14px\" onclick=\"startFight('bot',${i})\"><div style=\"font-size:18px\">${['🙂', '😐', '😠', '😈', '💀'][i]} ${d.n}</div><small>Récompenses x${d.mult}</small></button>`).join('');\n  const deckName = ME.useGalactique ? '🌠 Deck Galactique' : (ME.active && ME.active.length >= 10 ? 'Ton deck (' + ME.active.length + ' cartes)' : 'Deck d\\'entraînement (12 cartes)');\n  return `<div class=\"col\">\n  <div class=\"panel\"><h2>🤖 Combat contre un bot</h2><div class=\"mut\" style=\"margin-bottom:10px\">Deck utilisé : <b>${deckName}</b> <button class=\"sm\" onclick=\"go('deck')\">Changer</button></div><div class=\"row\">${diffs}</div></div>\n  ${STATE.G.boss ? eventBanners() : ''}\n  <div class=\"panel\"><h2>🧑‍🤝‍🧑 Combat entre amis (code de salon)</h2>\n   <div class=\"row\" style=\"align-items:flex-start;gap:24px\">\n    <div class=\"col\" style=\"flex:1;min-width:240px\"><b>Créer un salon</b><div class=\"mut\">Donne le code à ton ami, comme dans Among Us !</div>\n     ${ROOM ? `<div class=\"bigcode\">${ROOM}</div><div class=\"mut\">En attente de ton ami…</div><button onclick=\"cancelRoom()\">Annuler</button>` : `<button class=\"pri\" onclick=\"createRoom()\">Créer un salon</button>`}</div>\n    <div class=\"col\" style=\"flex:1;min-width:240px\"><b>Rejoindre un salon</b><input id=\"joincode\" maxlength=\"6\" placeholder=\"CODE\" style=\"text-transform:uppercase;font-size:24px;letter-spacing:6px;text-align:center\"><button class=\"vio\" onclick=\"joinRoom($('#joincode').value)\">Rejoindre</button></div>\n   </div></div></div>`;\n}\nasync function createRoom(invite) { const r = await api('roomCreate', { invite }); if (r.err) return toast(r.err, 1); ROOM = r.code; if (invite) { toast('Défi envoyé à ' + invite + ' ! Code : ' + r.code); go('fight'); } else render(); }\nasync function cancelRoom() { await api('roomCancel'); ROOM = null; render(); }\nasync function joinRoom(code) { closeModal(); const r = await api('roomJoin', { code }); if (r.err) return toast(r.err, 1); openBattle(r.battle); }\nasync function startFight(mode, diff) { const r = await api('battleStart', { mode, diff }); if (r.err) return toast(r.err, 1); openBattle(r.battle); }\n\n// ======================= ÉCRAN DE COMBAT =======================\nconst BT = { id: null, v: null, sel: null, timer: null, lastLog: -1, lastFx: 0, wasMyTurn: null };\nfunction openBattle(id) { ROOM = null; BT.id = id; BT.v = null; BT.sel = null; BT.lastLog = -1; BT.lastFx = 0; BT.wasMyTurn = null; $('#battle').classList.remove('hide'); pollBattle(); clearInterval(BT.timer); BT.timer = setInterval(pollBattle, 1000); }\nasync function pollBattle(action) {\n  if (!BT.id) return;\n  if (!action && BT.v && !BT.v.ended && BT.v.myTurn && BT.v.mode !== 'pvp') return; // rien à attendre\n  if (!action && BT.v && BT.v.ended) return;\n  const r = await api('battle', { id: BT.id, action });\n  if (r.gone) { closeBattle(); return; }\n  if (r.err) toast(r.err, 1);\n  if (r.view) { BT.v = r.view; drawBattle(); }\n}\nfunction act(a) { BT.sel = null; pollBattle(a); }\nfunction closeBattle() { clearInterval(BT.timer); BT.id = null; BT.v = null; $('#battle').classList.add('hide'); refresh().then(render); }\nfunction monHTML(m, mine, active) {\n  if (!m) return `<div class=\"mon\" style=\"width:${active ? 130 : 86}px;height:${active ? 180 : 120}px;border:2px dashed #fff3;border-radius:12px\"></div>`;\n  const c = m.card || D.CARDS[m.id]; const left = Math.max(0, c.hp - m.dmg); const pct = left / c.hp * 100;\n  const tgt = isTarget(m, mine);\n  const sts = (m.burn ? '🔥' : '') + (m.poison ? '☠️' : '') + (m.para ? '⚡' : '') + (m.shield ? '🛡️' : '');\n  return `<div class=\"mon ${tgt ? 'tgt' : ''}\" id=\"m${m.uid}\" onclick=\"clickMon(${m.uid},${mine ? 1 : 0})\">\n   ${cardHTML(m.id, { card: m.card, size: active ? 'mini' : 'tiny', click: false })}\n   <div class=\"pips\">${m.energy >= 90 ? '<i></i>∞' : Array.from({ length: Math.min(m.energy, 8) }, () => '<i></i>').join('')}</div>\n   <div class=\"sts\">${sts}</div>\n   <div class=\"bar\"><i class=\"${pct < 35 ? 'low' : ''}\" style=\"width:${pct}%\"></i></div><div class=\"hpt\">${left} / ${c.hp}</div></div>`;\n}\nfunction isTarget(m, mine) {\n  const s = BT.sel; if (!s || !mine || !BT.v.myTurn) return false;\n  if (s.k === 'energy') return true;\n  if (s.k === 'retreat') return BT.v.me.bench.some(b => b.uid === m.uid);\n  if (s.k === 'hand') { const h = BT.v.me.hand.find(x => x.uid === s.uid); const c = h && D.CARDS[h.id]; return c && c.from === m.id && m.played < BT.v.turnNo; }\n  return false;\n}\nfunction clickMon(uid, mine) {\n  const s = BT.sel; const v = BT.v;\n  if (!s || !mine) { const all = [v.me.active, ...v.me.bench, v.op.active, ...v.op.bench].filter(Boolean); const m = all.find(x => x.uid === uid); if (m && !m.card) zoomCard(m.id); return; }\n  if (s.k === 'energy') return act({ type: 'energy', target: uid });\n  if (s.k === 'retreat') return act({ type: 'retreat', target: uid });\n  if (s.k === 'hand') return act({ type: 'evolve', uid: s.uid, target: uid });\n}\nfunction clickHand(uid) { if (!BT.v.myTurn) { const h = BT.v.me.hand.find(x => x.uid === uid); return zoomCard(h.id); } BT.sel = BT.sel && BT.sel.uid === uid ? null : { k: 'hand', uid }; drawBattle(); }\nfunction drawBattle() {\n  const v = BT.v; if (!v) return; const B = $('#battle'); B.classList.toggle('boss', v.mode === 'boss');\n  const me = v.me, op = v.op;\n  const prizes = (n) => [0, 1, 2].map(i => `<span class=\"prize ${i < n ? 'on' : ''}\"></span>`).join('');\n  const selCard = BT.sel && BT.sel.k === 'hand' ? D.CARDS[(me.hand.find(h => h.uid === BT.sel.uid) || {}).id] : null;\n  const A = me.active; const ca = A && (A.card || D.CARDS[A.id]);\n  let actions = '';\n  if (v.ended) actions = '';\n  else if (!v.myTurn) actions = `<b style=\"padding:8px\">⏳ Tour de ${esc(op.name)}…</b>`;\n  else if (selCard) {\n    actions = `<b>${esc(selCard.name)}</b> ` + (selCard.stage === 0 ? `<button class=\"grn\" onclick=\"act({type:'play',uid:${BT.sel.uid}})\">${me.active ? 'Poser sur le banc' : 'Poser en actif'}</button>` : `<span class=\"mut\">Touche le monstre à faire évoluer (${esc(D.CARDS[selCard.from] ? D.CARDS[selCard.from].name : '')})</span>`) + ` <button onclick=\"BT.sel=null;drawBattle()\">Annuler</button>`;\n  } else if (BT.sel && BT.sel.k === 'energy') actions = `<span class=\"mut\">Touche un de tes monstres pour lui donner 1 énergie ⚡</span> <button onclick=\"BT.sel=null;drawBattle()\">Annuler</button>`;\n  else if (BT.sel && BT.sel.k === 'retreat') actions = `<span class=\"mut\">Touche un monstre de ton banc pour l'échanger</span> <button onclick=\"BT.sel=null;drawBattle()\">Annuler</button>`;\n  else if (ca) {\n    actions = ca.atk.map((a, n) => `<button class=\"atkbtn ${n ? 'red' : 'vio'}\" ${A.energy >= a.c && !A.para ? '' : 'disabled'} onclick=\"act({type:'attack',n:${n}})\"><b>${esc(a.n)} — ${a.d}</b><small>${'⚡'.repeat(a.c)}${a.e ? ' ' + esc(D.EFFECT_TXT[a.e]) : ''}</small></button>`).join('') +\n      `<button class=\"pri\" ${me.energyDone ? 'disabled' : ''} onclick=\"BT.sel={k:'energy'};drawBattle()\">⚡ Énergie</button>\n       <button ${me.bench.length && A.energy >= ca.retreat && !A.para ? '' : 'disabled'} onclick=\"BT.sel={k:'retreat'};drawBattle()\">↩️ Retraite (${ca.retreat})</button>\n       <button class=\"grn\" onclick=\"act({type:'end'})\">Fin du tour ➜</button>`;\n  }\n  const timer = v.mode === 'pvp' && !v.ended ? ` · ⏱️ <span data-until=\"${Date.now() + (v.deadline - v.now)}\">${timeLeft(v.deadline - v.now)}</span>` : '';\n  B.innerHTML = `\n   <div class=\"row\" style=\"padding:6px 10px;background:#000a;justify-content:space-between\">\n     <div><b>${v.mode === 'boss' ? '👹 COMBAT DE BOSS' : v.mode === 'pvp' ? '🧑‍🤝‍🧑 Combat entre amis' : '🤖 ' + esc(op.name)}</b> <span class=\"mut\">Tour ${v.turnNo}${timer}</span></div>\n     ${v.bossGlobal ? `<div class=\"row\" style=\"flex:1;max-width:420px\"><span>PV du boss (tout le monde) :</span><div class=\"hpbar\"><i style=\"width:${v.bossGlobal.hp / v.bossGlobal.max * 100}%\"></i></div></div>` : ''}\n     <div>${v.ended ? '<button class=\"pri sm\" onclick=\"closeBattle()\">Quitter</button>' : '<button class=\"sm red\" onclick=\"if(confirmQuit())act({type:\\'forfeit\\'})\">🏳️ Abandonner</button>'}</div>\n   </div>\n   <div class=\"bf\">\n    <div class=\"field\">\n     <div class=\"side\"><div class=\"pinfo\">${op.staff ? '👑 ' : ''}${esc(op.name)} ${op.boss ? '' : `· K.O. faits ${prizes(op.kos)} · 🂠 ${op.deck} · ✋ ${op.handN}`}</div>\n      <div class=\"prow\">${monHTML(op.active, false, true)}<div class=\"benchrow\">${op.bench.map(m => monHTML(m, false, false)).join('')}</div></div></div>\n     <div class=\"side\"><div class=\"prow\">${monHTML(me.active, true, true)}<div class=\"benchrow\">${me.bench.map(m => monHTML(m, true, false)).join('')}${me.bench.length < 4 ? '<div class=\"mut\" style=\"align-self:center;font-size:12px\">Banc ' + me.bench.length + '/4</div>' : ''}</div></div>\n      <div class=\"pinfo\">${esc(me.name)} · K.O. faits ${prizes(me.kos)} · 🂠 ${me.deck} ${me.energyDone ? '· ⚡ donnée' : '· ⚡ dispo'}</div></div>\n    </div>\n    <div class=\"log\" id=\"blog\">${v.log.map(l => `<div class=\"${l.k}\">${esc(l.txt)}</div>`).join('')}</div>\n   </div>\n   <div class=\"acts\">${actions}</div>\n   <div class=\"hand\">${me.hand.map(h => { const c = D.CARDS[h.id]; const playable = v.myTurn && (c.stage === 0 ? (!me.active || me.bench.length < 4) : [me.active, ...me.bench].some(m => m && m.id === c.from && m.played < v.turnNo)); return cardHTML(h.id, { size: 'mini', onclick: `clickHand(${h.uid})`, cls: (BT.sel && BT.sel.uid === h.uid ? 'sel' : '') + (playable ? '' : ''), attr: playable ? '' : 'style=\"opacity:.75\"' }); }).join('') || '<span class=\"mut\">Main vide</span>'}</div>\n   ${v.ended ? resultHTML(v) : ''}`;\n  const lg = $('#blog'); if (lg) lg.scrollTop = lg.scrollHeight;\n  // effets\n  if (v.fx && v.fx.t !== BT.lastFx) { BT.lastFx = v.fx.t; const el = document.getElementById('m' + v.fx.target); if (el) { el.classList.add('hit'); const d = document.createElement('div'); d.className = 'dmgnum'; d.textContent = '-' + v.fx.dmg; el.appendChild(d); } }\n  if (BT.wasMyTurn !== v.myTurn && !v.ended) { if (v.myTurn) { const f = document.createElement('div'); f.className = 'turnflag'; f.textContent = 'À TOI DE JOUER !'; $('.field').appendChild(f); } BT.wasMyTurn = v.myTurn; }\n}\nfunction confirmQuit() { return confirm('Abandonner le combat ?'); }\nfunction resultHTML(v) {\n  const r = v.result || {}; const win = v.winner === 'me';\n  return `<div class=\"result\"><div class=\"panel col\" style=\"text-align:center;min-width:300px\"><div style=\"font-size:64px\">${win ? '🏆' : v.winner === 'draw' ? '🤝' : '💀'}</div>\n   <h1 style=\"font-size:40px\" class=\"${win ? 'galact' : ''}\">${win ? 'VICTOIRE !' : v.winner === 'draw' ? 'ÉGALITÉ' : 'DÉFAITE'}</h1><div class=\"mut\">${esc(v.reason || '')}</div>\n   ${r.dealt != null ? `<div>Dégâts au boss : <b>${fmt(r.dealt)}</b></div>` : ''}\n   <div style=\"font-size:20px\">💰 +${fmt(r.credits || 0)} crédits</div>${r.xp ? `<div style=\"font-size:20px\">✨ +${fmt(r.xp)} XP</div>` : ''}\n   ${r.ups ? `<div style=\"font-size:22px;color:var(--acc)\">⬆️ NIVEAU SUPÉRIEUR !</div>` : ''}\n   <div class=\"row\" style=\"justify-content:center\">${v.mode === 'bot' ? `<button class=\"pri\" onclick=\"closeBattle();startFight('bot',${v.diff})\">Rejouer</button>` : ''}<button onclick=\"closeBattle()\">Retour</button></div></div></div>`;\n}\nwindow.addEventListener('beforeunload', () => { });\n\n// ======================= COLLECTION =======================\nconst CF = { type: '', rar: '', own: '', q: '' };\nfunction pColl() {\n  const all = Object.values(D.CARDS); const owned = all.filter(c => ownedN(c.id) > 0).length;\n  return `<div class=\"panel col\"><div class=\"row\" style=\"justify-content:space-between\"><h2>📚 Collection — ${ME.staff ? 'TOUTES' : owned + ' / ' + all.length} cartes</h2></div>\n   <div class=\"row\"><input id=\"cfq\" placeholder=\"🔎 Chercher…\" value=\"${esc(CF.q)}\" oninput=\"CF.q=this.value;drawColl()\">\n   <select onchange=\"CF.type=this.value;drawColl()\"><option value=\"\">Tous les types</option>${Object.entries(D.TYPES).map(([k, t]) => `<option value=\"${k}\" ${CF.type === k ? 'selected' : ''}>${t.i} ${t.n}</option>`).join('')}</select>\n   <select onchange=\"CF.rar=this.value;drawColl()\"><option value=\"\">Toutes les raretés</option>${D.RARITIES.map((r, i) => `<option value=\"${i}\" ${CF.rar === String(i) ? 'selected' : ''}>${r.n}</option>`).join('')}</select>\n   <select onchange=\"CF.own=this.value;drawColl()\"><option value=\"\">Toutes</option><option value=\"1\" ${CF.own === '1' ? 'selected' : ''}>Possédées</option><option value=\"2\" ${CF.own === '2' ? 'selected' : ''}>En double</option><option value=\"0\" ${CF.own === '0' ? 'selected' : ''}>Manquantes</option></select></div>\n   <div class=\"mut\">Touche une carte pour la voir en grand ou l'offrir à un ami (si tu l'as en double).</div></div>\n   <div class=\"grid\" id=\"collgrid\" style=\"margin-top:16px\"></div>`;\n}\nfunction drawColl() {\n  const q = CF.q.toLowerCase(); let l = Object.values(D.CARDS).filter(c => (!CF.type || c.type === CF.type) && (CF.rar === '' || c.r === +CF.rar) && (!q || c.name.toLowerCase().includes(q)));\n  if (CF.own === '1') l = l.filter(c => ownedN(c.id) > 0); if (CF.own === '2') l = l.filter(c => ownedN(c.id) > 1); if (CF.own === '0') l = l.filter(c => ownedN(c.id) === 0);\n  l.sort((a, b) => a.num - b.num);\n  $('#collgrid').innerHTML = l.map(c => { const n = ownedN(c.id); return cardHTML(c.id, { count: ME.staff ? 0 : n, no: !n, size: 'mini' }); }).join('') || '<div class=\"mut\">Aucune carte.</div>';\n}\n\n// ======================= DECK =======================\nlet DK = null;\nfunction pDeck() {\n  if (!DK) DK = (ME.active && ME.active.length ? ME.active.slice() : []);\n  return `<div class=\"col\">\n   ${ME.staff ? `<div class=\"panel row\" style=\"justify-content:space-between\"><div>🌠 <b class=\"galact\" style=\"font-size:20px\">Deck Galactique</b><div class=\"mut\">Deck staff très cheaté : toutes les exclusives + les cartes God.</div></div><button class=\"${ME.useGalactique ? 'grn' : 'pri'}\" onclick=\"setGal(${!ME.useGalactique})\">${ME.useGalactique ? '✅ Utilisé (cliquer pour enlever)' : 'Utiliser le Deck Galactique'}</button></div>` : ''}\n   <div class=\"panel\"><div class=\"row\" style=\"justify-content:space-between\"><h2>🃏 Mon deck (<span id=\"dkn\">${DK.length}</span>/${D.DECK_SIZE})</h2>\n   <div class=\"row\"><button onclick=\"DK=[];drawDeck()\">Vider</button><button onclick=\"autoDeck()\">✨ Deck auto (meilleures cartes)</button><button class=\"grn\" onclick=\"saveDeck()\">💾 Sauvegarder</button></div></div>\n   <div class=\"mut\">Entre 10 et ${D.DECK_SIZE} cartes, avec au moins une créature de <b>Base</b>. Mets les évolutions avec leurs bases !</div>\n   <div id=\"dklist\" class=\"row\" style=\"margin-top:10px;gap:6px\"></div></div>\n   <div class=\"panel\"><div class=\"row\"><h3 style=\"margin:0\">Mes cartes</h3><input placeholder=\"🔎\" oninput=\"CF.q=this.value;drawDeck()\" value=\"${esc(CF.q)}\"></div><div class=\"grid\" id=\"dkcoll\" style=\"margin-top:10px\"></div></div></div>`;\n}\nfunction drawDeck() {\n  const cnt = {}; DK.forEach(id => cnt[id] = (cnt[id] || 0) + 1);\n  $('#dkn').textContent = DK.length;\n  const ids = Object.keys(cnt).sort((a, b) => D.CARDS[a].num - D.CARDS[b].num);\n  $('#dklist').innerHTML = ids.map(id => `<div style=\"position:relative\">${cardHTML(id, { size: 'tiny', count: cnt[id], onclick: `dkRem('${id}')` })}</div>`).join('') || '<div class=\"mut\">Deck vide — touche des cartes en dessous pour les ajouter.</div>';\n  const q = CF.q.toLowerCase();\n  const l = Object.values(D.CARDS).filter(c => ownedN(c.id) > 0 && (!q || c.name.toLowerCase().includes(q))).sort((a, b) => b.r - a.r || a.num - b.num);\n  $('#dkcoll').innerHTML = l.map(c => { const left = ownedN(c.id) - (cnt[c.id] || 0); return cardHTML(c.id, { size: 'mini', count: ME.staff ? 0 : left, no: left <= 0, onclick: `dkAdd('${c.id}')` }); }).join('') || '<div class=\"mut\">Tu n\\'as pas encore de cartes. Atteins le niveau 5 ou achète un deck !</div>';\n}\nfunction dkAdd(id) { const cnt = DK.filter(x => x === id).length; if (cnt >= ownedN(id)) return toast('Tu n\\'en as plus.', 1); if (DK.length >= D.DECK_SIZE) return toast('Deck plein (' + D.DECK_SIZE + ').', 1); DK.push(id); drawDeck(); }\nfunction dkRem(id) { const i = DK.indexOf(id); if (i >= 0) DK.splice(i, 1); drawDeck(); }\nfunction autoDeck() {\n  const pool = []; for (const c of Object.values(D.CARDS)) { const n = Math.min(ownedN(c.id), ME.staff ? 2 : 4); for (let i = 0; i < n; i++) pool.push(c); }\n  const score = (c) => c.atk[1].d + c.hp / 2 + c.r * 10;\n  const out = []; const basics = pool.filter(c => c.stage === 0).sort((a, b) => score(b) - score(a));\n  for (const b of basics) { if (out.length >= D.DECK_SIZE) break; out.push(b.id); const s1 = pool.find(c => c.from === b.id && !out.includes(c.id)); if (s1 && out.length < D.DECK_SIZE) { out.push(s1.id); const s2 = pool.find(c => c.from === s1.id && !out.includes(c.id)); if (s2 && out.length < D.DECK_SIZE) out.push(s2.id); } }\n  DK = out.slice(0, D.DECK_SIZE); drawDeck(); toast('Deck auto créé, pense à sauvegarder !');\n}\nasync function saveDeck() { const r = await api('setDeck', { list: DK }); if (r.err) return toast(r.err, 1); toast('Deck sauvegardé ✅'); await refresh(); }\nasync function setGal(on) { await api('setDeck', { galactique: on }); await refresh(); render(); }\n\n// ======================= BOUTIQUE =======================\nconst DECK_ICONS = { base: '🎴', terre: '🪨', eau: '💧', feu: '🔥', psy: '🔮', ombre: '🌑', dragon: '🐉', vol: '🪶', metal: '⚙️', chromatique: '🌈', diamond: '💎', demon: '😈', angel: '😇', god: '👁️' };\nconst DECK_COLORS = { base: '#6b6b8a', terre: '#9b6a35', eau: '#1f8bff', feu: '#ff5a1f', psy: '#d14bff', ombre: '#5b3a8c', dragon: '#2fb36b', vol: '#8fd3ff', metal: '#a7b4c2', chromatique: 'linear-gradient(135deg,red,orange,yellow,lime,cyan,blue,violet)', diamond: '#9ee8ff', demon: '#c1121f', angel: '#fff6d8', god: 'linear-gradient(135deg,#fff,#ffd700,#fff)' };\nfunction pShop() {\n  const ev = STATE.G.event && STATE.G.event.on ? STATE.G.event : null;\n  return `<div class=\"col\"><div class=\"panel\"><h2>🛒 Boutique de decks</h2><div class=\"mut\">Chaque deck contient <b>${D.DECK_SIZE} cartes</b> au hasard, avec au moins une carte garantie de la rareté indiquée. Plus le deck est cher, plus les cartes sont rares ! Chance d'avoir une <b>EXCLUSIVE</b> : 0,0001 % par carte.</div>\n   <div style=\"margin-top:6px\">Tes crédits : <b style=\"color:var(--acc)\">${ME.staff ? '∞ (staff)' : fmt(ME.credits)}</b></div></div>\n   ${ev ? `<div class=\"panel\" style=\"border-color:${ev.info.c}\"><h2>${ev.info.i} Deck d'event : ${esc(ev.info.n)}</h2><div class=\"mut\">Fin dans <span data-until=\"${ev.end}\">${timeLeft(ev.end - Date.now())}</span> — 4 cartes d'event + 6 cartes bonus</div><div class=\"row\" style=\"margin:10px 0\">${ev.info.cards.map(x => { const c = Object.values(D.CARDS).find(cc => cc.name === x[1]); return c ? cardHTML(c.id, { size: 'tiny' }) : ''; }).join('')}</div><button class=\"pri\" onclick=\"buy('event',${ev.price})\">Acheter — ${fmt(ev.price)} 💰</button></div>` : ''}\n   <div class=\"grid\">${D.DECKS.map(d => { const g = D.RARITIES[d.guar]; return `<div class=\"deckbox ${d.gold ? 'gold' : ''}\" style=\"--dc:${DECK_COLORS[d.id]}\">\n     <div class=\"pk shine\">${DECK_ICONS[d.id]}</div><b style=\"font-size:18px\">${esc(d.n)}</b>\n     <div class=\"mut\" style=\"font-size:13px\">Garantie : 1 carte <b style=\"color:${g.c === 'rainbow' ? '#ff9af0' : g.c}\">${g.n}</b> ou mieux</div>\n     <div class=\"price\">${fmt(d.price)} 💰</div>${ME.decksBought && ME.decksBought[d.id] ? `<div class=\"mut\" style=\"font-size:12px\">Acheté ${ME.decksBought[d.id]} fois</div>` : ''}\n     <button class=\"pri\" ${!ME.staff && ME.credits < d.price ? 'disabled' : ''} onclick=\"buy('${d.id}',${d.price})\">Acheter</button></div>`; }).join('')}</div></div>`;\n}\nasync function buy(id, price) {\n  if (!ME.staff && !confirm('Acheter ce deck pour ' + fmt(price) + ' crédits ?')) return;\n  const r = await api('buyDeck', { deck: id }); if (r.err) return toast(r.err, 1);\n  showOpening(r); await refresh();\n}\nfunction showOpening(r) {\n  const O = $('#opening'); const list = r.list.slice().sort((a, b) => D.CARDS[a].r - D.CARDS[b].r);\n  O.innerHTML = `<h1 class=\"galact\" style=\"font-size:34px\">${esc(r.name)}</h1><div class=\"stage\" id=\"opstage\"></div><div class=\"row\"><button class=\"pri\" id=\"opskip\" onclick=\"OPEN_SKIP=1\">Tout révéler</button><button class=\"hide\" id=\"opclose\" onclick=\"$('#opening').classList.add('hide');DK=null;render()\">Super ! ✅</button></div>`;\n  O.classList.remove('hide'); OPEN_SKIP = 0; let i = 0;\n  const step = () => {\n    if (i >= list.length) { $('#opskip').classList.add('hide'); $('#opclose').classList.remove('hide'); return; }\n    const id = list[i++]; const c = D.CARDS[id]; const lost = r.got.find(g => g.id === id && !g.ok);\n    const el = document.createElement('div'); el.className = 'flip'; el.innerHTML = cardHTML(id, { size: 'mini' }) + (lost ? '<div class=\"mut\" style=\"font-size:11px;text-align:center\">max exclusives</div>' : '');\n    $('#opstage').appendChild(el);\n    if (c.r >= 6 && !OPEN_SKIP) { const big = document.createElement('div'); big.className = 'bigreveal'; big.innerHTML = `<h1 class=\"galact\" style=\"font-size:40px\">${D.RARITIES[c.r].n.toUpperCase()} !</h1>${cardHTML(id, { size: 'big', click: false })}<button class=\"pri\">Continuer</button>`; document.body.appendChild(big); big.querySelector('button').onclick = () => { big.remove(); setTimeout(step, 100); }; return; }\n    setTimeout(step, OPEN_SKIP ? 20 : 220);\n  };\n  step();\n}\nlet OPEN_SKIP = 0;\n\n// ======================= AMIS =======================\nfunction pFriends() {\n  return `<div class=\"col\">\n   <div class=\"panel row\" style=\"justify-content:space-between;align-items:flex-start\">\n    <div class=\"col\"><h2>👥 Mon code ami</h2><div class=\"bigcode\" style=\"text-align:left\">${ME.code}</div><div class=\"mut\">Donne ce code (ou ton pseudo) à tes amis.</div></div>\n    <div class=\"col\" style=\"min-width:260px\"><b>Ajouter un ami</b><input id=\"addwho\" placeholder=\"Pseudo ou code ami\"><button class=\"pri\" onclick=\"addFriend()\">Envoyer la demande</button></div>\n   </div>\n   ${STATE.reqs.length ? `<div class=\"panel\"><h3>📨 Demandes d'ami</h3>${STATE.reqs.map(n => `<div class=\"row\" style=\"padding:4px 0\"><b style=\"flex:1\">${esc(n)}</b><button class=\"grn sm\" onclick=\"fr('friendAccept','${esc(n)}')\">Accepter</button><button class=\"sm\" onclick=\"fr('friendDecline','${esc(n)}')\">Refuser</button></div>`).join('')}</div>` : ''}\n   <div class=\"panel\"><h3>Mes amis (${STATE.friends.length})</h3>\n   ${STATE.friends.length ? `<table>${STATE.friends.map(f => `<tr><td><span class=\"dot ${f.online ? 'on' : ''}\"></span><b>${f.role === 'creator' ? '👑 ' : f.role === 'admin' ? '🛡️ ' : ''}${esc(f.name)}</b></td><td>${f.staff ? '<span class=\"galact\">GALACTIQUE</span>' : esc(f.levelName)}</td><td>${f.inBattle ? '⚔️ en combat' : f.online ? 'en ligne' : 'hors ligne'}</td>\n     <td style=\"text-align:right\"><button class=\"sm red\" onclick=\"createRoom('${esc(f.name)}')\">⚔️ Défier</button> <button class=\"sm pri\" onclick=\"giftPick('${esc(f.name)}')\">🎁 Offrir</button> <button class=\"sm\" onclick=\"if(confirm('Retirer ${esc(f.name)} ?'))fr('friendRemove','${esc(f.name)}')\">✖</button></td></tr>`).join('')}</table>` : '<div class=\"mut\">Pas encore d\\'amis. Ajoute-les avec leur pseudo ou leur code !</div>'}</div></div>`;\n}\nasync function addFriend() { const r = await api('friendAdd', { who: $('#addwho').value }); if (r.err) return toast(r.err, 1); toast(r.ok); await refresh(); render(); }\nasync function fr(a, who) { const r = await api(a, { who }); if (r.err) toast(r.err, 1); else if (r.ok) toast(r.ok); await refresh(); render(); }\nfunction giftPick(to) {\n  const l = Object.values(D.CARDS).filter(c => ME.staff ? true : ownedN(c.id) >= 2).sort((a, b) => b.r - a.r);\n  openModal(`<h2>🎁 Offrir une carte à ${esc(to)}</h2><div class=\"mut\">${ME.staff ? 'Staff : tu peux offrir n\\'importe quelle carte.' : 'Seulement tes cartes en double.'}</div><input placeholder=\"🔎\" oninput=\"document.querySelectorAll('#gpl .card').forEach(e=>e.style.display=e.textContent.toLowerCase().includes(this.value.toLowerCase())?'':'none')\">\n   <div class=\"grid\" id=\"gpl\" style=\"margin-top:10px\">${l.map(c => cardHTML(c.id, { size: 'tiny', count: ME.staff ? 0 : ownedN(c.id), onclick: `giftTo('${esc(to)}','${c.id}')` })).join('') || '<div class=\"mut\">Aucune carte en double.</div>'}</div><button onclick=\"closeModal()\" style=\"margin-top:10px\">Fermer</button>`);\n}\nasync function giftTo(to, id) { if (!confirm('Offrir ' + D.CARDS[id].name + ' à ' + to + ' ?')) return; const r = await api('gift', { to, card: id }); if (r.err) return toast(r.err, 1); toast(r.ok); closeModal(); await refresh(); }\n\n// ======================= STAFF =======================\nfunction pStaff() {\n  if (!ME.staff) return '';\n  const cardsOpt = Object.values(D.CARDS).sort((a, b) => b.r - a.r || a.num - b.num).map(c => `<option value=\"${c.id}\">${esc(c.name)} — ${D.RARITIES[c.r].n}</option>`).join('');\n  const lvlOpt = Array.from({ length: D.MAX_LEVEL + 1 }, (_, i) => `<option value=\"${i}\">${i <= 100 ? 'Niveau ' + i : D.RANK_ICONS[i - 101] + ' ' + D.RANKS[i - 101]}</option>`).join('');\n  const dt = (ms) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };\n  return `<div class=\"col\"><div class=\"panel\"><h2>👑 Panneau Staff <span class=\"mut\" style=\"font-size:14px\">(Admin et Créateur ont les mêmes pouvoirs)</span></h2>\n   <div class=\"row\"><b>Joueur ciblé :</b><input id=\"st\" placeholder=\"pseudo (ou * pour TOUT LE MONDE)\" style=\"min-width:260px\"><button class=\"sm\" onclick=\"$('#st').value='${esc(ME.name)}'\">Moi</button><button class=\"sm\" onclick=\"$('#st').value='*'\">Tout le monde</button></div></div>\n   <div class=\"row\" style=\"align-items:stretch\">\n   <div class=\"panel col\" style=\"flex:1;min-width:280px\"><h3>💰 Crédits</h3><div class=\"row\"><input id=\"sc\" type=\"number\" placeholder=\"montant\" value=\"100000\"><button class=\"pri\" onclick=\"S('credits',{amount:$('#sc').value})\">Donner</button><button onclick=\"S('setcredits',{amount:$('#sc').value})\">Régler à</button></div>\n    <h3>🃏 Cartes</h3><select id=\"scard\">${cardsOpt}</select><div class=\"row\"><input id=\"scn\" type=\"number\" value=\"1\" style=\"width:80px\"><button class=\"pri\" onclick=\"S('card',{card:$('#scard').value,n:$('#scn').value})\">Donner</button><button onclick=\"S('takecard',{card:$('#scard').value,n:$('#scn').value})\">Retirer</button><button class=\"vio\" onclick=\"if(confirm('Donner TOUTES les cartes ?'))S('allcards')\">Toutes les cartes</button></div>\n    <h3>🎴 Decks</h3><div class=\"row\"><select id=\"sdeck\">${D.DECKS.map(d => `<option value=\"${d.id}\">${esc(d.n)}</option>`).join('')}</select><button class=\"pri\" onclick=\"S('deck',{deck:$('#sdeck').value})\">Offrir</button><button onclick=\"S('starter')\">Deck de départ</button></div>\n    <h3>⬆️ Niveau / XP</h3><div class=\"row\"><select id=\"slvl\">${lvlOpt}</select><button class=\"pri\" onclick=\"S('level',{level:$('#slvl').value})\">Mettre ce niveau</button></div><div class=\"row\"><input id=\"sxp\" type=\"number\" placeholder=\"XP\" value=\"10000\"><button onclick=\"S('xp',{amount:$('#sxp').value})\">Donner XP</button></div></div>\n   <div class=\"panel col\" style=\"flex:1;min-width:280px\"><h3>🔨 Modération</h3><div class=\"row\"><input id=\"sban\" type=\"number\" placeholder=\"minutes (vide = définitif)\" style=\"width:200px\"><button class=\"red\" onclick=\"S('ban',{minutes:$('#sban').value===''?-1:$('#sban').value})\">Bannir</button><button onclick=\"S('unban')\">Débannir</button></div>\n    <div class=\"row\"><button class=\"vio\" onclick=\"S('role',{role:'admin'})\">Nommer admin</button><button onclick=\"S('role',{role:'player'})\">Retirer admin</button><button onclick=\"S('resetpass')\">Nouveau mot de passe</button><button class=\"red\" onclick=\"if(confirm('SUPPRIMER ce compte pour toujours ?'))S('delete')\">Supprimer le compte</button></div>\n    <h3>📢 Annonce</h3><div class=\"row\"><input id=\"sann\" placeholder=\"message pour tous\" style=\"flex:1\"><button class=\"pri\" onclick=\"S('announce',{msg:$('#sann').value})\">Envoyer</button><button class=\"sm\" onclick=\"S('clearannounces')\">Effacer</button></div></div>\n   </div>\n   <div class=\"row\" style=\"align-items:stretch\">\n   <div class=\"panel col\" style=\"flex:1;min-width:260px\"><h3>🚀 Boost (event lancé par le staff)</h3><input id=\"bl\" placeholder=\"Nom (ex : Week-end XP)\" value=\"Boost du staff\"><div class=\"row\">XP x<input id=\"bx\" type=\"number\" value=\"2\" style=\"width:70px\"> Crédits x<input id=\"bc\" type=\"number\" value=\"2\" style=\"width:70px\"> Chance x<input id=\"bk\" type=\"number\" value=\"1\" style=\"width:70px\"></div><div class=\"row\">Durée (min)<input id=\"bm\" type=\"number\" value=\"60\" style=\"width:90px\"><button class=\"pri\" onclick=\"S('boost',{label:$('#bl').value,xp:$('#bx').value,credits:$('#bc').value,luck:$('#bk').value,minutes:$('#bm').value})\">Lancer</button><button onclick=\"S('stopboost')\">Arrêter</button></div></div>\n   <div class=\"panel col\" style=\"flex:1;min-width:260px\"><h3>📅 Event à dates</h3><select id=\"et\">${Object.entries(D.EVENT_THEMES).map(([k, t]) => `<option value=\"${k}\">${t.i} ${esc(t.n)}</option>`).join('')}</select><div class=\"row\">Début<input id=\"es\" type=\"datetime-local\" value=\"${dt(Date.now())}\"></div><div class=\"row\">Fin<input id=\"ee\" type=\"datetime-local\" value=\"${dt(Date.now() + 3 * 86400000)}\"></div><div class=\"row\">Prix du deck<input id=\"ep\" type=\"number\" value=\"50000\" style=\"width:120px\"><button class=\"pri\" onclick=\"S('event',{theme:$('#et').value,start:$('#es').value,end:$('#ee').value,price:$('#ep').value})\">Programmer</button><button onclick=\"S('stopevent')\">Arrêter</button></div></div>\n   <div class=\"panel col\" style=\"flex:1;min-width:260px\"><h3>👹 Boss d'event</h3><select id=\"bb\" onchange=\"$('#bhp').value=D.BOSSES[this.value].hp\">${Object.entries(D.BOSSES).map(([k, b]) => `<option value=\"${k}\">${esc(b.n)}</option>`).join('')}</select><div class=\"row\">PV<input id=\"bhp\" type=\"number\" value=\"${Object.values(D.BOSSES)[0].hp}\" style=\"width:120px\"> Durée (h)<input id=\"bh\" type=\"number\" value=\"24\" style=\"width:70px\"></div><div class=\"row\"><button class=\"red\" onclick=\"S('boss',{boss:$('#bb').value,hp:$('#bhp').value,hours:$('#bh').value})\">Faire apparaître</button><button onclick=\"S('stopboss')\">Retirer</button></div><div class=\"mut\" style=\"font-size:13px\">Tout le monde l'attaque ensemble. Quand il tombe : crédits pour tous + sa carte pour le n°1 (et 30 % de chance pour les autres).</div></div>\n   </div>\n   <div class=\"panel\"><div class=\"row\"><h3 style=\"margin:0\">Joueurs</h3><input id=\"squ\" placeholder=\"🔎\" oninput=\"staffUsers()\"></div><div id=\"sulist\" style=\"margin-top:8px\"></div></div></div>`;\n}\nasync function S(action, extra = {}) {\n  const target = $('#st') ? $('#st').value.trim() : ''; const needT = !['boost', 'stopboost', 'event', 'stopevent', 'boss', 'stopboss', 'announce', 'clearannounces'].includes(action);\n  if (needT && !target) return toast('Écris le pseudo du joueur ciblé en haut.', 1);\n  if (target === '*' && needT && !confirm('Faire ça à TOUT LE MONDE ?')) return;\n  const r = await api('admin', Object.assign({ do: action, target }, extra)); if (r.err) return toast(r.err, 1); toast(r.ok || 'OK'); await refresh(); staffUsers();\n}\nasync function staffUsers() {\n  const r = await api('admin', { do: 'users', q: $('#squ') ? $('#squ').value : '' }); if (!r.list || !$('#sulist')) return;\n  $('#sulist').innerHTML = `<table><tr><th>Joueur</th><th>Rôle</th><th>Niveau</th><th>Crédits</th><th>Cartes</th><th></th></tr>${r.list.map(u => `<tr><td><span class=\"dot ${u.online ? 'on' : ''}\"></span>${esc(u.name)}${u.banned ? ' ⛔' : ''}</td><td>${u.role === 'creator' ? '👑 Créateur' : u.role === 'admin' ? '🛡️ Admin' : 'Joueur'}</td><td>${esc(u.level)}</td><td>${fmt(u.credits)}</td><td>${u.cards}</td><td><button class=\"sm\" onclick=\"$('#st').value='${esc(u.name)}';$('#main').scrollTop=0\">Choisir</button></td></tr>`).join('')}</table>`;\n}\n\nstart();\n</script>\n</body>\n</html>\n";

// ---------- comptes staff d'origine (codes secrets : seul le hash est ici) ----------
const ORIGINALS = {
  dylan_lane: { name: 'Dylan_lane', role: 'admin', codeHash: '2a3cc0c4d381f98bd6e8bc75a04888e39983312fa1e19405401b7dd6a4a0b860' },
  zokutnt27: { name: 'zokutnt27', role: 'creator', codeHash: '8e0b306241e6ad87bea94ab77fc24b74238d5e3e71ae453beb2ad13762908c6c' },
};

// ---------- état ----------
let users = {};           // clé = pseudo en minuscules
let tokens = {};          // token -> clé
let G = {                 // état global du jeu
  boost: null,            // {xp, credits, luck, until, label}
  event: null,            // {theme, start, end, price}
  boss: null,             // {key, hp, max, until, dmg:{clé:dégâts}}
  announces: [],          // [{t, msg, by}]
  bossHistory: [],
};
const battles = {};       // id -> combat (mémoire)
const inBattle = {};      // clé -> id combat
const rooms = {};         // code -> {host, t}
const invites = {};       // clé -> [{from, code, t}]
const lastSeen = {};
const dirty = new Set();
let globalDirty = false;
let saveEnabled = true;

const now = () => Date.now();
const keyOf = (n) => String(n || '').trim().toLowerCase();
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function hashPass(p, salt) { return crypto.scryptSync(String(p), salt, 32).toString('hex'); }
function mark(u) { if (u) dirty.add(u.key); }
const isStaff = (u) => u && (u.role === 'admin' || u.role === 'creator');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeCode(n = 6) { let s = ''; for (let i = 0; i < n; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; return s; }

// ---------- sauvegarde ----------
const UP_URL = process.env.UPSTASH_REDIS_REST_URL, UP_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
const LOCAL_FILE = 'monster-booster-ultimate-data.json';
async function upstash(cmds) {
  const r = await fetch(UP_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + UP_TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('Upstash ' + r.status);
  return r.json();
}
async function loadAll() {
  try {
    if (UP_URL && UP_TOK) {
      const res = await upstash([['HGETALL', 'dm:users'], ['GET', 'dm:global']]);
      const flat = res[0].result || [];
      for (let i = 0; i < flat.length; i += 2) users[flat[i]] = JSON.parse(flat[i + 1]);
      if (res[1].result) G = Object.assign(G, JSON.parse(res[1].result));
      console.log('💾 Sauvegarde Upstash chargée :', Object.keys(users).length, 'comptes');
    } else if (fs.existsSync(LOCAL_FILE)) {
      const d = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
      users = d.users || {}; G = Object.assign(G, d.G || {});
      console.log('💾 Fichier local chargé :', Object.keys(users).length, 'comptes');
    } else console.log('💾 Nouvelle partie (aucune sauvegarde trouvée)');
  } catch (e) {
    console.log('⚠️ Chargement impossible, sauvegarde désactivée pour ne rien écraser :', e.message);
    saveEnabled = false;
  }
  for (const k in users) { const u = users[k]; for (const t of (u.tokens || [])) tokens[t] = k; fixUser(u); }
}
async function saveAll() {
  if (!saveEnabled) return;
  try {
    if (UP_URL && UP_TOK) {
      const cmds = [];
      for (const k of dirty) { if (users[k]) cmds.push(['HSET', 'dm:users', k, JSON.stringify(users[k])]); else cmds.push(['HDEL', 'dm:users', k]); }
      if (globalDirty) cmds.push(['SET', 'dm:global', JSON.stringify(G)]);
      if (cmds.length) await upstash(cmds);
    } else if (dirty.size || globalDirty) {
      fs.writeFileSync(LOCAL_FILE, JSON.stringify({ users, G }));
    }
    dirty.clear(); globalDirty = false;
  } catch (e) { console.log('⚠️ Sauvegarde ratée :', e.message); }
}
setInterval(saveAll, 15000);
process.on('SIGTERM', async () => { await saveAll(); process.exit(0); });
process.on('SIGINT', async () => { await saveAll(); process.exit(0); });

// ---------- comptes ----------
function fixUser(u) {
  u.cards = u.cards || {}; u.friends = u.friends || []; u.reqs = u.reqs || []; u.inbox = u.inbox || [];
  u.tokens = u.tokens || []; u.active = u.active || []; u.credits = u.credits || 0; u.xp = u.xp || 0; u.level = u.level || 0;
  u.wins = u.wins || 0; u.losses = u.losses || 0; u.decksBought = u.decksBought || {};
  if (!u.code) u.code = uniqueFriendCode();
  const o = ORIGINALS[u.key]; if (o) u.role = o.role;
}
function uniqueFriendCode() { let c; do { c = makeCode(6); } while (Object.values(users).some(x => x.code === c)); return c; }
function notify(u, txt) { u.inbox.unshift({ t: now(), txt }); u.inbox = u.inbox.slice(0, 40); mark(u); }
function owned(u, id) { return isStaff(u) ? 99 : (u.cards[id] || 0); }
function excCount(u) { let n = 0; for (const id in u.cards) if (CARDS[id] && CARDS[id].exclusive) n += u.cards[id]; return n; }
function addCard(u, id, n = 1) {
  const c = CARDS[id]; if (!c || n <= 0) return 0;
  if (c.exclusive && !isStaff(u)) n = Math.min(n, Math.max(0, EXCLUSIVE_MAX - excCount(u)));
  if (n <= 0) return 0;
  u.cards[id] = (u.cards[id] || 0) + n; mark(u); return n;
}
function removeCard(u, id, n = 1) { if ((u.cards[id] || 0) < n) return false; u.cards[id] -= n; if (!u.cards[id]) delete u.cards[id]; mark(u); return true; }

function giveStarter(u) {
  if (u.starter) return;
  u.starter = true; for (const id of STARTER) addCard(u, id, 1);
  if (!validDeck(u, u.active)) u.active = STARTER.slice();
  notify(u, '🎁 Niveau 5 atteint ! Tu as reçu le DECK DE DÉPART (20 cartes). Il est déjà équipé.');
}
function addXp(u, amount) {
  if (isStaff(u)) return 0;
  amount = Math.max(0, Math.round(amount)); u.xp += amount; let ups = 0;
  while (u.level < MAX_LEVEL && u.xp >= xpNeed(u.level)) { u.xp -= xpNeed(u.level); u.level++; ups++; if (u.level >= 5) giveStarter(u); }
  if (u.level >= MAX_LEVEL) u.xp = 0;
  if (ups) notify(u, '⬆️ Tu es passé au ' + levelName(u.level) + ' !');
  mark(u); return ups;
}
function setLevel(u, lvl) { u.level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(lvl))); u.xp = 0; if (u.level >= 5) giveStarter(u); mark(u); }

function validDeck(u, list) {
  if (!Array.isArray(list) || list.length < 10 || list.length > DECK_SIZE) return false;
  const cnt = {}; for (const id of list) { if (!CARDS[id]) return false; cnt[id] = (cnt[id] || 0) + 1; }
  for (const id in cnt) if (cnt[id] > owned(u, id)) return false;
  return list.some(id => CARDS[id].stage === 0);
}
function galactiqueDeck() {
  const l = Object.values(CARDS).filter(c => c.exclusive).map(c => c.id);
  for (const c of Object.values(CARDS)) if (c.r === 14 && !c.event) l.push(c.id);
  for (const c of Object.values(CARDS)) if (c.r === 13 && !c.event && l.length < 20) l.push(c.id);
  for (const c of Object.values(CARDS)) if (c.r === 12 && l.length < 20) l.push(c.id);
  return l.slice(0, 20);
}
function deckFor(u) {
  if (isStaff(u) && u.useGalactique) return galactiqueDeck();
  if (validDeck(u, u.active)) return u.active;
  if (isStaff(u)) return galactiqueDeck();
  return TRAINING.slice();
}

// ---------- tirages (achat de decks) ----------
function rarityRoll(tier, luck) {
  let tot = 0; const ws = []; const floor = tier >= 9 ? tier - 7 : 0; // les gros decks n'ont plus de cartes faibles
  for (let r = 0; r < 15; r++) { let w = r < floor ? 0 : RARITIES[r].w * Math.exp(tier * r * 0.045); if (luck > 1 && r >= 4) w *= luck; ws.push(w); tot += w; }
  let x = Math.random() * tot; for (let r = 0; r < 15; r++) { x -= ws[r]; if (x <= 0) return r; } return 0;
}
const NORMAL_POOL = Object.values(CARDS).filter(c => !c.exclusive && !c.event && !c.boss);
function pickCard(r, type) {
  let p = NORMAL_POOL.filter(c => c.r === r && (!type || c.type === type));
  if (!p.length) p = NORMAL_POOL.filter(c => c.r === r);
  let rr = r; while (!p.length && rr > 0) { rr--; p = NORMAL_POOL.filter(c => c.r === rr); }
  return rnd(p).id;
}
function rollDeck(deck, luck = 1) {
  const tier = DECKS.indexOf(deck); const type = deck.pool === 'all' ? null : deck.pool;
  const out = [pickCard(deck.guar, type)];
  // la 2e carte garantie : une créature de base du type, pour pouvoir jouer
  while (out.length < DECK_SIZE) {
    if (Math.random() < EXCLUSIVE_CHANCE * luck) { out.push(rnd(Object.values(CARDS).filter(c => c.exclusive)).id); continue; }
    const r = rarityRoll(tier, luck);
    out.push(pickCard(r, Math.random() < 0.8 ? type : null));
  }
  // évolutions jouables : ajoute la base si une évolution est seule
  for (let i = 0; i < out.length; i++) {
    const c = CARDS[out[i]];
    if (c.from && !out.includes(c.from)) { const base = c.from && CARDS[c.from].from ? CARDS[c.from].from : c.from; const j = out.findIndex(id => CARDS[id].r === 0 && CARDS[id].stage === 0 && id !== base); if (j >= 0) out[j] = base; }
  }
  return out;
}
function rollEvent(theme, luck = 1) {
  const th = EVENT_THEMES[theme]; const evc = th.cards.map(x => Object.values(CARDS).find(c => c.name === x[1]));
  const out = [];
  for (let i = 0; i < 4; i++) { let tot = 0; const ws = evc.map(c => { const w = RARITIES[c.r].w * (c.r >= 4 ? luck : 1) + 0.01; tot += w; return w; }); let x = Math.random() * tot; let k = 0; for (; k < ws.length - 1; k++) { x -= ws[k]; if (x <= 0) break; } out.push(evc[k].id); }
  for (let i = 0; i < 6; i++) out.push(pickCard(rarityRoll(3, luck), evc[0].type));
  return out;
}
const boostOn = () => G.boost && G.boost.until > now();
const bX = () => boostOn() ? G.boost.xp : 1, bC = () => boostOn() ? G.boost.credits : 1, bL = () => boostOn() ? G.boost.luck : 1;
const eventOn = () => G.event && G.event.start <= now() && G.event.end > now();
const bossOn = () => G.boss && G.boss.hp > 0 && G.boss.until > now();

// =================== MOTEUR DE COMBAT ===================
let UID = 1;
const inst = (id) => ({ uid: UID++, id });
const isBasic = (c) => CARDS[c.id] && CARDS[c.id].stage === 0;
function mkMon(c, turnNo) { return { uid: c.uid, id: c.id, dmg: 0, energy: 0, burn: false, poison: false, para: false, shield: 0, played: turnNo }; }
function cardOf(b, m) { return m.id.indexOf('BOSS_') === 0 ? b.bossCard : CARDS[m.id]; }
function newPlayer(name, key, ids, opts = {}) {
  return { name, key, deck: shuffle(ids.map(inst)), hand: [], active: null, bench: [], kos: 0, energyDone: false, bot: !!opts.bot, staff: !!opts.staff, level: opts.level || 0 };
}
function setupPlayer(p) {
  for (let t = 0; t < 8; t++) { p.hand = p.deck.splice(0, 5); if (p.hand.some(isBasic)) break; p.deck = shuffle(p.deck.concat(p.hand)); p.hand = []; }
  if (!p.hand.some(isBasic)) { const i = p.deck.findIndex(isBasic); if (i >= 0) p.hand.push(p.deck.splice(i, 1)[0]); }
  const basics = p.hand.filter(isBasic).sort((a, c) => CARDS[c.id].hp - CARDS[a.id].hp);
  const a = basics[0]; p.hand.splice(p.hand.indexOf(a), 1); p.active = mkMon(a, 0);
}
function L(b, txt, k) { b.log.push({ n: b.log.length, txt, k: k || '' }); if (b.log.length > 300) b.log.splice(0, 50); }
function newBattle(mode, p0, p1, extra = {}) {
  const b = Object.assign({ id: crypto.randomBytes(6).toString('hex'), mode, players: [p0, p1], turn: 0, turnNo: 1, log: [], winner: null, ended: false, created: now(), deadline: 0, result: {} }, extra);
  setupPlayer(p0); if (mode !== 'boss') setupPlayer(p1);
  if (mode === 'pvp') b.turn = Math.random() < 0.5 ? 0 : 1;
  battles[b.id] = b;
  if (p0.key) inBattle[p0.key] = b.id; if (p1.key) inBattle[p1.key] = b.id;
  L(b, '⚔️ Le combat commence ! ' + b.players[b.turn].name + ' joue en premier.', 'big');
  startTurn(b);
  return b;
}
function draw(b, p, n = 1) { for (let i = 0; i < n; i++) { if (!p.deck.length) return; p.hand.push(p.deck.shift()); } }
function startTurn(b) {
  if (b.ended) return;
  const p = b.players[b.turn];
  p.energyDone = false;
  for (const m of [p.active, ...p.bench]) if (m) m.shield = 0;
  if (!p.boss) draw(b, p, 1);
  b.deadline = now() + 90000;
  if (p.bot) runBot(b);
}
function allMons(p) { return [p.active, ...p.bench].filter(Boolean); }
function findMon(p, uid) { return allMons(p).find(m => m.uid === uid); }

function act(b, i, a) {
  if (b.ended) return 'Le combat est fini.';
  if (a.type === 'forfeit') { L(b, '🏳️ ' + b.players[i].name + ' abandonne.', 'bad'); finish(b, 1 - i, 'abandon'); return null; }
  if (b.turn !== i) return 'Ce n\'est pas ton tour.';
  const p = b.players[i], o = b.players[1 - i];
  if (a.type === 'play') {
    const h = p.hand.find(c => c.uid === a.uid); if (!h) return 'Carte introuvable.';
    const c = CARDS[h.id]; if (c.stage !== 0) return 'Seules les créatures de base se posent directement. Les autres évoluent !';
    if (!p.active) p.active = mkMon(h, b.turnNo); else { if (p.bench.length >= 4) return 'Ton banc est plein (4 max).'; p.bench.push(mkMon(h, b.turnNo)); }
    p.hand.splice(p.hand.indexOf(h), 1); L(b, p.name + ' pose ' + c.name + '.'); return null;
  }
  if (a.type === 'evolve') {
    const h = p.hand.find(c => c.uid === a.uid); if (!h) return 'Carte introuvable.';
    const c = CARDS[h.id]; const m = findMon(p, a.target); if (!m) return 'Cible introuvable.';
    if (c.from !== m.id) return c.name + ' évolue seulement depuis ' + (CARDS[c.from] ? CARDS[c.from].name : '?') + '.';
    if (m.played >= b.turnNo) return 'Attends le prochain tour pour faire évoluer ce monstre.';
    const old = CARDS[m.id].name; m.id = c.id; m.uid = h.uid; m.played = b.turnNo; m.burn = m.poison = m.para = false;
    p.hand.splice(p.hand.indexOf(h), 1); L(b, '✨ ' + old + ' évolue en ' + c.name + ' !', 'good'); return null;
  }
  if (a.type === 'energy') {
    if (p.energyDone) return 'Une seule énergie par tour.';
    const m = findMon(p, a.target); if (!m) return 'Cible introuvable.';
    m.energy++; p.energyDone = true; L(b, p.name + ' donne 1 énergie à ' + CARDS[m.id].name + '.'); return null;
  }
  if (a.type === 'retreat') {
    const A = p.active, ca = cardOf(b, A); const m = p.bench.find(x => x.uid === a.target); if (!m) return 'Choisis un monstre du banc.';
    if (A.para) return 'Ton monstre est paralysé !'; if (A.energy < ca.retreat) return 'Il faut ' + ca.retreat + ' énergie(s) pour battre en retraite.';
    A.energy -= ca.retreat; A.burn = A.poison = false; p.bench[p.bench.indexOf(m)] = A; p.active = m;
    L(b, p.name + ' rappelle ' + ca.name + ' et envoie ' + CARDS[m.id].name + '.'); return null;
  }
  if (a.type === 'attack') { const e = attack(b, i, a.n | 0); if (e) return e; if (!b.ended) endTurn(b); return null; }
  if (a.type === 'end') { endTurn(b); return null; }
  return 'Action inconnue.';
}
const coin = () => Math.random() < 0.5;
function attack(b, i, n) {
  const p = b.players[i], o = b.players[1 - i]; const A = p.active; if (!A) return 'Pas de monstre actif.';
  const ca = cardOf(b, A); const at = ca.atk[n]; if (!at) return 'Attaque inconnue.';
  if (A.para) return 'Ton monstre est paralysé ce tour !';
  if (A.energy < at.c) return 'Pas assez d\'énergie (' + at.c + ' nécessaire).';
  const D = o.active; if (!D) return 'Pas de cible.';
  const cd = cardOf(b, D);
  let dmg = at.d, extra = '';
  if (at.e === 'coin') { if (coin()) { dmg += 40; extra = ' (FACE ! +40)'; } else extra = ' (pile)'; }
  if (dmg > 0) {
    if (cd.weak === ca.type) { dmg *= 2; extra += ' — SUPER EFFICACE x2 !'; }
    if (cd.resist === ca.type) { dmg = Math.max(0, dmg - 20); extra += ' (résistance -20)'; }
    if (D.shield) { dmg = Math.max(0, dmg - D.shield); extra += ' (bouclier -' + D.shield + ')'; }
  }
  D.dmg += dmg;
  L(b, '💥 ' + ca.name + ' utilise ' + at.n + ' : ' + dmg + ' dégâts à ' + cd.name + extra, 'atk');
  b.fx = { t: now(), from: i, dmg, target: D.uid };
  if (o.boss) b.bossDealt = (b.bossDealt || 0) + dmg;
  switch (at.e) {
    case 'burn': if (!cd.boss) { D.burn = true; L(b, '🔥 ' + cd.name + ' est brûlé !'); } break;
    case 'poison': if (!cd.boss) { D.poison = true; L(b, '☠️ ' + cd.name + ' est empoisonné !'); } break;
    case 'paralyze': if (!cd.boss && coin()) { D.para = true; L(b, '⚡ FACE : ' + cd.name + ' est paralysé !'); } else L(b, 'Pile : pas de paralysie.'); break;
    case 'heal': A.dmg = Math.max(0, A.dmg - 30); L(b, '💚 ' + ca.name + ' se soigne de 30 PV.'); break;
    case 'heal_all': for (const m of allMons(p)) m.dmg = Math.max(0, m.dmg - 50); L(b, '💚 Tous les monstres de ' + p.name + ' sont soignés de 50 PV.'); break;
    case 'bench': for (const m of o.bench) m.dmg += 20; if (o.bench.length) L(b, '🌪️ 20 dégâts à tout le banc adverse.'); break;
    case 'nuke': for (const m of o.bench) m.dmg += 50; if (o.bench.length) L(b, '☄️ 50 dégâts à tout le banc adverse !'); break;
    case 'recoil': A.dmg += 20; L(b, ca.name + ' se blesse de 20 PV.'); break;
    case 'shield': A.shield = 30; L(b, '🛡️ ' + ca.name + ' se protège (-30 au prochain tour).'); break;
    case 'draw': draw(b, p, 2); L(b, p.name + ' pioche 2 cartes.'); break;
    case 'energy': A.energy++; L(b, '⚡ ' + ca.name + ' gagne 1 énergie.'); break;
  }
  checkKOs(b, i);
  return null;
}
function checkKOs(b, attacker) {
  const order = [1 - attacker, attacker];
  for (const j of order) {
    const p = b.players[j], o = b.players[1 - j];
    for (const m of allMons(p).slice()) {
      const c = cardOf(b, m);
      if (m.dmg >= c.hp) {
        if (p.boss) { L(b, '🏆 ' + c.name + ' EST VAINCU !!!', 'big'); b.bossKilled = true; finish(b, 1 - j, 'boss'); return; }
        L(b, '💀 ' + c.name + ' est K.O. !', 'ko');
        if (p.active === m) p.active = null; else p.bench.splice(p.bench.indexOf(m), 1);
        o.kos++;
      }
    }
    if (!p.active && p.bench.length) {
      let best = 0; p.bench.forEach((m, k) => { if (CARDS[m.id].hp - m.dmg > CARDS[p.bench[best].id].hp - p.bench[best].dmg) best = k; });
      p.active = p.bench.splice(best, 1)[0]; L(b, p.name + ' envoie ' + CARDS[p.active.id].name + ' au combat.');
    }
  }
  for (const j of order) {
    const p = b.players[j], o = b.players[1 - j];
    if (o.kos >= 3) { finish(b, 1 - j, '3 K.O.'); return; }
    if (!p.active) {
      const bi = p.hand.findIndex(isBasic);
      if (bi >= 0 && !p.boss) { p.active = mkMon(p.hand.splice(bi, 1)[0], b.turnNo); L(b, p.name + ' envoie ' + CARDS[p.active.id].name + ' depuis sa main.'); }
      else { finish(b, 1 - j, 'plus de monstre'); return; }
    }
  }
}
function endTurn(b) {
  if (b.ended) return;
  const p = b.players[b.turn];
  for (const pl of b.players) {
    const m = pl.active; if (!m) continue; const c = cardOf(b, m);
    if (m.poison) { m.dmg += 10; L(b, '☠️ Poison : ' + c.name + ' perd 10 PV.'); }
    if (m.burn) { m.dmg += 20; L(b, '🔥 Brûlure : ' + c.name + ' perd 20 PV.'); if (coin()) { m.burn = false; L(b, c.name + ' n\'est plus brûlé.'); } }
  }
  if (p.active && p.active.para) p.active.para = false;
  checkKOs(b, 1 - b.turn); if (b.ended) return;
  b.turn = 1 - b.turn; b.turnNo++;
  const limit = b.mode === 'boss' ? 50 : 100;
  if (b.turnNo > limit) {
    const [a, c] = b.players; L(b, '⏰ Limite de tours atteinte.', 'big');
    finish(b, a.kos > c.kos ? 0 : c.kos > a.kos ? 1 : -1, 'temps'); return;
  }
  if (b.turn === 0 || !b.players[b.turn].bot) L(b, '— Tour de ' + b.players[b.turn].name + ' —', 'turn');
  startTurn(b);
}

// ---------- IA des bots ----------
function runBot(b) {
  const i = b.turn, p = b.players[i], o = b.players[1 - i];
  L(b, '— Tour de ' + p.name + ' —', 'turn');
  if (p.boss) { const n = (b.turnNo % 3 === 0) ? 1 : 0; attack(b, i, n); if (!b.ended) endTurn(b); return; }
  const smart = p.diff >= 2;
  // poser les créatures de base
  for (const h of p.hand.slice()) if (isBasic(h) && (!p.active || p.bench.length < 4)) act(b, i, { type: 'play', uid: h.uid });
  // évoluer
  for (const h of p.hand.slice()) { const c = CARDS[h.id]; if (!c.from) continue; const m = allMons(p).find(x => x.id === c.from && x.played < b.turnNo); if (m) act(b, i, { type: 'evolve', uid: h.uid, target: m.uid }); }
  // retraite si le monstre actif va tomber
  const A = p.active; if (smart && A && p.bench.length) {
    const ca = CARDS[A.id]; const left = ca.hp - A.dmg;
    if (left <= 30 && A.energy >= ca.retreat && !A.para) { const best = p.bench.slice().sort((x, y) => y.energy - x.energy)[0]; if (best.energy > 0) act(b, i, { type: 'retreat', target: best.uid }); }
  }
  // énergie
  const act0 = p.active; const ca0 = CARDS[act0.id];
  if (act0.energy < ca0.atk[1].c) act(b, i, { type: 'energy', target: act0.uid });
  else { const t = p.bench.slice().sort((x, y) => CARDS[y.id].atk[1].d - CARDS[x.id].atk[1].d)[0]; act(b, i, { type: 'energy', target: (t || act0).uid }); }
  // attaque
  const A2 = p.active, ca = CARDS[A2.id], D = o.active; const cd = cardOf(b, D);
  let best = -1, bestScore = -1;
  ca.atk.forEach((at, n) => { if (A2.energy >= at.c && !A2.para) { let d = at.d; if (cd.weak === ca.type) d *= 2; const ko = D.dmg + d >= cd.hp; const s = d + (ko ? 1000 : 0) - (ko && n === 1 && ca.atk[0].d + D.dmg >= cd.hp ? 500 : 0); if (s > bestScore) { bestScore = s; best = n; } } });
  if (best >= 0) { attack(b, i, best); if (!b.ended) endTurn(b); } else endTurn(b);
}
const DIFFS = [
  { n: 'Facile', maxR: 1, mult: 0.6, lines: 4 },
  { n: 'Normal', maxR: 3, mult: 1, lines: 4 },
  { n: 'Difficile', maxR: 5, mult: 1.6, lines: 4 },
  { n: 'Expert', maxR: 9, mult: 2.5, lines: 3 },
  { n: 'Cauchemar', maxR: 14, mult: 4, lines: 2 },
];
function botDeck(diff) {
  const d = DIFFS[diff]; const roots = shuffle(Object.values(CARDS).filter(c => c.stage === 0 && !c.special && !c.exclusive && !c.event && c.r <= d.maxR && Object.values(CARDS).some(x => x.from === c.id)));
  const out = [];
  for (const r of roots.slice(0, d.lines)) {
    const s1 = Object.values(CARDS).find(x => x.from === r.id); const s2 = s1 && Object.values(CARDS).find(x => x.from === s1.id);
    out.push(r.id, r.id, r.id); if (s1 && s1.r <= d.maxR + 2) out.push(s1.id, s1.id); if (s2 && s2.r <= d.maxR + 2) out.push(s2.id);
  }
  const sp = Object.values(CARDS).filter(c => c.special && !c.event && c.r <= d.maxR);
  while (out.length < DECK_SIZE && sp.length && diff >= 3) out.push(rnd(sp).id);
  while (out.length < DECK_SIZE) out.push(rnd(roots).id);
  return out.slice(0, DECK_SIZE);
}

// ---------- fin de combat + récompenses ----------
function finish(b, winner, reason) {
  if (b.ended) return; b.ended = true; b.winner = winner; b.reason = reason; b.endedAt = now();
  const P = b.players;
  if (winner >= 0) L(b, '🏆 ' + P[winner].name + ' gagne le combat ! (' + reason + ')', 'big'); else L(b, '🤝 Égalité !', 'big');
  for (let i = 0; i < 2; i++) { if (P[i].key && inBattle[P[i].key] === b.id) delete inBattle[P[i].key]; }
  if (b.mode === 'bot') {
    const u = users[P[0].key]; if (!u) return; const d = DIFFS[b.diff]; const L0 = Math.min(u.level, MAX_LEVEL);
    const f = winner === 0 ? 1 : winner === -1 ? 0.4 : 0.25;
    const credits = Math.round((300 + 30 * Math.min(L0, 100)) * d.mult * f * bC());
    const xp = Math.round((150 + 25 * L0) * d.mult * f * bX());
    if (winner === 0) u.wins++; else if (winner === 1) u.losses++;
    u.credits += credits; const ups = addXp(u, xp); mark(u);
    b.result[0] = { credits, xp: isStaff(u) ? 0 : xp, ups, win: winner === 0 };
  } else if (b.mode === 'pvp') {
    for (let i = 0; i < 2; i++) {
      const u = users[P[i].key]; if (!u) continue; const L0 = Math.min(u.level, MAX_LEVEL);
      const f = winner === i ? 1 : winner === -1 ? 0.5 : 0.3; const fair = reason === 'abandon' && winner !== i ? 0 : 1;
      const credits = Math.round((400 + 20 * Math.min(L0, 100)) * f * bC() * fair), xp = Math.round((150 + 30 * L0) * 1.2 * f * bX() * fair);
      if (winner === i) u.wins++; else if (winner === 1 - i) u.losses++;
      u.credits += credits; const ups = addXp(u, xp); mark(u);
      b.result[i] = { credits, xp: isStaff(u) ? 0 : xp, ups, win: winner === i };
    }
  } else if (b.mode === 'boss') {
    const u = users[P[0].key]; if (!u || !G.boss) return;
    const dealt = Math.min(b.bossDealt || 0, Math.max(0, G.boss.hp));
    G.boss.hp -= dealt; G.boss.dmg[u.key] = (G.boss.dmg[u.key] || 0) + dealt; globalDirty = true;
    const credits = Math.round((dealt * 1.5 + 500) * bC()), xp = Math.round((200 + dealt / 3) * bX());
    u.credits += credits; const ups = addXp(u, xp); mark(u);
    b.result[0] = { credits, xp: isStaff(u) ? 0 : xp, ups, win: winner === 0, dealt };
    if (G.boss.hp <= 0) bossDefeated(u.key);
  }
}
function bossDefeated(byKey) {
  const bo = G.boss; const B = BOSSES[bo.key]; const ranking = Object.entries(bo.dmg).sort((a, c) => c[1] - a[1]);
  ranking.forEach(([k, d], idx) => {
    const u = users[k]; if (!u) return;
    const credits = Math.round(5000 + d * 3); u.credits += credits;
    let txt = '🏆 Le boss ' + B.n + ' est vaincu ! Tu avais fait ' + d + ' dégâts (#' + (idx + 1) + '). Récompense : ' + credits.toLocaleString('fr') + ' crédits';
    if (idx === 0 || Math.random() < 0.3) { addCard(u, B.drop, 1); txt += ' + la carte ' + CARDS[B.drop].name + ' !'; }
    if (k === byKey) { u.credits += 10000; txt += ' (+10 000 pour le coup final !)'; }
    notify(u, txt); mark(u);
  });
  G.announces.unshift({ t: now(), msg: '🏆 ' + B.n + ' a été vaincu ! Coup final : ' + (users[byKey] ? users[byKey].name : '?'), by: 'Jeu' });
  G.bossHistory.unshift({ key: bo.key, t: now(), top: ranking.slice(0, 3).map(([k, d]) => [users[k] ? users[k].name : k, d]) });
  G.boss = null; globalDirty = true;
}

// ---------- vue d'un combat pour un joueur ----------
function monView(b, m) { if (!m) return null; const c = cardOf(b, m); return { uid: m.uid, id: m.id, dmg: m.dmg, hp: c.hp, energy: m.energy, burn: m.burn, poison: m.poison, para: m.para, shield: m.shield, played: m.played, card: m.id.indexOf('BOSS_') === 0 ? c : undefined }; }
function battleView(b, i) {
  const me = b.players[i], op = b.players[1 - i];
  const pv = (p, mine) => ({ name: p.name, kos: p.kos, deck: p.deck.length, handN: p.hand.length, hand: mine ? p.hand : undefined, active: monView(b, p.active), bench: p.bench.map(m => monView(b, m)), energyDone: p.energyDone, bot: p.bot, boss: !!p.boss, staff: p.staff });
  return { id: b.id, mode: b.mode, me: pv(me, true), op: pv(op, false), myTurn: b.turn === i && !b.ended, turnNo: b.turnNo, log: b.log.slice(-60), ended: b.ended, winner: b.winner === -1 ? 'draw' : b.winner === i ? 'me' : b.winner === null ? null : 'op', reason: b.reason, result: b.result[i], deadline: b.deadline, now: now(), fx: b.fx, bossGlobal: b.mode === 'boss' && G.boss ? { hp: G.boss.hp, max: G.boss.max } : null, diff: b.diff };
}
function tickPvp(b) {
  if (b.ended || b.mode !== 'pvp') return;
  for (let i = 0; i < 2; i++) { const k = b.players[i].key; if (now() - (lastSeen[k] || 0) > 60000) { L(b, '📴 ' + b.players[i].name + ' s\'est déconnecté.', 'bad'); finish(b, 1 - i, 'déconnexion'); return; } }
  if (now() > b.deadline) { L(b, '⏰ Temps écoulé pour ' + b.players[b.turn].name + '.'); endTurn(b); }
}
setInterval(() => { for (const id in battles) { const b = battles[id]; tickPvp(b); if (b.ended && now() - b.endedAt > 600000) delete battles[id]; if (!b.ended && now() - b.created > 3 * 3600000) finish(b, -1, 'trop long'); } for (const c in rooms) if (now() - rooms[c].t > 15 * 60000) delete rooms[c]; }, 2000);

// =================== API ===================
function pubUser(u) {
  return {
    name: u.name, role: u.role || 'player', staff: isStaff(u), credits: u.credits, xp: u.xp, level: u.level, need: u.level < MAX_LEVEL ? xpNeed(u.level) : 0,
    levelName: levelName(u.level, isStaff(u)), cards: isStaff(u) ? 'all' : u.cards, active: u.active, useGalactique: !!u.useGalactique, starter: !!u.starter,
    code: u.code, wins: u.wins, losses: u.losses, inbox: u.inbox.slice(0, 20), exc: excCount(u), decksBought: u.decksBought,
  };
}
function friendView(k) { const f = users[k]; if (!f) return null; return { name: f.name, online: now() - (lastSeen[k] || 0) < 30000, levelName: levelName(f.level, isStaff(f)), staff: isStaff(f), role: f.role, inBattle: !!inBattle[k] }; }
function globalView() {
  return {
    boost: boostOn() ? G.boost : null,
    event: G.event && G.event.end > now() ? Object.assign({ on: eventOn(), info: EVENT_THEMES[G.event.theme] }, G.event) : null,
    boss: bossOn() ? { key: G.boss.key, info: BOSSES[G.boss.key], hp: G.boss.hp, max: G.boss.max, until: G.boss.until, top: Object.entries(G.boss.dmg).sort((a, c) => c[1] - a[1]).slice(0, 5).map(([k, d]) => [users[k] ? users[k].name : k, d]) } : null,
    announces: G.announces.slice(0, 5), now: now(),
  };
}

const H = {};
H.register = (q) => {
  const name = String(q.name || '').trim(); const k = keyOf(name);
  if (!/^[A-Za-z0-9_\-]{3,16}$/.test(name)) return { err: 'Pseudo : 3 à 16 caractères (lettres, chiffres, _ ou -).' };
  if (String(q.pass || '').length < 4) return { err: 'Mot de passe : 4 caractères minimum.' };
  if (users[k]) return { err: 'Ce pseudo est déjà pris.' };
  const o = ORIGINALS[k];
  if (o && sha(String(q.secret || '').trim().toUpperCase()) !== o.codeHash) return { err: 'Ce pseudo est réservé. Il faut le CODE SECRET.', needSecret: true };
  const salt = crypto.randomBytes(8).toString('hex');
  const u = { key: k, name: o ? o.name : name, salt, hash: hashPass(q.pass, salt), role: o ? o.role : 'player', created: now(), credits: o ? 0 : 1000, useGalactique: !!o };
  fixUser(u); users[k] = u;
  notify(u, o ? '👑 Bienvenue ' + u.name + ' ! Tu es ' + (o.role === 'creator' ? 'le CRÉATEUR' : 'l\'ADMIN') + ' de Monster Booster Ultimate. Ton niveau : GALACTIQUE.' : '👋 Bienvenue sur Monster Booster Ultimate ! Gagne des combats pour monter de niveau. Au niveau 5 tu reçois ton deck de départ !');
  return login(u);
};
function login(u) { const t = crypto.randomBytes(18).toString('hex'); tokens[t] = u.key; u.tokens.push(t); u.tokens = u.tokens.slice(-5); mark(u); return { token: t }; }
H.login = (q) => {
  const u = users[keyOf(q.name)]; if (!u || hashPass(q.pass || '', u.salt) !== u.hash) return { err: 'Pseudo ou mot de passe incorrect.' };
  if (u.banned && (u.banned === -1 || u.banned > now())) return { err: u.banned === -1 ? '⛔ Ce compte est banni définitivement.' : '⛔ Banni jusqu\'au ' + new Date(u.banned).toLocaleString('fr') };
  return login(u);
};
H.data = () => ({ CARDS, RARITIES, TYPES, EFFECT_TXT, DECKS, STAFF_DECK, DECK_SIZE, EXCLUSIVE_MAX, RANKS, RANK_ICONS, MAX_LEVEL, EVENT_THEMES, BOSSES, DIFFS, GALACTIQUE: galactiqueDeck(), STARTER, TRAINING });

// ---- authentifiées ----
const A = {};
A.me = (u) => ({ user: pubUser(u), G: globalView(), friends: u.friends.map(friendView).filter(Boolean), reqs: u.reqs.map(k => users[k] && users[k].name).filter(Boolean), invites: (invites[u.key] || []).filter(x => now() - x.t < 120000 && rooms[x.code]), battle: inBattle[u.key] || null });
A.logout = (u, q) => { delete tokens[q.token]; u.tokens = u.tokens.filter(t => t !== q.token); mark(u); return {}; };
A.readInbox = (u) => { u.inbox = []; mark(u); return {}; };
A.setDeck = (u, q) => {
  if (q.galactique !== undefined && isStaff(u)) { u.useGalactique = !!q.galactique; mark(u); return { ok: true }; }
  if (!validDeck(u, q.list)) return { err: 'Deck invalide : entre 10 et ' + DECK_SIZE + ' cartes, au moins 1 créature de base, et seulement des cartes que tu possèdes.' };
  u.active = q.list.slice(); u.useGalactique = false; mark(u); return { ok: true };
};
A.buyDeck = (u, q) => {
  let cards, name;
  if (q.deck === 'event') {
    if (!eventOn()) return { err: 'Pas d\'event en cours.' };
    const price = G.event.price || 50000; if (!isStaff(u) && u.credits < price) return { err: 'Pas assez de crédits.' };
    if (!isStaff(u)) u.credits -= price; cards = rollEvent(G.event.theme, bL()); name = 'Deck ' + EVENT_THEMES[G.event.theme].n;
  } else {
    const d = DECKS.find(x => x.id === q.deck); if (!d) return { err: 'Deck inconnu.' };
    if (!isStaff(u) && u.credits < d.price) return { err: 'Pas assez de crédits (il faut ' + d.price.toLocaleString('fr') + ').' };
    if (!isStaff(u)) u.credits -= d.price; cards = rollDeck(d, bL()); name = d.n;
    u.decksBought[d.id] = (u.decksBought[d.id] || 0) + 1;
  }
  const got = []; for (const id of cards) { const n = addCard(u, id, 1); got.push({ id, ok: n > 0 || isStaff(u) }); }
  if (!isStaff(u) && !validDeck(u, u.active)) { const l = cards.filter((id, i) => got[i].ok); if (validDeck(u, l)) u.active = l; }
  mark(u); return { name, got, list: cards };
};
// --- amis ---
function findUser(who) { who = String(who || '').trim(); return users[keyOf(who)] || Object.values(users).find(x => x.code === who.toUpperCase()); }
A.friendAdd = (u, q) => {
  const f = findUser(q.who); if (!f) return { err: 'Aucun joueur avec ce pseudo ou ce code.' }; if (f === u) return { err: 'C\'est toi !' };
  if (u.friends.includes(f.key)) return { err: 'Vous êtes déjà amis.' };
  if (u.reqs.includes(f.key)) return A.friendAccept(u, { who: f.name });
  if (!f.reqs.includes(u.key)) f.reqs.push(u.key); notify(f, '👥 ' + u.name + ' veut être ton ami.'); mark(f); return { ok: 'Demande envoyée à ' + f.name + ' !' };
};
A.friendAccept = (u, q) => {
  const f = users[keyOf(q.who)]; if (!f) return { err: 'Joueur introuvable.' };
  u.reqs = u.reqs.filter(k => k !== f.key); f.reqs = f.reqs.filter(k => k !== u.key);
  if (!u.friends.includes(f.key)) u.friends.push(f.key); if (!f.friends.includes(u.key)) f.friends.push(u.key);
  notify(f, '👥 ' + u.name + ' a accepté ta demande d\'ami !'); mark(u); mark(f); return { ok: 'Vous êtes amis !' };
};
A.friendDecline = (u, q) => { const k = keyOf(q.who); u.reqs = u.reqs.filter(x => x !== k); mark(u); return {}; };
A.friendRemove = (u, q) => { const k = keyOf(q.who); u.friends = u.friends.filter(x => x !== k); const f = users[k]; if (f) { f.friends = f.friends.filter(x => x !== u.key); mark(f); } mark(u); return {}; };
A.gift = (u, q) => {
  const f = users[keyOf(q.to)]; if (!f) return { err: 'Joueur introuvable.' };
  if (!isStaff(u) && !u.friends.includes(f.key)) return { err: 'Tu peux offrir seulement à tes amis.' };
  const c = CARDS[q.card]; if (!c) return { err: 'Carte inconnue.' };
  if (!isStaff(u)) {
    if ((u.cards[c.id] || 0) < 2) return { err: 'Tu peux offrir seulement des cartes EN DOUBLE (il faut en avoir au moins 2).' };
    const inDeck = u.active.filter(x => x === c.id).length; if (u.cards[c.id] - 1 < inDeck) return { err: 'Cette carte est utilisée dans ton deck. Enlève-la d\'abord.' };
  }
  if (c.exclusive && !isStaff(f) && excCount(f) >= EXCLUSIVE_MAX) return { err: f.name + ' a déjà ' + EXCLUSIVE_MAX + ' cartes exclusives (le maximum).' };
  if (!isStaff(u)) removeCard(u, c.id, 1);
  addCard(f, c.id, 1); notify(f, '🎁 ' + u.name + ' t\'a offert la carte ' + c.name + ' !'); mark(u); return { ok: c.name + ' offerte à ' + f.name + ' !' };
};
// --- salons (codes comme Among Us) ---
A.roomCreate = (u, q) => {
  if (inBattle[u.key]) return { err: 'Tu es déjà en combat.' };
  for (const c in rooms) if (rooms[c].host === u.key) delete rooms[c];
  let code; do { code = makeCode(6); } while (rooms[code]); rooms[code] = { host: u.key, t: now() };
  if (q.invite) { const f = users[keyOf(q.invite)]; if (f) { invites[f.key] = (invites[f.key] || []).filter(x => now() - x.t < 120000); invites[f.key].push({ from: u.name, code, t: now() }); } }
  return { code };
};
A.roomCancel = (u) => { for (const c in rooms) if (rooms[c].host === u.key) delete rooms[c]; return {}; };
A.roomJoin = (u, q) => {
  const code = String(q.code || '').trim().toUpperCase(); const r = rooms[code]; if (!r) return { err: 'Aucun salon avec ce code.' };
  if (r.host === u.key) return { err: 'C\'est ton propre salon !' };
  const h = users[r.host]; if (!h) return { err: 'Salon fermé.' }; if (inBattle[u.key] || inBattle[h.key]) return { err: 'Un des joueurs est déjà en combat.' };
  delete rooms[code]; if (invites[u.key]) invites[u.key] = invites[u.key].filter(x => x.code !== code);
  const b = newBattle('pvp', newPlayer(h.name, h.key, deckFor(h), { staff: isStaff(h), level: h.level }), newPlayer(u.name, u.key, deckFor(u), { staff: isStaff(u), level: u.level }));
  return { battle: b.id };
};
// --- combats ---
A.battleStart = (u, q) => {
  if (inBattle[u.key] && battles[inBattle[u.key]] && !battles[inBattle[u.key]].ended) return { battle: inBattle[u.key] };
  const me = newPlayer(u.name, u.key, deckFor(u), { staff: isStaff(u), level: u.level });
  if (q.mode === 'boss') {
    if (!bossOn()) return { err: 'Aucun boss en ce moment.' };
    const bc = bossCard(G.boss.key, G.boss.hp);
    const bp = { name: bc.name, key: null, deck: [], hand: [], active: { uid: UID++, id: bc.id, dmg: 0, energy: 99, burn: false, poison: false, para: false, shield: 0, played: 0 }, bench: [], kos: 0, bot: true, boss: true };
    const b = newBattle('boss', me, bp, { bossCard: bc }); return { battle: b.id };
  }
  const diff = Math.max(0, Math.min(4, q.diff | 0));
  const bot = newPlayer('Bot ' + DIFFS[diff].n, null, botDeck(diff), { bot: true }); bot.diff = diff;
  const b = newBattle('bot', me, bot, { diff }); return { battle: b.id };
};
A.battle = (u, q) => {
  const b = battles[q.id]; if (!b) return { err: 'Combat introuvable.', gone: true };
  const i = b.players.findIndex(p => p.key === u.key); if (i < 0) return { err: 'Tu n\'es pas dans ce combat.' };
  tickPvp(b);
  if (q.action) { const e = act(b, i, q.action); if (e) return { err: e, view: battleView(b, i) }; }
  return { view: battleView(b, i) };
};

// --- staff (admin = créateur : mêmes pouvoirs) ---
function targets(t) { if (t === '*') return Object.values(users); const u = users[keyOf(t)]; return u ? [u] : []; }
A.admin = (u, q) => {
  if (!isStaff(u)) return { err: 'Réservé au staff.' };
  const T = targets(q.target); const need = () => { if (!T.length) throw new Error('Joueur introuvable.'); };
  const n = (x, d = 0) => { const v = Number(x); return isFinite(v) ? v : d; };
  try {
    switch (q.do) {
      case 'users': return { list: Object.values(users).filter(x => !q.q || x.key.includes(keyOf(q.q))).slice(0, 100).map(x => ({ name: x.name, role: x.role, level: levelName(x.level, isStaff(x)), credits: x.credits, banned: x.banned || 0, online: now() - (lastSeen[x.key] || 0) < 30000, cards: Object.values(x.cards).reduce((a, c) => a + c, 0) })) };
      case 'credits': need(); for (const t of T) { t.credits = Math.max(0, t.credits + n(q.amount)); notify(t, '💰 Le staff t\'a donné ' + n(q.amount).toLocaleString('fr') + ' crédits !'); } return { ok: 'Crédits donnés à ' + T.length + ' joueur(s).' };
      case 'setcredits': need(); for (const t of T) { t.credits = Math.max(0, n(q.amount)); mark(t); } return { ok: 'Crédits réglés.' };
      case 'card': { need(); const c = CARDS[q.card]; if (!c) return { err: 'Carte inconnue.' }; let tot = 0; for (const t of T) { const g = addCard(t, c.id, Math.max(1, n(q.n, 1))); tot += g; if (g) notify(t, '🎁 Le staff t\'a offert ' + (g > 1 ? g + 'x ' : '') + c.name + ' !'); } return { ok: tot ? c.name + ' donnée !' : 'Rien donné (limite de ' + EXCLUSIVE_MAX + ' exclusives ?)' }; }
      case 'allcards': need(); for (const t of T) { for (const c of Object.values(CARDS)) if (!c.exclusive) addCard(t, c.id, 1); notify(t, '🎁 Le staff t\'a donné TOUTES les cartes (sauf exclusives) !'); } return { ok: 'Toutes les cartes données.' };
      case 'takecard': need(); for (const t of T) { const k = Math.min(t.cards[q.card] || 0, Math.max(1, n(q.n, 1))); if (k) removeCard(t, q.card, k); t.active = t.active.filter(x => owned(t, x) > 0); } return { ok: 'Carte retirée.' };
      case 'level': need(); for (const t of T) { setLevel(t, n(q.level)); notify(t, '⬆️ Le staff t\'a mis au ' + levelName(t.level) + ' !'); } return { ok: 'Niveau réglé.' };
      case 'xp': need(); for (const t of T) addXp(t, n(q.amount)); return { ok: 'XP donnée.' };
      case 'deck': { need(); const d = DECKS.find(x => x.id === q.deck); if (!d) return { err: 'Deck inconnu.' }; for (const t of T) { const l = rollDeck(d, 1); for (const id of l) addCard(t, id, 1); notify(t, '🎁 Le staff t\'a offert un ' + d.n + ' (20 cartes) !'); } return { ok: d.n + ' offert.' }; }
      case 'starter': need(); for (const t of T) { t.starter = false; giveStarter(t); } return { ok: 'Deck de départ donné.' };
      case 'ban': need(); if (T.length === 1 && ORIGINALS[T[0].key]) return { err: 'Impossible de bannir un compte d\'origine (Dylan_lane / zokutnt27).' }; for (const t of T) { if (ORIGINALS[t.key]) continue; const m = n(q.minutes, -1); t.banned = m < 0 ? -1 : now() + m * 60000; for (const tk of t.tokens) delete tokens[tk]; t.tokens = []; mark(t); } return { ok: 'Banni.' };
      case 'unban': need(); for (const t of T) { t.banned = 0; mark(t); } return { ok: 'Débanni.' };
      case 'delete': need(); for (const t of T) { if (ORIGINALS[t.key] || t === u) continue; for (const tk of t.tokens) delete tokens[tk]; for (const f of Object.values(users)) { f.friends = f.friends.filter(k => k !== t.key); f.reqs = f.reqs.filter(k => k !== t.key); } delete users[t.key]; dirty.add(t.key); } return { ok: 'Compte supprimé.' };
      case 'role': need(); for (const t of T) { if (ORIGINALS[t.key]) continue; t.role = q.role === 'admin' ? 'admin' : 'player'; notify(t, t.role === 'admin' ? '🛡️ Tu es maintenant ADMIN de Monster Booster Ultimate !' : 'Tu n\'es plus admin.'); } return { ok: 'Rôle changé.' };
      case 'resetpass': need(); { const t = T[0]; if (ORIGINALS[t.key] && t !== u) return { err: 'Impossible sur un compte d\'origine.' }; const p = makeCode(6).toLowerCase(); t.salt = crypto.randomBytes(8).toString('hex'); t.hash = hashPass(p, t.salt); mark(t); return { ok: 'Nouveau mot de passe de ' + t.name + ' : ' + p }; }
      case 'boost': G.boost = { xp: Math.max(1, n(q.xp, 1)), credits: Math.max(1, n(q.credits, 1)), luck: Math.max(1, n(q.luck, 1)), until: now() + Math.max(1, n(q.minutes, 30)) * 60000, label: String(q.label || 'Boost du staff').slice(0, 60), by: u.name }; globalDirty = true; G.announces.unshift({ t: now(), msg: '🚀 ' + G.boost.label + ' : XP x' + G.boost.xp + ', crédits x' + G.boost.credits + ', chance x' + G.boost.luck, by: u.name }); return { ok: 'Boost lancé !' };
      case 'stopboost': G.boost = null; globalDirty = true; return { ok: 'Boost arrêté.' };
      case 'event': { if (!EVENT_THEMES[q.theme]) return { err: 'Thème inconnu.' }; const start = q.start ? new Date(q.start).getTime() : now(); const end = q.end ? new Date(q.end).getTime() : start + 3 * 86400000; if (!(end > start)) return { err: 'Dates invalides.' }; G.event = { theme: q.theme, start, end, price: Math.max(0, n(q.price, 50000)), by: u.name }; globalDirty = true; G.announces.unshift({ t: now(), msg: EVENT_THEMES[q.theme].i + ' Event « ' + EVENT_THEMES[q.theme].n + ' » du ' + new Date(start).toLocaleString('fr') + ' au ' + new Date(end).toLocaleString('fr'), by: u.name }); return { ok: 'Event programmé !' }; }
      case 'stopevent': G.event = null; globalDirty = true; return { ok: 'Event arrêté.' };
      case 'boss': { const B = BOSSES[q.boss]; if (!B) return { err: 'Boss inconnu.' }; const hp = Math.max(100, n(q.hp, B.hp)); G.boss = { key: q.boss, hp, max: hp, until: now() + Math.max(0.1, n(q.hours, 24)) * 3600000, dmg: {} }; globalDirty = true; G.announces.unshift({ t: now(), msg: '👹 BOSS : ' + B.n + ' est apparu ! (' + hp.toLocaleString('fr') + ' PV) Tout le monde à l\'attaque !', by: u.name }); return { ok: 'Boss lancé !' }; }
      case 'stopboss': G.boss = null; globalDirty = true; return { ok: 'Boss retiré.' };
      case 'announce': G.announces.unshift({ t: now(), msg: '📢 ' + String(q.msg || '').slice(0, 200), by: u.name }); G.announces = G.announces.slice(0, 20); globalDirty = true; return { ok: 'Annonce envoyée.' };
      case 'clearannounces': G.announces = []; globalDirty = true; return { ok: 'Annonces effacées.' };
    }
  } catch (e) { return { err: e.message }; }
  return { err: 'Action inconnue.' };
};

// ---------- serveur HTTP ----------
const hits = {};
const server = http.createServer((req, res) => {
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) return send(200, PAGE, 'text/html');
  if (req.method === 'GET' && url === '/health') return send(200, 'ok', 'text/plain');
  if (req.method !== 'POST' || url.indexOf('/api/') !== 0) return send(404, '{"err":"introuvable"}');
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress; const sec = Math.floor(now() / 10000);
  const hk = ip + ':' + sec; hits[hk] = (hits[hk] || 0) + 1; if (hits[hk] > (+process.env.RATE_LIMIT || 1500)) return send(429, '{"err":"Trop de requêtes, calme-toi !"}');
  let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    let q = {}; try { q = JSON.parse(body || '{}'); } catch (e) { }
    const name = url.slice(5); let out;
    try {
      if (H[name]) out = H[name](q);
      else if (A[name]) {
        const k = tokens[q.token]; const u = k && users[k];
        if (!u) out = { err: 'Session expirée, reconnecte-toi.', logout: true };
        else if (u.banned && (u.banned === -1 || u.banned > now())) out = { err: '⛔ Tu es banni.', logout: true };
        else { lastSeen[u.key] = now(); out = A[name](u, q); }
      } else out = { err: 'API inconnue.' };
    } catch (e) { console.error(e); out = { err: 'Erreur serveur : ' + e.message }; }
    send(200, JSON.stringify(out));
  });
});
setInterval(() => { const s = Math.floor(now() / 10000); for (const k in hits) if (!k.endsWith(':' + s)) delete hits[k]; }, 20000);

const PORT = process.env.PORT || 3000;
loadAll().then(() => server.listen(PORT, () => console.log('🃏 Monster Booster Ultimate en ligne sur le port ' + PORT)));
