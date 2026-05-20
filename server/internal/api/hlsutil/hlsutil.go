// Package hlsutil provides helpers for serving HLS playlists.
package hlsutil

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ServePlaylistWithLLHeaders reads an HLS playlist file, injects the
// EXT-X-SERVER-CONTROL tag required for LL-HLS blocking reload (if not
// already present), and writes the result to the response.
func ServePlaylistWithLLHeaders(c *fiber.Ctx, path string) error {
	data, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}

	const serverControl = "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=0.6\n"
	body := string(data)

	if !strings.Contains(body, "#EXT-X-SERVER-CONTROL") {
		body = strings.Replace(body, "#EXTM3U\n", "#EXTM3U\n"+serverControl, 1)
	}

	c.Set("Content-Type", "application/vnd.apple.mpegurl")
	c.Set("Cache-Control", "no-cache")
	return c.SendString(body)
}

// ParseInt parses a non-negative decimal integer from s without strconv to
// avoid allocations in the hot HLS path.
func ParseInt(s string) (int, error) {
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return 0, fmt.Errorf("not a number")
		}
		n = n*10 + int(ch-'0')
	}
	return n, nil
}
