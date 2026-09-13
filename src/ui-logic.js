import { ABILITIES } from './abilities/index.js';
import { CLASSES, RACES, computePreset } from './characters.js';

// Способности, доступные персонажу: общие + классовые, с учётом minGame и выборов [12].
export function availableAbilities(character) {
  return ABILITIES.filter((a) => {
    if (a.classKey !== 'common' && a.classKey !== character.classKey && (!character.raceKey || a.raceKey !== character.raceKey)) return false;
    if (a.minGame > character.game) return false;
    if (a.choiceGroup === 'game12') {
      return character.game >= 12 && character.game12Choice === a.id;
    }
    return true;
  });
}

// Выбирает следующую цель с наименьшим КБ, отличную от prev.
function pickNext(targets, prev) {
  let next = -1;
  for (let j = 0; j < targets.length; j++) {
    if (j === prev) continue;
    if (next < 0 || targets[j].ac < targets[next].ac) next = j;
  }
  return next < 0 ? 0 : next;
}

// Дефолтный порядок ударов: жадно по наименьшему КБ, не дважды подряд.
export function defaultOrder(targets) {
  const n = targets.length;
  if (n < 2) return [0];
  const seq = [0]; let prev = 0;
  for (let s = 0; s < 3; s++) { const v = pickNext(targets, prev); seq.push(v); prev = v; }
  return seq;
}

// Проверяет и исправляет порядок: нужная длина, индексы в пределах, не дважды подряд.
export function sanitizeOrder(order, targets) {
  const n = targets.length;
  const desired = n < 2 ? 1 : 4;
  if (!Array.isArray(order) || order.length !== desired) return defaultOrder(targets);
  const out = []; let prev = -1;
  for (let i = 0; i < desired; i++) {
    let v = order[i];
    if (typeof v !== 'number' || v < 0 || v >= n) v = (i > 0 ? pickNext(targets, prev) : 0);
    if (i > 0 && v === prev) v = pickNext(targets, prev);
    out.push(v); prev = v;
  }
  return out;
}

// Дефолтные значения параметров способности для данного набора целей.
export function defaultParams(ability, targets) {
  const out = {};
  for (const p of ability.params || []) {
    if (p.kind === 'targetPick') out[p.id] = 0;
    else if (p.kind === 'targetOrder') out[p.id] = defaultOrder(targets);
    else if (p.kind === 'distribute') out[p.id] = null;
    else if (p.kind === 'select') out[p.id] = p.options && p.options.length ? p.options[0].value : null;
    else if (p.kind === 'stepper') out[p.id] = p.min ?? 0;
    else if (p.kind === 'toggle') out[p.id] = false;
    else out[p.id] = p.default ?? null;
  }
  return out;
}

// Выборы 12-й игры по классу.
export const GAME12_CHOICES = {
  warrior:   [{ id: 'weakSpot', name: 'Слабое место (крит 18–20)' }, { id: 'masterFencer', name: 'Мастер фехтования' }],
  barbarian: [{ id: 'gwm', name: 'Мастер большого оружия (−5/+10)' }, { id: 'unbreakable', name: 'Несокрушимый' }],
  rogue:     [{ id: 'lucky', name: 'Фартовый (промах→крит)' }, { id: 'traumatic', name: 'Травмоопасный' }],
  paladin:   [{ id: 'extraAttack', name: 'Дополнительная атака' }, { id: 'improvedSmite', name: 'Улучшенная кара (6д10)' }],
  ranger:    [{ id: 'giantHunter', name: 'Охотник на великанов (−КБ)' }, { id: 'ricochet', name: 'Рикошет (+цель)' }],
  monk:      [{ id: 'kiBoost', name: 'Усиление Ци (1д6)' }, { id: 'balance', name: 'Часть баланса' }],
  wizard:    [{ id: 'unknownAttack', name: 'Неизвестная атака' }, { id: 'counterspell', name: 'Контрзаклинание' }],
  druid:     [{ id: 'beastRage', name: 'Ярость зверя (кубы форм↑)' }, { id: 'windGust', name: 'Порыв ветра' }],
  artificer: [{ id: 'flamethrower', name: 'Весомый аргумент (огнемёт 2д6)' }, { id: 'unstableArgument', name: 'Нестабильный аргумент' }],
  cleric:    [{ id: 'divineLight', name: 'Божественный свет (1д4+Ст, излуч.)' }, { id: 'strongFaith', name: 'Укрепление веры' }],
  necromancer: [{ id: 'harvest', name: 'Жатва' }, { id: 'soulMaster', name: 'Мастер душ' }],
};

// Оружие персонажа с учётом выборов [12].
export function weaponForCharacter(c) {
  const cls = CLASSES[c.classKey];
  const w = { dice: cls.dice, stat: cls.weaponStat };
  if (c.classKey === 'monk' && c.game >= 12 && c.game12Choice === 'kiBoost') w.dice = '1d6';
  return w;
}

// Список артефактов с UI-метаданными.
export const ARTIFACTS = [
  { id: 'runeOfWarrior',   name: 'Руна воителя (+1 атака/урон оружия)' },
  { id: 'braceletsOfLuck', name: 'Наручи удачи (крит 19)' },
  { id: 'runeOfElements',  name: 'Руна стихий (+1д6, смена типа)' },
];

// Диапазон крита с учётом выборов [12] и артефактов.
export function critRangeForCharacter(c) {
  let r = (c.classKey === 'warrior' && c.game >= 12 && c.game12Choice === 'weakSpot') ? 18 : 20;
  if (c.artifacts && c.artifacts.includes('braceletsOfLuck')) r = Math.min(r, 19);
  return r;
}

// Какие модификаторы применимы к данной способности (и классу персонажа).
export function modifierRelevance(ability, character) {
  const c = character || {};
  const cls = c.classKey;
  const g12 = c.game >= 12 ? c.game12Choice : null;
  const magic = ability.category === 'magic';
  return {
    adv: !!ability.usesAttackRoll,
    dis: !!ability.usesAttackRoll,
    hex: !!ability.usesSave,
    chaos: magic,
    concentration: c.classKey === 'wizard' && c.game >= 4,
    rage: ability.category === 'physical',
    orcReroll: !!(RACES[c.raceKey] && RACES[c.raceKey].orcReroll),
    barbRage: cls === 'barbarian',
    bonusAttack: cls === 'warrior' || (cls === 'paladin' && g12 === 'extraAttack') || (cls === 'ranger' && c.game >= 4),
    smiteDice: cls === 'paladin',
    guaranteedHit: cls === 'ranger' || c.raceKey === 'elf',
    luckyCrit: cls === 'rogue' && c.game >= 12 && c.game12Choice === 'lucky',
    sneak: cls === 'rogue',
    sneakDouble: cls === 'rogue',
    gwm: cls === 'barbarian' && g12 === 'gwm',
    acIgnore: cls === 'ranger' && g12 === 'giantHunter',
    giantHunter: cls === 'ranger' && g12 === 'giantHunter',
    ricochet: cls === 'ranger' && g12 === 'ricochet',
    typeOverride: cls === 'monk' && c.game >= 4,
    contactless: cls === 'monk' && c.game >= 4,
    runeOfWarrior: (c.artifacts || []).includes('runeOfWarrior'),
    runeOfElements: (c.artifacts || []).includes('runeOfElements'),
    sacredWeapon: cls === 'cleric',
    tincture: cls === 'bard',
    inspiration: cls === 'bard' && c.game >= 4,
    beastRage: cls === 'druid' && c.game >= 12 && g12 === 'beastRage',
  };
}

// Пресет цели: статы из таблицы + сохранённая раса (для расовых правил входящего урона).
export function presetTarget(race, klass, level) {
  const pr = computePreset(race, klass, level);
  return { ac: pr.ac, hp: pr.hp, saves: pr.saves, race };
}

// Начальное состояние приложения.
export function defaultState() {
  return {
    character: { classKey: 'warrior', raceKey: 'human', game: 1, statOverrides: {}, bumps: null, game12Choice: null, artifacts: [] },
    abilityId: 'rainOfBlows',
    params: {},
    targets: [{ ac: 12, hp: 30, saves: { str: 0, dex: 0, con: 0, wis: 0, int: 0, cha: 0 }, race: null, preset: null }],
    mods: { adv: false, dis: false, concentration: 0, chaos: false, hex: false, rage: false, orcReroll: false,
      barbRage: false, bonusAttack: false, smiteDice: 0, guaranteedHit: false, luckyCrit: false,
      sneak: false, sneakDouble: false, gwm: false, giantHunter: false, ricochet: false,
      contactless: false, sacredWeapon: false, tincture: false, inspiration: false, runeType: 'fire' },
    pinned: false,
    trials: 100000,
    seed: 1,
  };
}

export function serializeState(state) {
  return JSON.stringify(state);
}

// При ошибке парсинга или несовместимой структуре возвращает null.
export function deserializeState(str) {
  try {
    const s = JSON.parse(str);
    if (!s || typeof s !== 'object' || !s.character || !Array.isArray(s.targets)) return null;
    return s;
  } catch {
    return null;
  }
}
