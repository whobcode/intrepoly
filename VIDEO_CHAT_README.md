# WebRTC Video Chat Implementation

## Overview

This implementation adds peer-to-peer video chat functionality to the multiplayer Monopoly game, allowing 2-8 players in the same game room to see and hear each other while playing.

## Architecture

### Client-Side Components

**1. `/public/js/video-chat.js`**
- WebRTC peer connection management
- Local media stream handling (camera/microphone)
- Screen sharing functionality
- ICE candidate exchange
- Video quality management
- UI control handlers

**2. Video Chat UI in `/public/index.html`**
- Floating video panel (top-right corner)
- Video grid for displaying participants
- Control buttons: Join/Leave, Mute/Unmute, Camera On/Off, Screen Share
- Responsive design for mobile and desktop
- Minimize/restore functionality

**3. CSS Styles (inline in index.html)**
- Dark-themed video panel
- Responsive grid layout
- Button states (active, disabled, danger)
- Mobile optimizations

### Server-Side Components

**1. `/src/game.ts` - WebRTC Signaling**

Added methods:
- `handleVideoReady(playerId)` - Broadcasts when player joins video
- `handleVideoStopped(playerId)` - Broadcasts when player leaves video
- `relayWebRTCMessage(type, fromPlayerId, payload)` - Relays signaling between peers
- `broadcastToOthers(message, excludePlayerId)` - Selective broadcast helper

Message types handled:
- `video-ready` - Player ready for video connections
- `video-stopped` - Player stopped video
- `webrtc-offer` - SDP offer for peer connection
- `webrtc-answer` - SDP answer for peer connection
- `webrtc-ice` - ICE candidate exchange

### WebRTC Flow

1. **Player A joins video:**
   - Requests camera/microphone permissions
   - Sends `video-ready` message to server
   - Server broadcasts `PEER_JOINED` to all other players

2. **Player B receives peer joined notification:**
   - If Player B has video active, creates RTCPeerConnection
   - Generates SDP offer
   - Sends `webrtc-offer` to server for Player A

3. **Player A receives offer:**
   - Creates RTCPeerConnection
   - Sets remote description (offer)
   - Generates SDP answer
   - Sends `webrtc-answer` to server for Player B

4. **ICE Candidate Exchange:**
   - Both peers gather ICE candidates
   - Send `webrtc-ice` messages through server
   - Server relays candidates between peers

5. **Connection Established:**
   - Peers exchange media streams
   - Video/audio rendered in UI

## Features

### Core Features
- ✅ Peer-to-peer video connections (no media server required)
- ✅ Audio chat with echo cancellation and noise suppression
- ✅ Mute/unmute microphone
- ✅ Turn camera on/off (video pausing)
- ✅ Screen sharing
- ✅ Automatic connection to new players
- ✅ Graceful disconnect handling

### Quality Features
- ✅ Adaptive video quality (SD/HD/FHD)
- ✅ Mobile-optimized bitrates (500kbps on mobile)
- ✅ Automatic quality downgrade on mobile devices
- ✅ Multiple STUN servers for better connectivity

### UI Features
- ✅ Floating video panel (non-intrusive)
- ✅ Responsive grid layout (1-8 players)
- ✅ Player name labels on videos
- ✅ Visual indicators for muted audio/video
- ✅ Minimize/restore panel
- ✅ Mobile-responsive design

## Usage

### For Players

**1. Join Video Chat:**
- Click "Join Video" button in the video panel
- Allow camera/microphone permissions
- Your video appears first in the grid

**2. Controls:**
- **Mute Mic**: Disable/enable your microphone
- **Camera Off**: Pause/resume your video
- **Share Screen**: Share your screen instead of camera
- **Join Video** (when active): Leave video chat

**3. Automatic Connections:**
- When other players join video, their streams appear automatically
- When players leave, their videos are removed

### For Developers

**1. Testing Locally:**
```bash
# Start the development server
npm run dev

# Open multiple browser windows
# Navigate to the same game URL in each
# Click "Join Video" in each window
```

**2. Integration Points:**

Import video chat in your module:
```javascript
import { initVideoChat, handleWebRTCMessage } from './video-chat.js';

// Initialize on page load
initVideoChat();

// Handle WebRTC messages in your state handler
if (message.type.startsWith('PEER_') || message.type.startsWith('WEBRTC_')) {
  handleWebRTCMessage(message);
}
```

**3. Configuration:**

Adjust video quality in `/public/js/video-chat.js`:
```javascript
const VIDEO_QUALITY = {
  sd: { width: 640, height: 480, frameRate: 15, bitrate: 300000 },
  hd: { width: 1280, height: 720, frameRate: 24, bitrate: 800000 },
  fhd: { width: 1920, height: 1080, frameRate: 30, bitrate: 2000000 }
};
```

Add custom TURN servers (for NAT traversal):
```javascript
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'username',
      credential: 'password'
    }
  ]
};
```

## Browser Compatibility

### Supported Browsers:
- ✅ Chrome/Edge 89+ (Desktop & Mobile)
- ✅ Firefox 88+ (Desktop & Mobile)
- ✅ Safari 15+ (Desktop & iOS)
- ✅ Opera 75+

### Required Permissions:
- Camera access
- Microphone access
- Screen capture (for screen sharing)

### HTTPS Requirement:
WebRTC requires HTTPS for getUserMedia(). The app must be served over HTTPS in production.

## Troubleshooting

### Common Issues:

**1. "Camera not accessible" error:**
- Check browser permissions
- Ensure no other app is using the camera
- Try refreshing the page
- Check if HTTPS is enabled

**2. No video from other players:**
- Check network connectivity
- Ensure both peers have video active
- Check browser console for WebRTC errors
- Try using a TURN server if behind restrictive NAT

**3. Poor video quality:**
- Check network bandwidth
- Switch to SD quality on mobile
- Close other bandwidth-intensive apps
- Consider using audio-only mode

**4. Connection fails:**
- Both peers need compatible browsers
- May need TURN server for certain network configurations
- Check firewall settings
- Verify WebSocket connection is stable

### Debug Mode:

Open browser console to see WebRTC logs:
```javascript
// Check active peer connections
console.log('Active peers:', window.__state);

// Monitor ICE connection states
// Look for logs like: "Connection state with Player1: connected"
```

## Security Considerations

### Privacy:
- Video streams are peer-to-peer (not stored on server)
- Server only relays signaling messages
- Players can opt-out anytime
- No recording functionality (by design)

### Network Security:
- STUN servers are used for NAT traversal only
- No media data passes through STUN servers
- Consider using authenticated TURN servers in production
- All signaling goes through existing WebSocket connection

## Performance Optimization

### Mobile Devices:
- Automatic SD quality (640x480@15fps)
- Reduced bitrate (500kbps)
- Efficient video codec negotiation
- Optimized grid layout

### Desktop:
- HD quality by default (1280x720@24fps)
- Higher bitrate (800kbps)
- Support for up to 8 simultaneous streams
- Hardware acceleration enabled

### Network:
- Multiple STUN servers for redundancy
- Adaptive bitrate based on network conditions
- Efficient ICE candidate gathering
- Quick reconnection on connection drop

## Future Enhancements

Possible improvements:
- [ ] Audio-only mode
- [ ] Picture-in-picture support
- [ ] Virtual backgrounds
- [ ] Noise cancellation improvements
- [ ] Recording functionality
- [ ] Chat reactions during video
- [ ] Bandwidth usage monitoring
- [ ] Automatic quality adjustment based on network

## Credits

WebRTC implementation based on patterns from the Ollama chat application, adapted for the Monopoly game context.

## License

Part of the intrepoly (Monopoly on Cloudflare Workers) project.
