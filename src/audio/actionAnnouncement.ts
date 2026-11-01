import { legal, type State } from "../game/engine";
import type { Action } from "../game/betting";
import type { SpokenAction } from "./tableAudio";
// Called after the engine accepts the action; include short all-in calls and
// raises selected with any sizing control, not just the All-in shortcut.
export function actionAnnouncement(
  state: State,
  action: Action,
): SpokenAction | null {
  const p = state.players[state.actor];
  const paid =
    action.type === "call"
      ? legal(state, state.actor).call
      : action.type === "raise"
        ? action.to - p.bet
        : 0;
  if (paid > 0 && paid === p.stack) return "allin";
  if (action.type === "call") return "call";
  if (action.type === "raise") return state.high === 0 ? "bet" : "raise";
  return null;
}
