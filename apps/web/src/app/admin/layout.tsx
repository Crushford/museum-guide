import { AdminNav } from '@/components/shared/AdminNav';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    redirect('/');
  }

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
