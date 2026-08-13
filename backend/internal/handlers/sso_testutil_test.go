package handlers

import (
	"net/http"
	"time"

	"github.com/aceobservability/ace/backend/internal/sso"
)

func testSSO() *sso.Module {
	return sso.New(&http.Client{Timeout: 2 * time.Second})
}
