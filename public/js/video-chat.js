// WebRTC Video Chat Manager for Monopoly
// Based on patterns from ollama implementation

import { getWebSocket, send } from './api.js';
import { state } from './state.js';

// Video chat state
let localStream = null;
let screenStream = null;
let peerConnections = new Map(); // playerId -> RTCPeerConnection
let isVideoActive = false;
let isMicMuted = false;
let isVideoMuted = false;
let currentQuality = 'hd';

// SFU (Selective Forwarding Unit) state for multi-party video
let sfuMode = true; // Enable SFU mode by default for better scalability
let sfuSession = null; // { sessionId, peerConnection }
let sfuLocalTracks = new Map(); // trackName -> { trackId, mid }
let sfuRemoteTracks = new Map(); // trackId -> { playerId, playerName, trackName }

// Video quality presets optimized for Monopoly game
const VIDEO_QUALITY = {
  sd: { width: 640, height: 480, frameRate: 15, bitrate: 300000 },
  hd: { width: 1280, height: 720, frameRate: 24, bitrate: 800000 },
  fhd: { width: 1920, height: 1080, frameRate: 30, bitrate: 2000000 }
};

// ICE servers configuration - will be populated with TURN credentials
let ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// Cache for TURN credentials
let turnCredentialsCache = null;
let turnCredentialsFetchTime = 0;
const TURN_CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

/**
 * Fetches TURN server credentials from the backend.
 * Credentials are cached for 1 hour to avoid excessive API calls.
 * @returns {Promise<Object>} ICE servers configuration
 */
async function fetchTurnCredentials() {
  const now = Date.now();

  // Return cached credentials if still valid
  if (turnCredentialsCache && (now - turnCredentialsFetchTime) < TURN_CACHE_TTL) {
    console.log('Using cached TURN credentials');
    return turnCredentialsCache;
  }

  try {
    console.log('Fetching fresh TURN credentials...');
    const response = await fetch('/api/turn/credentials', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.iceServers && data.iceServers.length > 0) {
      // Update the ICE servers configuration
      ICE_SERVERS = {
        iceServers: data.iceServers,
        iceCandidatePoolSize: 10
      };

      // Cache the result
      turnCredentialsCache = ICE_SERVERS;
      turnCredentialsFetchTime = now;

      console.log('TURN credentials fetched successfully:', data.provider || 'unknown');
      if (data.fallback) {
        console.warn('Using fallback STUN-only configuration');
      }
    }

    return ICE_SERVERS;
  } catch (error) {
    console.error('Failed to fetch TURN credentials:', error);
    console.log('Using default STUN servers');
    return ICE_SERVERS;
  }
}

// ============================================
// SFU (Serverless Forwarding Unit) Functions
// ============================================

/**
 * Creates a new SFU session with Cloudflare Realtime.
 * @returns {Promise<{sessionId: string, peerConnection: RTCPeerConnection}>}
 */
async function createSfuSession() {
  console.log('Creating SFU session...');

  // Create a new RTCPeerConnection for the SFU
  const pc = new RTCPeerConnection(ICE_SERVERS);

  // Create initial offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Send to backend to create session
  const response = await fetch('/api/sfu/session/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      sessionDescription: {
        type: 'offer',
        sdp: pc.localDescription.sdp
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create SFU session');
  }

  const data = await response.json();

  // Set remote description from SFU
  if (data.sessionDescription) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
  }

  sfuSession = {
    sessionId: data.sessionId,
    peerConnection: pc
  };

  console.log('SFU session created:', data.sessionId);
  return sfuSession;
}

/**
 * Publishes local tracks to the SFU.
 * @param {MediaStream} stream - The local media stream to publish
 */
async function publishTracksToSfu(stream) {
  if (!sfuSession) {
    throw new Error('No SFU session');
  }

  const pc = sfuSession.peerConnection;
  const tracks = [];

  // Add tracks to peer connection
  stream.getTracks().forEach((track, index) => {
    const sender = pc.addTrack(track, stream);
    const trackName = `${state.playerId}-${track.kind}-${index}`;
    tracks.push({
      location: 'local',
      trackName: trackName,
      mid: sender.mid
    });
  });

  // Create new offer with tracks
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Push tracks to SFU
  const response = await fetch(`/api/sfu/session/${sfuSession.sessionId}/tracks/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      sessionDescription: {
        type: 'offer',
        sdp: pc.localDescription.sdp
      },
      tracks: tracks
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to publish tracks');
  }

  const data = await response.json();

  // Set remote description
  if (data.sessionDescription) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
  }

  // Save track info
  if (data.tracks) {
    data.tracks.forEach(track => {
      sfuLocalTracks.set(track.trackName, {
        trackId: track.trackId,
        mid: track.mid
      });
    });
  }

  console.log('Tracks published to SFU:', sfuLocalTracks.size);

  // Notify other players about our tracks
  send('sfu-tracks-published', {
    playerId: state.playerId,
    playerName: state.playerName,
    sessionId: sfuSession.sessionId,
    tracks: Array.from(sfuLocalTracks.entries()).map(([name, info]) => ({
      trackName: name,
      trackId: info.trackId
    }))
  });

  return data;
}

/**
 * Subscribes to remote tracks from another player via SFU.
 * @param {string} sessionId - The remote player's session ID
 * @param {Array} tracks - Array of track info to subscribe to
 */
async function subscribeToSfuTracks(sessionId, tracks) {
  if (!sfuSession) {
    console.warn('No SFU session, cannot subscribe');
    return;
  }

  const pc = sfuSession.peerConnection;

  // Add transceivers for receiving tracks
  const remoteTracks = tracks.map(track => ({
    location: 'remote',
    sessionId: sessionId,
    trackName: track.trackName
  }));

  // Request tracks from SFU
  const response = await fetch(`/api/sfu/session/${sfuSession.sessionId}/tracks/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      tracks: remoteTracks
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Failed to subscribe to tracks:', error);
    return;
  }

  const data = await response.json();

  // Renegotiate if needed
  if (data.requiresImmediateRenegotiation) {
    await renegotiateSfuSession();
  }

  console.log('Subscribed to remote tracks');
}

/**
 * Renegotiates the SFU session (for adding/removing tracks).
 */
async function renegotiateSfuSession() {
  if (!sfuSession) return;

  const pc = sfuSession.peerConnection;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch(`/api/sfu/session/${sfuSession.sessionId}/renegotiate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      sessionDescription: {
        type: 'offer',
        sdp: pc.localDescription.sdp
      }
    })
  });

  if (!response.ok) {
    console.error('Renegotiation failed');
    return;
  }

  const data = await response.json();

  if (data.sessionDescription) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sessionDescription));
  }
}

/**
 * Closes the SFU session and cleans up.
 */
async function closeSfuSession() {
  if (!sfuSession) return;

  // Close all tracks
  if (sfuLocalTracks.size > 0) {
    const trackNames = Array.from(sfuLocalTracks.keys());
    try {
      await fetch(`/api/sfu/session/${sfuSession.sessionId}/tracks/close`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tracks: trackNames.map(name => ({ trackName: name })),
          force: true
        })
      });
    } catch (e) {
      console.error('Error closing tracks:', e);
    }
  }

  // Close peer connection
  sfuSession.peerConnection.close();

  // Notify others
  send('sfu-session-closed', {
    playerId: state.playerId,
    sessionId: sfuSession.sessionId
  });

  sfuSession = null;
  sfuLocalTracks.clear();
  sfuRemoteTracks.clear();

  console.log('SFU session closed');
}

// Initialize video chat
export function initVideoChat() {
  console.log('Initializing video chat...');
  setupEventListeners();
}

// Setup event listeners for video controls
function setupEventListeners() {
  const toggleVideoBtn = document.getElementById('toggle-video-btn');
  const toggleAudioBtn = document.getElementById('toggle-audio-btn');
  const toggleCameraBtn = document.getElementById('toggle-camera-btn');
  const shareScreenBtn = document.getElementById('share-screen-btn');
  const leaveVideoBtn = document.getElementById('leave-video-btn');
  const sidebarJoinBtn = document.getElementById('sidebar-join-video-btn');

  if (toggleVideoBtn) {
    toggleVideoBtn.addEventListener('click', toggleVideo);
  }
  if (toggleAudioBtn) {
    toggleAudioBtn.addEventListener('click', toggleAudio);
  }
  if (toggleCameraBtn) {
    toggleCameraBtn.addEventListener('click', toggleCamera);
  }
  if (shareScreenBtn) {
    shareScreenBtn.addEventListener('click', toggleScreenShare);
  }
  if (leaveVideoBtn) {
    leaveVideoBtn.addEventListener('click', leaveVideo);
  }
  // Sidebar video join button
  if (sidebarJoinBtn) {
    sidebarJoinBtn.addEventListener('click', toggleVideo);
  }
}

// Toggle video on/off
export async function toggleVideo() {
  if (!isVideoActive) {
    await startVideo();
  } else {
    stopVideo();
  }
}

// Start video chat
async function startVideo() {
  try {
    // Fetch TURN credentials before starting (for better NAT traversal)
    await fetchTurnCredentials();

    const quality = VIDEO_QUALITY[currentQuality] || VIDEO_QUALITY.hd;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const effectiveQuality = isMobile ? VIDEO_QUALITY.sd : quality;

    // Request user media
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: effectiveQuality.width },
        height: { ideal: effectiveQuality.height },
        frameRate: { ideal: effectiveQuality.frameRate },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // Add local video to UI
    addLocalVideo(localStream);
    isVideoActive = true;

    // Use SFU mode for better scalability (2-8 players)
    if (sfuMode) {
      try {
        // Create SFU session
        await createSfuSession();

        // Publish our tracks to the SFU
        await publishTracksToSfu(localStream);

        // Setup track event handler for receiving remote streams
        sfuSession.peerConnection.ontrack = (event) => {
          console.log('Received track from SFU:', event.track.kind);
          // The track info will be matched with player info from WebSocket messages
          handleSfuRemoteTrack(event);
        };

        console.log('SFU video chat started successfully');
      } catch (sfuError) {
        console.error('SFU mode failed, falling back to P2P:', sfuError);
        sfuMode = false;
        // Fall through to P2P mode
      }
    }

    // P2P fallback or if SFU mode is disabled
    if (!sfuMode) {
      // Notify server that we're ready for video (P2P mode)
      send('video-ready', { playerId: state.playerId });
      console.log('P2P video chat started successfully');
    }

    // Update UI
    updateVideoControls();
    showVideoPanel();

  } catch (error) {
    console.error('Error starting video:', error);
    alert('Could not access camera/microphone: ' + error.message);
  }
}

/**
 * Handles incoming remote tracks from the SFU.
 * @param {RTCTrackEvent} event - The track event from the peer connection
 */
function handleSfuRemoteTrack(event) {
  const track = event.track;
  const streams = event.streams;

  // Get or create a MediaStream for this remote player
  // The player info will be matched via WebSocket messages
  if (streams && streams.length > 0) {
    const remoteStream = streams[0];
    const streamId = remoteStream.id;

    // Check if we already have video for this stream
    let videoWrapper = document.querySelector(`[data-stream-id="${streamId}"]`);

    if (!videoWrapper) {
      // Create placeholder - will be updated when we get player info via WebSocket
      videoWrapper = document.createElement('div');
      videoWrapper.className = 'video-wrapper';
      videoWrapper.id = `video-sfu-${streamId}`;
      videoWrapper.dataset.streamId = streamId;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = remoteStream;

      const label = document.createElement('div');
      label.className = 'video-label';
      label.textContent = 'Connecting...';

      videoWrapper.appendChild(video);
      videoWrapper.appendChild(label);

      const videoGrid = document.getElementById('video-grid');
      if (videoGrid) {
        videoGrid.appendChild(videoWrapper);
      }

      // Also add to sidebar
      addSfuRemoteToSidebar(streamId, remoteStream, 'Connecting...');
    }
  }
}

/**
 * Adds a remote SFU stream to the sidebar video grid.
 */
function addSfuRemoteToSidebar(streamId, stream, playerName) {
  const sidebarGrid = document.getElementById('sidebar-video-grid');
  if (!sidebarGrid) return;

  let thumbWrapper = document.getElementById(`sidebar-video-sfu-${streamId}`);
  if (thumbWrapper) return;

  thumbWrapper = document.createElement('div');
  thumbWrapper.className = 'sidebar-video-thumb';
  thumbWrapper.id = `sidebar-video-sfu-${streamId}`;
  thumbWrapper.style.cssText = 'position:relative; border-radius:4px; overflow:hidden; background:#1a1a1a;';

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.style.cssText = 'width:100%; height:60px; object-fit:cover;';

  const label = document.createElement('div');
  label.className = 'sidebar-video-label';
  label.style.cssText = 'position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 4px; text-align:center;';
  label.textContent = playerName;

  thumbWrapper.appendChild(video);
  thumbWrapper.appendChild(label);
  sidebarGrid.appendChild(thumbWrapper);
}

// Stop video chat
async function stopVideo() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  // Remove local video from both grids
  const localVideo = document.getElementById('video-local');
  if (localVideo) localVideo.remove();
  const sidebarLocalVideo = document.getElementById('sidebar-video-local');
  if (sidebarLocalVideo) sidebarLocalVideo.remove();

  // Close SFU session if in SFU mode
  if (sfuSession) {
    await closeSfuSession();

    // Remove all SFU remote videos
    document.querySelectorAll('[id^="video-sfu-"]').forEach(el => el.remove());
    document.querySelectorAll('[id^="sidebar-video-sfu-"]').forEach(el => el.remove());
  }

  // Close all peer connections and remove sidebar videos (P2P mode)
  peerConnections.forEach((pc, playerId) => {
    pc.close();
    const sidebarRemote = document.getElementById(`sidebar-video-${playerId}`);
    if (sidebarRemote) sidebarRemote.remove();
  });
  peerConnections.clear();

  isVideoActive = false;

  // Notify server (for P2P cleanup)
  send('video-stopped', { playerId: state.playerId });

  // Update UI
  updateVideoControls();
  hideVideoPanel();

  // Update sidebar button
  const sidebarBtn = document.getElementById('sidebar-join-video-btn');
  if (sidebarBtn) sidebarBtn.textContent = 'Join';

  console.log('Video chat stopped');
}

// Toggle audio mute
function toggleAudio() {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isMicMuted = !audioTrack.enabled;
    updateVideoControls();
  }
}

// Toggle camera on/off
function toggleCamera() {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isVideoMuted = !videoTrack.enabled;
    updateVideoControls();
  }
}

// Toggle screen share
async function toggleScreenShare() {
  if (!screenStream) {
    await startScreenShare();
  } else {
    stopScreenShare();
  }
}

// Start screen sharing
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: false
    });

    const videoTrack = screenStream.getVideoTracks()[0];

    // Replace video track in all peer connections
    peerConnections.forEach((pc) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
    });

    // Update local video
    const localVideo = document.querySelector('#video-local video');
    if (localVideo) {
      localVideo.srcObject = screenStream;
    }

    // When screen sharing stops
    videoTrack.onended = () => {
      stopScreenShare();
    };

    updateVideoControls();
    console.log('Screen sharing started');
  } catch (error) {
    console.error('Error starting screen share:', error);
    if (error.name !== 'NotAllowedError') {
      alert('Could not start screen sharing: ' + error.message);
    }
  }
}

// Stop screen sharing
function stopScreenShare() {
  if (!screenStream) return;

  screenStream.getTracks().forEach(track => track.stop());
  screenStream = null;

  // Restore camera in peer connections
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];

    peerConnections.forEach((pc) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
    });

    // Update local video
    const localVideo = document.querySelector('#video-local video');
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
  }

  updateVideoControls();
  console.log('Screen sharing stopped');
}

// Leave video chat
function leaveVideo() {
  stopVideo();
}

// Handle incoming WebRTC signaling messages
export async function handleWebRTCMessage(message) {
  switch (message.type) {
    // SFU mode messages
    case 'SFU_TRACKS_PUBLISHED':
      await handleSfuTracksPublished(message.payload);
      break;
    case 'SFU_SESSION_CLOSED':
      handleSfuSessionClosed(message.payload);
      break;

    // P2P mode messages
    case 'PEER_JOINED':
      await handlePeerJoined(message.payload);
      break;
    case 'PEER_LEFT':
      handlePeerLeft(message.payload);
      break;
    case 'EXISTING_VIDEO_PEERS':
      // When we join, we receive a list of existing video participants
      // We should create connections to each of them (they will also connect to us)
      await handleExistingPeers(message.payload);
      break;
    case 'WEBRTC_OFFER':
      await handleOffer(message.payload);
      break;
    case 'WEBRTC_ANSWER':
      await handleAnswer(message.payload);
      break;
    case 'WEBRTC_ICE':
      await handleIceCandidate(message.payload);
      break;
  }
}

/**
 * Handles notification that another player published tracks to the SFU.
 * @param {Object} payload - Contains playerId, playerName, sessionId, tracks
 */
async function handleSfuTracksPublished(payload) {
  const { playerId, playerName, sessionId, tracks } = payload;

  // Don't subscribe to our own tracks
  if (playerId === state.playerId) return;

  console.log(`Player ${playerName} published ${tracks.length} tracks to SFU`);

  // Store track info for labeling videos later
  tracks.forEach(track => {
    sfuRemoteTracks.set(track.trackId, {
      playerId,
      playerName,
      trackName: track.trackName
    });
  });

  // Subscribe to their tracks if we have an active session
  if (sfuSession && isVideoActive) {
    await subscribeToSfuTracks(sessionId, tracks);
  }
}

/**
 * Handles notification that another player closed their SFU session.
 * @param {Object} payload - Contains playerId, sessionId
 */
function handleSfuSessionClosed(payload) {
  const { playerId, sessionId } = payload;

  console.log(`Player ${playerId} closed SFU session`);

  // Remove their remote tracks from our tracking
  for (const [trackId, info] of sfuRemoteTracks.entries()) {
    if (info.playerId === playerId) {
      sfuRemoteTracks.delete(trackId);
    }
  }

  // Remove their video elements
  document.querySelectorAll(`[data-player-id="${playerId}"]`).forEach(el => el.remove());
}

// Handle list of existing video peers when we join
async function handleExistingPeers(payload) {
  const { peers } = payload;
  if (!Array.isArray(peers) || !localStream || !isVideoActive) return;

  console.log(`Received ${peers.length} existing video peers`);

  // Connect to each existing peer
  for (const peer of peers) {
    if (peer && peer.playerId !== state.playerId) {
      console.log(`Connecting to existing peer: ${peer.playerName} (${peer.playerId})`);
      await createPeerConnection(peer.playerId, peer.playerName, true);
    }
  }
}

// Handle peer joined
async function handlePeerJoined(payload) {
  const { playerId, playerName } = payload;

  // Don't connect to ourselves
  if (playerId === state.playerId) return;

  console.log(`Peer joined: ${playerName} (${playerId})`);

  // If we have video active, create offer
  if (localStream && isVideoActive) {
    await createPeerConnection(playerId, playerName, true);
  }
}

// Handle peer left
function handlePeerLeft(payload) {
  const { playerId, playerName } = payload;

  console.log(`Peer left: ${playerName} (${playerId})`);

  // Close peer connection
  const pc = peerConnections.get(playerId);
  if (pc) {
    pc.close();
    peerConnections.delete(playerId);
  }

  // Remove video element
  const videoElement = document.getElementById(`video-${playerId}`);
  if (videoElement) {
    videoElement.remove();
  }
}

// Create peer connection
async function createPeerConnection(playerId, playerName, createOffer = false) {
  if (peerConnections.has(playerId)) {
    console.log(`Peer connection already exists for ${playerId}`);
    return peerConnections.get(playerId);
  }

  const pc = new RTCPeerConnection(ICE_SERVERS);

  // Add local tracks
  if (localStream) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    localStream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, localStream);

      // Apply bandwidth limitations on mobile
      if (isMobile && track.kind === 'video') {
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
          parameters.encodings = [{}];
        }
        parameters.encodings[0].maxBitrate = 500000;
        sender.setParameters(parameters).catch(err =>
          console.error('Failed to set parameters:', err)
        );
      }
    });
  }

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      send('webrtc-ice', {
        targetPlayerId: playerId,
        candidate: event.candidate
      });
    }
  };

  // Handle remote stream
  pc.ontrack = (event) => {
    console.log(`Received remote track from ${playerName}`);
    const remoteStream = event.streams[0];
    addRemoteVideo(playerId, playerName, remoteStream);
  };

  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${playerName}: ${pc.connectionState}`);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      handlePeerLeft({ playerId, playerName });
    }
  };

  peerConnections.set(playerId, pc);

  // Create offer if we're the initiator
  if (createOffer) {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);

      send('webrtc-offer', {
        targetPlayerId: playerId,
        offer: offer
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  return pc;
}

// Handle offer
async function handleOffer(payload) {
  const { fromPlayerId, fromPlayerName, offer } = payload;

  console.log(`Received offer from ${fromPlayerName}`);

  const pc = await createPeerConnection(fromPlayerId, fromPlayerName, false);

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    send('webrtc-answer', {
      targetPlayerId: fromPlayerId,
      answer: answer
    });
  } catch (error) {
    console.error('Error handling offer:', error);
  }
}

// Handle answer
async function handleAnswer(payload) {
  const { fromPlayerId, fromPlayerName, answer } = payload;

  console.log(`Received answer from ${fromPlayerName}`);

  const pc = peerConnections.get(fromPlayerId);
  if (pc) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
}

// Handle ICE candidate
async function handleIceCandidate(payload) {
  const { fromPlayerId, candidate } = payload;

  const pc = peerConnections.get(fromPlayerId);
  if (pc) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
}

// Add local video to UI
function addLocalVideo(stream) {
  // Add to main video grid
  const videoGrid = document.getElementById('video-grid');
  if (videoGrid) {
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-wrapper';
    videoWrapper.id = 'video-local';

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true; // Mute local audio to prevent feedback
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = 'You';

    videoWrapper.appendChild(video);
    videoWrapper.appendChild(label);
    videoGrid.appendChild(videoWrapper);
  }

  // Also add to sidebar video grid
  const sidebarGrid = document.getElementById('sidebar-video-grid');
  if (sidebarGrid) {
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'sidebar-video-thumb';
    thumbWrapper.id = 'sidebar-video-local';
    thumbWrapper.style.cssText = 'position:relative; border-radius:4px; overflow:hidden; background:#1a1a1a;';

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.style.cssText = 'width:100%; height:60px; object-fit:cover;';

    const label = document.createElement('div');
    label.style.cssText = 'position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 4px; text-align:center;';
    label.textContent = 'You';

    thumbWrapper.appendChild(video);
    thumbWrapper.appendChild(label);
    sidebarGrid.appendChild(thumbWrapper);
  }

  // Update sidebar button
  const sidebarBtn = document.getElementById('sidebar-join-video-btn');
  if (sidebarBtn) sidebarBtn.textContent = 'Leave';
}

// Add remote video to UI
function addRemoteVideo(playerId, playerName, stream) {
  // Add to main video grid
  const videoGrid = document.getElementById('video-grid');
  if (videoGrid) {
    // Remove existing video if any
    let videoWrapper = document.getElementById(`video-${playerId}`);
    if (videoWrapper) {
      videoWrapper.remove();
    }

    videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-wrapper';
    videoWrapper.id = `video-${playerId}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = playerName;

    videoWrapper.appendChild(video);
    videoWrapper.appendChild(label);
    videoGrid.appendChild(videoWrapper);
  }

  // Also add to sidebar video grid
  const sidebarGrid = document.getElementById('sidebar-video-grid');
  if (sidebarGrid) {
    let thumbWrapper = document.getElementById(`sidebar-video-${playerId}`);
    if (thumbWrapper) thumbWrapper.remove();

    thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'sidebar-video-thumb';
    thumbWrapper.id = `sidebar-video-${playerId}`;
    thumbWrapper.style.cssText = 'position:relative; border-radius:4px; overflow:hidden; background:#1a1a1a;';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.style.cssText = 'width:100%; height:60px; object-fit:cover;';

    const label = document.createElement('div');
    label.style.cssText = 'position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 4px; text-align:center;';
    label.textContent = playerName;

    thumbWrapper.appendChild(video);
    thumbWrapper.appendChild(label);
    sidebarGrid.appendChild(thumbWrapper);
  }
}

// Update video control buttons
function updateVideoControls() {
  const toggleVideoBtn = document.getElementById('toggle-video-btn');
  const toggleAudioBtn = document.getElementById('toggle-audio-btn');
  const toggleCameraBtn = document.getElementById('toggle-camera-btn');
  const shareScreenBtn = document.getElementById('share-screen-btn');

  if (toggleVideoBtn) {
    toggleVideoBtn.textContent = isVideoActive ? 'Leave Video' : 'Join Video';
    toggleVideoBtn.className = isVideoActive ? 'btn-video active' : 'btn-video';
  }

  if (toggleAudioBtn) {
    toggleAudioBtn.textContent = isMicMuted ? 'Unmute Mic' : 'Mute Mic';
    toggleAudioBtn.disabled = !isVideoActive;
    toggleAudioBtn.className = isMicMuted ? 'btn-video danger' : 'btn-video';
  }

  if (toggleCameraBtn) {
    toggleCameraBtn.textContent = isVideoMuted ? 'Turn On Camera' : 'Turn Off Camera';
    toggleCameraBtn.disabled = !isVideoActive;
    toggleCameraBtn.className = isVideoMuted ? 'btn-video danger' : 'btn-video';
  }

  if (shareScreenBtn) {
    shareScreenBtn.textContent = screenStream ? 'Stop Sharing' : 'Share Screen';
    shareScreenBtn.disabled = !isVideoActive;
    shareScreenBtn.className = screenStream ? 'btn-video active' : 'btn-video';
  }
}

// Show video panel
function showVideoPanel() {
  const videoPanel = document.getElementById('video-panel');
  if (videoPanel) {
    videoPanel.style.display = 'flex';
  }
}

// Hide video panel (only hide when no videos)
function hideVideoPanel() {
  const videoGrid = document.getElementById('video-grid');
  if (videoGrid && videoGrid.children.length === 0) {
    const videoPanel = document.getElementById('video-panel');
    if (videoPanel) {
      videoPanel.style.display = 'none';
    }
  }
}

// Export state getters
export function isVideoChatActive() {
  return isVideoActive;
}

export function getActivePeers() {
  return Array.from(peerConnections.keys());
}
