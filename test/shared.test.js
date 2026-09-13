import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiWeaponAttack } from '../src/abilities/shared.js';
import { seqRng } from './helpers.js';

const ctx = (over) => {
  const stats = over.stats ?? { str: 3, dex: 0, con: 0, wis: 0, int: 0, cha: 0 };
  return {
    rng: over.rng,
    stats,
    attackBonus: (s) => stats[s],
    critRange: over.critRange ?? 20,
    weapon: over.weapon ?? { dice: '1d10', stat: 'str' },
    targets: over.targets ?? [{ ac: 10, hp: 30 }],
    mods: { orcReroll: false, adv: false, dis: false, barbRage: false, gwm: false,
      guaranteedHit: false, luckyCrit: false, acIgnore: 0, typeOverride: undefined, bonusAttack: false,
      sneak: false, sneakDouble: false, smiteDice: 0, ricochet: false,
      runeOfWarrior: false, sacredWeapon: 0, runeOfElements: false, inspiration: false, tincture: false,
      ...(over.mods || {}) },
  };
};

test('одна атака: попадание = куб+стат physical', () => {
  // nat=floor(0.5*20)+1=11; 11+3>=10 hit; d10 0.99 ->10; +3 =13
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99]) }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('две атаки по одной цели складываются в два пакета', () => {
  // обе nat 11 (0.5), урон 0.99->10+3=13 каждая
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99, 0.5, 0.99]) }), [0, 0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }, { type: 'physical', amount: 13 }]]);
});

test('barbRage удваивает бонус Силы в уроне (и помогает попасть)', () => {
  // bonus = 3*2 = 6. nat=floor(0.0*20)+1=1 -> промах? nat1 always miss. Возьмём nat=10 (0.45):
  // 10+6>=10 hit; d10 0.99->10 + 6 = 16
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.45, 0.99]), mods: { barbRage: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 16 }]]);
});

test('gwm: -5 к попаданию, +10 к урону', () => {
  // bonus 3, gwm -5 => эффект попадания 3-5=-2: nat=10 ->10-2=8 <10 промах. Возьмём nat=20 -> nat20 крит-попадание.
  // крит: d10 удваивается: 0.99->10 + 0.99->10 +3 +10 = 33
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.99, 0.99, 0.99]), mods: { gwm: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 33 }]]);
});

test('guaranteedHit: первая атака попадает без броска (куб урона — первый бросок)', () => {
  // guaranteedHit -> не кидаем d20 на первую атаку; первый бросок rng идёт в урон: 0.99->10 +3 =13
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.99]), mods: { guaranteedHit: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('luckyCrit: на промахе атаки преобразуется в крит', () => {
  // d20: nat=floor(0.05*20)+1=2; +3 = 5 < 99 (промах)
  // luckyCrit преобразует промах в крит -> два куба: 0.99->10 + 0.99->10 +3 = 23
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.05, 0.99, 0.99]), targets: [{ ac: 99, hp: 30 }], mods: { luckyCrit: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 23 }]]);
});

test('luckyCrit: при попадании атака наносит нормальный урон', () => {
  // d20: nat=floor(0.5*20)+1=11; +3 = 14 >= 10 (попадание, не крит)
  // luckyCrit не применяется -> один куб: 0.99->10 +3 = 13
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99]), targets: [{ ac: 10, hp: 30 }], mods: { luckyCrit: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('цель с AC<10 без acIgnore: попасть можно (пол AC 10 не применяется)', () => {
  // targets ac=8; nat=floor(0.4*20)+1=9; 9+3=12 >= 8 -> попадание (если бы floor применялся, было бы AC 10 -> 12>=10 тоже hit, но проверяем AC 8 точнее)
  // Используем nat=8 (0.35->floor=7, +1=8): 8+3=11>=8 hit, но 11<10 промах если floor. Значит nat должен быть меньше 8.
  // nat=floor(0.29*20)+1=6+1=7; 7+3=10 >= 8 hit, но 10 >= 10 — неразличимо.
  // Берём nat=5 (0.2->4+1=5): 5+3=8 >= 8 hit; но если floor: 8 >= 10 false -> промах. Это доказывает баг.
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.2, 0.99]), targets: [{ ac: 8, hp: 30 }], mods: { acIgnore: 0 } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('acIgnore понижает эффективную броню, не ниже 10', () => {
  // цель ac 14, acIgnore 6 -> eff 10 (floor). nat=10 (0.45): 10+3>=10 hit
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.45, 0.99]), targets: [{ ac: 14, hp: 30 }], mods: { acIgnore: 6 } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }]]);
});

test('typeOverride делает урон magic', () => {
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99]), mods: { typeOverride: 'magic' } }), [0]);
  assert.deepEqual(p, [[{ type: 'magic', amount: 13 }]]);
});

test('bonusAttack добавляет ещё одну атаку по первой цели плана', () => {
  // план [0]; bonusAttack -> две атаки. обе nat 0.5, урон 0.99
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99, 0.5, 0.99]), mods: { bonusAttack: true } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }, { type: 'physical', amount: 13 }]]);
});

test('smiteDice добавляет Nд10 излучения один раз к первому попаданию', () => {
  // атака: nat 0.5 hit, урон d10 0.99->10+3=13; затем smite 2d10 по 0.99 ->20 radiant
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5, 0.99, 0.99, 0.99]), mods: { smiteDice: 2 } }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }, { type: 'radiant', amount: 20 }]]);
});

test('sneak: +dex к урону и преимущество; sneakDouble удваивает удар', () => {
  // weapon dex-based: stat dex=4, dice 2d4. sneak -> бонус урона 2*dex=8; sneakDouble ->*2
  // adv: два d20 (0.5,0.5)->11 hit; урон 2d4 (0.99,0.99)=8 + 8(2dex) =16; *2 =32
  const p = multiWeaponAttack(ctx({
    rng: seqRng([0.5, 0.5, 0.99, 0.99]),
    stats: { str: 0, dex: 4, con: 0, wis: 0, int: 0, cha: 0 },
    weapon: { dice: '2d4', stat: 'dex' },
    mods: { sneak: true, sneakDouble: true },
  }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 32 }]]);
});

test('ricochet дублирует урон первого попадания по следующей цели', () => {
  // 2 цели; атака по 0: nat 0.5 hit, d10 0.99->13; ricochet -> та же 13 по цели 1
  const p = multiWeaponAttack(ctx({
    rng: seqRng([0.5, 0.99]),
    targets: [{ ac: 10, hp: 30 }, { ac: 10, hp: 30 }],
    mods: { ricochet: true },
  }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 13 }], [{ type: 'physical', amount: 13 }]]);
});

test('ricochet дублирует ровно один выстрел, а не весь урон по цели за ход', () => {
  // две атаки по цели 0: обе попали (nat 0.5), d10 0.99->13 каждая.
  // рикошет копирует только первый выстрел -> цель 1 получает одну 13, а не 26.
  const p = multiWeaponAttack(ctx({
    rng: seqRng([0.5, 0.99, 0.5, 0.99]),
    targets: [{ ac: 10, hp: 30 }, { ac: 10, hp: 30 }],
    mods: { ricochet: true },
  }), [0, 0]);
  assert.deepEqual(p, [
    [{ type: 'physical', amount: 13 }, { type: 'physical', amount: 13 }],
    [{ type: 'physical', amount: 13 }],
  ]);
});

test('промах не даёт пакета и не тратит смайт', () => {
  // nat=1 (0) промах; смайт не применяется (нет попадания)
  const p = multiWeaponAttack(ctx({ rng: seqRng([0]), mods: { smiteDice: 2 } }), [0]);
  assert.deepEqual(p, [[]]);
});

test('крит: куб оружия удваивается, стат не удваивается', () => {
  // critRange 20, rng: nat=floor(0.99*20)+1=20 -> crit; затем два d10: 0.99->10, 0.99->10; +3 stat
  // amount = 10+10+3 = 23
  const p = multiWeaponAttack(ctx({
    rng: seqRng([0.99, 0.99, 0.99]),
    critRange: 20,
  }), [0]);
  assert.deepEqual(p, [[{ type: 'physical', amount: 23 }]]);
});

test('крит смайт: кубы смайта удваиваются на крите', () => {
  // nat=0.99->20 crit; weapon d10: 0.99->10, 0.99->10; +3 stat = 23 physical
  // smite 2d10: crit -> 4d10, all 0.99->10 each; =40 radiant
  const p = multiWeaponAttack(ctx({
    rng: seqRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
    mods: { smiteDice: 2 },
  }), [0]);
  assert.deepEqual(p, [[
    { type: 'physical', amount: 23 },
    { type: 'radiant', amount: 40 },
  ]]);
});

test('Руна воителя: +1 к урону оружия (и помогает попасть)', () => {
  // stat str 3, rune +1 => bonus к урону 4. nat 0.5 hit; d10 0.99->10 +3 +1 =14
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5,0.99]), mods:{ runeOfWarrior:true } }), [0]);
  assert.deepEqual(p, [[{type:'physical',amount:14}]]);
});

test('Священное оружие: +Стойкость к урону оружия', () => {
  // sacredWeapon=4 => +4 урон. d10 0.99->10 +3 +4 =17
  const p = multiWeaponAttack(ctx({ rng: seqRng([0.5,0.99]), mods:{ sacredWeapon:4 } }), [0]);
  assert.deepEqual(p, [[{type:'physical',amount:17}]]);
});
