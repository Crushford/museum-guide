'use client';

import { useState } from 'react';
import { ArtifactFormClient } from './ArtifactFormClient';
import { ArtifactJsonImportClient } from './ArtifactJsonImportClient';

type Room = {
  id: number;
  name: string;
  type: 'ROOM';
  parentId: number | null;
};

type ImportedArtifactData = {
  name: string;
  parentId?: number;
  parentName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

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
  const [importedData, setImportedData] = useState<ImportedArtifactData | null>(
    null
  );

  const handleValidJson = (data: ImportedArtifactData) => {
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
      <ArtifactJsonImportClient
        museumId={museumId}
        roomId={roomId}
        onValidJson={handleValidJson}
      />
    </>
  );
}
