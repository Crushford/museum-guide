'use client';

import { useState } from 'react';
import { RoomFormClient } from './RoomFormClient';
import { RoomJsonImportClient } from './RoomJsonImportClient';
import { Room, RoomDraft } from '@/lib/types';

type RoomFormWrapperProps = {
  museumId: number;
  rooms: Room[];
};

export function RoomFormWrapper({ museumId, rooms }: RoomFormWrapperProps) {
  const [importedData, setImportedData] = useState<RoomDraft | null>(null);

  const handleValidJson = (data: RoomDraft) => {
    setImportedData(data);
  };

  return (
    <>
      <RoomFormClient
        museumId={museumId}
        rooms={rooms}
        importedData={importedData}
      />
      <RoomJsonImportClient onValidJson={handleValidJson} />
    </>
  );
}
