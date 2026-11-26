import { useEffect, useState } from 'react';

export default function useQrCountdown(qr) {
  const [clock, setClock] = useState(Date.now);
  const expiresAt = qr?.expiresAt;
  const receivedAt = qr?.receivedAt;
  const serverTime = qr?.serverTime;

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return 0;
  const remaining = Date.parse(expiresAt) - Date.parse(serverTime) -
    (Math.max(clock, receivedAt) - receivedAt);
  return Math.max(0, Math.ceil(remaining / 1000));
}
