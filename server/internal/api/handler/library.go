package handler

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/library"
)

// Library groups library-related handlers.
type Library struct {
	Scanner   *library.Scanner
	UploadDir string
}

// List godoc: GET /api/library
// Supports ?q= search and ?genre= filter.
func (h *Library) List(c *fiber.Ctx) error {
	tracks := h.Scanner.Tracks()
	q := strings.ToLower(c.Query("q"))
	genre := strings.ToLower(c.Query("genre"))

	if q == "" && genre == "" {
		return respond.OK(c, tracks)
	}

	var filtered []*library.Track
	for _, t := range tracks {
		if q != "" {
			haystack := strings.ToLower(t.Title + " " + t.Artist + " " + t.Album)
			if !strings.Contains(haystack, q) {
				continue
			}
		}
		if genre != "" && strings.ToLower(t.Genre) != genre {
			continue
		}
		filtered = append(filtered, t)
	}
	return respond.OK(c, filtered)
}

// allowedAudioExts is the set of extensions accepted for upload.
var allowedAudioExts = map[string]bool{
	".mp3": true, ".flac": true, ".ogg": true,
	".wav": true, ".aac": true, ".m4a": true, ".opus": true,
}

// Upload godoc: POST /api/library/upload
// Accepts multipart/form-data with field "files" (multiple files allowed).
func (h *Library) Upload(c *fiber.Ctx) error {
	form, err := c.MultipartForm()
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "failed to parse form: "+err.Error())
	}

	uploadDir := h.UploadDir
	if uploadDir == "" {
		uploadDir = "./data/music"
	}
	if err := os.MkdirAll(uploadDir, 0o750); err != nil {
		return respond.Error(c, fiber.StatusInternalServerError, "failed to create upload directory")
	}

	files := form.File["files"]
	if len(files) == 0 {
		return respond.Error(c, fiber.StatusBadRequest, "no files provided")
	}

	type result struct {
		Name  string `json:"name"`
		Error string `json:"error,omitempty"`
	}
	results := make([]result, 0, len(files))

	for _, fh := range files {
		name := filepath.Base(fh.Filename)
		ext := strings.ToLower(filepath.Ext(name))

		if !allowedAudioExts[ext] {
			results = append(results, result{Name: fh.Filename, Error: "unsupported format"})
			continue
		}

		src, err := fh.Open()
		if err != nil {
			results = append(results, result{Name: fh.Filename, Error: "failed to open"})
			continue
		}

		dst := filepath.Join(uploadDir, name)
		if _, statErr := os.Stat(dst); statErr == nil {
			base := strings.TrimSuffix(name, ext)
			dst = filepath.Join(uploadDir, base+"_"+strconv.FormatInt(time.Now().UnixNano(), 36)+ext)
		}

		out, createErr := os.Create(dst)
		if createErr != nil {
			src.Close()
			results = append(results, result{Name: fh.Filename, Error: "failed to create file"})
			continue
		}

		if _, copyErr := io.Copy(out, src); copyErr != nil {
			src.Close()
			out.Close()
			if removeErr := os.Remove(dst); removeErr != nil {
				slog.Warn("library: upload cleanup: remove failed", "path", dst, "err", removeErr)
			}
			results = append(results, result{Name: fh.Filename, Error: "failed to write"})
			continue
		}
		src.Close()
		out.Close()

		slog.Info("library: uploaded", "file", dst)
		results = append(results, result{Name: fh.Filename})
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := h.Scanner.Scan(ctx); err != nil {
			slog.Warn("library: post-upload scan failed", "err", err)
		}
	}()

	return respond.OK(c, fiber.Map{"uploaded": results})
}

// Update godoc: PATCH /api/library/:id
// Updates metadata overrides (title, artist, album, genre) for a track.
func (h *Library) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Title  string `json:"title"`
		Artist string `json:"artist"`
		Album  string `json:"album"`
		Genre  string `json:"genre"`
	}
	if err := c.BodyParser(&body); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	track, err := h.Scanner.UpdateTrack(id, body.Title, body.Artist, body.Album, body.Genre)
	if err != nil {
		return respond.Error(c, fiber.StatusNotFound, err.Error())
	}
	return respond.OK(c, track)
}

// ResetOverride godoc: DELETE /api/library/:id/override
// Removes any stored metadata override, restoring the file's ID3 values.
func (h *Library) ResetOverride(c *fiber.Ctx) error {
	track, err := h.Scanner.DeleteOverride(c.Params("id"))
	if err != nil {
		return respond.Error(c, fiber.StatusNotFound, err.Error())
	}
	return respond.OK(c, track)
}

// Scan godoc: POST /api/library/scan
func (h *Library) Scan(c *fiber.Ctx) error {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := h.Scanner.Scan(ctx); err != nil {
			slog.Error("library: scan failed", "err", err)
		}
	}()
	return respond.OK(c, fiber.Map{"status": "scan started"})
}
