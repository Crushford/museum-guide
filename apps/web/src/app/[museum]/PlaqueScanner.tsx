'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import type {
  ArtifactDraft,
  DuplicateSearchResult,
  OcrResult,
  ScanStage,
} from '@repo/types';
import { API_URL } from '@/lib/api';
import { SectionCard } from '@/components/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type StageKey = ScanStage;

type StageState = 'idle' | 'running' | 'done';

type DuplicateCandidate = DuplicateSearchResult['candidates'][number];
type DuplicateResponse = DuplicateSearchResult;
type Draft = ArtifactDraft;
type OcrPayload = OcrResult;

const stageOrder: StageKey[] = [
  'ocr',
  'duplicates_raw',
  'draft',
  'duplicates_draft',
  'persist',
];

const stageLabels: Record<StageKey, string> = {
  ocr: 'Reading plaque text...',
  duplicates_raw: 'Checking if this artefact already exists...',
  draft: 'Understanding the artefact...',
  duplicates_draft: 'Double-checking for duplicates...',
  persist: 'Creating artefact...',
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      if (typeof payload?.error === 'string') message = payload.error;
    } catch {
      // Ignore JSON parse failures.
    }
    throw new Error(message);
  }

  return response.json();
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read image file'));
    };
    reader.onerror = () => reject(new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

interface PlaqueScannerProps {
  museumId: number;
  museumSlug: string;
}

export function PlaqueScanner({ museumId, museumSlug }: PlaqueScannerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ocrRef = useRef<OcrPayload | null>(null);
  const imageBase64Ref = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stageStates, setStageStates] = useState<Record<StageKey, StageState>>({
    ocr: 'idle',
    duplicates_raw: 'idle',
    draft: 'idle',
    duplicates_draft: 'idle',
    persist: 'idle',
  });
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [ocr, setOcr] = useState<OcrPayload | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [duplicateGate, setDuplicateGate] = useState<{
    step: 'duplicates_raw' | 'duplicates_draft';
    candidates: DuplicateCandidate[];
  } | null>(null);
  const [museumConfidenceNeedsConfirm, setMuseumConfidenceNeedsConfirm] =
    useState(false);

  const isRunning = useMemo(
    () => Object.values(stageStates).some((state) => state === 'running'),
    [stageStates]
  );

  const visibleStages = useMemo(
    () => stageOrder.filter((stage) => stageStates[stage] !== 'idle'),
    [stageStates]
  );

  const setStageRunning = (stage: StageKey) => {
    setCurrentMessage(stageLabels[stage]);
    setStageStates((prev) => ({ ...prev, [stage]: 'running' }));
  };

  const setStageDone = (stage: StageKey) => {
    setStageStates((prev) => ({ ...prev, [stage]: 'done' }));
  };

  const resetStages = () => {
    setStageStates({
      ocr: 'idle',
      duplicates_raw: 'idle',
      draft: 'idle',
      duplicates_draft: 'idle',
      persist: 'idle',
    });
  };

  const stopRunningStages = () => {
    setStageStates((prev) => ({
      ocr: prev.ocr === 'running' ? 'done' : prev.ocr,
      duplicates_raw:
        prev.duplicates_raw === 'running' ? 'done' : prev.duplicates_raw,
      draft: prev.draft === 'running' ? 'done' : prev.draft,
      duplicates_draft:
        prev.duplicates_draft === 'running' ? 'done' : prev.duplicates_draft,
      persist: prev.persist === 'running' ? 'done' : prev.persist,
    }));
  };

  const routeToMatchedArtifact = (slug: string) => {
    setIsModalOpen(false);
    router.push(`/${museumSlug}/artifacts/${slug}?scanMatched=1`);
  };

  const runEnrichmentAndCreate = async (text: string, draftData: Draft) => {
    const ocrPayload = ocrRef.current;
    const imagePayload = imageBase64Ref.current;

    if (!ocrPayload || !imagePayload) {
      const missing: string[] = [];
      if (!ocrPayload) missing.push('OCR payload');
      if (!imagePayload) missing.push('image payload');
      throw new Error(
        `Scan session data is missing (${missing.join(' + ')}). Please scan the plaque again.`
      );
    }

    setStageRunning('persist');
    const created = await postJson<{
      artifactId: number;
      artifactSlug: string;
    }>(`/museums/${museumId}/scan/create`, {
      imageBase64: imagePayload,
      rawText: text,
      ocr: ocrPayload,
      draft: draftData,
    });
    setStageDone('persist');
    setIsModalOpen(false);
    router.push(`/${museumSlug}/artifacts/${created.artifactSlug}`);
  };

  const runSecondDuplicateCheck = async (text: string, draftData: Draft) => {
    setStageRunning('duplicates_draft');
    const draftDupes = await postJson<DuplicateResponse>(
      `/museums/${museumId}/scan/duplicates-draft`,
      { draft: draftData }
    );
    setStageDone('duplicates_draft');

    if (
      draftDupes.outcome === 'single_strong_match' &&
      draftDupes.candidates.length === 1
    ) {
      routeToMatchedArtifact(draftDupes.candidates[0].slug);
      return;
    }

    if (draftDupes.outcome === 'multiple_candidates') {
      setDuplicateGate({
        step: 'duplicates_draft',
        candidates: draftDupes.candidates,
      });
      setCurrentMessage('Choose an existing artefact or create a new one.');
      return;
    }

    await runEnrichmentAndCreate(text, draftData);
  };

  const runDraftStage = async (text: string) => {
    setStageRunning('draft');
    const draftResponse = await postJson<{ draft: Draft }>(
      `/museums/${museumId}/scan/draft`,
      { rawText: text }
    );
    setDraft(draftResponse.draft);
    setStageDone('draft');

    if (draftResponse.draft.museumConfidence < 70) {
      setMuseumConfidenceNeedsConfirm(true);
      setCurrentMessage(
        `Museum confidence is ${draftResponse.draft.museumConfidence.toFixed(0)}%. Please confirm museum selection (TODO).`
      );
      return;
    }

    await runSecondDuplicateCheck(text, draftResponse.draft);
  };

  const startScan = async () => {
    if (!file) {
      fileInputRef.current?.click();
      return;
    }

    try {
      setError(null);
      setDuplicateGate(null);
      setMuseumConfidenceNeedsConfirm(false);
      setCurrentMessage(null);
      setIsModalOpen(true);
      resetStages();
      setDraft(null);
      setRawText('');
      setOcr(null);
      setImageBase64(null);
      ocrRef.current = null;
      imageBase64Ref.current = null;

      const encodedImage = await readFileAsBase64(file);
      setImageBase64(encodedImage);
      imageBase64Ref.current = encodedImage;

      setStageRunning('ocr');
      const ocrResponse = await postJson<{ rawText: string; ocr: OcrPayload }>(
        `/museums/${museumId}/scan/ocr`,
        {
          imageBase64: encodedImage,
        }
      );

      setRawText(ocrResponse.rawText);
      setOcr(ocrResponse.ocr);
      ocrRef.current = ocrResponse.ocr;
      setStageDone('ocr');

      setStageRunning('duplicates_raw');
      const rawDupes = await postJson<DuplicateResponse>(
        `/museums/${museumId}/scan/duplicates-raw`,
        { rawText: ocrResponse.rawText }
      );
      setStageDone('duplicates_raw');

      if (
        rawDupes.outcome === 'single_strong_match' &&
        rawDupes.candidates.length === 1
      ) {
        routeToMatchedArtifact(rawDupes.candidates[0].slug);
        return;
      }

      if (rawDupes.outcome === 'multiple_candidates') {
        setDuplicateGate({
          step: 'duplicates_raw',
          candidates: rawDupes.candidates,
        });
        setCurrentMessage('Choose an existing artefact or create a new one.');
        return;
      }

      await runDraftStage(ocrResponse.rawText);
    } catch (scanError) {
      stopRunningStages();
      setError(scanError instanceof Error ? scanError.message : 'Scan failed');
      setCurrentMessage('We hit an error while scanning.');
      setIsModalOpen(true);
    }
  };

  const continueFlow = async () => {
    if (!rawText) return;

    try {
      setError(null);

      if (museumConfidenceNeedsConfirm && draft) {
        setMuseumConfidenceNeedsConfirm(false);
        await runSecondDuplicateCheck(rawText, draft);
        return;
      }

      if (duplicateGate?.step === 'duplicates_raw') {
        setDuplicateGate(null);
        await runDraftStage(rawText);
        return;
      }

      if (duplicateGate?.step === 'duplicates_draft' && draft) {
        setDuplicateGate(null);
        await runEnrichmentAndCreate(rawText, draft);
      }
    } catch (scanError) {
      stopRunningStages();
      setError(scanError instanceof Error ? scanError.message : 'Scan failed');
      setCurrentMessage('We hit an error while scanning.');
      setIsModalOpen(true);
    }
  };

  return (
    <SectionCard
      title="Scan Plaque"
      subtitle="Create an artefact from a plaque photo"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Camera capture is preferred. Upload is available as a fallback.
        </p>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setError(null);
            setDuplicateGate(null);
            setMuseumConfidenceNeedsConfirm(false);
            setCurrentMessage(null);
            resetStages();
            setOcr(null);
            setImageBase64(null);
            ocrRef.current = null;
            imageBase64Ref.current = null;

            if (previewUrl) URL.revokeObjectURL(previewUrl);
            if (selected) {
              setPreviewUrl(URL.createObjectURL(selected));
            } else {
              setPreviewUrl(null);
            }
          }}
          disabled={isRunning}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning}
          >
            Choose file
          </Button>
          <Button type="button" onClick={startScan} disabled={isRunning}>
            Scan plaque
          </Button>
        </div>

        {file && (
          <p className="text-sm text-muted-foreground">Selected: {file.name}</p>
        )}

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Selected plaque"
            className="max-h-64 rounded-md border object-contain"
          />
        )}

        {error && <ErrorText>{error}</ErrorText>}
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          if (isRunning && !error) return;
          setIsModalOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scanning plaque</DialogTitle>
            <DialogDescription>
              {currentMessage || 'Preparing scan...'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isRunning && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Working on this scan...
              </div>
            )}

            {visibleStages.length > 0 && (
              <div className="space-y-1 text-sm">
                {visibleStages.map((stage) => {
                  const state = stageStates[stage];
                  const marker = state === 'done' ? 'Done' : 'In progress';
                  return (
                    <p key={stage} className="text-muted-foreground">
                      {stageLabels[stage]} {marker}
                    </p>
                  );
                })}
              </div>
            )}

            {museumConfidenceNeedsConfirm && draft && (
              <Alert variant="warning" className="space-y-2">
                <p className="text-sm font-medium">
                  Museum confidence is {draft.museumConfidence.toFixed(0)}%
                </p>
                <p className="text-sm">
                  TODO: Ask user to confirm which museum this artefact belongs
                  to when confidence is below 70%.
                </p>
                <Button type="button" size="sm" onClick={continueFlow}>
                  Continue for now
                </Button>
              </Alert>
            )}

            {duplicateGate && (
              <div className="rounded-md border p-3 space-y-3">
                <p className="text-sm font-medium">
                  Possible existing artefacts
                </p>
                {duplicateGate.candidates.map((candidate) => (
                  <div
                    key={candidate.artifactId}
                    className="rounded border p-2 space-y-1"
                  >
                    <p className="font-medium">{candidate.localTitle}</p>
                    {candidate.englishTitle && (
                      <p className="text-sm text-muted-foreground">
                        {candidate.englishTitle}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Match score: {(candidate.score * 100).toFixed(0)}%
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => routeToMatchedArtifact(candidate.slug)}
                    >
                      Open existing artefact
                    </Button>
                  </div>
                ))}
                <Button type="button" onClick={continueFlow}>
                  None of these match
                </Button>
              </div>
            )}

            {error && <ErrorText>{error}</ErrorText>}
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
