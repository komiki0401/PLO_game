export type Personality = {
  name: string;
  style: "aggressive" | "rock" | "pressure" | "caller" | "tricky" | "balanced";
  label: string;
  badge: string;
  description: string;
  callFloor: number;
  oddsFactor: number;
  raiseThreshold: number;
  raiseChance: number;
  bluff: number;
  sizing: number;
  speculate: number;
};

export const personalities: readonly Personality[] = [
  {
    name: "AKIRA", style: "aggressive", label: "攻撃型", badge: "攻撃",
    description: "広めに参加し、大きめのベットやレイズで圧力。弱い手のブラフも混ぜます。",
    callFloor: 0.18, oddsFactor: 0.78, raiseThreshold: 0.48,
    raiseChance: 0.8, bluff: 0.18, sizing: 0.8, speculate: 0.65,
  },
  {
    name: "LUNA", style: "rock", label: "堅実型", badge: "堅実",
    description: "強い手を厳選する堅実派。ただし安いコールはポットオッズに合わせて参加します。",
    callFloor: 0.44, oddsFactor: 1.2, raiseThreshold: 0.8,
    raiseChance: 0.4, bluff: 0.015, sizing: 0.5, speculate: 0.12,
  },
  {
    name: "REN", style: "pressure", label: "積極加圧型", badge: "加圧",
    description: "AKIRAに並ぶ積極派。プリフロップからレイズし、完成前の手でもベットして主導権を狙います。",
    callFloor: 0.2, oddsFactor: 0.85, raiseThreshold: 0.46,
    raiseChance: 0.85, bluff: 0.22, sizing: 0.65, speculate: 0.7,
  },
  {
    name: "MIKA", style: "caller", label: "フロップ参加型", badge: "参加",
    description: "安いレイズなら広くコールしてフロップへ。以降は役・勝率と支払額で判断し、強い手ではレイズもします。",
    callFloor: 0.18, oddsFactor: 0.85, raiseThreshold: 0.72,
    raiseChance: 0.35, bluff: 0.035, sizing: 0.45, speculate: 0.9,
  },
  {
    name: "SORA", style: "tricky", label: "ブラフ混合型", badge: "策略",
    description: "役なしでもベットやレイズを混ぜる策略派。少人数ではブラフを増やし、大きな反撃には撤退もします。",
    callFloor: 0.24, oddsFactor: 0.95, raiseThreshold: 0.6,
    raiseChance: 0.65, bluff: 0.3, sizing: 0.6, speculate: 0.6,
  },
];

const balanced: Personality = {
  name: "YOU", style: "balanced", label: "標準型", badge: "標準",
  description: "標準的な判断。", callFloor: 0.2, oddsFactor: 1.1,
  raiseThreshold: 0.67, raiseChance: 0.65, bluff: 0.06, sizing: 0.5, speculate: 0.4,
};

// Seat IDs stay stable across hands, including when a busted seat sits out.
export const personalityFor = (id: number): Personality =>
  personalities[id - 1] ?? balanced;
