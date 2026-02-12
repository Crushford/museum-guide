import type { Metadata } from 'next';
import SearchPageClient from './SearchPageClient';

export const metadata: Metadata = {
  title: 'Find a Museum',
};

export default function Home() {
  return <SearchPageClient />;
}
