import AuthGate from '@/components/AuthGate';
import AppShell from '@/components/AppShell';
import { FirmProvider } from '@/lib/firm';

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <FirmProvider>
        <AppShell>{children}</AppShell>
      </FirmProvider>
    </AuthGate>
  );
}
