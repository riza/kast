// Package listener tracks unique IPs actively fetching HLS segments per mount.
package listener

import (
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"

	"github.com/phuslu/iploc"
)

// Entry is a snapshot of a single active listener.
type Entry struct {
	IP          string    `json:"ip"`
	Mount       string    `json:"mount"`
	LastSeen    time.Time `json:"last_seen"`
	CountryCode string    `json:"country_code"`
	UserAgent   string    `json:"user_agent"`
}

type listenerData struct {
	lastSeen  time.Time
	userAgent string
}

// Tracker counts unique IPs per mount with a sliding TTL window.
type Tracker struct {
	mu      sync.Mutex
	entries map[string]map[string]listenerData // mountName → IP → data
	ttl     time.Duration
}

// New returns a Tracker with the given TTL.
func New(ttl time.Duration) *Tracker {
	return &Tracker{
		entries: make(map[string]map[string]listenerData),
		ttl:     ttl,
	}
}

// Touch records a request from ip on mountName and returns the current count.
func (lt *Tracker) Touch(mountName, ip, userAgent string) int {
	n, _ := lt.TouchDebug(mountName, ip, userAgent)
	return n
}

// TouchDebug records a request and also returns all current IP keys for debugging.
func (lt *Tracker) TouchDebug(mountName, ip, userAgent string) (int, []string) {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		slog.Error("listener: invalid IP in TouchDebug — guard bug",
			"ip", ip, "ip_hex", fmt.Sprintf("%x", ip), "mount", mountName)
		lt.mu.Lock()
		keys := lt.snapshotKeys(mountName)
		n := len(lt.entries[mountName])
		lt.mu.Unlock()
		return n, keys
	}
	normalIP := parsed.String()
	if normalIP != ip {
		slog.Warn("listener: IP normalized",
			"raw", ip, "raw_hex", fmt.Sprintf("%x", ip), "normalized", normalIP, "mount", mountName)
	}
	lt.mu.Lock()
	defer lt.mu.Unlock()
	if lt.entries[mountName] == nil {
		lt.entries[mountName] = make(map[string]listenerData)
	}
	lt.entries[mountName][normalIP] = listenerData{lastSeen: time.Now(), userAgent: userAgent}
	cutoff := time.Now().Add(-lt.ttl)
	for k, v := range lt.entries[mountName] {
		if v.lastSeen.Before(cutoff) {
			delete(lt.entries[mountName], k)
		}
	}
	return len(lt.entries[mountName]), lt.snapshotKeys(mountName)
}

// All returns every active listener across all mounts, expiring stale entries.
func (lt *Tracker) All() []Entry {
	lt.mu.Lock()
	defer lt.mu.Unlock()
	cutoff := time.Now().Add(-lt.ttl)
	var out []Entry
	for mount, ips := range lt.entries {
		for ip, d := range ips {
			if d.lastSeen.Before(cutoff) {
				delete(ips, ip)
				continue
			}
			parsed := net.ParseIP(ip)
			if parsed == nil {
				slog.Error("listener: invalid IP key found — evicting",
					"ip", ip, "ip_hex", fmt.Sprintf("%x", ip), "mount", mount)
				delete(ips, ip)
				continue
			}
			e := Entry{IP: ip, Mount: mount, LastSeen: d.lastSeen, UserAgent: d.userAgent}
			e.CountryCode = iploc.Country(parsed)
			out = append(out, e)
		}
	}
	return out
}

// Sweep expires stale entries and returns a map of mountName → current count.
func (lt *Tracker) Sweep() map[string]int {
	lt.mu.Lock()
	defer lt.mu.Unlock()
	cutoff := time.Now().Add(-lt.ttl)
	counts := make(map[string]int, len(lt.entries))
	for mount, ips := range lt.entries {
		for k, v := range ips {
			if v.lastSeen.Before(cutoff) {
				delete(ips, k)
				continue
			}
			if net.ParseIP(k) == nil {
				slog.Error("listener: invalid IP key in sweep — evicting",
					"ip", k, "ip_hex", fmt.Sprintf("%x", k), "mount", mount)
				delete(ips, k)
				continue
			}
		}
		counts[mount] = len(ips)
	}
	return counts
}

// snapshotKeys returns all current keys for mountName; must be called with lt.mu held.
func (lt *Tracker) snapshotKeys(mountName string) []string {
	keys := make([]string, 0, len(lt.entries[mountName]))
	for k := range lt.entries[mountName] {
		keys = append(keys, k)
	}
	return keys
}
