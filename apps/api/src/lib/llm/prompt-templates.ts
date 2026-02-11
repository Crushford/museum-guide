type IntroductionPromptContext = {
  artifactName: string;
  plaqueText?: string | null;
  museumName?: string | null;
  roomName?: string | null;
  parentRoomName?: string | null;
  museumSummary?: string | null;
};

function buildLocation(
  parentRoomName?: string | null,
  roomName?: string | null
): string | null {
  if (parentRoomName && roomName) {
    return `${parentRoomName} - ${roomName}`;
  }
  if (roomName) return roomName;
  if (parentRoomName) return parentRoomName;
  return null;
}

export function buildIntroductionPrompt(
  context: IntroductionPromptContext
): string {
  const instructions =
    'Write a concise spoken introduction for the artifact described below. ' +
    'Aim for 260–320 words (about 2 minutes). ' +
    'Start immediately with the artifact; no greetings, no self-introductions, and do not say "welcome". ' +
    'Do not mention being a guide, and do not include stage directions or gestures.';

  const lines: string[] = [`Artifact: ${context.artifactName}`];

  if (context.museumName) {
    lines.push(`Museum: ${context.museumName}`);
  }

  const location = buildLocation(context.parentRoomName, context.roomName);
  if (location) {
    lines.push(`Room: ${location}`);
  }

  if (context.museumSummary) {
    lines.push(`Museum summary (Wikipedia): ${context.museumSummary}`);
  }

  if (context.plaqueText) {
    lines.push(`Plaque text: ${context.plaqueText}`);
  }

  return `${instructions}\n\nContext:\n${lines
    .map((line) => `- ${line}`)
    .join('\n')}`;
}
