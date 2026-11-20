export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function formatRoomCode(code: string): string {
  const clean = normalizeRoomCode(code);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const totalTenths = Math.ceil(clamped / 100);
    const seconds = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    return `0:${seconds.toString().padStart(2, '0')}.${tenths}`;
  }

  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatElapsedSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
