'use client';

import { useState } from 'react';
import { MuseumFormClient } from './MuseumFormClient';
import { MuseumJsonImportClient } from './MuseumJsonImportClient';

type MuseumData = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export function MuseumFormWrapper() {
  const [importedData, setImportedData] = useState<MuseumData | null>(null);

  const handleValidJson = (data: MuseumData) => {
    setImportedData(data);
  };

  return (
    <>
      <MuseumFormClient importedData={importedData} />
      <MuseumJsonImportClient onValidJson={handleValidJson} />
    </>
  );
}
