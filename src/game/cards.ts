export type Card = number;
export const rank = (c: Card) => (c % 13) + 2;
export const suit = (c: Card) => Math.floor(c / 13);
export const cardText = (c: Card) =>
  `${"23456789TJQKA"[c % 13]}${"♠♥♣♦"[suit(c)]}`;
export function deck(rng = Math.random): Card[] {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
export function combinations<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  function visit(start: number, items: T[]) {
    if (items.length === n) {
      out.push(items);
      return;
    }
    for (let i = start; i <= a.length - n + items.length; i++)
      visit(i + 1, [...items, a[i]]);
  }
  visit(0, []);
  return out;
}
