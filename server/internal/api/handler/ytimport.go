package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/ytimport"
)

// YTImport groups handlers for YouTube import.
type YTImport struct {
	Manager *ytimport.Manager
}

type previewRequest struct {
	URL string `json:"url"`
}

// Preview godoc: POST /api/library/import/youtube/preview
func (h *YTImport) Preview(c *fiber.Ctx) error {
	var req previewRequest
	if err := c.BodyParser(&req); err != nil || req.URL == "" {
		return respond.Error(c, fiber.StatusBadRequest, "url is required")
	}

	ctx := c.UserContext()
	result, err := h.Manager.Preview(ctx, req.URL)
	if err != nil {
		return respond.Error(c, fiber.StatusUnprocessableEntity, err.Error())
	}
	return respond.OK(c, result)
}

type importRequest struct {
	Items []importItem `json:"items"`
}

type importItem struct {
	YTID       string `json:"ytid"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	DurationMs int64  `json:"duration_ms"`
	Thumbnail  string `json:"thumbnail"`
}

type importResponse struct {
	JobID     string    `json:"job_id"`
	CreatedAt time.Time `json:"created_at"`
}

// Start godoc: POST /api/library/import/youtube
func (h *YTImport) Start(c *fiber.Ctx) error {
	var req importRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	if len(req.Items) == 0 {
		return respond.Error(c, fiber.StatusBadRequest, "items must not be empty")
	}

	items := make([]*ytimport.Item, len(req.Items))
	for i, it := range req.Items {
		if it.YTID == "" {
			return respond.Error(c, fiber.StatusBadRequest, "each item must have a ytid")
		}
		items[i] = &ytimport.Item{
			YTID:       it.YTID,
			Title:      it.Title,
			Artist:     it.Artist,
			DurationMs: it.DurationMs,
			Thumbnail:  it.Thumbnail,
		}
	}

	jobID := h.Manager.StartImport(items)
	return respond.OK(c, importResponse{JobID: jobID, CreatedAt: time.Now()})
}

// GetJob godoc: GET /api/library/imports/:id
func (h *YTImport) GetJob(c *fiber.Ctx) error {
	id := c.Params("id")
	job := h.Manager.GetJob(id)
	if job == nil {
		return respond.Error(c, fiber.StatusNotFound, "import job not found")
	}
	return respond.OK(c, job)
}

// ListJobs godoc: GET /api/library/imports
func (h *YTImport) ListJobs(c *fiber.Ctx) error {
	return respond.OK(c, h.Manager.ListJobs())
}
