import { useEffect, useState } from 'react';
import { DJHealthMonitor, type HealthStatus } from '../../engine/dj/DJHealthMonitor';

export function useDJHealth(): HealthStatus | null {
  const [status, setStatus] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const monitor = DJHealthMonitor.getInstance();
    monitor.start();
    const unsub = monitor.subscribe(setStatus);
    return unsub;
  }, []);

  return status;
}
