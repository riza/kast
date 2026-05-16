package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/webrtcmanager"
)

// WHEP handles WebRTC HTTP Egress Protocol requests.
// POST /api/whep/:name — body: SDP offer, response: SDP answer.
type WHEP struct {
	Manager *webrtcmanager.Manager
}

func (h *WHEP) Offer(c *fiber.Ctx) error {
	mountName := "/" + c.Params("name")
	offerSDP := string(c.Body())
	if offerSDP == "" {
		return respond.Error(c, fiber.StatusBadRequest, "SDP offer body required")
	}

	answerSDP, err := h.Manager.AddPeer(mountName, offerSDP)
	if err != nil {
		return respond.Error(c, fiber.StatusServiceUnavailable, err.Error())
	}

	c.Set("Content-Type", "application/sdp")
	c.Set("Access-Control-Allow-Origin", "*")
	c.Status(fiber.StatusCreated)
	return c.SendString(answerSDP)
}
