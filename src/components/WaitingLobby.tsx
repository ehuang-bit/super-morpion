import { useEffect, useState } from 'react';
import { TIME_CONTROL_LABELS, type RoomSnapshot } from '@shared/protocol';
import { ArrowLeft, Check, Copy, Share2 } from 'lucide-react';
import { formatRoomCode } from '../utils/format';
import { QrCode } from './QrCode';

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

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const shareInvite = async () => {
    try {
      await navigator.share({
        title: 'Super Morpion — duel',
        text: `Je te défie au Super Morpion (${TIME_CONTROL_LABELS[snapshot.timeControl]}) ! Code ${snapshot.code}`,
        url: inviteUrl,
      });
    } catch {
      // Partage annulé
    }
  };

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
    <main className="w-full max-w-[460px] mx-auto px-1 sm:px-2 lg:px-0 flex-1 flex flex-col justify-center">
      <div
        className="rounded-[16px] p-4 sm:p-5 lg:p-4 xl:p-5 flex flex-col gap-4 sm:gap-5"
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

        {/* Code du salon à 6 caractères + QR code d'invitation */}
        <div className="flex flex-col min-[360px]:flex-row items-stretch gap-3">
          <div
            className="flex-1 min-w-0 rounded-[12px] p-3.5 sm:p-4 lg:p-3.5 xl:p-4 flex flex-col justify-between gap-3"
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
                className="mt-1 block font-mono text-xl sm:text-2xl lg:text-xl xl:text-2xl font-semibold tracking-[0.12em] whitespace-nowrap"
                style={{ color: 'var(--text-primary)' }}
              >
                {formatRoomCode(snapshot.code)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyText(snapshot.code, 'code')}
              className="tactile-btn self-start inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
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

          <div className="shrink-0 flex flex-col items-center justify-center gap-1.5">
            <QrCode
              value={inviteUrl}
              size={116}
              label={`QR code d’invitation pour le salon ${snapshot.code}`}
            />
            <span
              className="text-[10.5px] font-medium text-center leading-tight max-w-[118px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Scanner pour rejoindre
            </span>
          </div>
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
          {canShare && (
            <button
              type="button"
              onClick={() => void shareInvite()}
              className="tactile-btn mt-2 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--accent-active-bg)',
                color: 'var(--accent-active-text)',
                border: '1px solid var(--accent-active)',
              }}
            >
              <Share2 className="w-4 h-4" />
              <span>Envoyer l’invitation</span>
            </button>
          )}
        </div>

        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: 'var(--border-cell)' }}
        >
          <span
            className="inline-flex items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="live-dot" aria-hidden="true" />
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
