package handler

import (
	"context"
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/autodj"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/playlist"
	"github.com/riza/kast/internal/webhook"
)

// AutoDJ groups handlers for per-mount AutoDJ control.
type AutoDJ struct {
	DJManager *djmanager.Manager
	Playlists *playlist.Manager
	Scanner   *library.Scanner
	Webhooks  *webhook.Manager
}

type startAutoDJRequest struct {
	PlaylistID      string `json:"playlist_id"`
	Mode            string `json:"mode"`
	StartTrackPath  string `json:"start_track_path"`
}

// Start godoc: POST /api/mounts/:name/autodj
func (h *AutoDJ) Start(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")

	var req startAutoDJRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	if req.PlaylistID == "" {
		return respond.Error(c, fiber.StatusBadRequest, "playlist_id is required")
	}

	pl, err := h.Playlists.Get(req.PlaylistID)
	if errors.Is(err, playlist.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "playlist not found")
	}

	mode := autodj.ModeSequential
	modeStr := req.Mode
	if modeStr == "" {
		modeStr = pl.Mode
	}
	if modeStr == "shuffle" {
		mode = autodj.ModeShuffle
	}

	allTracks := h.Scanner.Tracks()
	byPath := make(map[string]*library.Track, len(allTracks))
	for _, t := range allTracks {
		byPath[t.Path] = t
	}

	var tracks []*library.Track
	for _, path := range pl.TrackPaths {
		if t, ok := byPath[path]; ok {
			tracks = append(tracks, t)
		} else {
			slog.Warn("autodj start: track not in library", "path", path)
		}
	}

	if len(tracks) == 0 {
		return respond.Error(c, fiber.StatusUnprocessableEntity,
			"no tracks from this playlist exist in the library (run a scan first)")
	}

	onTrackChange := func(path string) {
		if err := h.Playlists.SetLastPlayed(req.PlaylistID, path); err != nil {
			slog.Warn("autodj: failed to save last played", "err", err)
		}
	}

	startFrom := req.StartTrackPath
	if startFrom == "" {
		startFrom = pl.LastPlayedPath
	}
	jingle := h.DJManager.ResolveJingles(mountName, byPath)
	if err := h.DJManager.Start(context.Background(), mountName, req.PlaylistID, startFrom, onTrackChange, tracks, mode, pl.CrossfadeMs, jingle); err != nil {
		return respond.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	if h.Webhooks != nil {
		h.Webhooks.Emit("autodj.started", fiber.Map{
			"mount":       mountName,
			"playlist_id": req.PlaylistID,
			"mode":        string(mode),
		})
	}
	return respond.OK(c, fiber.Map{
		"status":    "started",
		"mount":     mountName,
		"tracks":    len(tracks),
		"mode":      string(mode),
		"crossfade": pl.CrossfadeMs,
	})
}

// Skip godoc: POST /api/mounts/:name/autodj/skip
func (h *AutoDJ) Skip(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	if err := h.DJManager.Skip(mountName); err != nil {
		return respond.Error(c, fiber.StatusNotFound, err.Error())
	}
	if h.Webhooks != nil {
		h.Webhooks.Emit("autodj.track.skipped", fiber.Map{"mount": mountName})
	}
	return respond.OK(c, fiber.Map{"status": "skipped"})
}

// Stop godoc: DELETE /api/mounts/:name/autodj
func (h *AutoDJ) Stop(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	if err := h.DJManager.Stop(mountName); err != nil {
		return respond.Error(c, fiber.StatusNotFound, err.Error())
	}
	if h.Webhooks != nil {
		h.Webhooks.Emit("autodj.stopped", fiber.Map{"mount": mountName})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// Status godoc: GET /api/mounts/:name/autodj
func (h *AutoDJ) Status(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	info := h.DJManager.GetSession(mountName)
	if info == nil {
		return respond.Error(c, fiber.StatusNotFound, "no active autodj session")
	}
	return respond.OK(c, info)
}

// Sessions godoc: GET /api/autodj/sessions
func (h *AutoDJ) Sessions(c *fiber.Ctx) error {
	return respond.OK(c, h.DJManager.ListSessions())
}

type nowPlayingResponse struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	DurationMs int64  `json:"duration_ms"`
}

// NowPlaying godoc: GET /api/mounts/:name/nowplaying
func (h *AutoDJ) NowPlaying(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	t := h.DJManager.NowPlaying(mountName)
	if t == nil {
		return respond.OK(c, nil)
	}
	return respond.OK(c, nowPlayingResponse{
		ID:         t.ID,
		Title:      t.Title,
		Artist:     t.Artist,
		Album:      t.Album,
		DurationMs: t.DurationMs,
	})
}

type tracksResponse struct {
	Tracks       []nowPlayingResponse `json:"tracks"`
	NowPlayingID string               `json:"now_playing_id"`
	Queue        []nowPlayingResponse `json:"queue"`
}

func toTrackInfo(t *library.Track) nowPlayingResponse {
	return nowPlayingResponse{ID: t.ID, Title: t.Title, Artist: t.Artist, Album: t.Album, DurationMs: t.DurationMs}
}

// Tracks godoc: GET /api/mounts/:name/autodj/tracks
func (h *AutoDJ) Tracks(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	tracks, npID, queue := h.DJManager.Tracks(mountName)
	if tracks == nil {
		return respond.Error(c, fiber.StatusNotFound, "no active autodj session")
	}
	resp := tracksResponse{
		Tracks:       make([]nowPlayingResponse, len(tracks)),
		NowPlayingID: npID,
		Queue:        make([]nowPlayingResponse, len(queue)),
	}
	for i, t := range tracks {
		resp.Tracks[i] = toTrackInfo(t)
	}
	for i, t := range queue {
		resp.Queue[i] = toTrackInfo(t)
	}
	return respond.OK(c, resp)
}

// JumpTo godoc: POST /api/mounts/:name/autodj/jump
func (h *AutoDJ) JumpTo(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	var req struct {
		Index int `json:"index"`
	}
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	if err := h.DJManager.JumpTo(mountName, req.Index); err != nil {
		return respond.Error(c, fiber.StatusNotFound, err.Error())
	}
	return respond.OK(c, fiber.Map{"status": "jumped", "index": req.Index})
}

// InsertNext godoc: POST /api/mounts/:name/autodj/queue
func (h *AutoDJ) InsertNext(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	var req struct {
		TrackID string `json:"track_id"`
	}
	if err := c.BodyParser(&req); err != nil || req.TrackID == "" {
		return respond.Error(c, fiber.StatusBadRequest, "track_id is required")
	}
	var found *library.Track
	for _, t := range h.Scanner.Tracks() {
		if t.ID == req.TrackID {
			found = t
			break
		}
	}
	if found == nil {
		return respond.Error(c, fiber.StatusNotFound, "track not found")
	}
	if err := h.DJManager.InsertNext(mountName, found); err != nil {
		return respond.Error(c, fiber.StatusNotFound, err.Error())
	}
	return respond.OK(c, fiber.Map{"status": "queued"})
}

// History godoc: GET /api/mounts/:name/autodj/history
func (h *AutoDJ) History(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	tracks := h.DJManager.RecentTracks(mountName)
	out := make([]nowPlayingResponse, 0, len(tracks))
	for _, t := range tracks {
		out = append(out, toTrackInfo(t))
	}
	return respond.OK(c, out)
}
