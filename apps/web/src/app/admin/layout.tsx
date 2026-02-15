import { AdminAuthGate } from './AdminAuthGate';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminAuthGate>{children}</AdminAuthGate>;
}
