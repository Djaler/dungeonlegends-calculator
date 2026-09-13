import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

function strip(src) {
  return src
    .replace(/^\s*import[^;]*;?\s*$/gm, '')
    .replace(/^\s*export\s+/gm, '');
}

const read = (p) => readFileSync(p, 'utf8');

const engine = strip(read('src/engine.js'));
const types = strip(read('src/types.js'));
const characters = strip(read('src/characters.js'));
const modifiers = strip(read('src/modifiers.js'));

// Автосбор способностей: сперва все классовые файлы, потом index (объявляет ABILITIES).
const abilityFiles = readdirSync('src/abilities')
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .sort();
const abilityClasses = abilityFiles.map((f) => strip(read(`src/abilities/${f}`))).join('\n');
const abilityIndex = strip(read('src/abilities/index.js'));

const simulator = strip(read('src/simulator.js'));
const uiLogic = strip(read('src/ui-logic.js'));
const ui = read('src/ui.js');

// Общий код для Worker и основного потока (порядок важен: типы и характеристики
// до модификаторов и способностей).
const core = [engine, types, characters, modifiers, abilityClasses, abilityIndex].join('\n');

const workerCore = [core, simulator, `
const ABILITY_MAP = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));
self.onmessage = (e) => {
  const { type, abilityId, baseCtx, opts } = e.data;
  // Функции через postMessage не переносятся, поэтому второе действие Решительности
  // приходит как id и разворачивается в способность здесь.
  const runOpts = { ...opts, resolveAbility: opts.resolveAbilityId ? ABILITY_MAP[opts.resolveAbilityId] : null };
  if (type === 'run') {
    const m = runAbility(ABILITY_MAP[abilityId], baseCtx, runOpts);
    self.postMessage({ type: 'result', metrics: { ...m,
      groupFreq: [...m.groupFreq],
      targetFreq: m.targetFreq.map((f) => [...f]) } });
  }
  if (type === 'compare') {
    const list = (e.data.abilityIds && e.data.abilityIds.length)
      ? ABILITIES.filter((a) => e.data.abilityIds.includes(a.id))
      : ABILITIES;
    self.postMessage({ type: 'comparison', rows: compareAbilities(list, baseCtx, runOpts) });
  }
};
`].join('\n');

const mainGlue = `
${core}
function makeWorker() {
  const code = ${JSON.stringify(workerCore)};
  const blob = new Blob([code], { type: 'application/javascript' });
  const w = new Worker(URL.createObjectURL(blob));
  return new Proxy(w, {
    get(t, p) {
      if (p === 'onmessage') return t._wrapped;
      return typeof t[p] === 'function' ? t[p].bind(t) : t[p];
    },
    set(t, p, v) {
      if (p === 'onmessage') {
        t._wrapped = v;
        t.onmessage = (e) => {
          const d = e.data;
          if (d.type === 'result') {
            d.metrics.groupFreq = new Map(d.metrics.groupFreq);
            d.metrics.targetFreq = d.metrics.targetFreq.map((f) => new Map(f));
          }
          v(e);
        };
        return true;
      }
      t[p] = v; return true;
    },
  });
}
`;

const engineBlock = mainGlue + '\n' + simulator + '\n' + uiLogic;
const tpl = read('template.html');
const out = tpl.replace('/*ENGINE*/', engineBlock).replace('/*UI*/', ui);
writeFileSync('dnd-dmg.html', out);
console.log('dnd-dmg.html собран,', out.length, 'байт');
