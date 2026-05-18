package schedule

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/riza/kast/internal/autodj"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/playlist"
	"github.com/riza/kast/internal/webhook"
)

// tickInterval is how often the runner reconciles djmanager state against the
// schedule set. 5s matches the listener-sweep ticker and bounds edge-of-window
// latency to ~5 seconds.
const tickInterval = 5 * time.Second

// djStarter is the subset of djmanager.Manager the runner needs. Defined as
// an interface so tests can supply a fake without spinning up ffmpeg.
type djStarter interface {
	Start(ctx context.Context, mountName string, playlistID string, startFromPath string, onTrackChange func(path string), tracks []*library.Track, mode autodj.Mode, crossfadeMs int) error
	Stop(mountName string) error
	GetSession(mountName string) *djmanager.SessionInfo
}

// trackProvider returns the current library tracks. Scanner satisfies this.
type trackProvider interface {
	Tracks() []*library.Track
}

// Runner drives schedules: every tickInterval it computes the desired
// (mount → schedule) assignment for the current minute and reconciles the
// djmanager state accordingly.
//
// Ownership model: the runner only stops sessions it started. A mount with no
// recorded assignment is treated as "manual" and left alone unless a schedule's
// active window covers it — in which case the schedule replaces it (per the
// product decision to favour scheduled content during scheduled hours).
type Runner struct {
	schedules *Manager
	dj        djStarter
	playlists *playlist.Manager
	scanner   trackProvider
	webhooks  *webhook.Manager
	loc       *time.Location

	mu         sync.Mutex
	assignment map[string]string // mountName → scheduleID
}

// NewRunner builds a Runner. tz must be a valid IANA name (already validated
// by config). On invalid tz the runner falls back to UTC with a warning so a
// misconfiguration cannot crash the server.
func NewRunner(
	schedules *Manager,
	dj *djmanager.Manager,
	playlists *playlist.Manager,
	scanner *library.Scanner,
	webhooks *webhook.Manager,
	tz string,
) *Runner {
	loc, err := time.LoadLocation(tz)
	if err != nil || loc == nil {
		slog.Warn("schedule: invalid timezone, falling back to UTC", "tz", tz, "err", err)
		loc = time.UTC
	}
	return &Runner{
		schedules:  schedules,
		dj:         dj,
		playlists:  playlists,
		scanner:    scanner,
		webhooks:   webhooks,
		loc:        loc,
		assignment: make(map[string]string),
	}
}

// Run blocks until ctx is cancelled, ticking every tickInterval.
func (r *Runner) Run(ctx context.Context) {
	slog.Info("schedule: runner started", "tz", r.loc.String(), "tick", tickInterval)
	// Fire once immediately so newly-active schedules are picked up without
	// waiting a full tick (mostly relevant on boot after djm.Restore).
	r.tick(time.Now().In(r.loc))

	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("schedule: runner stopped")
			return
		case t := <-ticker.C:
			r.tick(t.In(r.loc))
		}
	}
}

// tick reconciles djmanager state against the schedule set at the given
// instant (already in the runner's timezone).
func (r *Runner) tick(now time.Time) {
	desired := r.desiredAssignments(now)

	r.mu.Lock()
	current := make(map[string]string, len(r.assignment))
	for k, v := range r.assignment {
		current[k] = v
	}
	r.mu.Unlock()

	// 1. Start or replace where desired differs from current.
	for mount, sched := range desired {
		if current[mount] == sched.ID {
			continue
		}
		// Adopt-on-boot: if djmanager already runs the right playlist on this
		// mount (typically restored by djm.Restore), claim ownership without
		// restarting playback.
		if current[mount] == "" {
			if sess := r.dj.GetSession(mount); sess != nil && sess.PlaylistID == sched.PlaylistID {
				r.setAssignment(mount, sched.ID)
				slog.Info("schedule: adopted existing session", "mount", mount, "schedule", sched.Name)
				continue
			}
		}
		r.applyStart(now, mount, sched)
	}

	// 2. Stop mounts whose previously-owned schedule is no longer active.
	for mount, schedID := range current {
		if _, stillDesired := desired[mount]; stillDesired {
			continue
		}
		r.applyStop(mount, schedID)
	}
}

// desiredAssignments returns the schedule (if any) that should be active on
// each mount at instant now. Overlap is forbidden at validation time, so each
// mount has at most one match.
func (r *Runner) desiredAssignments(now time.Time) map[string]*Schedule {
	nowMin := now.Hour()*60 + now.Minute()
	dayBit := uint8(1) << uint8(now.Weekday())
	out := make(map[string]*Schedule)
	for _, s := range r.schedules.List() {
		if !s.Enabled {
			continue
		}
		if s.DaysMask&dayBit == 0 {
			continue
		}
		if nowMin < s.StartMinutes || nowMin >= s.EndMinutes {
			continue
		}
		out[s.Mount] = s
	}
	return out
}

func (r *Runner) applyStart(now time.Time, mount string, s *Schedule) {
	pl, err := r.playlists.Get(s.PlaylistID)
	if err != nil {
		r.emitSkipped(mount, s, "playlist not found")
		slog.Warn("schedule: playlist gone, skipping", "schedule", s.ID, "playlist_id", s.PlaylistID)
		return
	}

	allTracks := r.scanner.Tracks()
	byPath := make(map[string]*library.Track, len(allTracks))
	for _, t := range allTracks {
		byPath[t.Path] = t
	}
	var tracks []*library.Track
	for _, p := range pl.TrackPaths {
		if t, ok := byPath[p]; ok {
			tracks = append(tracks, t)
		}
	}
	if len(tracks) == 0 {
		r.emitSkipped(mount, s, "no playlist tracks present in library")
		slog.Warn("schedule: playlist has no resolvable tracks, skipping",
			"schedule", s.ID, "playlist", pl.Name, "mount", mount)
		return
	}

	mode := autodj.ModeSequential
	if pl.Mode == "shuffle" {
		mode = autodj.ModeShuffle
	}

	playlistID := s.PlaylistID
	onTrackChange := func(path string) {
		if err := r.playlists.SetLastPlayed(playlistID, path); err != nil {
			slog.Warn("schedule: SetLastPlayed failed", "err", err)
		}
	}

	if err := r.dj.Start(context.Background(), mount, playlistID, pl.LastPlayedPath, onTrackChange, tracks, mode, pl.CrossfadeMs); err != nil {
		r.emitSkipped(mount, s, "dj start failed: "+err.Error())
		slog.Error("schedule: dj.Start failed", "schedule", s.ID, "mount", mount, "err", err)
		return
	}

	r.setAssignment(mount, s.ID)
	r.emit("schedule.triggered", map[string]any{
		"schedule_id": s.ID,
		"name":        s.Name,
		"mount":       mount,
		"playlist_id": playlistID,
		"mode":        string(mode),
	})
	slog.Info("schedule: triggered", "schedule", s.Name, "mount", mount, "playlist", pl.Name)
}

func (r *Runner) applyStop(mount, schedID string) {
	if err := r.dj.Stop(mount); err != nil {
		// Already stopped (manual stop or crash) — log and clear assignment.
		slog.Info("schedule: dj.Stop returned non-fatal", "mount", mount, "err", err)
	}
	r.clearAssignment(mount)
	r.emit("schedule.ended", map[string]any{
		"schedule_id": schedID,
		"mount":       mount,
	})
	slog.Info("schedule: ended", "mount", mount, "schedule_id", schedID)
}

func (r *Runner) setAssignment(mount, schedID string) {
	r.mu.Lock()
	r.assignment[mount] = schedID
	r.mu.Unlock()
}

func (r *Runner) clearAssignment(mount string) {
	r.mu.Lock()
	delete(r.assignment, mount)
	r.mu.Unlock()
}

func (r *Runner) emit(event string, payload map[string]any) {
	if r.webhooks == nil {
		return
	}
	r.webhooks.Emit(event, payload)
}

func (r *Runner) emitSkipped(mount string, s *Schedule, reason string) {
	r.emit("schedule.skipped", map[string]any{
		"schedule_id": s.ID,
		"name":        s.Name,
		"mount":       mount,
		"reason":      reason,
	})
}
