// Top-level switch: the setup screen until a game exists, then the shell (design 07 §8).
import { useGameStore } from "./store.js";
import { Setup } from "./screens/Setup.js";
import { Shell } from "./screens/Shell.js";

export function App() {
  const state = useGameStore();
  return state.world ? <Shell /> : <Setup />;
}
