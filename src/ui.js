// UI-only display metadata (does not touch the engine): each spell's element
// drives the accent glow, and the dice formula is shown as a spell inscription.
const SPELL_META = {
  magicMissiles:  { element: 'arcane',    formula: '3 × 1d4+1 · авто' },
  chainLightning: { element: 'lightning', formula: '2d6 + до 3 атак' },
  fireball:       { element: 'fire',      formula: '6d6 · спасбросок Лвк 15' },
  telekinesis:    { element: 'force',     formula: '1d4 · атака Инт' },
  staff:          { element: 'arcane',    formula: '1d4 · атака Инт' },
  basicAttack:    { element: 'steel',     formula: 'куб оружия + стат' },
};
const GLOW = { fire: '#FF7A36', lightning: '#54D6FF', arcane: '#B07CFF', force: '#8FA0C8', steel: '#cdb892' };

// --- display-only probability helpers (mirror the engine rules) ---
const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);
const pct = (x) => Math.round(x * 100) + '%';
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };

// Сводная статистика распределения (freq: Map<урон, число прогонов>).
function statsFromFreq(freq, trials) {
  const entries = [...freq.entries()].sort((a, b) => a[0] - b[0]);
  let sum = 0; for (const [v, c] of entries) sum += v * c;
  const pc = (q) => { const t = q * trials; let cum = 0; for (const [v, c] of entries) { cum += c; if (cum >= t) return v; } return entries.length ? entries[entries.length - 1][0] : 0; };
  return {
    entries,
    min: entries.length ? entries[0][0] : 0,
    max: entries.length ? entries[entries.length - 1][0] : 0,
    mean: sum / trials,
    med: pc(0.5), p25: pc(0.25), p75: pc(0.75),
  };
}

function initUI(root) {
  const STORAGE_KEY = 'dnd-dmg-state';
  let state = deserializeState(localStorage.getItem(STORAGE_KEY)) || defaultState();

  const save = () => { try { localStorage.setItem(STORAGE_KEY, serializeState(state)); } catch {} };
  const qsa = (s) => document.querySelectorAll(s);

  let currentGlow = GLOW[(SPELL_META[state.abilityId] || { element: 'arcane' }).element];

  const worker = makeWorker();
  worker.onmessage = (e) => {
    if (e.data.type === 'result') renderResult(e.data.metrics);
    if (e.data.type === 'comparison') renderComparison(e.data.rows);
  };

  root.innerHTML = `
    <header class="masthead">
      <div class="crest">⛤</div>
      <div style="flex:1"><div class="eyebrow">Боевой гримуар</div><h1 class="title" id="heroTitle">Человек-воин</h1></div>
      <button class="btn btn-ghost" id="reset">Сбросить</button>
    </header>
    <section class="hero" id="result"><div class="minmax">Призываю расчёт…</div></section>
    <div id="charts"></div>

    <div class="label">Герой</div>
    <div id="builder"></div>

    <div class="label">Способность</div>
    <div id="spells"></div>
    <div id="params"></div>

    <div class="label">Модификаторы</div>
    <div id="mods"></div>

    <div class="label">Цели</div>
    <div id="targets"></div>
    <button class="btn btn-dashed" id="addTarget">+ Добавить цель</button>

    <div class="label">Сравнение способностей героя</div>
    <div id="compare"></div>
  `;

  document.getElementById('reset').onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    ensureParams();
    renderAll();
    run();
  };
  document.getElementById('addTarget').onclick = () => {
    state.targets.push({ ac: 12, hp: 30, saves: { str: 0, dex: 0, con: 0, wis: 0, int: 0, cha: 0 }, race: null, preset: null });
    ensureParams();
    save();
    renderParams();
    renderTargets();
    run();
  };

  renderAll();
  run();

  // --- вспомогательные ---

  function setGlow() {
    const meta = SPELL_META[state.abilityId] || { element: 'arcane' };
    currentGlow = GLOW[meta.element] || GLOW.arcane;
    document.documentElement.style.setProperty('--glow', currentGlow);
  }

  function effectiveStats() {
    const c = state.character;
    const base = deriveStats(c.classKey, c.raceKey, c.game, c.bumps);
    return { ...base, ...c.statOverrides };
  }

  function currentAbility() {
    return availableAbilities(state.character).find((a) => a.id === state.abilityId) || null;
  }

  function ensureParams() {
    const a = currentAbility();
    if (!a) { state.params = {}; return; }
    const def = defaultParams(a, state.targets);
    state.params = { ...def, ...(state.params || {}) };
    if (a.params.some((p) => p.kind === 'targetOrder')) {
      const op = a.params.find((p) => p.kind === 'targetOrder');
      state.params[op.id] = sanitizeOrder(state.params[op.id], state.targets);
    }
    a.params.filter((p) => p.kind === 'targetPick').forEach((p) => {
      if (state.params[p.id] >= state.targets.length) state.params[p.id] = 0;
    });
  }

  function renderAll() {
    setGlow();
    renderBuilder();
    renderSpells();
    renderParams();
    renderMods();
    renderTargets();
    // обновить заголовок
    const c = state.character;
    const rn = RACES[c.raceKey] ? RACES[c.raceKey].name : '';
    const cn = CLASSES[c.classKey] ? CLASSES[c.classKey].name : '';
    const title = document.getElementById('heroTitle');
    if (title) title.textContent = `${rn}-${cn.toLowerCase()}`;
  }

  function onCharacterChange() {
    const avail = availableAbilities(state.character);
    if (!avail.find((a) => a.id === state.abilityId)) {
      state.abilityId = avail[0] ? avail[0].id : null;
    }
    ensureParams();
    save();
    renderAll();
    run();
  }

  // --- конструктор героя ---

  function renderBuilder() {
    const c = state.character;
    const opt = (obj, sel) => Object.entries(obj).map(([k, v]) =>
      `<option value="${k}" ${sel === k ? 'selected' : ''}>${v.name}</option>`).join('');
    const games = Array.from({ length: 20 }, (_, i) => i + 1).map((g) =>
      `<option ${c.game === g ? 'selected' : ''}>${g}</option>`).join('');
    const s = effectiveStats();
    const keys = [['str', 'Сила'], ['dex', 'Лов'], ['con', 'Стой'], ['wis', 'Муд'], ['int', 'Инт'], ['cha', 'Хар']];
    const wpn = weaponForCharacter(c);
    const game12Choices = GAME12_CHOICES[c.classKey];
    const game12Html = (c.game >= 12 && game12Choices) ? `
      <label class="field"><span>Выбор [12]</span>
        <select id="bGame12">
          <option value="">—</option>
          ${game12Choices.map((ch) => `<option value="${ch.id}" ${c.game12Choice === ch.id ? 'selected' : ''}>${ch.name}</option>`).join('')}
        </select>
      </label>` : '';
    document.getElementById('builder').innerHTML = `
      <div class="card">
        <div class="build-top">
          <label class="field"><span>Класс</span><select id="bClass">${opt(CLASSES, c.classKey)}</select></label>
          <label class="field"><span>Раса</span><select id="bRace">${opt(RACES, c.raceKey)}</select></label>
          <label class="field"><span>Игра</span><select id="bGame">${games}</select></label>
          ${game12Html}
        </div>
        <div class="stats">${keys.map(([k, l]) =>
          `<label class="stat"><span class="s-k">${l}</span><input class="s-v" type="number" data-stat="${k}" value="${s[k]}"></label>`
        ).join('')}</div>
        <div class="kit"><span class="chip">Оружие <i>${wpn.dice} · ${wpn.stat === 'str' ? 'Сила' : 'Ловкость'}</i></span></div>
        <div class="artifacts">
          ${ARTIFACTS.map((art) => {
            const on = (c.artifacts || []).includes(art.id);
            return `<label class="sigil"><input type="checkbox" data-artifact="${art.id}" ${on ? 'checked' : ''}><span class="mark"></span>${art.name}</label>`;
          }).join('')}
        </div>
      </div>`;
    document.getElementById('bClass').onchange = (e) => {
      state.character.classKey = e.target.value;
      state.character.statOverrides = {};
      onCharacterChange();
    };
    document.getElementById('bRace').onchange = (e) => {
      state.character.raceKey = e.target.value;
      state.character.statOverrides = {};
      onCharacterChange();
    };
    document.getElementById('bGame').onchange = (e) => {
      state.character.game = Number(e.target.value);
      onCharacterChange();
    };
    const bGame12 = document.getElementById('bGame12');
    if (bGame12) bGame12.onchange = (e) => {
      state.character.game12Choice = e.target.value || null;
      onCharacterChange();
    };
    qsa('[data-stat]').forEach((el) => el.onchange = () => {
      state.character.statOverrides[el.dataset.stat] = Number(el.value);
      save();
      run();
    });
    qsa('[data-artifact]').forEach((el) => el.onchange = () => {
      const id = el.dataset.artifact;
      if (!state.character.artifacts) state.character.artifacts = [];
      if (el.checked) {
        if (!state.character.artifacts.includes(id)) state.character.artifacts.push(id);
      } else {
        state.character.artifacts = state.character.artifacts.filter((a) => a !== id);
      }
      save();
      renderMods();
      run();
    });
  }

  // --- выбор способности ---

  function renderSpells() {
    const avail = availableAbilities(state.character);
    document.getElementById('spells').innerHTML = avail.map((a) => {
      const meta = SPELL_META[a.id] || { element: 'arcane', formula: '' };
      const on = a.id === state.abilityId;
      return `<button class="spell" data-spell="${a.id}" aria-pressed="${on}" style="--el:${GLOW[meta.element] || GLOW.arcane}">
        <span class="dot"></span>
        <span class="meta"><span class="nm">${a.name}</span><span class="fx">${meta.formula}</span></span>
        <span class="tag">${a.charges}</span>
      </button>`;
    }).join('');
    qsa('[data-spell]').forEach((b) => b.onclick = () => {
      state.abilityId = b.dataset.spell;
      ensureParams();
      save();
      setGlow();
      renderSpells();
      renderParams();
      renderMods();
      run();
    });
  }

  // --- параметры способности ---

  function renderParams() {
    const a = currentAbility();
    const box = document.getElementById('params');
    if (!a || !a.params || a.params.length === 0) { box.innerHTML = ''; return; }

    let html = '<div class="params">';
    for (const p of a.params) {
      if (p.kind === 'targetPick') {
        // ряд кнопок для выбора цели
        const cur = state.params[p.id] ?? 0;
        html += `<div class="pick"><span class="param-label" style="padding:0">${p.label}:</span>`;
        for (let i = 0; i < state.targets.length; i++) {
          html += `<button class="opt${cur === i ? ' on' : ''}" data-pick="${p.id}" data-val="${i}">Цель ${i + 1}</button>`;
        }
        html += '</div>';
      } else if (p.kind === 'targetOrder') {
        // набор select'ов «Удар N»
        const seq = sanitizeOrder(state.params[p.id], state.targets);
        const labels = ['Удар 1 (авто)', 'Удар 2', 'Удар 3', 'Удар 4'];
        if (state.targets.length >= 2) {
          html += '<div class="chainseq" style="padding:12px 14px">';
          for (let slot = 0; slot < seq.length; slot++) {
            const prev = slot > 0 ? seq[slot - 1] : -1;
            const opts = state.targets.map((t, j) =>
              j === prev ? '' : `<option value="${j}" ${j === seq[slot] ? 'selected' : ''}>Цель ${j + 1} · КБ ${t.ac}</option>`
            ).join('');
            html += `<label class="field"><span>${labels[slot]}</span><select data-order="${p.id}" data-slot="${slot}">${opts}</select></label>`;
          }
          html += '</div><div class="mod-note" style="padding:0 14px 12px">Первый удар попадает автоматически; дальше — атаки в выбранном порядке (нельзя дважды подряд по одной цели).</div>';
        }
      } else if (p.kind === 'distribute') {
        // волшебные снаряды — показываем подпись (дефолт null = по кругу)
        html += `<div class="param-row"><span class="param-label">${p.label}</span><span style="font-size:.78rem;color:var(--muted)">по кругу</span></div>`;
      } else if (p.kind === 'toggle') {
        const val = state.params[p.id] ?? false;
        html += `<div class="param-row"><span class="param-label">${p.label}</span>
          <label class="sigil" style="border-radius:999px"><input type="checkbox" data-toggle="${p.id}" ${val ? 'checked' : ''}><span class="mark"></span></label></div>`;
      } else if (p.kind === 'select') {
        const val = state.params[p.id];
        const opts2 = (p.options || []).map((o) =>
          `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`
        ).join('');
        html += `<div class="param-row"><span class="param-label">${p.label}</span><select data-select="${p.id}" style="width:auto">${opts2}</select></div>`;
      } else if (p.kind === 'stepper') {
        const val = state.params[p.id] ?? p.min ?? 0;
        html += `<div class="param-row int-row" style="border:0;padding:10px 14px">
          <div class="cap"><b>${p.label} ×${val}</b></div>
          <div class="stepper">
            <button data-step="${p.id}" data-dir="-1" aria-label="меньше">−</button>
            <input type="number" value="${val}" readonly>
            <button data-step="${p.id}" data-dir="1" aria-label="больше">+</button>
          </div></div>`;
      }
    }
    html += '</div>';
    box.innerHTML = html;

    // обработчики
    qsa('[data-pick]').forEach((b) => b.onclick = () => {
      state.params[b.dataset.pick] = Number(b.dataset.val);
      ensureParams(); save(); renderParams(); run();
    });
    qsa('[data-order]').forEach((el) => el.onchange = () => {
      const id = el.dataset.order;
      const slot = Number(el.dataset.slot);
      const cur = sanitizeOrder(state.params[id], state.targets);
      cur[slot] = Number(el.value);
      state.params[id] = sanitizeOrder(cur, state.targets);
      save(); renderParams(); run();
    });
    qsa('[data-toggle]').forEach((el) => el.onchange = () => {
      state.params[el.dataset.toggle] = el.checked;
      ensureParams(); save(); run();
    });
    qsa('[data-select]').forEach((el) => el.onchange = () => {
      state.params[el.dataset.select] = el.value;
      ensureParams(); save(); run();
    });
    qsa('[data-step]').forEach((b) => b.onclick = () => {
      const id = b.dataset.step;
      const dir = Number(b.dataset.dir);
      const p2 = a.params.find((p) => p.id === id);
      const mn = p2 && p2.min != null ? p2.min : 0;
      const mx = p2 && p2.max != null ? p2.max : Infinity;
      state.params[id] = Math.max(mn, Math.min(mx, (state.params[id] ?? mn) + dir));
      ensureParams(); save(); renderParams(); run();
    });
  }

  // --- модификаторы ---

  // Потолок кары: паладину — по прокачке, всем прочим «Символ паладина» даёт 2д10.
  function smiteCap(c) {
    if (c.classKey !== 'paladin') return 2;
    return (c.game >= 12 && c.game12Choice === 'improvedSmite') ? 6 : 4;
  }

  function renderMods() {
    const a = currentAbility();
    const rel = a ? modifierRelevance(a, state.character) : { adv: false, dis: false, hex: false, chaos: false, concentration: false, rage: false, orcReroll: false };
    const c = state.character;
    const raceOrcReroll = RACES[c.raceKey] && RACES[c.raceKey].orcReroll;

    const toggles = [
      ['orcReroll', 'Орочий переброс', 'переброс «1–2» на кубах урона'],
      ['chaos', 'Зелье хаоса ×2', 'удваивает весь магический урон'],
      ['rage', 'Зелье ярости ×2', 'удваивает физический урон'],
      ['adv', 'Преимущество (атаки)', 'влияет на броски атаки'],
      ['dis', 'Помеха (атаки)', 'влияет на броски атаки'],
      ['hex', 'Сглаз: помеха спасброску', 'цель кидает спасбросок Ловкости с помехой'],
      ['barbRage', 'Ярость (×2 Сила)', 'варварская ярость: удваивает бонус Силы к урону'],
      ['gwm', 'Мастер большого оружия (−5/+10)', '−5 к атаке, +10 к урону'],
      ['guaranteedHit', 'Гарант. попадание (1 атака)', 'одна атака попадает автоматически'],
      ['luckyCrit', 'Фартовый (при промахе — крит)', 'при промахе атака преобразуется в критическое попадание'],
      ['bonusAttack', '+1 атака оружием', 'дополнительная атака оружием'],
      ['sneak', 'Скрытная атака (из скрытности)', '+урон скрытной атаки из скрытности'],
      ['sneakDouble', 'Скрытная: ×2 (потеря скрытности)', 'двойной урон скрытной атаки с потерей скрытности'],
      ['contactless', 'Бесконтактный бой (маг)', 'тип урона оружием становится магическим'],
      ['ricochet', 'Рикошет (+цель)', 'удар рикошетом по дополнительной цели'],
      ['giantHunter', 'Охотник на великанов (−КБ по Муд)', 'уменьшает КБ цели на значение Мудрости'],
      ['sacredWeapon', 'Священное оружие (+Ст)', '+значение Телосложения к урону оружием'],
      ['inspiration', 'Воодушевление (+д6)', 'бард влил вам д6 к урону: +1d6 первой цели с уроном'],
      ['tincture', 'Настойка: смелость (×2)', 'вы выпили настойку и выпало «3»: удваивает весь урон за ход'],
      ['talent', 'Талант (+3 к броску)', '16-я игра: сначала спасает промах, если решает исход; иначе +3 к самому низкому кубу урона'],
      ['rabbitFoot', 'Кроличья лапка (переброс)', 'артефакт: перебросить неудачный бросок атаки'],
    ];
    document.getElementById('mods').innerHTML =
      '<div class="sigils">' + toggles.map(([k, l, hint]) => {
        if (!rel[k]) return ''; // не показываем нерелевантные классовые моды
        const disabled = k === 'orcReroll' && raceOrcReroll;
        const checked = k === 'orcReroll' && raceOrcReroll ? true : state.mods[k];
        const label = disabled ? l + ' <span style="font-size:.68rem;color:var(--rune-gold)">(авто)</span>' : l;
        return `<label class="sigil" title="${hint}">
          <input type="checkbox" data-mod="${k}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
          <span class="mark"></span>${label}</label>`;
      }).join('') + '</div>'
      + ((c.artifacts || []).includes('runeOfElements') ? `
        <div class="int-row" style="margin-top:10px">
          <div class="cap"><b>Руна стихий: тип урона</b><span>+1d6 и смена типа; физический и магический по-разному ложатся на слабости цели</span></div>
          <select data-runetype style="width:auto">
            <option value="physical" ${(state.mods.runeType||'fire')==='physical'?'selected':''}>Физический</option>
            <option value="magic" ${(state.mods.runeType||'fire')==='magic'?'selected':''}>Магический</option>
            <option value="fire" ${(state.mods.runeType||'fire')==='fire'?'selected':''}>Огонь</option>
            <option value="radiant" ${(state.mods.runeType||'fire')==='radiant'?'selected':''}>Излучение</option>
          </select>
        </div>` : '')
      + (rel.humanResolve ? (() => {
          const sel = state.mods.resolveAbilityId || '';
          const opts = availableAbilities(c)
            .map((a) => `<option value="${a.id}" ${sel === a.id ? 'selected' : ''}>${a.name}</option>`)
            .join('');
          return `<div class="int-row" style="margin-top:10px">
            <div class="cap"><b>Решительность: 2-е действие</b><span>урон второго действия делится пополам</span></div>
            <select data-resolve style="width:auto">
              <option value="" ${sel === '' ? 'selected' : ''}>— нет —</option>
              ${opts}
            </select>
          </div>`;
        })() : '')
      + (rel.genius ? `<div class="int-row" style="margin-top:10px">
          <div class="cap"><b>Гениальность +${state.mods.genius}</b><span>изобретатель добавляет свой Интеллект к вашей атаке</span></div>
          <div class="stepper">
            <button data-genius="-1" aria-label="меньше">−</button>
            <input type="number" value="${state.mods.genius}" readonly aria-label="Гениальность">
            <button data-genius="1" aria-label="больше">+</button>
          </div>
        </div>` : '')
      + (rel.concentration ? `<div class="int-row" style="margin-top:10px">
          <div class="cap"><b>Концентрация ×${state.mods.concentration}</b><span>+2d6 к урону за каждый заряд</span></div>
          <div class="stepper">
            <button data-conc="-1" aria-label="меньше">−</button>
            <input type="number" value="${state.mods.concentration}" readonly aria-label="Концентрация">
            <button data-conc="1" aria-label="больше">+</button>
          </div>
        </div>` : '')
      + (rel.smiteDice ? (() => {
          const maxSmite = smiteCap(c);
          return `<div class="int-row" style="margin-top:10px">
            <div class="cap"><b>Кара паладина ×${state.mods.smiteDice}</b><span>+1d10 к урону за кость (макс ${maxSmite})</span></div>
            <div class="stepper">
              <button data-smite="-1" aria-label="меньше">−</button>
              <input type="number" value="${state.mods.smiteDice}" readonly aria-label="Кара паладина">
              <button data-smite="1" aria-label="больше">+</button>
            </div>
          </div>`;
        })() : '');
    qsa('[data-mod]').forEach((el) => el.onchange = () => {
      state.mods[el.dataset.mod] = el.checked;
      save(); run();
    });
    qsa('[data-runetype]').forEach((el) => el.onchange = () => {
      state.mods.runeType = el.value;
      save(); run();
    });
    qsa('[data-resolve]').forEach((el) => el.onchange = () => {
      state.mods.resolveAbilityId = el.value || null;
      save(); run();
    });
    qsa('[data-conc]').forEach((b) => b.onclick = () => {
      state.mods.concentration = Math.max(0, state.mods.concentration + Number(b.dataset.conc));
      renderMods(); save(); run();
    });
    qsa('[data-genius]').forEach((b) => b.onclick = () => {
      state.mods.genius = Math.max(0, Math.min(5, (state.mods.genius || 0) + Number(b.dataset.genius)));
      renderMods(); save(); run();
    });
    qsa('[data-smite]').forEach((b) => b.onclick = () => {
      const maxSmite = smiteCap(c);
      state.mods.smiteDice = Math.max(0, Math.min(maxSmite, state.mods.smiteDice + Number(b.dataset.smite)));
      renderMods(); save(); run();
    });
  }

  // --- цели ---

  function renderTargets() {
    const raceOpts = (sel) =>
      `<option value="">— без расы (уникальный)</option>` +
      Object.entries(RACES).map(([k, v]) =>
        `<option value="${k}" ${sel === k ? 'selected' : ''}>${v.name}</option>`).join('');
    const classOpts = (sel) => Object.entries(CLASSES).map(([k, v]) =>
      `<option value="${k}" ${sel === k ? 'selected' : ''}>${v.name}</option>`).join('');

    document.getElementById('targets').innerHTML = state.targets.map((t, i) => {
      const p = t.preset || {};
      const raceRule = t.race && RACES[t.race] && RACES[t.race].onIncoming
        ? ruleLabel(RACES[t.race].onIncoming) : '';
      return `
      <div class="foe">
        <div class="foe-head"><span class="rune">◆</span><span class="n">Противник ${i + 1}</span>
          ${state.targets.length > 1 ? `<button class="foe-del" data-del="${i}" aria-label="Убрать противника">✕ Убрать</button>` : ''}</div>
        <div class="grid3">
          <label class="field"><span>Класс брони</span><input type="number" data-ac="${i}" value="${t.ac}"></label>
          <label class="field"><span>Здоровье</span><input type="number" data-hp="${i}" value="${t.hp}"></label>
        </div>
        <div class="stats">
          ${[['str','Сила'],['dex','Лов'],['con','Стой'],['wis','Муд'],['int','Инт'],['cha','Хар']].map(([k,lbl]) =>
            `<label class="stat"><span>${lbl}</span><input type="number" data-save="${i}-${k}" value="${(t.saves && t.saves[k] != null) ? t.saves[k] : 0}"></label>`
          ).join('')}
        </div>
        <div class="sigils">
          <label class="sigil" title="скованный, окружённый, лежачий в ближнем бою, дуэль">
            <input type="checkbox" data-tadv="${i}" ${t.adv ? 'checked' : ''}>
            <span class="mark"></span>Атаки по нему с преимуществом</label>
          <label class="sigil" title="дымовая шашка, лежачий в дальнем бою, атака по другой цели в дуэли">
            <input type="checkbox" data-tdis="${i}" ${t.dis ? 'checked' : ''}>
            <span class="mark"></span>Атаки по нему с помехой</label>
        </div>
        ${raceRule ? `<div class="rule">◆ ${raceRule}</div>` : ''}
        <div class="preset">
          <div class="preset-lab">Прикинуть по облику — подставится сразу</div>
          <div class="grid3">
            <label class="field"><span>раса</span><select data-prace="${i}">${raceOpts(t.race || '')}</select></label>
            <label class="field"><span>класс</span><select data-pclass="${i}">${classOpts(p.klass || 'warrior')}</select></label>
            <label class="field"><span>игра №</span><input type="number" data-plevel="${i}" value="${p.level ?? 1}"></label>
          </div>
        </div>
      </div>`;
    }).join('');

    qsa('[data-del]').forEach((b) => b.onclick = () => {
      state.targets.splice(Number(b.dataset.del), 1);
      ensureParams(); save(); renderParams(); renderTargets(); run();
    });
    qsa('[data-ac]').forEach((el) => el.onchange = () => {
      state.targets[Number(el.dataset.ac)].ac = Number(el.value);
      ensureParams(); save(); run();
    });
    qsa('[data-tadv]').forEach((el) => el.onchange = () => {
      state.targets[Number(el.dataset.tadv)].adv = el.checked;
      save(); run();
    });
    qsa('[data-tdis]').forEach((el) => el.onchange = () => {
      state.targets[Number(el.dataset.tdis)].dis = el.checked;
      save(); run();
    });
    qsa('[data-hp]').forEach((el) => el.onchange = () => {
      state.targets[Number(el.dataset.hp)].hp = Number(el.value);
      save(); run();
    });
    qsa('[data-save]').forEach((el) => el.onchange = () => {
      const [idx, key] = el.dataset.save.split('-');
      const t = state.targets[Number(idx)];
      if (!t.saves) t.saves = { str: 0, dex: 0, con: 0, wis: 0, int: 0, cha: 0 };
      t.saves[key] = Number(el.value);
      save(); run();
    });

    const applyPreset = (i) => {
      const race = document.querySelector(`[data-prace="${i}"]`).value;
      const klass = document.querySelector(`[data-pclass="${i}"]`).value;
      const level = Number(document.querySelector(`[data-plevel="${i}"]`).value);
      const t = state.targets[i];
      if (race) {
        const pr = presetTarget(race, klass, level);
        t.ac = pr.ac; t.hp = pr.hp; t.saves = pr.saves; t.race = pr.race;
      } else {
        t.race = null;
      }
      t.preset = { race: race || null, klass, level };
      ensureParams(); save(); renderParams(); renderTargets(); run();
    };
    qsa('[data-prace]').forEach((el) => el.onchange = () => applyPreset(Number(el.dataset.prace)));
    qsa('[data-pclass]').forEach((el) => el.onchange = () => applyPreset(Number(el.dataset.pclass)));
    qsa('[data-plevel]').forEach((el) => el.onchange = () => applyPreset(Number(el.dataset.plevel)));
  }

  // Краткое описание расового правила на входящий урон.
  function ruleLabel(onIncoming) {
    const parts = [];
    if (onIncoming.magic) {
      const m = onIncoming.magic;
      if (m.mult != null) parts.push(`×${m.mult} к маг`);
      else if (m.add != null) parts.push(`${fmt(m.add)} к маг`);
    }
    if (onIncoming.physical) {
      const p = onIncoming.physical;
      if (p.mult != null) parts.push(`×${p.mult} к физ`);
      else if (p.add != null) parts.push(`${fmt(p.add)} к физ`);
    }
    return parts.join(', ');
  }

  // --- baseCtx и run ---

  function baseCtx() {
    const c = state.character;
    const a = currentAbility();
    const rel = a ? modifierRelevance(a, c) : {};
    const stats = effectiveStats();
    return {
      classKey: c.classKey,
      stats,
      weapon: weaponForCharacter(c),
      critRange: critRangeForCharacter(c),
      fumbleRange: fumbleRangeForCharacter(c),
      targets: state.targets.map((t) => ({ ac: t.ac, hp: t.hp, saves: t.saves || { str: 0, dex: 0, con: 0, wis: 0, int: 0, cha: 0 }, race: t.race || null, adv: !!t.adv, dis: !!t.dis })),
      mods: {
        orcReroll: !!(RACES[c.raceKey] && RACES[c.raceKey].orcReroll),
        adv: !!(rel.adv && state.mods.adv),
        dis: !!(rel.dis && state.mods.dis),
        hex: !!(rel.hex && state.mods.hex),
        chaos: !!(rel.chaos && state.mods.chaos),
        rage: !!(rel.rage && state.mods.rage),
        concentration: rel.concentration ? (state.mods.concentration || 0) : 0,
        barbRage: !!(rel.barbRage && state.mods.barbRage),
        gwm: !!(rel.gwm && state.mods.gwm),
        guaranteedHit: !!(rel.guaranteedHit && state.mods.guaranteedHit),
        luckyCrit: !!(rel.luckyCrit && state.mods.luckyCrit),
        bonusAttack: !!(rel.bonusAttack && state.mods.bonusAttack),
        sneak: !!(rel.sneak && state.mods.sneak),
        sneakDouble: !!(rel.sneakDouble && state.mods.sneakDouble),
        ricochet: !!(rel.ricochet && state.mods.ricochet),
        smiteDice: rel.smiteDice ? (state.mods.smiteDice || 0) : 0,
        acIgnore: (rel.acIgnore && state.mods.giantHunter) ? stats.wis : 0,
        typeOverride: (rel.typeOverride && state.mods.contactless) ? 'magic' : undefined,
        genius: rel.genius ? (state.mods.genius || 0) : 0,
        talent: !!(rel.talent && state.mods.talent),
        rabbitFoot: !!(rel.rabbitFoot && state.mods.rabbitFoot),
        runeOfWarrior: (c.artifacts || []).includes('runeOfWarrior'),
        runeOfElements: (c.artifacts || []).includes('runeOfElements'),
        runeType: state.mods.runeType || 'fire',
        sacredWeapon: (rel.sacredWeapon && state.mods.sacredWeapon) ? stats.con : 0,
        tincture: !!(rel.tincture && state.mods.tincture),
        inspiration: !!(rel.inspiration && state.mods.inspiration),
        beastRage: !!rel.beastRage,
      },
      params: state.params,
    };
  }

  function run() {
    ensureParams();
    const opts = { trials: state.trials, seed: state.seed };
    const a = currentAbility();
    const rel = a ? modifierRelevance(a, state.character) : {};
    const resolveId = rel.humanResolve ? state.mods.resolveAbilityId : null;
    const resolveAbility = resolveId ? availableAbilities(state.character).find((x) => x.id === resolveId) : null;
    if (resolveAbility) {
      // Второе действие идёт со своими параметрами: цели у него могут быть иные.
      opts.resolveAbilityId = resolveAbility.id;
      opts.resolveParams = defaultParams(resolveAbility, state.targets);
    }
    const ids = availableAbilities(state.character).map((a) => a.id);
    worker.postMessage({ type: 'run', abilityId: state.abilityId, baseCtx: baseCtx(), opts });
    worker.postMessage({ type: 'compare', baseCtx: baseCtx(), opts, abilityIds: ids });
  }

  // --- отображение результатов ---

  function renderResult(m) {
    const ability = currentAbility() || ABILITIES.find((a) => a.id === state.abilityId);
    const meta = SPELL_META[state.abilityId] || { formula: '' };
    const s = statsFromFreq(m.groupFreq, m.trials);
    const kill = Math.round((m.killCount[0] / m.trials) * 100);
    const chips = m.perTargetMean.map((v, i) =>
      `<span class="chip">Ц${i + 1} <b>${v.toFixed(1)}</b> · убить <b>${Math.round((m.killCount[i] / m.trials) * 100)}%</b></span>`).join('');

    const pinBtn = `<button class="pin${state.pinned ? ' on' : ''}" id="pin" title="${state.pinned ? 'Открепить' : 'Закрепить'}">📌</button>`;
    document.getElementById('result').className = `hero${state.pinned ? ' pinned' : ''}`;
    document.getElementById('result').innerHTML = `
      <div class="hero-top"><span class="eyebrow">${ability ? ability.name : ''}</span><span class="formula">${meta.formula}</span>${pinBtn}</div>
      <div class="dmg-row">
        <div class="dmg">${m.groupMean.toFixed(1)}</div>
        <div class="dmg-side">
          <div class="dmg-cap">Среднее по группе</div>
          <div class="minmax">медиана <b>${s.med}</b></div>
          <div class="minmax">убить Ц1: <b>${kill}%</b></div>
        </div>
      </div>
      <div class="hist-wrap"><canvas height="120" style="height:120px"></canvas><div class="tip" hidden></div></div>
      <div class="hist-axis"><span>мин ${s.min}</span><span>макс ${s.max}</span></div>
      <div class="hist-legend">
        <span class="lg-med" title="Медиана: в половине боёв урон ниже, в половине — выше">медиана <b>${s.med}</b></span>
        <span class="lg-mean" title="Среднее арифметическое урона за ход">среднее <b>${m.groupMean.toFixed(1)}</b></span>
        <span class="lg-band" title="Серединная половина исходов — перцентили 25–75%">обычно <b>${s.p25}–${s.p75}</b></span>
      </div>
      <div class="hist-note">«Обычно» — серединные 50% исходов (перцентили 25–75): четверть боёв даёт меньше ${s.p25}, четверть — больше ${s.p75}.</div>
      <div class="chips">${chips}</div>`;

    const wrap = document.querySelector('#result .hist-wrap');
    wireChart(wrap.querySelector('canvas'), wrap.querySelector('.tip'), m.groupFreq, m.trials);

    document.getElementById('pin').onclick = () => {
      state.pinned = !state.pinned;
      save();
      renderResult(m);
    };

    // отдельные графики по каждой цели (если целей больше одной)
    const charts = document.getElementById('charts');
    if (m.targetFreq.length < 2) { charts.innerHTML = ''; return; }
    charts.innerHTML = '<div class="label">Урон по каждой цели</div>' + m.targetFreq.map((f, i) => {
      const st = statsFromFreq(f, m.trials);
      const killP = Math.round((m.killCount[i] / m.trials) * 100);
      return `<div class="tchart">
        <div class="tchart-head"><span class="tdot"></span>Цель ${i + 1}
          <span class="tmeta">ср. ${m.perTargetMean[i].toFixed(1)} · убить ${killP}%</span></div>
        <div class="hist-wrap"><canvas height="84" style="height:84px"></canvas><div class="tip" hidden></div></div>
        <div class="hist-axis"><span>мин ${st.min}</span><span>макс ${st.max}</span></div>
      </div>`;
    }).join('');
    charts.querySelectorAll('.tchart').forEach((el, i) => {
      const w = el.querySelector('.hist-wrap');
      wireChart(w.querySelector('canvas'), w.querySelector('.tip'), m.targetFreq[i], m.trials);
    });
  }

  // Рисует гистограмму один раз (подложка 25–75%, медиана, среднее) и возвращает
  // снимок (ImageData) + геометрию — чтобы при наведении не перерисовывать всё заново.
  function drawBase(c, freq, trials) {
    const dpr = window.devicePixelRatio || 1;
    const H = c.getAttribute('height') ? Number(c.getAttribute('height')) : 120;
    const W = c.clientWidth || 560;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = W * dpr; c.height = H * dpr;
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const s = statsFromFreq(freq, trials);
    if (!s.entries.length) return null;
    const range = s.max - s.min;
    // Шаг данных = НОД всех значений урона (для зелья хаоса все значения чётные,
    // шаг = 2). Один столбец на реальную точку решётки, иначе между столбцами
    // оставались бы пустые ячейки (узкие столбцы с щелями).
    let step = 0;
    for (const [v] of s.entries) step = gcd(step, v - s.min);
    if (!step) step = 1;
    let nBins = Math.floor(range / step) + 1;
    let mode = 'lattice';
    if (nBins > 60) { nBins = 60; mode = 'range'; } // очень широкий разброс — обычный биннинг
    if (range === 0) nBins = 1;
    const binOf = (v) => (range === 0 ? 0 : mode === 'lattice'
      ? Math.round((v - s.min) / step)
      : Math.min(nBins - 1, Math.floor(((v - s.min) / range) * nBins)));
    const bins = new Array(nBins).fill(0);
    for (const [v, cnt] of s.entries) {
      let j = binOf(v); if (j < 0) j = 0; if (j >= nBins) j = nBins - 1;
      bins[j] += cnt;
    }
    const maxC = Math.max(...bins);
    const binPx = W / nBins;
    const xOf = (v) => (range === 0 ? W / 2 : mode === 'lattice'
      ? ((v - s.min) / step + 0.5) * binPx
      : ((v - s.min) / range) * W);

    g.fillStyle = 'rgba(236,228,210,.07)';
    g.fillRect(xOf(s.p25), 0, Math.max(1, xOf(s.p75) - xOf(s.p25)), H);

    const grad = g.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0, currentGlow + '22');
    grad.addColorStop(1, currentGlow);
    g.fillStyle = grad; g.shadowColor = currentGlow; g.shadowBlur = 7;
    const barW = Math.max(1, binPx * 0.92);
    for (let j = 0; j < nBins; j++) {
      if (!bins[j]) continue;
      const h = (bins[j] / maxC) * (H - 6);
      g.fillRect(j * binPx + (binPx - barW) / 2, H - h, barW, h);
    }
    g.shadowBlur = 0;

    g.strokeStyle = currentGlow; g.lineWidth = 2;
    g.beginPath(); g.moveTo(xOf(s.med), 0); g.lineTo(xOf(s.med), H); g.stroke();
    g.strokeStyle = '#C9A24B'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(xOf(s.mean), 0); g.lineTo(xOf(s.mean), H); g.stroke();
    g.setLineDash([]);

    return { g, img: g.getImageData(0, 0, c.width, c.height), s, H, xOf };
  }

  // Наведение мышью (десктоп) и проведение пальцем (телефон) показывают число.
  // База перерисовывается один раз; при движении только restore + одна линия.
  function wireChart(c, tip, freq, trials) {
    const base = drawBase(c, freq, trials);
    if (!base) return;
    const { g, img, s, H, xOf } = base;
    const minV = s.min, maxV = s.max;
    const show = (ev) => {
      const rect = c.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const target = minV + frac * (maxV - minV);
      let best = s.entries[0];
      for (const e of s.entries) if (Math.abs(e[0] - target) < Math.abs(best[0] - target)) best = e;
      let ge = 0; for (const e of s.entries) if (e[0] >= best[0]) ge += e[1];
      g.putImageData(img, 0, 0);
      g.strokeStyle = '#ECE4D2'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(xOf(best[0]), 0); g.lineTo(xOf(best[0]), H); g.stroke();
      tip.hidden = false;
      tip.innerHTML = `<b>${best[0]}</b> урона · ${(best[1] / trials * 100).toFixed(1)}% · ≥ ${Math.round(ge / trials * 100)}%`;
      tip.style.left = Math.min(rect.width - 4, Math.max(4, ev.clientX - rect.left)) + 'px';
    };
    const hide = () => { tip.hidden = true; g.putImageData(img, 0, 0); };
    c.onpointerdown = show;
    c.onpointermove = (ev) => { if (ev.pointerType === 'mouse' || ev.buttons || ev.pressure) show(ev); };
    c.onpointerup = hide;
    c.onpointerleave = hide;
  }

  function renderComparison(rows) {
    const max = Math.max(...rows.map((r) => r.groupMean), 1);
    document.getElementById('compare').innerHTML = rows.map((r, i) => {
      const meta = SPELL_META[r.id] || { element: 'arcane' };
      const w = Math.max(2, (r.groupMean / max) * 100);
      return `<div class="rank" style="--el:${GLOW[meta.element] || GLOW.arcane}">
        <span class="no">${i + 1}</span><span class="dot"></span>
        <span class="rk-body"><span class="rk-top"><span class="nm">${r.name}</span><span class="val">${r.groupMean.toFixed(1)}</span></span>
          <span class="bar" style="width:${w}%"></span></span>
      </div>`;
    }).join('');
  }
}
