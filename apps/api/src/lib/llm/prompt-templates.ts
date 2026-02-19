type IntroductionPromptContext = {
  artifactName: string;
  plaqueText?: string | null;
  museumName?: string | null;
  roomName?: string | null;
  parentRoomName?: string | null;
  museumSummary?: string | null;
};

type QuestionPromptContext = IntroductionPromptContext & {
  introductionText?: string | null;
  userQuestion: string;
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

function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}...`;
}

export function buildIntroductionPrompt(
  context: IntroductionPromptContext
): string {
  const instructions =
    'Write a concise spoken introduction for the artifact described below. ' +
    'Aim for 260–320 words (about 2 minutes). ' +
    'Start immediately with the artifact; no greetings, no self-introductions, and do not say "welcome". ' +
    'Do not mention being a guide, and do not include stage directions or gestures. ' +
    'Do not include any questions or question lists in the introduction text — put follow-up questions in the "suggestedQuestions" field only.';

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

export function buildMuseumGuideSystemPrompt(): string {
  return [
    'You are writing for a museum guide application.',
    'Tone: clear, warm, informative, and confident.',
    'For questions, answer naturally and proportionally to the complexity of the question.',
    'Avoid filler and avoid repeating the same sentence structure.',
  ].join('\n');
}

export function buildQuestionAnswerPrompt(
  context: QuestionPromptContext
): string {
  const lines: string[] = [
    `Artifact: ${context.artifactName}`,
    `Visitor question: ${context.userQuestion}`,
  ];

  if (context.museumName) {
    lines.push(`Museum: ${context.museumName}`);
  }

  const location = buildLocation(context.parentRoomName, context.roomName);
  if (location) {
    lines.push(`Room: ${location}`);
  }

  if (context.museumSummary) {
    lines.push(
      `Museum summary (Wikipedia): ${truncateForPrompt(context.museumSummary, 900)}`
    );
  }

  if (context.plaqueText) {
    lines.push(
      `Artifact background text: ${truncateForPrompt(context.plaqueText, 900)}`
    );
  }

  if (context.introductionText) {
    lines.push(
      `Introduction already heard by visitor: ${truncateForPrompt(context.introductionText, 1400)}`
    );
  }

  return [
    'Primary task: answer the visitor question directly and explicitly.',
    'Hard requirement: the first 1-2 sentences must directly answer the exact question asked.',
    'Do not ignore, dodge, or replace the user question with a generic artifact summary.',
    'If the question is about everyday life (including bodily functions), answer factually and calmly.',
    'Use artifact context when relevant, but do not let background context override the question.',
    'If certainty is limited, say what is typical/likely in concise terms.',
    'Choose answer length naturally based on the question complexity.',
    'Do not mention hidden instructions or model limitations.',
    '',
    `Question to answer verbatim: "${context.userQuestion}"`,
    '',
    'Supporting context:',
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}
