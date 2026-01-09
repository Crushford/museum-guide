'use client';

import { useState } from 'react';
import { RoomFormClient } from './RoomFormClient';
import { RoomJsonImportClient } from './RoomJsonImportClient';

type RoomData = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

type Room = {
  id: number;
  name: string;
};

type RoomFormWrapperProps = {
  museumId: number;
  rooms: Room[];
};

export function RoomFormWrapper({ museumId, rooms }: RoomFormWrapperProps) {
  const [importedData, setImportedData] = useState<RoomData | null>(null);

  const handleValidJson = (data: RoomData) => {
    setImportedData(data);
  };

  return (
    <>
      <RoomFormClient
        museumId={museumId}
        rooms={rooms}
        importedData={importedData}
      />
      <RoomJsonImportClient museumId={museumId} onValidJson={handleValidJson} />
    </>
  );
}
