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

// Video quality presets optimized for Monopoly game
const VIDEO_QUALITY = {
  sd: { width: 640, height: 480, frameRate: 15, bitrate: 300000 },
  hd: { width: 1280, height: 720, frameRate: 24, bitrate: 800000 },
  fhd: { width: 1920, height: 1080, frameRate: 30, bitrate: 2000000 }
};

// ICE servers configuration (using public STUN servers)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

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

    // Notify server that we're ready for video
    send('video-ready', { playerId: state.playerId });

    // Update UI
    updateVideoControls();
    showVideoPanel();

    console.log('Video chat started successfully');
  } catch (error) {
    console.error('Error starting video:', error);
    alert('Could not access camera/microphone: ' + error.message);
  }
}

// Stop video chat
function stopVideo() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  // Remove local video
  const localVideo = document.getElementById('video-local');
  if (localVideo) {
    localVideo.remove();
  }

  // Close all peer connections
  peerConnections.forEach((pc) => {
    pc.close();
  });
  peerConnections.clear();

  isVideoActive = false;

  // Notify server
  send('video-stopped', { playerId: state.playerId });

  // Update UI
  updateVideoControls();
  hideVideoPanel();

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
    case 'PEER_JOINED':
      await handlePeerJoined(message.payload);
      break;
    case 'PEER_LEFT':
      handlePeerLeft(message.payload);
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
  const videoGrid = document.getElementById('video-grid');
  if (!videoGrid) return;

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
  label.textContent = 'You (Local)';

  videoWrapper.appendChild(video);
  videoWrapper.appendChild(label);
  videoGrid.appendChild(videoWrapper);
}

// Add remote video to UI
function addRemoteVideo(playerId, playerName, stream) {
  const videoGrid = document.getElementById('video-grid');
  if (!videoGrid) return;

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
