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
)

// AutoDJ groups handlers for per-mount AutoDJ control.
type AutoDJ struct {
	DJManager *djmanager.Manager
	Playlists *playlist.Manager
	Scanner   *library.Scanner
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
	if err := h.DJManager.Start(context.Background(), mountName, req.PlaylistID, startFrom, onTrackChange, tracks, mode, pl.CrossfadeMs); err != nil {
		return respond.Error(c, fiber.StatusInternalServerError, err.Error())
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
	return respond.OK(c, fiber.Map{"status": "skipped"})
}

// Stop godoc: DELETE /api/mounts/:name/autodj
func (h *AutoDJ) Stop(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	if err := h.DJManager.Stop(mountName); err != nil {
		return respond.Error(c, fiber.StatusNotFound, err.Error())
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
