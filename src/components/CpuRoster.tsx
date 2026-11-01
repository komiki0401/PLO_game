import { personalities } from "../game/personalities";

export function CpuRoster({ count }: { count: number }) {
  return (
    <details className="cpu-roster">
      <summary>CPUの個性を見る</summary>
      <ul>
        {personalities.slice(0, count - 1).map(profile => (
          <li key={profile.name}>
            <strong>{profile.name} · {profile.label}</strong>
            <span>{profile.description}</span>
          </li>
        ))}
      </ul>
      <p>両ゲーム共通。難易度は読みの精度、個性は参加・レイズ・ベット額の傾向に影響します。</p>
    </details>
  );
}
