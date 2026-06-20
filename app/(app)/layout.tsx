import AuthGate from '@/components/AuthGate';
import AppShell from '@/components/AppShell';

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
