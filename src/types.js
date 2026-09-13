// Тип урона → категория. Категория ('physical'/'magic') — то, на что смотрят
// зелья (ярость ×2 физ, хаос ×2 маг) и расовые правила цели.
export const TYPES = {
  physical:  { cat: 'physical' },
  magic:     { cat: 'magic' },
  fire:      { cat: 'magic' },
  lightning: { cat: 'magic' },
  necrotic:  { cat: 'magic' },
  psychic:   { cat: 'magic' },
  radiant:   { cat: 'magic' },
};

export function categoryOf(type) {
  const t = TYPES[type];
  if (!t) throw new Error(`Неизвестный тип урона: ${type}`);
  return t.cat;
}
