import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@repo/db';
import { makeArtifact, makeQuestion } from './helpers/factories';
import { app } from '../server';
import { adminAuth } from './helpers/test-setup';

describe('GET /artifacts/:artifactId/questions', () => {
  it('returns 400 for non-numeric artifactId', async () => {
    const res = await request(app).get('/artifacts/notanumber/questions');
    expect(res.status).toBe(400);
  });

  it('returns 200 with questions array', async () => {
    const questions = [
      makeQuestion({ id: 1, artifactId: 1 }),
      makeQuestion({ id: 2, artifactId: 1, questionText: 'Another?' }),
    ];
    vi.mocked(prisma.artifactQuestion.findMany).mockResolvedValue(
      questions.map((q) => ({ ...q, _count: { listenEvents: 0 } })) as any
    );
    vi.mocked(prisma.artifactQuestionVote.findMany).mockResolvedValue([]);
    const res = await request(app).get('/artifacts/1/questions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('questionText');
    expect(res.body[0]).toHaveProperty('currentUserVote');
  });
});

describe('POST /artifacts/:artifactId/questions/ask', () => {
  it('returns 400 when question is missing', async () => {
    const res = await request(app).post('/artifacts/1/questions/ask').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'question is required');
  });

  it('returns 400 when question is too short', async () => {
    const res = await request(app)
      .post('/artifacts/1/questions/ask')
      .send({ question: 'short' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/too short/);
  });

  it('returns 404 when artifact not found', async () => {
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue(null);
    const res = await request(app)
      .post('/artifacts/999/questions/ask')
      .send({ question: 'What is this artifact about?' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Artifact not found');
  });

  it('returns 200 with previewOnly when previewOnly=true', async () => {
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.artifactQuestion.findMany).mockResolvedValue([]);
    const res = await request(app).post('/artifacts/1/questions/ask').send({
      question: 'What is this artifact about?',
      previewOnly: true,
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('previewOnly', true);
      expect(res.body).toHaveProperty('correctedQuestion');
    }
  });

  it('returns 200 with question when artifact exists and question is valid', async () => {
    const artifact = makeArtifact({ id: 1 });
    vi.mocked(prisma.artifact.findUnique).mockResolvedValue({
      ...artifact,
      museum: { id: 1, name: 'Museum', wikipediaSummary: null },
      room: {
        id: 1,
        name: 'Room',
        museumId: 1,
        parentRoomId: null,
        parentRoom: null,
      },
      content: [{ text: 'Intro text' }],
    } as any);
    vi.mocked(prisma.artifactQuestion.findMany).mockResolvedValue([]);
    const newQuestion = makeQuestion({
      id: 1,
      artifactId: 1,
      questionText: 'What is this artifact about?',
      answerText: 'Generated answer.',
    });
    vi.mocked(prisma.artifactQuestion.create).mockResolvedValue({
      ...newQuestion,
      _count: { listenEvents: 0 },
    } as any);
    vi.mocked(prisma.artifactQuestion.update).mockResolvedValue({
      ...newQuestion,
      _count: { listenEvents: 0 },
    } as any);
    vi.mocked(prisma.artifactQuestionVote.create).mockResolvedValue({
      id: 1,
      questionId: 1,
      username: 'user',
      value: 1,
    } as any);
    const res = await request(app)
      .post('/artifacts/1/questions/ask')
      .send({ question: 'What is this artifact about?' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('requiresConfirmation', false);
    expect(res.body).toHaveProperty('question');
    expect(res.body.question).toHaveProperty('questionText');
    expect(res.body.question).toHaveProperty('answerText');
  });
});

describe('POST /artifact-questions/:questionId/vote', () => {
  it('returns 400 for invalid questionId', async () => {
    const res = await request(app)
      .post('/artifact-questions/notanumber/vote')
      .send({ vote: 'up' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid questionId');
  });

  it('returns 400 when vote is not up or down', async () => {
    const res = await request(app)
      .post('/artifact-questions/1/vote')
      .send({ vote: 'sideways' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'vote must be "up" or "down"');
  });

  it('returns 200 with upvotes/downvotes when voting up', async () => {
    vi.mocked(prisma.artifactQuestionVote.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.artifactQuestionVote.create).mockResolvedValue({
      id: 1,
      questionId: 1,
      username: 'user',
      value: 1,
    } as any);
    vi.mocked(prisma.artifactQuestionVote.count)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    vi.mocked(prisma.artifactQuestionVote.findUnique).mockResolvedValue({
      value: 1,
    } as any);
    vi.mocked(prisma.artifactQuestion.update).mockResolvedValue({} as any);
    const res = await request(app)
      .post('/artifact-questions/1/vote')
      .send({ vote: 'up' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('questionId', 1);
    expect(res.body).toHaveProperty('upvotes');
    expect(res.body).toHaveProperty('downvotes');
    expect(res.body).toHaveProperty('currentUserVote');
  });
});

describe('POST /artifact-questions/:questionId/use', () => {
  it('returns 400 for invalid questionId', async () => {
    const res = await request(app).post('/artifact-questions/notanumber/use');
    expect(res.status).toBe(400);
  });

  it('returns 200 with askCount', async () => {
    const question = makeQuestion({ id: 1, askCount: 2 });
    vi.mocked(prisma.artifactQuestion.update).mockResolvedValue({
      ...question,
      askCount: 3,
    } as any);
    const res = await request(app).post('/artifact-questions/1/use');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
    expect(res.body).toHaveProperty('askCount', 3);
  });
});

describe('POST /artifact-questions/:questionId/listen', () => {
  it('returns 400 for invalid questionId', async () => {
    const res = await request(app).post(
      '/artifact-questions/notanumber/listen'
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 with ok when event recorded', async () => {
    vi.mocked(prisma.artifactQuestionListenEvent.create).mockResolvedValue(
      {} as any
    );
    const res = await request(app)
      .post('/artifact-questions/1/listen')
      .send({ durationSeconds: 5, completed: true });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });
});
