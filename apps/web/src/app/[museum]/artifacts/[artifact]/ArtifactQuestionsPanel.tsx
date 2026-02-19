'use client';

import { useMemo, useRef, useState } from 'react';
import { ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { SectionCard } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ErrorText } from '@/components/ui/error-text';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { API_URL } from '@/lib/api';
import { usePreferredLLMProvider } from '@/hooks/usePreferredLLMProvider';
import { usePreferredTTSProvider } from '@/hooks/usePreferredTTSProvider';
import { ArtifactQuestion, AskResponse } from '@/lib/types';

interface ArtifactQuestionsPanelProps {
  artifactId: number;
  initialQuestions: ArtifactQuestion[];
  suggestedQuestions: string[];
}

export function ArtifactQuestionsPanel({
  artifactId,
  initialQuestions,
  suggestedQuestions,
}: ArtifactQuestionsPanelProps) {
  const [questions, setQuestions] =
    useState<ArtifactQuestion[]>(initialQuestions);
  const [draft, setDraft] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [similarPrompt, setSimilarPrompt] = useState<AskResponse | null>(null);
  const [pendingVoteId, setPendingVoteId] = useState<number | null>(null);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<{
    original: string;
    corrected: string;
    hasCorrections: boolean;
  } | null>(null);
  const [selectedPublishQuestion, setSelectedPublishQuestion] = useState('');
  const [publishAnonymously, setPublishAnonymously] = useState(false);
  const [modalAnsweredQuestion, setModalAnsweredQuestion] =
    useState<ArtifactQuestion | null>(null);
  const preferredProvider = usePreferredLLMProvider();
  const preferredTtsProvider = usePreferredTTSProvider();
  const sessionIdRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `session-${Date.now()}`
  );

  const sortedQuestions = useMemo(
    () =>
      [...questions].sort((a, b) => {
        const scoreA = a.upvotes - a.downvotes;
        const scoreB = b.upvotes - b.downvotes;
        if (scoreA !== scoreB) return scoreB - scoreA;
        if (a.askCount !== b.askCount) return b.askCount - a.askCount;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }),
    [questions]
  );

  async function submitQuestion(forceCreate: boolean) {
    if (!selectedPublishQuestion.trim()) return;

    setIsAsking(true);
    setError(null);
    setModalError(null);
    try {
      const res = await fetch(
        `${API_URL}/artifacts/${artifactId}/questions/ask?provider=${preferredProvider}&ttsProvider=${preferredTtsProvider}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: selectedPublishQuestion.trim(),
            approvedQuestionText: selectedPublishQuestion.trim(),
            forceCreate,
            publishAnonymously,
          }),
        }
      );
      const data = (await res.json()) as AskResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }

      if (data.requiresConfirmation && data.similarQuestion) {
        setSimilarPrompt(data);
        return;
      }

      if (data.question) {
        setQuestions((prev) => [data.question!, ...prev]);
        setModalAnsweredQuestion(data.question);
      }
      setDraft('');
      setSimilarPrompt(null);
      setPreviewQuestion(null);
    } catch (askError) {
      setModalError(
        askError instanceof Error ? askError.message : 'Failed to ask'
      );
    } finally {
      setIsAsking(false);
    }
  }

  async function previewQuestionForPublish() {
    if (!draft.trim()) return;

    setIsPublishModalOpen(true);
    setIsPreviewing(true);
    setError(null);
    setModalError(null);
    setPreviewQuestion(null);
    setModalAnsweredQuestion(null);
    setSimilarPrompt(null);
    try {
      const res = await fetch(
        `${API_URL}/artifacts/${artifactId}/questions/ask?provider=${preferredProvider}&ttsProvider=${preferredTtsProvider}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: draft.trim(),
            previewOnly: true,
          }),
        }
      );
      const data = (await res.json()) as AskResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const original = data.originalQuestion?.trim() || draft.trim();
      const corrected = data.correctedQuestion?.trim() || original;
      const hasCorrections =
        data.hasCorrections === true && corrected !== original;

      setPreviewQuestion({ original, corrected, hasCorrections });
      setSelectedPublishQuestion(hasCorrections ? corrected : original);
    } catch (previewError) {
      setModalError(
        previewError instanceof Error
          ? previewError.message
          : 'Failed to prepare question'
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  function resetModalState(open: boolean) {
    setIsPublishModalOpen(open);
    if (!open) {
      setModalError(null);
      setPreviewQuestion(null);
      setSelectedPublishQuestion('');
      setPublishAnonymously(false);
      setModalAnsweredQuestion(null);
      setSimilarPrompt(null);
      setIsPreviewing(false);
      setIsAsking(false);
    }
  }

  async function vote(questionId: number, direction: 'up' | 'down') {
    setPendingVoteId(questionId);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/artifact-questions/${questionId}/vote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vote: direction }),
        }
      );
      const payload = (await response.json()) as {
        upvotes: number;
        downvotes: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || `Failed (${response.status})`);
      }

      setQuestions((prev) =>
        prev.map((q: ArtifactQuestion) =>
          q.id === questionId
            ? { ...q, upvotes: payload.upvotes, downvotes: payload.downvotes }
            : q
        )
      );
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : 'Vote failed');
    } finally {
      setPendingVoteId(null);
    }
  }

  async function applyExistingAnswer(questionId: number) {
    try {
      const response = await fetch(
        `${API_URL}/artifact-questions/${questionId}/use`,
        {
          method: 'POST',
        }
      );
      const payload = (await response.json()) as {
        askCount?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || `Failed (${response.status})`);
      }
      setQuestions((prev) =>
        prev.map((q: ArtifactQuestion) =>
          q.id === questionId
            ? { ...q, askCount: payload.askCount ?? q.askCount }
            : q
        )
      );
      setSimilarPrompt(null);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to use question');
    }
  }

  async function trackListen(
    questionId: number,
    durationSeconds: number,
    completed: boolean
  ) {
    try {
      await fetch(`${API_URL}/artifact-questions/${questionId}/listen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationSeconds,
          completed,
          source: 'inline',
          sessionId: sessionIdRef.current,
        }),
      });
    } catch {
      // Analytics failures should not block UX.
    }
  }

  return (
    <SectionCard title="Ask About This Artifact">
      <div className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={280}
            placeholder="Ask a question (1-2 sentences, like a great Reddit title)."
            className="min-h-[96px]"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Keep it concise: max 280 characters.
            </p>
            <p className="text-xs text-muted-foreground">{draft.length}/280</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void previewQuestionForPublish()}
            disabled={isAsking || isPreviewing}
          >
            {(isAsking || isPreviewing) && <Spinner className="mr-2" />}
            Ask Question
          </Button>
          {suggestedQuestions.slice(0, 5).map((suggestion: string) => (
            <Button
              key={suggestion}
              variant="secondary"
              size="sm"
              onClick={() => setDraft(suggestion)}
              disabled={isAsking}
              className="whitespace-normal break-words text-left h-auto py-2 max-w-full"
            >
              {suggestion}
            </Button>
          ))}
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        {sortedQuestions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No community questions yet. Be the first to ask one.
          </p>
        ) : (
          <div className="space-y-4">
            {sortedQuestions.map((question: ArtifactQuestion) => (
              <div
                key={question.id}
                className="rounded-md border p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium text-primary">
                      {question.questionText}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      asked by {question.askedByUsername ?? 'anonymous'} |{' '}
                      {question.listenCount} listens
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => vote(question.id, 'up')}
                      disabled={pendingVoteId === question.id}
                    >
                      <ThumbsUp className="h-3 w-3 mr-1" />
                      {question.upvotes}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => vote(question.id, 'down')}
                      disabled={pendingVoteId === question.id}
                    >
                      <ThumbsDown className="h-3 w-3 mr-1" />
                      {question.downvotes}
                    </Button>
                  </div>
                </div>

                {question.answerText && (
                  <div className="space-y-2">
                    <p className="text-primary leading-relaxed whitespace-pre-wrap">
                      {question.answerText}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {question.isAdultContent && (
                        <Badge variant="destructive">Adult Content</Badge>
                      )}
                      {question.sensitiveTopics.map((topic: string) => (
                        <Badge key={topic} variant="outline">
                          {topic}
                        </Badge>
                      ))}
                      {question.subjectTags.map((tag: string) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {question.answerAudioUrl && (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                        <Volume2 className="h-4 w-4 text-primary shrink-0" />
                        <audio
                          controls
                          src={`${API_URL}${question.answerAudioUrl}`}
                          className="w-full h-10"
                          onEnded={(event) =>
                            trackListen(
                              question.id,
                              event.currentTarget.duration || 0,
                              true
                            )
                          }
                          onPause={(event) =>
                            trackListen(
                              question.id,
                              event.currentTarget.currentTime || 0,
                              false
                            )
                          }
                        >
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={isPublishModalOpen} onOpenChange={resetModalState}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish your question?</DialogTitle>
            <DialogDescription>
              Questions are public for other visitors. You can publish with your
              name hidden.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isPreviewing ? (
              <div className="flex items-center gap-2 rounded-md border p-3">
                <Spinner />
                <p className="text-sm text-muted-foreground">
                  Preparing your question for publishing...
                </p>
              </div>
            ) : modalAnsweredQuestion ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your question is now public. Here is the answer:
                </p>
                <div className="rounded-md border p-2">
                  <p className="font-medium">
                    {modalAnsweredQuestion.questionText}
                  </p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="whitespace-pre-wrap">
                    {modalAnsweredQuestion.answerText}
                  </p>
                </div>
                {modalAnsweredQuestion.answerAudioUrl && (
                  <audio
                    controls
                    src={`${API_URL}${modalAnsweredQuestion.answerAudioUrl}`}
                    className="w-full h-10"
                  >
                    Your browser does not support the audio element.
                  </audio>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => resetModalState(false)}
                    className="w-full"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : previewQuestion?.hasCorrections ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  We found a few typos. UK and US spelling are both accepted, so
                  only clear typos/capitalization were changed.
                </p>
                <ToggleGroup
                  type="single"
                  value={selectedPublishQuestion}
                  onValueChange={(v) => {
                    if (v) setSelectedPublishQuestion(v);
                  }}
                  className="flex-col items-stretch gap-2"
                >
                  <ToggleGroupItem
                    value={previewQuestion.corrected}
                    className="h-auto flex-col items-start gap-0.5 p-2 text-left whitespace-normal"
                  >
                    <p className="text-xs text-muted-foreground">Suggested</p>
                    <p>{previewQuestion.corrected}</p>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value={previewQuestion.original}
                    className="h-auto flex-col items-start gap-0.5 p-2 text-left whitespace-normal"
                  >
                    <p className="text-xs text-muted-foreground">Original</p>
                    <p>{previewQuestion.original}</p>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            ) : (
              <div className="rounded-md border p-2">
                <p>{previewQuestion?.original || draft.trim()}</p>
              </div>
            )}

            {!modalAnsweredQuestion && !isPreviewing && (
              <button
                type="button"
                className={`w-full rounded-md border p-2 text-left ${
                  publishAnonymously ? 'border-primary' : 'border-border'
                }`}
                onClick={() => setPublishAnonymously((prev) => !prev)}
              >
                {publishAnonymously
                  ? 'Publish anonymously (name hidden)'
                  : 'Publish with my name visible'}
              </button>
            )}

            {similarPrompt?.requiresConfirmation &&
              similarPrompt.similarQuestion && (
                <Alert variant="warning" className="space-y-2">
                  <p className="text-sm">
                    Similar question found (
                    {Math.round(similarPrompt.similarQuestion.similarity * 100)}
                    % match).
                  </p>
                  <p className="text-sm font-medium">
                    {similarPrompt.similarQuestion.questionText}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!similarPrompt.similarQuestion) return;
                        void applyExistingAnswer(
                          similarPrompt.similarQuestion.id
                        );
                        resetModalState(false);
                      }}
                    >
                      Use Existing Answer
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void submitQuestion(true)}
                      disabled={isAsking}
                    >
                      Ask Anyway
                    </Button>
                  </div>
                </Alert>
              )}

            {modalError && <ErrorText>{modalError}</ErrorText>}

            {!modalAnsweredQuestion && !isPreviewing && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => resetModalState(false)}
                  disabled={isAsking}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void submitQuestion(false)}
                  disabled={isAsking || !selectedPublishQuestion.trim()}
                >
                  {isAsking && <Spinner className="mr-2" />}
                  Publish and Answer
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
