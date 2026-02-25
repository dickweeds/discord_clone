import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/voiceService', () => ({
  joinVoiceChannel: vi.fn().mockResolvedValue({ existingPeers: [] }),
  leaveVoiceChannel: vi.fn().mockResolvedValue(undefined),
  cleanupMedia: vi.fn(),
  startVideo: vi.fn().mockResolvedValue(undefined),
  stopVideo: vi.fn(),
}));

vi.mock('../services/mediaService', () => ({
  muteAudio: vi.fn(),
  unmuteAudio: vi.fn(),
  deafenAudio: vi.fn(),
  undeafenAudio: vi.fn(),
  getLocalStream: vi.fn().mockReturnValue(null),
}));

vi.mock('../services/vadService', () => ({
  stopLocalVAD: vi.fn(),
  startLocalVAD: vi.fn(),
  stopAllVAD: vi.fn(),
}));

vi.mock('../utils/soundPlayer', () => ({
  playConnectSound: vi.fn(),
  playDisconnectSound: vi.fn(),
}));

import { useVoiceStore } from './useVoiceStore';
import * as voiceService from '../services/voiceService';
import * as mediaService from '../services/mediaService';
import * as vadService from '../services/vadService';
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
    speakingUsers: new Set<string>(),
    isVideoEnabled: false,
    videoParticipants: new Set(),
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

    it('clears speakingUsers on leave', async () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        channelParticipants: new Map([['voice-ch-1', ['my-user-id']]]),
        speakingUsers: new Set(['my-user-id', 'other-user']),
      });
      mockLeave.mockResolvedValueOnce(undefined);

      await useVoiceStore.getState().leaveChannel();

      expect(useVoiceStore.getState().speakingUsers.size).toBe(0);
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

    it('clears departed user from speakingUsers', () => {
      useVoiceStore.setState({
        channelParticipants: new Map([['ch-1', ['user-1', 'user-2']]]),
        speakingUsers: new Set(['user-1', 'user-2']),
      });

      useVoiceStore.getState().removePeer('ch-1', 'user-1');

      expect(useVoiceStore.getState().speakingUsers.has('user-1')).toBe(false);
      expect(useVoiceStore.getState().speakingUsers.has('user-2')).toBe(true);
    });
  });

  describe('setSpeaking', () => {
    it('adds userId to speakingUsers when speaking', () => {
      useVoiceStore.getState().setSpeaking('user-1', true);
      expect(useVoiceStore.getState().speakingUsers.has('user-1')).toBe(true);
    });

    it('removes userId from speakingUsers when not speaking', () => {
      useVoiceStore.setState({ speakingUsers: new Set(['user-1']) });
      useVoiceStore.getState().setSpeaking('user-1', false);
      expect(useVoiceStore.getState().speakingUsers.has('user-1')).toBe(false);
    });

    it('handles multiple speaking users', () => {
      useVoiceStore.getState().setSpeaking('user-1', true);
      useVoiceStore.getState().setSpeaking('user-2', true);
      expect(useVoiceStore.getState().speakingUsers.size).toBe(2);
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

    it('calls mediaService.muteAudio when muting', () => {
      useVoiceStore.getState().toggleMute();
      expect(mediaService.muteAudio).toHaveBeenCalled();
    });

    it('calls mediaService.unmuteAudio when unmuting', () => {
      useVoiceStore.setState({ isMuted: true });
      useVoiceStore.getState().toggleMute();
      expect(mediaService.unmuteAudio).toHaveBeenCalled();
    });

    it('stops local VAD when muting', () => {
      useVoiceStore.getState().toggleMute();
      expect(vadService.stopLocalVAD).toHaveBeenCalled();
    });

    it('restarts local VAD when unmuting with active stream', () => {
      const mockStream = {} as MediaStream;
      vi.mocked(mediaService.getLocalStream).mockReturnValue(mockStream);
      useVoiceStore.setState({ isMuted: true, currentUserId: 'my-user' });

      useVoiceStore.getState().toggleMute();

      expect(vadService.startLocalVAD).toHaveBeenCalledWith(
        mockStream,
        expect.any(Function),
      );
    });

    it('clears self from speakingUsers when muting', () => {
      useVoiceStore.setState({
        currentUserId: 'my-user',
        speakingUsers: new Set(['my-user', 'other-user']),
      });
      useVoiceStore.getState().toggleMute();
      expect(useVoiceStore.getState().speakingUsers.has('my-user')).toBe(false);
      expect(useVoiceStore.getState().speakingUsers.has('other-user')).toBe(true);
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

    it('calls mediaService.deafenAudio when deafening', () => {
      useVoiceStore.getState().toggleDeafen();
      expect(mediaService.deafenAudio).toHaveBeenCalled();
    });

    it('calls undeafenAudio with restoreMuted=false when was not muted before deafen', () => {
      useVoiceStore.setState({ isMuted: false, currentUserId: 'my-user' });
      useVoiceStore.getState().toggleDeafen(); // ON: wasMutedBeforeDeafen = false
      vi.clearAllMocks();

      useVoiceStore.getState().toggleDeafen(); // OFF
      expect(mediaService.undeafenAudio).toHaveBeenCalledWith(false);
    });

    it('calls undeafenAudio with restoreMuted=true when was muted before deafen', () => {
      useVoiceStore.setState({ isMuted: true, currentUserId: 'my-user' });
      useVoiceStore.getState().toggleDeafen(); // ON: wasMutedBeforeDeafen = true
      vi.clearAllMocks();

      useVoiceStore.getState().toggleDeafen(); // OFF
      expect(mediaService.undeafenAudio).toHaveBeenCalledWith(true);
    });

    it('restarts local VAD when undeafening and was not muted before', () => {
      const mockStream = {} as MediaStream;
      vi.mocked(mediaService.getLocalStream).mockReturnValue(mockStream);
      useVoiceStore.setState({ isMuted: false, currentUserId: 'my-user' });
      useVoiceStore.getState().toggleDeafen(); // ON
      vi.clearAllMocks();

      useVoiceStore.getState().toggleDeafen(); // OFF
      expect(vadService.startLocalVAD).toHaveBeenCalledWith(
        mockStream,
        expect.any(Function),
      );
    });

    it('sets isMuted to true when deafening', () => {
      useVoiceStore.getState().toggleDeafen();
      expect(useVoiceStore.getState().isMuted).toBe(true);
    });

    it('restores previous mute state when undeafening', () => {
      // Start unmuted, then deafen, then undeafen
      useVoiceStore.setState({ isMuted: false });
      useVoiceStore.getState().toggleDeafen();
      expect(useVoiceStore.getState().isMuted).toBe(true);
      useVoiceStore.getState().toggleDeafen();
      expect(useVoiceStore.getState().isMuted).toBe(false);
    });

    it('keeps muted state when was muted before deafen', () => {
      useVoiceStore.setState({ isMuted: true });
      useVoiceStore.getState().toggleDeafen();
      expect(useVoiceStore.getState().isMuted).toBe(true);
      useVoiceStore.getState().toggleDeafen();
      expect(useVoiceStore.getState().isMuted).toBe(true);
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

  describe('toggleVideo', () => {
    it('enables video when in voice channel', async () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
      });

      await useVoiceStore.getState().toggleVideo();

      const state = useVoiceStore.getState();
      expect(state.isVideoEnabled).toBe(true);
      expect(state.videoParticipants.has('my-user-id')).toBe(true);
      expect(voiceService.startVideo).toHaveBeenCalled();
    });

    it('disables video when already enabled', async () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        isVideoEnabled: true,
        videoParticipants: new Set(['my-user-id']),
      });

      await useVoiceStore.getState().toggleVideo();

      const state = useVoiceStore.getState();
      expect(state.isVideoEnabled).toBe(false);
      expect(state.videoParticipants.has('my-user-id')).toBe(false);
      expect(voiceService.stopVideo).toHaveBeenCalled();
    });

    it('is a no-op when not in voice channel', async () => {
      await useVoiceStore.getState().toggleVideo();

      expect(voiceService.startVideo).not.toHaveBeenCalled();
      expect(voiceService.stopVideo).not.toHaveBeenCalled();
      expect(useVoiceStore.getState().isVideoEnabled).toBe(false);
    });

    it('sets error and keeps video disabled when startVideo fails', async () => {
      vi.mocked(voiceService.startVideo).mockRejectedValueOnce(new Error('Camera permission denied'));

      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
      });

      await useVoiceStore.getState().toggleVideo();

      const state = useVoiceStore.getState();
      expect(state.isVideoEnabled).toBe(false);
      expect(state.error).toBe('Camera permission denied');
      expect(state.videoParticipants.has('my-user-id')).toBe(false);
      expect(voiceService.stopVideo).not.toHaveBeenCalled();
    });
  });

  describe('addVideoParticipant / removeVideoParticipant', () => {
    it('adds a video participant', () => {
      useVoiceStore.getState().addVideoParticipant('user-1');
      expect(useVoiceStore.getState().videoParticipants.has('user-1')).toBe(true);
    });

    it('removes a video participant', () => {
      useVoiceStore.setState({ videoParticipants: new Set(['user-1', 'user-2']) });
      useVoiceStore.getState().removeVideoParticipant('user-1');
      expect(useVoiceStore.getState().videoParticipants.has('user-1')).toBe(false);
      expect(useVoiceStore.getState().videoParticipants.has('user-2')).toBe(true);
    });
  });

  describe('leaveChannel resets video', () => {
    it('stops video and resets video state on leave', async () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        isVideoEnabled: true,
        videoParticipants: new Set(['my-user-id']),
      });
      mockLeave.mockResolvedValueOnce(undefined);

      await useVoiceStore.getState().leaveChannel();

      const state = useVoiceStore.getState();
      expect(state.isVideoEnabled).toBe(false);
      expect(state.videoParticipants.size).toBe(0);
      expect(voiceService.stopVideo).toHaveBeenCalled();
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
        isVideoEnabled: true,
        videoParticipants: new Set(['my-user-id']),
      });

      useVoiceStore.getState().localCleanup();

      const state = useVoiceStore.getState();
      expect(state.currentChannelId).toBeNull();
      expect(state.currentUserId).toBeNull();
      expect(state.connectionState).toBe('disconnected');
      expect(state.channelParticipants.size).toBe(0);
      expect(state.isMuted).toBe(false);
      expect(state.isDeafened).toBe(false);
      expect(state.isVideoEnabled).toBe(false);
      expect(state.videoParticipants.size).toBe(0);
      expect(voiceService.cleanupMedia).toHaveBeenCalled();
      expect(mockLeave).not.toHaveBeenCalled();
    });

    it('clears speakingUsers', () => {
      useVoiceStore.setState({
        currentChannelId: 'voice-ch-1',
        currentUserId: 'my-user-id',
        connectionState: 'connected',
        speakingUsers: new Set(['user-1', 'user-2']),
      });

      useVoiceStore.getState().localCleanup();

      expect(useVoiceStore.getState().speakingUsers.size).toBe(0);
    });
  });
});
