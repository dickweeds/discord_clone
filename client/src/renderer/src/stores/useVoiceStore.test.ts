import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/voiceService', () => ({
  joinVoiceChannel: vi.fn().mockResolvedValue({ existingPeers: [] }),
  leaveVoiceChannel: vi.fn().mockResolvedValue(undefined),
  cleanupMedia: vi.fn(),
}));

vi.mock('../utils/soundPlayer', () => ({
  playConnectSound: vi.fn(),
  playDisconnectSound: vi.fn(),
}));

import { useVoiceStore } from './useVoiceStore';
import * as voiceService from '../services/voiceService';
import { playConnectSound, playDisconnectSound } from '../utils/soundPlayer';

const mockJoin = vi.mocked(voiceService.joinVoiceChannel);
const mockLeave = vi.mocked(voiceService.leaveVoiceChannel);

beforeEach(() => {
  useVoiceStore.setState({
    currentChannelId: null,
    currentUserId: null,
    connectionState: 'disconnected',
    isLoading: false,
    error: null,
    channelParticipants: new Map(),
    isMuted: false,
    isDeafened: false,
  });
  vi.clearAllMocks();
});

describe('useVoiceStore', () => {
  it('should have correct initial state', () => {
    const state = useVoiceStore.getState();
    expect(state.currentChannelId).toBeNull();
    expect(state.currentUserId).toBeNull();
    expect(state.connectionState).toBe('disconnected');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.channelParticipants.size).toBe(0);
    expect(state.isMuted).toBe(false);
    expect(state.isDeafened).toBe(false);
  });

  describe('joinChannel', () => {
    it('sets connection state to connecting then connected', async () => {
      mockJoin.mockResolvedValueOnce({ existingPeers: [] });

      await useVoiceStore.getState().joinChannel('voice-ch-1', 'my-user-id');

      const state = useVoiceStore.getState();
      expect(state.connectionState).toBe('connected');
      expect(state.currentChannelId).toBe('voice-ch-1');
      expect(state.currentUserId).toBe('my-user-id');
      expect(state.isLoading).toBe(false);
    });

    it('calls voiceService.joinVoiceChannel with channelId', async () => {
      mockJoin.mockResolvedValueOnce({ existingPeers: [] });

      await useVoiceStore.getState().joinChannel('voice-ch-1', 'my-user-id');

      expect(mockJoin).toHaveBeenCalledWith('voice-ch-1');
    });

    it('sets currentChannelId optimistically during connecting', async () => {
      let connectingChannelId: string | null = null;
      mockJoin.mockImplementationOnce(async () => {
        connectingChannelId = useVoiceStore.getState().currentChannelId;
        return { existingPeers: [] };
      });

      await useVoiceStore.getState().joinChannel('voice-ch-1', 'my-user-id');

      expect(connectingChannelId).toBe('voice-ch-1');
    });

    it('updates channelParticipants with existingPeers and self', async () => {
      mockJoin.mockResolvedValueOnce({ existingPeers: ['user-1', 'user-2'] });

      await useVoiceStore.getState().joinChannel('voice-ch-1', 'my-user-id');

      const participants = useVoiceStore.getState().channelParticipants.get('voice-ch-1');
      expect(participants).toEqual(['user-1', 'user-2', 'my-user-id']);
    });

    it('plays connect sound on success', async () => {
      mockJoin.mockResolvedValueOnce({ existingPeers: [] });

      await useVoiceStore.getState().joinChannel('voice-ch-1', 'my-user-id');

      expect(playConnectSound).toHaveBeenCalled();
    });

    it('sets error state on failure', async () => {
      mockJoin.mockRejectedValueOnce(new Error('Connection failed'));

      await useVoiceStore.getState().joinChannel('voice-ch-1', 'my-user-id');

      const state = useVoiceStore.getState();
      expect(state.connectionState).toBe('disconnected');
      expect(state.currentChannelId).toBeNull();
      expect(state.currentUserId).toBeNull();
      expect(state.error).toBe('Connection failed');
      expect(state.isLoading).toBe(false);
    });

    it('cleans up media on failure', async () => {
      mockJoin.mockRejectedValueOnce(new Error('Connection failed'));

      await useVoiceStore.getState().joinChannel('voice-ch-1', 'my-user-id');

      expect(voiceService.cleanupMedia).toHaveBeenCalled();
    });

    it('leaves current channel before joining new one', async () => {
      // Set up as already connected
      useVoiceStore.setState({
        currentChannelId: 'old-channel',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
      });

      mockLeave.mockResolvedValueOnce(undefined);
      mockJoin.mockResolvedValueOnce({ existingPeers: [] });

      await useVoiceStore.getState().joinChannel('new-channel', 'my-user-id');

      expect(mockLeave).toHaveBeenCalledWith('old-channel');
      expect(useVoiceStore.getState().currentChannelId).toBe('new-channel');
    });
  });

  describe('leaveChannel', () => {
    it('resets state and calls cleanup', async () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        channelParticipants: new Map([['voice-ch-1', ['my-user-id']]]),
      });
      mockLeave.mockResolvedValueOnce(undefined);

      await useVoiceStore.getState().leaveChannel();

      const state = useVoiceStore.getState();
      expect(state.currentChannelId).toBeNull();
      expect(state.currentUserId).toBeNull();
      expect(state.connectionState).toBe('disconnected');
      expect(state.isMuted).toBe(false);
      expect(state.isDeafened).toBe(false);
      expect(voiceService.cleanupMedia).toHaveBeenCalled();
    });

    it('sends voice:leave request via voiceService', async () => {
      useVoiceStore.setState({ currentChannelId: 'voice-ch-1', currentUserId: 'my-user-id', connectionState: 'connected' });
      mockLeave.mockResolvedValueOnce(undefined);

      await useVoiceStore.getState().leaveChannel();

      expect(mockLeave).toHaveBeenCalledWith('voice-ch-1');
    });

    it('plays disconnect sound', async () => {
      useVoiceStore.setState({ currentChannelId: 'voice-ch-1', currentUserId: 'my-user-id', connectionState: 'connected' });
      mockLeave.mockResolvedValueOnce(undefined);

      await useVoiceStore.getState().leaveChannel();

      expect(playDisconnectSound).toHaveBeenCalled();
    });

    it('does nothing if not in a channel', async () => {
      await useVoiceStore.getState().leaveChannel();

      expect(mockLeave).not.toHaveBeenCalled();
      expect(voiceService.cleanupMedia).not.toHaveBeenCalled();
    });

    it('still cleans up locally even if ws request fails', async () => {
      useVoiceStore.setState({ currentChannelId: 'voice-ch-1', currentUserId: 'my-user-id', connectionState: 'connected' });
      mockLeave.mockRejectedValueOnce(new Error('WS down'));

      await useVoiceStore.getState().leaveChannel();

      expect(voiceService.cleanupMedia).toHaveBeenCalled();
      expect(useVoiceStore.getState().currentChannelId).toBeNull();
    });

    it('only removes self from channelParticipants, not all participants', async () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        channelParticipants: new Map([['voice-ch-1', ['user-1', 'my-user-id', 'user-2']]]),
      });
      mockLeave.mockResolvedValueOnce(undefined);

      await useVoiceStore.getState().leaveChannel();

      const participants = useVoiceStore.getState().channelParticipants.get('voice-ch-1');
      expect(participants).toEqual(['user-1', 'user-2']);
    });

    it('removes channel entry when self is the last participant', async () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        channelParticipants: new Map([['voice-ch-1', ['my-user-id']]]),
      });
      mockLeave.mockResolvedValueOnce(undefined);

      await useVoiceStore.getState().leaveChannel();

      expect(useVoiceStore.getState().channelParticipants.has('voice-ch-1')).toBe(false);
    });
  });

  describe('addPeer', () => {
    it('adds user to channelParticipants', () => {
      useVoiceStore.getState().addPeer('ch-1', 'user-1');

      const participants = useVoiceStore.getState().channelParticipants.get('ch-1');
      expect(participants).toEqual(['user-1']);
    });

    it('does not add duplicate user', () => {
      useVoiceStore.getState().addPeer('ch-1', 'user-1');
      useVoiceStore.getState().addPeer('ch-1', 'user-1');

      const participants = useVoiceStore.getState().channelParticipants.get('ch-1');
      expect(participants).toEqual(['user-1']);
    });

    it('adds multiple users to same channel', () => {
      useVoiceStore.getState().addPeer('ch-1', 'user-1');
      useVoiceStore.getState().addPeer('ch-1', 'user-2');

      const participants = useVoiceStore.getState().channelParticipants.get('ch-1');
      expect(participants).toEqual(['user-1', 'user-2']);
    });
  });

  describe('removePeer', () => {
    it('removes user from channelParticipants', () => {
      useVoiceStore.setState({
        channelParticipants: new Map([['ch-1', ['user-1', 'user-2']]]),
      });

      useVoiceStore.getState().removePeer('ch-1', 'user-1');

      const participants = useVoiceStore.getState().channelParticipants.get('ch-1');
      expect(participants).toEqual(['user-2']);
    });

    it('removes channel entry when last user leaves', () => {
      useVoiceStore.setState({
        channelParticipants: new Map([['ch-1', ['user-1']]]),
      });

      useVoiceStore.getState().removePeer('ch-1', 'user-1');

      expect(useVoiceStore.getState().channelParticipants.has('ch-1')).toBe(false);
    });
  });

  describe('toggleMute', () => {
    it('toggles isMuted flag', () => {
      expect(useVoiceStore.getState().isMuted).toBe(false);
      useVoiceStore.getState().toggleMute();
      expect(useVoiceStore.getState().isMuted).toBe(true);
      useVoiceStore.getState().toggleMute();
      expect(useVoiceStore.getState().isMuted).toBe(false);
    });
  });

  describe('toggleDeafen', () => {
    it('toggles isDeafened flag', () => {
      expect(useVoiceStore.getState().isDeafened).toBe(false);
      useVoiceStore.getState().toggleDeafen();
      expect(useVoiceStore.getState().isDeafened).toBe(true);
      useVoiceStore.getState().toggleDeafen();
      expect(useVoiceStore.getState().isDeafened).toBe(false);
    });
  });

  describe('clearError', () => {
    it('clears the error state', () => {
      useVoiceStore.setState({ error: 'some error' });
      useVoiceStore.getState().clearError();
      expect(useVoiceStore.getState().error).toBeNull();
    });
  });

  describe('syncParticipants', () => {
    it('rebuilds channelParticipants from presence data', () => {
      useVoiceStore.getState().syncParticipants([
        { userId: 'u1', channelId: 'ch-1' },
        { userId: 'u2', channelId: 'ch-1' },
        { userId: 'u3', channelId: 'ch-2' },
      ]);

      const state = useVoiceStore.getState();
      expect(state.channelParticipants.get('ch-1')).toEqual(['u1', 'u2']);
      expect(state.channelParticipants.get('ch-2')).toEqual(['u3']);
    });
  });

  describe('localCleanup', () => {
    it('resets all voice state without sending WS message', () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        channelParticipants: new Map([['voice-ch-1', ['u1']]]),
        isMuted: true,
        isDeafened: true,
      });

      useVoiceStore.getState().localCleanup();

      const state = useVoiceStore.getState();
      expect(state.currentChannelId).toBeNull();
      expect(state.currentUserId).toBeNull();
      expect(state.connectionState).toBe('disconnected');
      expect(state.channelParticipants.size).toBe(0);
      expect(state.isMuted).toBe(false);
      expect(state.isDeafened).toBe(false);
      expect(voiceService.cleanupMedia).toHaveBeenCalled();
      expect(mockLeave).not.toHaveBeenCalled();
    });
  });
});
