'use client';

import { useState } from 'react';
import { ArtifactFormClient } from './ArtifactFormClient';
import { ArtifactJsonImportClient } from './ArtifactJsonImportClient';
import { ArtifactImportData, Room } from '@/lib/types';

type ArtifactFormWrapperProps = {
  museumId: number;
  museumName: string;
  rooms: Room[];
  roomId?: number;
  initialParentName?: string;
};

export function ArtifactFormWrapper({
  museumId,
  museumName,
  rooms,
  roomId,
  initialParentName,
}: ArtifactFormWrapperProps) {
  const [importedData, setImportedData] = useState<ArtifactImportData | null>(
    null
  );

  const handleValidJson = (data: ArtifactImportData) => {
    setImportedData(data);
  };

  return (
    <>
      <ArtifactFormClient
        museumId={museumId}
        museumName={museumName}
        rooms={rooms}
        roomId={roomId}
        initialParentName={initialParentName}
        importedData={importedData}
      />
      <ArtifactJsonImportClient onValidJson={handleValidJson} />
    </>
  );
}
