'use client';

import { MappingModal } from './MappingModal';

interface WarehouseMappingViewProps {
  token: string;
  onError: (value: string) => void;
  initialLocationCode?: string | null;
  onNavigate?: (tab: string) => void;
}

export function WarehouseMappingView({
  token,
  onError,
  initialLocationCode,
  onNavigate,
}: WarehouseMappingViewProps) {
  return (
    <section className="space-y-6">
      <MappingModal
        inline={true}
        isOpen={true}
        token={token}
        initialLocationCode={initialLocationCode}
        onClose={() => {
          if (onNavigate) {
            onNavigate('warehouse2d');
          }
        }}
        onSuccess={() => {
          // Success callback
        }}
      />
    </section>
  );
}
