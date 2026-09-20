'use client';

import { MappingModal } from './MappingModal';

import { Location } from '../../lib/api';

interface WarehouseMappingViewProps {
  token: string;
  onError: (value: string) => void;
  locations?: Location[];
  initialLocationCode?: string | null;
  onNavigate?: (tab: string) => void;
}

export function WarehouseMappingView({
  token,
  onError,
  locations,
  initialLocationCode,
  onNavigate,
}: WarehouseMappingViewProps) {
  return (
    <section className="space-y-6">
      <MappingModal
        inline={true}
        isOpen={true}
        token={token}
        locations={locations}
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
