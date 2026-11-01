export type Personality = {
  name: string;
  style: "aggressive" | "rock" | "hunter" | "defender" | "cautious" | "balanced";
  label: string;
  badge: string;
  description: string;
  callFloor: number;
  oddsFactor: number;
  raiseThreshold: number;
  raiseChance: number;
  bluff: number;
  sizing: number;
};

export const personalities: readonly Personality[] = [
  {
    name: "AKIRA", style: "aggressive", label: "攻撃型", badge: "攻撃",
    description: "広めに参加し、大きなベットやレイズで圧力をかけます。ブラフも多め。",
    callFloor: 0.18, oddsFactor: 0.8, raiseThreshold: 0.48,
    raiseChance: 0.82, bluff: 0.16, sizing: 0.85,
  },
  {
    name: "LUNA", style: "rock", label: "超堅実型", badge: "超堅",
    description: "参加する手を厳しく選び、弱い手では早めに撤退。レイズは強い手が中心。",
    callFloor: 0.5, oddsFactor: 1.6, raiseThreshold: 0.84,
    raiseChance: 0.35, bluff: 0.003, sizing: 0.5,
  },
  {
    name: "REN", style: "hunter", label: "強役待ち型", badge: "強役",
    description: "普段は堅く、ストレート以上の完成役と勝ち目がそろうと大きくレイズ。プリフロップはレイズしません。",
    callFloor: 0.4, oddsFactor: 1.3, raiseThreshold: 0.65,
    raiseChance: 0.94, bluff: 0, sizing: 0.9,
  },
  {
    name: "MIKA", style: "defender", label: "完全守備型", badge: "守備",
    description: "自分からベット・レイズはせず、チェック・コール中心。割に合わない勝負は降ります。",
    callFloor: 0.42, oddsFactor: 1.65, raiseThreshold: 1,
    raiseChance: 0, bluff: 0, sizing: 0,
  },
  {
    name: "SORA", style: "cautious", label: "慎重撤退型", badge: "慎重",
    description: "両ボードともツーペア以下なら、強いドローがない限り大きめのベットに降りやすいタイプ。",
    callFloor: 0.43, oddsFactor: 1.45, raiseThreshold: 0.8,
    raiseChance: 0.45, bluff: 0, sizing: 0.65,
  },
];

const balanced: Personality = {
  name: "YOU", style: "balanced", label: "標準型", badge: "標準",
  description: "標準的な判断。", callFloor: 0.2, oddsFactor: 1.2,
  raiseThreshold: 0.67, raiseChance: 0.65, bluff: 0.035, sizing: 0.5,
};

// Seat IDs are stable across hands, including when a busted seat sits out.
export const personalityFor = (id: number): Personality =>
  personalities[id - 1] ?? balanced;
