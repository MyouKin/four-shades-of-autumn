let context: AudioContext | null = null;
export function playSound(
  type: "click" | "move" | "attack" | "turn" | "research",
) {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const osc = context.createOscillator();
    const volume = context.createGain();
    const now = context.currentTime;
    const notes = {
      click: 420,
      move: 300,
      attack: 95,
      turn: 520,
      research: 680,
    };
    osc.type = type === "attack" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(notes[type], now);
    osc.frequency.exponentialRampToValueAtTime(
      notes[type] * (type === "attack" ? 0.35 : 1.45),
      now + 0.14,
    );
    volume.gain.setValueAtTime(0.04, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(volume);
    volume.connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    /* Sound is optional on browsers with audio restrictions. */
  }
}
