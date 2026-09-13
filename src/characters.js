// Полные таблицы классов и рас из «Правила Днд.txt».
// stats: str=Сила, dex=Ловкость, con=Стойкость, wis=Мудрость, int=Интеллект, cha=Харизма.
// weaponStat — характеристика владения оружием (прибавляется к атаке и урону).
export const CLASSES = {
  warrior:    { name: 'Воин',         ac: 15, hp: 25, dice: '1d10', weaponStat: 'str', stats: { str: 3,  dex: 1,  con: 1,  wis: 0,  int: 0,  cha: -1 } },
  barbarian:  { name: 'Варвар',       ac: 10, hp: 30, dice: '1d12', weaponStat: 'str', stats: { str: 4,  dex: 1,  con: 2,  wis: -1, int: -2, cha: 0  } },
  rogue:      { name: 'Плут',         ac: 12, hp: 15, dice: '2d4',  weaponStat: 'dex', stats: { str: -2, dex: 4,  con: -1, wis: 2,  int: 0,  cha: 1  } },
  paladin:    { name: 'Паладин',      ac: 17, hp: 20, dice: '1d10', weaponStat: 'str', stats: { str: 3,  dex: -2, con: 2,  wis: 0,  int: -1, cha: 2  } },
  druid:      { name: 'Друид',        ac: 10, hp: 25, dice: '1d4',  weaponStat: 'dex', stats: { str: 2,  dex: 2,  con: 0,  wis: 2,  int: 0,  cha: -2 } },
  wizard:     { name: 'Волшебник',    ac: 10, hp: 15, dice: '1d4',  weaponStat: 'dex', stats: { str: -2, dex: 0,  con: -1, wis: 2,  int: 4,  cha: 1  } },
  artificer:  { name: 'Изобретатель', ac: 15, hp: 15, dice: '1d8',  weaponStat: 'dex', stats: { str: -1, dex: 2,  con: 0,  wis: 0,  int: 4,  cha: -1 } },
  cleric:     { name: 'Жрец',         ac: 15, hp: 20, dice: '1d6',  weaponStat: 'dex', stats: { str: -1, dex: -1, con: 4,  wis: 0,  int: 1,  cha: 1  } },
  bard:       { name: 'Бард',         ac: 12, hp: 25, dice: '1d6',  weaponStat: 'dex', stats: { str: 0,  dex: 1,  con: -1, wis: -1, int: 1,  cha: 4  } },
  ranger:     { name: 'Следопыт',     ac: 12, hp: 20, dice: '1d8',  weaponStat: 'dex', stats: { str: -1, dex: 3,  con: 1,  wis: 3,  int: -1, cha: -1 } },
  necromancer:{ name: 'Некромант',    ac: 12, hp: 20, dice: '1d4',  weaponStat: 'dex', stats: { str: -1, dex: 1,  con: 2,  wis: 1,  int: 3,  cha: -2 } },
  monk:       { name: 'Монах',        ac: 10, hp: 30, dice: '1d4',  weaponStat: 'dex', stats: { str: 0,  dex: 3,  con: 3,  wis: 0,  int: -1, cha: -1 } },
};

// statMods — расовые правки характеристик (только дварф -1 ловкость).
// onIncoming — правила ПОЛУЧАЕМОГО урона по категории (для целей этой расы).
// orcReroll — пассивка атакующего «Рождённый в битве» (переброс кубика урона 1–2).
export const RACES = {
  human:      { name: 'Человек',          hpMod: 0,  acMod: 0, statMods: {} },
  elf:        { name: 'Эльф',             hpMod: 0,  acMod: 0, statMods: {} },
  dwarf:      { name: 'Дварф',            hpMod: 0,  acMod: 0, statMods: { dex: -1 }, onIncoming: { magic: { mult: 0.5 } } },
  halfling:   { name: 'Полурослик',       hpMod: -5, acMod: 0, statMods: {} },
  orc:        { name: 'Орк',              hpMod: 5,  acMod: 0, statMods: {}, orcReroll: true, onIncoming: { magic: { add: 2 } } },
  tiefling:   { name: 'Тифлинг',          hpMod: 0,  acMod: 0, statMods: {} },
  aasimar:    { name: 'Аасимар',          hpMod: 0,  acMod: 0, statMods: {}, onIncoming: { physical: { add: 2 } } },
  tabaxi:     { name: 'Табакси',          hpMod: 0,  acMod: 0, statMods: {} },
  dragonborn: { name: 'Драконорождённый', hpMod: 0,  acMod: 1, statMods: {} },
  goblin:     { name: 'Гоблин',           hpMod: 0,  acMod: 0, statMods: {} },
  kitsune:    { name: 'Кицунэ',           hpMod: 0,  acMod: 0, statMods: {} },
};

export const MILESTONES = [4, 8, 12, 16, 20];
const STAT_KEYS = ['str', 'dex', 'con', 'wis', 'int', 'cha'];

// Две наивысшие по базе характеристики (для дефолтного прироста 8-й игры).
function topTwoStats(stats) {
  return [...STAT_KEYS].sort((a, b) => stats[b] - stats[a]).slice(0, 2);
}

// При игре >= 8 получает +1 к двум наивысшим из ФАКТИЧЕСКИХ статов (с учётом расовых правок).

export function deriveStats(classKey, raceKey, game, bumps) {
  const c = CLASSES[classKey];
  const r = RACES[raceKey];
  if (!c || !r) throw new Error('Неизвестный класс или раса');
  const out = {};
  for (const k of STAT_KEYS) out[k] = c.stats[k] + (r.statMods[k] || 0);
  if (game >= 8) {
    const chosen = bumps && bumps.length === 2 ? bumps : topTwoStats(out);
    for (const k of chosen) out[k] += 1;
  }
  return out;
}

export function computePreset(raceKey, classKey, game) {
  const c = CLASSES[classKey];
  const r = RACES[raceKey];
  if (!c || !r) throw new Error('Неизвестный класс или раса');
  const reached = MILESTONES.filter((m) => m <= game).length;
  return {
    ac: c.ac + r.acMod,
    hp: c.hp + r.hpMod + 5 * reached,
    saves: deriveStats(classKey, raceKey, game),
  };
}
