// Инвариант: показанный тумблер обязан менять расчёт.
// Тумблер, который виден, но ни на что не влияет, хуже отсутствующего —
// пользователь считает эффект учтённым, а его нет.
//
// Проверка точная, а не статистическая: модификатор-пустышка не трогает ни одной
// ветки кода и не тратит ни одного броска ГПСЧ, поэтому при общем сиде прогоны
// совпадают бит-в-бит. Хватает пары сотен итераций.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/abilities/index.js';
import { runAbility } from '../src/simulator.js';
import { CLASSES, RACES, deriveStats } from '../src/characters.js';
import {
  availableAbilities, defaultParams, modifierRelevance, GAME12_CHOICES, ARTIFACTS,
  weaponForCharacter, critRangeForCharacter, fumbleRangeForCharacter,
} from '../src/ui-logic.js';

const ALL_ARTIFACTS = ARTIFACTS.map((a) => a.id);

// Что значит «включить тумблер» в терминах ctx.mods — повторяет baseCtx() из src/ui.js:
// у части модификаторов ключ интерфейса и ключ движка различаются.
const turnOn = (modId, stats) => {
  switch (modId) {
    case 'concentration': return { concentration: 3 };
    case 'smiteDice': return { smiteDice: 2 };
    case 'genius': return { genius: 4 };
    case 'sacredWeapon': return { sacredWeapon: stats.con };
    case 'giantHunter': return { acIgnore: stats.wis };
    case 'contactless': return { typeOverride: 'magic' };
    default: return { [modId]: true };
  }
};

// Ключи без собственного контрола: включаются сами, чужим тумблером или селектом.
// humanResolve — это селект второго действия, он проверяется отдельным тестом ниже.
const NO_CONTROL = new Set(['orcReroll', 'beastRage', 'acIgnore', 'typeOverride', 'runeType', 'humanResolve']);

const OFF_MODS = {
  adv: false, dis: false, hex: false, chaos: false, rage: false, orcReroll: false, concentration: 0,
  barbRage: false, bonusAttack: false, smiteDice: 0, guaranteedHit: false, luckyCrit: false,
  genius: 0, talent: false, rabbitFoot: false, sneak: false, sneakDouble: false, gwm: false,
  acIgnore: 0, giantHunter: false, ricochet: false, typeOverride: undefined, contactless: false,
  runeOfWarrior: false, runeOfElements: false, runeType: 'fire', sacredWeapon: 0,
  tincture: false, inspiration: false, resolveAbilityId: null,
};

// Наборы целей: разный КБ ловит модификаторы попадания, расы — те, что меняют
// категорию урона, несколько целей — рикошет и области.
const TARGET_SETS = [
  [{ ac: 10 }], [{ ac: 16 }], [{ ac: 22 }],
  [{ ac: 16 }, { ac: 16 }, { ac: 16 }],
  [{ ac: 16, race: 'dwarf' }], [{ ac: 16, race: 'orc' }], [{ ac: 16, race: 'aasimar' }],
];

const mkTargets = (set) => set.map((t) => ({
  ac: t.ac, hp: 9999, saves: { str: 0, dex: 0, con: 0, wis: 0, int: 0, cha: 0 },
  race: t.race || null, adv: false, dis: false,
}));

function affects(ability, character, modId, targetSet) {
  const targets = mkTargets(targetSet);
  const stats = deriveStats(character.classKey, character.raceKey, character.game, null);
  const base = {
    classKey: character.classKey,
    stats,
    weapon: weaponForCharacter(character),
    critRange: critRangeForCharacter(character),
    fumbleRange: fumbleRangeForCharacter(character),
    targets,
    params: defaultParams(ability, targets),
  };
  const opts = { trials: 200, seed: 12345 };
  // sneakDouble вложен в sneak, поэтому сравнивается поверх включённой скрытной атаки
  const extra = modId === 'sneakDouble' ? { sneak: true } : {};
  const off = runAbility(ability, { ...base, mods: { ...OFF_MODS, ...extra } }, opts);
  const on = runAbility(ability, { ...base, mods: { ...OFF_MODS, ...extra, ...turnOn(modId, stats) } }, opts);
  return on.groupMean !== off.groupMean;
}

test('селект «Решительность» показан человеку и влияет на расчёт', () => {
  const character = { classKey: 'warrior', raceKey: 'human', game: 16, game12Choice: null, artifacts: [] };
  const ability = availableAbilities(character).find((a) => a.id === 'basicAttack');
  assert.equal(modifierRelevance(ability, character).humanResolve, true);
  const targets = mkTargets([{ ac: 16 }]);
  const ctx = {
    classKey: character.classKey,
    stats: deriveStats(character.classKey, character.raceKey, character.game, null),
    weapon: weaponForCharacter(character),
    critRange: critRangeForCharacter(character),
    fumbleRange: fumbleRangeForCharacter(character),
    targets, mods: { ...OFF_MODS }, params: defaultParams(ability, targets),
  };
  const off = runAbility(ability, ctx, { trials: 500, seed: 99 });
  const on = runAbility(ability, ctx, { trials: 500, seed: 99, resolveAbility: ability, resolveParams: ctx.params });
  assert.notEqual(on.groupMean, off.groupMean);
  // не-человеку селект не показывается
  const orc = { ...character, raceKey: 'orc' };
  assert.equal(modifierRelevance(ability, orc).humanResolve, false);
});

test('каждый показанный модификатор влияет на расчёт', () => {
  const dead = [];
  let shown = 0;
  for (const raceKey of Object.keys(RACES)) {
    for (const classKey of Object.keys(CLASSES)) {
      for (const game of [1, 4, 12, 16]) {
        const choices = [null, ...(GAME12_CHOICES[classKey] || []).map((x) => x.id)];
        for (const game12Choice of choices) {
          for (const artifacts of [[], ALL_ARTIFACTS]) {
            const character = { classKey, raceKey, game, game12Choice, artifacts };
            for (const ability of availableAbilities(character)) {
              const rel = modifierRelevance(ability, character);
              for (const [modId, isShown] of Object.entries(rel)) {
                if (!isShown || NO_CONTROL.has(modId)) continue;
                shown++;
                if (TARGET_SETS.some((set) => affects(ability, character, modId, set))) continue;
                dead.push(`${modId} @ ${ability.id} (${raceKey}-${classKey}, игра ${game}${game12Choice ? ', ' + game12Choice : ''}${artifacts.length ? ', с артефактами' : ''})`);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(shown > 1000, `проверено подозрительно мало показов: ${shown}`);
  const uniq = [...new Set(dead.map((d) => d.split(' (')[0]))];
  assert.deepEqual(uniq, [], `показаны, но не влияют:\n  ${uniq.join('\n  ')}\n(всего случаев ${dead.length} из ${shown})`);
});
