import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, Link as LinkIcon } from 'lucide-react';
import { Modal, Button } from '../../components';
import { useInviteStore } from '../../stores/useInviteStore';

function buildInviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteModal({ open, onOpenChange }: InviteModalProps): React.ReactNode {
  const invites = useInviteStore((s) => s.invites);
  const isLoading = useInviteStore((s) => s.isLoading);
  const error = useInviteStore((s) => s.error);
  const fetchInvites = useInviteStore((s) => s.fetchInvites);
  const generateInvite = useInviteStore((s) => s.generateInvite);
  const revokeInvite = useInviteStore((s) => s.revokeInvite);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      fetchInvites();
      setCopiedId(null);
    }
  }, [open, fetchInvites]);

  const copyToClipboard = useCallback(async (token: string, id: string) => {
    await navigator.clipboard.writeText(buildInviteLink(token));
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    const invite = await generateInvite();
    if (invite) {
      await copyToClipboard(invite.token, 'generated');
    }
    setIsGenerating(false);
  };

  const handleRevoke = (id: string) => {
    revokeInvite(id);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Invite People">
      <div className="mt-4 flex flex-col gap-4 w-[480px]">
        {/* Generate Section */}
        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={isGenerating}>
            <LinkIcon size={16} className="mr-2" />
            {isGenerating ? 'Generating...' : 'Generate Invite Link'}
          </Button>
          {copiedId === 'generated' && (
            <span className="text-sm text-accent-primary">Copied!</span>
          )}
        </div>

        {/* Error */}
        {error && <p className="text-sm text-error">{error}</p>}

        {/* Loading */}
        {isLoading && <p className="text-sm text-text-muted">Loading...</p>}

        {/* Invite List */}
        {!isLoading && invites.length === 0 && (
          <p className="text-sm text-text-muted">No active invites. Generate one above.</p>
        )}

        {!isLoading && invites.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm text-text-primary font-mono truncate">
                    {invite.token}
                  </span>
                  <span className="text-xs text-text-muted">
                    {new Date(invite.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(invite.token, invite.id)}
                    title="Copy invite link"
                  >
                    {copiedId === invite.id ? (
                      <span className="text-xs text-accent-primary">Copied!</span>
                    ) : (
                      <Copy size={14} />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(invite.id)}
                    title="Revoke invite"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
