// Package webrtcmanager implements WHEP (WebRTC HTTP Egress Protocol) for Kast.
//
// Each active AutoDJ mount gets an RTP listener on a dynamic UDP port.
// ffmpeg writes Opus RTP to that port; the manager reads packets and fans
// them out to every subscribed browser peer via pion/webrtc.
package webrtcmanager

import (
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v3"
)

// Config holds optional WebRTC settings.
type Config struct {
	// NATIPs maps the server's private IP(s) to their public counterparts.
	// Required when running behind NAT or inside Docker. Example: ["1.2.3.4"].
	NATIPs []string
	// UDPPortMin/UDPPortMax constrain the ICE UDP ephemeral port range.
	// Both must be > 0 and exposed via Docker/firewall for remote WebRTC.
	UDPPortMin uint16
	UDPPortMax uint16
}

// peerEntry holds one browser WebRTC connection and the sender RTP track.
type peerEntry struct {
	pc    *webrtc.PeerConnection
	track *webrtc.TrackLocalStaticRTP
	once  sync.Once
}

// mountState holds the shared RTP track and all connected peers for one mount.
type mountState struct {
	mu    sync.Mutex
	track *webrtc.TrackLocalStaticRTP
	peers []*peerEntry
	conn  *net.UDPConn
}

func (ms *mountState) removePeer(target *peerEntry) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	for i, e := range ms.peers {
		if e == target {
			ms.peers = append(ms.peers[:i], ms.peers[i+1:]...)
			return
		}
	}
}

// Manager manages WebRTC WHEP sessions per mount.
type Manager struct {
	mu     sync.Mutex
	mounts map[string]*mountState
	api    *webrtc.API
}

// New returns a Manager ready to accept mounts and WHEP peers.
func New(cfg Config) *Manager {
	me := &webrtc.MediaEngine{}
	// Register Opus as the sole audio codec (payload type 111, standard for WebRTC).
	if err := me.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{
			MimeType:    webrtc.MimeTypeOpus,
			ClockRate:   48000,
			Channels:    2,
			SDPFmtpLine: "minptime=10;useinbandfec=1",
		},
		PayloadType: 111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		panic("webrtcmanager: register opus codec: " + err.Error())
	}

	se := webrtc.SettingEngine{}

	// Map private → public IPs so ICE candidates are reachable through NAT/Docker.
	if len(cfg.NATIPs) > 0 {
		se.SetNAT1To1IPs(cfg.NATIPs, webrtc.ICECandidateTypeHost)
		slog.Info("webrtc: NAT1To1 IPs configured", "ips", cfg.NATIPs)
	}

	// Limit UDP ephemeral ports so they can be explicitly exposed in Docker/firewall.
	if cfg.UDPPortMin > 0 && cfg.UDPPortMax > cfg.UDPPortMin {
		if err := se.SetEphemeralUDPPortRange(cfg.UDPPortMin, cfg.UDPPortMax); err != nil {
			slog.Warn("webrtc: invalid UDP port range, using system default",
				"min", cfg.UDPPortMin, "max", cfg.UDPPortMax, "err", err)
		} else {
			slog.Info("webrtc: UDP port range configured",
				"min", cfg.UDPPortMin, "max", cfg.UDPPortMax)
		}
	}

	return &Manager{
		mounts: make(map[string]*mountState),
		api:    webrtc.NewAPI(webrtc.WithMediaEngine(me), webrtc.WithSettingEngine(se)),
	}
}

// AllocatePort binds a dynamic UDP port for a mount's RTP input and returns
// the port number. Call this before starting the ffmpeg process so the port
// can be embedded in the RTP output URL. Returns 0 and an error on failure.
func (m *Manager) AllocatePort(mountName string) (int, error) {
	// If a previous session exists for this mount, clean it up first.
	m.StopMount(mountName)

	track, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{
			MimeType:  webrtc.MimeTypeOpus,
			ClockRate: 48000,
			Channels:  2,
		},
		"audio",
		"kast-"+sanitize(mountName),
	)
	if err != nil {
		return 0, fmt.Errorf("webrtcmanager: create track for %s: %w", mountName, err)
	}

	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		return 0, fmt.Errorf("webrtcmanager: listen udp for %s: %w", mountName, err)
	}

	port := conn.LocalAddr().(*net.UDPAddr).Port

	ms := &mountState{track: track, conn: conn}
	m.mu.Lock()
	m.mounts[mountName] = ms
	m.mu.Unlock()

	// Forward incoming RTP packets to all connected peers.
	go m.relayRTP(mountName, ms, conn)

	slog.Info("webrtc: rtp listener ready", "mount", mountName, "port", port)
	return port, nil
}

// relayRTP reads UDP packets from conn and writes them to the shared track.
func (m *Manager) relayRTP(mountName string, ms *mountState, conn *net.UDPConn) {
	buf := make([]byte, 1500)
	pkt := &rtp.Packet{}
	for {
		n, _, err := conn.ReadFromUDP(buf)
		if err != nil {
			// conn closed → normal shutdown
			return
		}
		if err := pkt.Unmarshal(buf[:n]); err != nil {
			continue
		}
		if _, err := ms.track.Write(buf[:n]); err != nil {
			// All peers disconnected or mount stopped.
			slog.Debug("webrtc: track write error", "mount", mountName, "err", err)
		}
	}
}

// AddPeer handles a WHEP offer: creates a PeerConnection wired to the mount's
// shared audio track and returns the SDP answer. Returns an error if the mount
// is not currently active.
func (m *Manager) AddPeer(mountName, offerSDP string) (string, error) {
	m.mu.Lock()
	ms, ok := m.mounts[mountName]
	m.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("webrtcmanager: no active stream for mount %q", mountName)
	}

	pc, err := m.api.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	})
	if err != nil {
		return "", fmt.Errorf("webrtcmanager: new peer connection: %w", err)
	}

	entry := &peerEntry{pc: pc, track: ms.track}

	// Register the ICE state callback before any descriptions are set so we
	// never miss an early state change.
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		slog.Debug("webrtc: ice state", "mount", mountName, "state", state)
		switch state {
		case webrtc.ICEConnectionStateConnected, webrtc.ICEConnectionStateCompleted:
			slog.Info("webrtc: peer ice connected", "mount", mountName)
		case webrtc.ICEConnectionStateFailed:
			// ICEConnectionStateFailed is terminal — all candidate pairs exhausted.
			// ICEConnectionStateDisconnected is transient; pion retries automatically.
			entry.once.Do(func() {
				ms.removePeer(entry)
				pc.Close()
				slog.Info("webrtc: peer disconnected", "mount", mountName)
			})
		case webrtc.ICEConnectionStateClosed:
			// Triggered when pc.Close() is called (e.g. from StopMount).
			entry.once.Do(func() {
				ms.removePeer(entry)
				slog.Info("webrtc: peer disconnected", "mount", mountName)
			})
		}
	})

	if _, err := pc.AddTrack(ms.track); err != nil {
		pc.Close()
		return "", fmt.Errorf("webrtcmanager: add track: %w", err)
	}

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}); err != nil {
		pc.Close()
		return "", fmt.Errorf("webrtcmanager: set remote description: %w", err)
	}

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return "", fmt.Errorf("webrtcmanager: create answer: %w", err)
	}

	// Wait for ICE gathering — but cap it so the HTTP response isn't blocked
	// forever if Google STUN is unreachable. Host candidates are enough for
	// local/LAN use; STUN adds reflexive candidates for NAT traversal.
	gathered := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return "", fmt.Errorf("webrtcmanager: set local description: %w", err)
	}
	select {
	case <-gathered:
	case <-time.After(5 * time.Second):
		slog.Debug("webrtc: ice gathering timeout, proceeding with partial candidates")
	}

	ms.mu.Lock()
	ms.peers = append(ms.peers, entry)
	ms.mu.Unlock()

	slog.Info("webrtc: peer whep connected", "mount", mountName)
	return pc.LocalDescription().SDP, nil
}

// StopMount tears down all peers and the RTP listener for a mount.
func (m *Manager) StopMount(mountName string) {
	m.mu.Lock()
	ms, ok := m.mounts[mountName]
	if ok {
		delete(m.mounts, mountName)
	}
	m.mu.Unlock()
	if !ok {
		return
	}

	ms.conn.Close()

	ms.mu.Lock()
	peers := ms.peers
	ms.peers = nil
	ms.mu.Unlock()

	for _, e := range peers {
		e.pc.Close()
	}
	slog.Info("webrtc: mount stopped", "mount", mountName)
}

// StopAll tears down every active mount. Call on graceful shutdown.
func (m *Manager) StopAll() {
	m.mu.Lock()
	names := make([]string, 0, len(m.mounts))
	for n := range m.mounts {
		names = append(names, n)
	}
	m.mu.Unlock()
	for _, n := range names {
		m.StopMount(n)
	}
}

// sanitize strips the leading slash from a mount name for use as a stream ID.
func sanitize(name string) string {
	if len(name) > 0 && name[0] == '/' {
		return name[1:]
	}
	return name
}
