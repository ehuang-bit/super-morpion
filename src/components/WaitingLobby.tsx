import { useEffect, useState } from 'react';
import { TIME_CONTROL_LABELS, type RoomSnapshot } from '@shared/protocol';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { formatRoomCode } from '../utils/format';

interface WaitingLobbyProps {
  snapshot: RoomSnapshot;
  onCancel: () => void;
}

export function WaitingLobby({ snapshot, onCancel }: WaitingLobbyProps) {
  const [copiedType, setCopiedType] = useState<'link' | 'code' | null>(null);

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/room/${snapshot.code}`
      : `/room/${snapshot.code}`;

  useEffect(() => {
    if (!copiedType) return;
    const timer = window.setTimeout(() => setCopiedType(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copiedType]);

  const copyText = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
    } catch {
      // Fallback for restricted clipboard permissions
      setCopiedType(type);
    }
  };

  return (
    <main className="w-full max-w-[460px] mx-auto px-3 flex-1 flex flex-col justify-center">
      <div
        className="rounded-[16px] p-5 sm:p-6 flex flex-col gap-5"
        style={{
          backgroundColor: 'var(--bg-board)',
          border: '1px solid var(--border-main)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1
              className="text-lg font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Duel privé prêt
            </h1>
            <p
              className="text-xs sm:text-sm mt-0.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Partagez le lien ou le code à votre adversaire.
            </p>
          </div>
          <span
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-main)',
            }}
          >
            {TIME_CONTROL_LABELS[snapshot.timeControl]}
          </span>
        </div>

        {/* Short 6-char room code */}
        <div
          className="rounded-[12px] p-4 flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-main)',
          }}
        >
          <div>
            <span
              className="block text-[11px] font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              Code du salon
            </span>
            <span
              className="mt-0.5 block font-mono text-2xl sm:text-3xl font-semibold tracking-[0.14em]"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatRoomCode(snapshot.code)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => copyText(snapshot.code, 'code')}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-board)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
            }}
          >
            {copiedType === 'code' ? (
              <>
                <Check className="w-3.5 h-3.5" style={{ color: 'var(--x-color)' }} />
                <span>Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </>
            )}
          </button>
        </div>

        {/* Direct invite link */}
        <div>
          <span
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Lien d’invitation direct
          </span>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              aria-label="Lien d’invitation direct"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-[10px] px-3 py-2 font-mono text-xs"
              style={{
                backgroundColor: 'var(--bg-recessed)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-cell)',
              }}
            />
            <button
              type="button"
              onClick={() => copyText(inviteUrl, 'link')}
              className="tactile-btn shrink-0 rounded-[10px] px-4 py-2 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              {copiedType === 'link' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Lien copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copier le lien</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: 'var(--border-cell)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            En attente de l’adversaire…
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Annuler</span>
          </button>
        </div>
      </div>
    </main>
  );
}
