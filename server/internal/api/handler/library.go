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
			_ = os.Remove(dst)
			results = append(results, result{Name: fh.Filename, Error: "failed to write"})
			continue
		}
		src.Close()
		out.Close()

		slog.Info("library: uploaded", "file", dst)
		results = append(results, result{Name: fh.Filename})
	}

	go func() {
		if err := h.Scanner.Scan(context.Background()); err != nil {
			slog.Warn("library: post-upload scan failed", "err", err)
		}
	}()

	return respond.OK(c, fiber.Map{"uploaded": results})
}

// Scan godoc: POST /api/library/scan
func (h *Library) Scan(c *fiber.Ctx) error {
	go func() {
		if err := h.Scanner.Scan(context.Background()); err != nil {
			_ = err
		}
	}()
	return respond.OK(c, fiber.Map{"status": "scan started"})
}
