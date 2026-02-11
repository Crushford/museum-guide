'use client';

import { useState } from 'react';
import { MuseumFormClient } from './MuseumFormClient';
import { MuseumJsonImportClient } from './MuseumJsonImportClient';
import { MuseumInput } from '@/lib/types';

export function MuseumFormWrapper() {
  const [importedData, setImportedData] = useState<MuseumInput | null>(null);

  const handleValidJson = (data: MuseumInput) => {
    setImportedData(data);
  };

  return (
    <>
      <MuseumFormClient importedData={importedData} />
      <MuseumJsonImportClient onValidJson={handleValidJson} />
    </>
  );
}
