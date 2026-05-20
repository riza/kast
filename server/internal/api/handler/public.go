package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
)

// Public groups unauthenticated public mount endpoints.
type Public struct {
	Mounts    *mount.Manager
	DJManager *djmanager.Manager
	Playlists *playlist.Manager
	Scanner   *library.Scanner
}

type nowPlayingInfo struct {
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	DurationMs int64  `json:"duration_ms"`
}

type publicMountResponse struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Genre       string          `json:"genre"`
	Website     string          `json:"website"`
	Protocol    string          `json:"protocol"`
	Codec       string          `json:"codec"`
	Bitrate     string          `json:"bitrate"`
	Status      string          `json:"status"`
	Listeners   int             `json:"listeners"`
	NowPlaying  *nowPlayingInfo `json:"now_playing"`
	// Player config
	PlayerStationName  string `json:"player_station_name"`
	PlayerAccent       string `json:"player_accent"`
	PlayerAccentSoft   string `json:"player_accent_soft"`
	PlayerTheme        string `json:"player_theme"`
	PlayerLayout       string `json:"player_layout"`
	PlayerAmbient      bool   `json:"player_ambient"`
	PlayerShowAbout    bool   `json:"player_show_about"`
	PlayerShowHistory  bool   `json:"player_show_history"`
	PlayerShowPlaylist bool   `json:"player_show_playlist"`
}

type publicTrackInfo struct {
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	DurationMs int64  `json:"duration_ms"`
}

type publicPlaylistResponse struct {
	Name   string            `json:"name"`
	Mode   string            `json:"mode"`
	Tracks []publicTrackInfo `json:"tracks"`
}

// Mount godoc: GET /public/:mount
func (h *Public) Mount(c *fiber.Ctx) error {
	mountName := "/" + c.Params("mount")
	mt, err := h.Mounts.Get(mountName)
	if err != nil {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	t := h.DJManager.NowPlaying(mountName)
	resp := publicMountResponse{
		Name:               mt.Name,
		Description:        mt.Description,
		Genre:              mt.Genre,
		Website:            mt.Website,
		Protocol:           mt.Protocol,
		Codec:              mt.Codec,
		Bitrate:            mt.Bitrate,
		Status:             string(mt.Status),
		Listeners:          mt.Listeners,
		PlayerStationName:  mt.PlayerStationName,
		PlayerAccent:       mt.PlayerAccent,
		PlayerAccentSoft:   mt.PlayerAccentSoft,
		PlayerTheme:        mt.PlayerTheme,
		PlayerLayout:       mt.PlayerLayout,
		PlayerAmbient:      mt.PlayerAmbient,
		PlayerShowAbout:    mt.PlayerShowAbout,
		PlayerShowHistory:  mt.PlayerShowHistory,
		PlayerShowPlaylist: mt.PlayerShowPlaylist,
	}
	if t != nil {
		resp.NowPlaying = &nowPlayingInfo{
			Title:      t.Title,
			Artist:     t.Artist,
			Album:      t.Album,
			DurationMs: t.DurationMs,
		}
	}
	return respond.OK(c, resp)
}

// History godoc: GET /public/:mount/history
func (h *Public) History(c *fiber.Ctx) error {
	mountName := "/" + c.Params("mount")
	if _, err := h.Mounts.Get(mountName); err != nil {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	tracks := h.DJManager.RecentTracks(mountName)
	out := make([]publicTrackInfo, 0, len(tracks))
	for _, t := range tracks {
		out = append(out, publicTrackInfo{Title: t.Title, Artist: t.Artist, Album: t.Album, DurationMs: t.DurationMs})
	}
	return respond.OK(c, out)
}

// Playlist godoc: GET /public/:mount/playlist
func (h *Public) Playlist(c *fiber.Ctx) error {
	mountName := "/" + c.Params("mount")
	if _, err := h.Mounts.Get(mountName); err != nil {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	sess := h.DJManager.GetSession(mountName)
	if sess == nil {
		return respond.OK(c, []struct{}{})
	}
	pl, err := h.Playlists.Get(sess.PlaylistID)
	if err != nil {
		return respond.OK(c, []struct{}{})
	}
	allTracks := h.Scanner.Tracks()
	byPath := make(map[string]*library.Track, len(allTracks))
	for _, t := range allTracks {
		byPath[t.Path] = t
	}
	out := make([]publicTrackInfo, 0, len(pl.TrackPaths))
	for _, path := range pl.TrackPaths {
		if t, ok := byPath[path]; ok {
			out = append(out, publicTrackInfo{Title: t.Title, Artist: t.Artist, Album: t.Album, DurationMs: t.DurationMs})
		}
	}
	return respond.OK(c, publicPlaylistResponse{Name: pl.Name, Mode: pl.Mode, Tracks: out})
}
