// test/ui-logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availableAbilities, defaultParams, sanitizeOrder, modifierRelevance,
  presetTarget, defaultState, serializeState, deserializeState,
  GAME12_CHOICES, weaponForCharacter, critRangeForCharacter, fumbleRangeForCharacter, ARTIFACTS,
} from '../src/ui-logic.js';

test('availableAbilities: волшебник на 1 игре видит базовую атаку + стартовые спеллы, без [12]', () => {
  const ids = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).map((a) => a.id);
  assert.ok(ids.includes('basicAttack'));
  assert.ok(ids.includes('fireball'));
});

test('availableAbilities: воин на 1 игре видит базовую атаку и Град ударов', () => {
  const ids = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null }).map((a) => a.id);
  assert.deepEqual(ids, ['basicAttack', 'rainOfBlows']);
});

test('modifierRelevance: огненный шар — hex да, adv нет', () => {
  const fb = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).find((a) => a.id === 'fireball');
  const r = modifierRelevance(fb);
  assert.equal(r.hex, true);
  assert.equal(r.adv, false);
  assert.equal(r.chaos, true);
  assert.equal(r.rage, false);
});

test('modifierRelevance: базовая атака — rage да, chaos нет, adv да', () => {
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  const r = modifierRelevance(ba);
  assert.equal(r.rage, true);
  assert.equal(r.chaos, false);
  assert.equal(r.adv, true);
});

test('sanitizeOrder: чинит длину и запрет двух подряд', () => {
  const targets = [{ ac: 10 }, { ac: 12 }];
  const out = sanitizeOrder([0, 0, 0, 0], targets);
  assert.equal(out.length, 4);
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i], out[i - 1]);
});

test('presetTarget: возвращает ac/hp/saves и сохраняет расу', () => {
  const t = presetTarget('orc', 'barbarian', 8);
  assert.equal(t.race, 'orc');
  assert.equal(t.hp, 45); // 30 + 5(орк) + 10(вехи 4,8)
  assert.ok(t.saves && typeof t.saves.con === 'number'); // орк-варвар con=2+1(bump)=3
  assert.equal(t.saves.con, 3); // варвар con=2+1(bump 8 игра) -> 3
  assert.equal(t.saves.dex, 1); // dex варвара не бампован
});

test('serialize/deserialize round-trips, мусор -> null', () => {
  const s = defaultState();
  assert.deepEqual(deserializeState(serializeState(s)), s);
  assert.equal(deserializeState('{не json'), null);
});

test('defaultParams: targetPick=0, targetOrder сформирован', () => {
  const chain = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).find((a) => a.id === 'chainLightning');
  const p = defaultParams(chain, [{ ac: 10 }, { ac: 12 }, { ac: 8 }]);
  assert.equal(Array.isArray(p.order), true);
  assert.equal(p.order.length, 4);
});

test('modifierRelevance: ярость варвара только у варвара; смайт только у паладина', () => {
  const ba = availableAbilities({ classKey: 'barbarian', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(ba, { classKey: 'barbarian', game: 1 }).barbRage, true);
  const wb = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(wb, { classKey: 'warrior', game: 1 }).barbRage, false);
  assert.equal(modifierRelevance(wb, { classKey: 'warrior', game: 1 }).bonusAttack, true);
});

test('critRangeForCharacter: у кицунэ критов нет (порог недостижим)', () => {
  assert.equal(critRangeForCharacter({ classKey: 'warrior', raceKey: 'kitsune', game: 12, game12Choice: 'weakSpot' }), 21);
  assert.equal(critRangeForCharacter({ classKey: 'warrior', raceKey: 'kitsune', game: 1, artifacts: ['braceletsOfLuck'] }), 21);
  assert.equal(critRangeForCharacter({ classKey: 'warrior', raceKey: 'human', game: 1 }), 20);
});

test('fumbleRangeForCharacter: у человека «Злой рок» — провал на 1 и 2', () => {
  assert.equal(fumbleRangeForCharacter({ raceKey: 'human' }), 2);
  assert.equal(fumbleRangeForCharacter({ raceKey: 'orc' }), 1);
  assert.equal(fumbleRangeForCharacter({}), 1);
});

test('modifierRelevance: концентрация только для магических способностей', () => {
  const fb = availableAbilities({ classKey: 'wizard', game: 4, game12Choice: null }).find((a) => a.id === 'fireball');
  const staff = availableAbilities({ classKey: 'wizard', game: 4, game12Choice: null }).find((a) => a.id === 'staff');
  assert.equal(modifierRelevance(fb, { classKey: 'wizard', game: 4 }).concentration, true);
  assert.equal(modifierRelevance(staff, { classKey: 'wizard', game: 4 }).concentration, false);
});

test('critRangeForCharacter: Слабое место даёт 18 на 12 игре', () => {
  assert.equal(critRangeForCharacter({ classKey: 'warrior', game: 12, game12Choice: 'weakSpot' }), 18);
  assert.equal(critRangeForCharacter({ classKey: 'warrior', game: 12, game12Choice: 'masterFencer' }), 20);
  assert.equal(critRangeForCharacter({ classKey: 'warrior', game: 8, game12Choice: 'weakSpot' }), 20);
});

test('weaponForCharacter: монах с Усилением Ци получает 1д6', () => {
  assert.equal(weaponForCharacter({ classKey: 'monk', game: 12, game12Choice: 'kiBoost' }).dice, '1d6');
  assert.equal(weaponForCharacter({ classKey: 'monk', game: 1, game12Choice: null }).dice, '1d4');
});

test('GAME12_CHOICES: у паладина два варианта', () => {
  assert.equal(GAME12_CHOICES.paladin.length, 2);
});

test('modifierRelevance: giantHunter=true для следопыта с выбором giantHunter на игре 12', () => {
  const ba = availableAbilities({ classKey: 'ranger', game: 12, game12Choice: 'giantHunter' })[0];
  const r = modifierRelevance(ba, { classKey: 'ranger', game: 12, game12Choice: 'giantHunter' });
  assert.equal(r.giantHunter, true);
  assert.equal(r.acIgnore, true);
});

test('availableAbilities: дварф любого класса видит Тяжёлую голову', () => {
  const ids = availableAbilities({classKey:'wizard',raceKey:'dwarf',game:1,game12Choice:null}).map(a=>a.id);
  assert.ok(ids.includes('dwarfHeadbutt'));
});
test('availableAbilities: не-дварф НЕ видит Тяжёлую голову', () => {
  const ids = availableAbilities({classKey:'wizard',raceKey:'orc',game:1,game12Choice:null}).map(a=>a.id);
  assert.ok(!ids.includes('dwarfHeadbutt'));
});

test('modifierRelevance: humanResolve — true только для человека', () => {
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', raceKey: 'human', game: 1 }).humanResolve, true);
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', raceKey: 'orc', game: 1 }).humanResolve, false);
});

test('availableAbilities: Весомый аргумент даёт и огнемёт, и силовой болт', () => {
  const ids = availableAbilities({classKey:'artificer',game:12,game12Choice:'flamethrower'}).map(a=>a.id);
  assert.ok(ids.includes('flamethrower'));
  assert.ok(ids.includes('forceBolt'));
  assert.ok(!ids.includes('unstableArgument'));
});
test('availableAbilities: Нестабильный аргумент не даёт силовой болт', () => {
  const ids = availableAbilities({classKey:'artificer',game:12,game12Choice:'unstableArgument'}).map(a=>a.id);
  assert.ok(ids.includes('unstableArgument'));
  assert.ok(!ids.includes('forceBolt'));
  assert.ok(!ids.includes('flamethrower'));
});
test('availableAbilities: силовой болт недоступен до 12 игры', () => {
  const ids = availableAbilities({classKey:'artificer',game:4,game12Choice:'flamethrower'}).map(a=>a.id);
  assert.ok(!ids.includes('forceBolt'));
});

test('critRangeForCharacter: Наручи удачи дают 19', () => {
  assert.equal(critRangeForCharacter({classKey:'wizard',game:1,artifacts:['braceletsOfLuck']}), 19);
  assert.equal(critRangeForCharacter({classKey:'warrior',game:12,game12Choice:'weakSpot',artifacts:['braceletsOfLuck']}), 18);
});

test('ARTIFACTS: ровно 3 записи с нужными id, без hint', () => {
  assert.equal(ARTIFACTS.length, 3);
  const ids = ARTIFACTS.map((a) => a.id);
  assert.deepEqual(ids, ['runeOfWarrior', 'braceletsOfLuck', 'runeOfElements']);
  assert.ok(ARTIFACTS.every((a) => a.name && !a.hint));
});

test('modifierRelevance: runeOfElements — true только когда артефакт выбран', () => {
  const fb = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).find((a) => a.id === 'fireball');
  assert.equal(modifierRelevance(fb, { classKey: 'wizard', game: 1, artifacts: [] }).runeOfElements, false);
  assert.equal(modifierRelevance(fb, { classKey: 'wizard', game: 1, artifacts: ['runeOfElements'] }).runeOfElements, true);
});

test('modifierRelevance: runeOfWarrior — true только когда артефакт выбран', () => {
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', game: 1, artifacts: [] }).runeOfWarrior, false);
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', game: 1, artifacts: ['runeOfWarrior'] }).runeOfWarrior, true);
});

test('modifierRelevance: настойку пьёт кто угодно, не только бард', () => {
  // Бард её варит, но эффект получает выпивший — и артефакт с 20 игры доступен всем.
  const fb = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).find((a) => a.id === 'fireball');
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(fb, { classKey: 'wizard', raceKey: 'orc', game: 1 }).tincture, true);
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', game: 1 }).tincture, true);
});

test('modifierRelevance: воодушевление доступно союзнику любого класса и игры', () => {
  // «Выберите до пяти существ» — получатели союзники; игра барда, а не получателя.
  const fb = availableAbilities({ classKey: 'wizard', game: 1, game12Choice: null }).find((a) => a.id === 'fireball');
  assert.equal(modifierRelevance(fb, { classKey: 'wizard', game: 1 }).inspiration, true);
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', game: 1 }).inspiration, true);
});

test('modifierRelevance: sacredWeapon — true только для клерика', () => {
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(ba, { classKey: 'paladin', game: 1 }).sacredWeapon, false);
  assert.equal(modifierRelevance(ba, { classKey: 'cleric', game: 1 }).sacredWeapon, true);
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', game: 1 }).sacredWeapon, false);
});

test('modifierRelevance: beastRage — true только для друида game>=12 с выбором beastRage', () => {
  const ba = availableAbilities({ classKey: 'druid', game: 12, game12Choice: 'beastRage' })[0];
  assert.equal(modifierRelevance(ba, { classKey: 'druid', game: 12, game12Choice: 'beastRage' }).beastRage, true);
  assert.equal(modifierRelevance(ba, { classKey: 'druid', game: 12, game12Choice: 'windGust' }).beastRage, false);
  assert.equal(modifierRelevance(ba, { classKey: 'druid', game: 8, game12Choice: null }).beastRage, false);
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', game: 12, game12Choice: 'beastRage' }).beastRage, false);
});

test('defaultState: character.artifacts — пустой массив', () => {
  const s = defaultState();
  assert.deepEqual(s.character.artifacts, []);
});

test('modifierRelevance: orcReroll — true только для орка', () => {
  const ba = availableAbilities({ classKey: 'warrior', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', raceKey: 'orc', game: 1 }).orcReroll, true);
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', raceKey: 'human', game: 1 }).orcReroll, false);
});

test('modifierRelevance: concentration — true только для волшебника game>=4', () => {
  const fb = availableAbilities({ classKey: 'wizard', game: 4, game12Choice: null }).find((a) => a.id === 'fireball');
  assert.equal(modifierRelevance(fb, { classKey: 'wizard', raceKey: 'orc', game: 4 }).concentration, true);
  assert.equal(modifierRelevance(fb, { classKey: 'wizard', raceKey: 'orc', game: 1 }).concentration, false);
  assert.equal(modifierRelevance(fb, { classKey: 'cleric', raceKey: 'human', game: 12 }).concentration, false);
});

test('modifierRelevance: guaranteedHit — следопыт и эльф; не человек-плут', () => {
  const ba = availableAbilities({ classKey: 'ranger', game: 1, game12Choice: null })[0];
  // следопыт — true
  assert.equal(modifierRelevance(ba, { classKey: 'ranger', game: 1 }).guaranteedHit, true);
  // эльф любого класса — true
  assert.equal(modifierRelevance(ba, { classKey: 'warrior', raceKey: 'elf', game: 1 }).guaranteedHit, true);
  // человек-плут — false (рог больше не в списке)
  assert.equal(modifierRelevance(ba, { classKey: 'rogue', raceKey: 'human', game: 1 }).guaranteedHit, false);
});

test('luckyCrit: только для rogue game>=12 с выбором lucky', () => {
  const rogueAb = availableAbilities({ classKey: 'rogue', game: 1, game12Choice: null })[0];
  assert.equal(modifierRelevance(rogueAb, { classKey: 'rogue', game: 12, game12Choice: 'lucky' }).luckyCrit, true);
  assert.equal(modifierRelevance(rogueAb, { classKey: 'rogue', game: 12, game12Choice: 'someOther' }).luckyCrit, false);
  assert.equal(modifierRelevance(rogueAb, { classKey: 'rogue', game: 1, game12Choice: null }).luckyCrit, false);
  assert.equal(modifierRelevance(rogueAb, { classKey: 'ranger', game: 12, game12Choice: 'lucky' }).luckyCrit, false);
});
