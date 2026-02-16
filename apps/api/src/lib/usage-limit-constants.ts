export type UserLimitSummary = {
  llmCalls: number | null;
  wikiCalls: number | null;
  museumCreates: number | null;
  artifactCreates: number | null;
  plaqueScans: number | null;
};

export type GlobalLimitSummary = {
  llmCalls: number | null;
  wikiCalls: number | null;
  dbOps: number | null;
  museumCreates: number | null;
  artifactCreates: number | null;
};

// Prototype caps (currently same for admin and non-admin users)
export const USER_DAILY_LIMITS: UserLimitSummary = {
  llmCalls: 100,
  wikiCalls: 100,
  museumCreates: 10,
  artifactCreates: 20,
  plaqueScans: 30,
};

export const GLOBAL_DAILY_LIMITS: GlobalLimitSummary = {
  llmCalls: 150,
  wikiCalls: 150,
  dbOps: null,
  museumCreates: 15,
  artifactCreates: 30,
};
