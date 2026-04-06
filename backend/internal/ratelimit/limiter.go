package ratelimit

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type key struct {
	UserID     uuid.UUID
	ProviderID uuid.UUID
}

type window struct {
	count     int
	expiresAt time.Time
}

// Limiter implements a simple fixed-window rate limiter keyed by (user, provider).
type Limiter struct {
	mu      sync.Mutex
	windows map[key]*window
	done    chan struct{}
}

// New creates a Limiter and starts a background goroutine that
// sweeps expired entries every 5 minutes.
func New() *Limiter {
	l := &Limiter{
		windows: make(map[key]*window),
		done:    make(chan struct{}),
	}
	go l.cleanup()
	return l
}

// Allow checks whether the user may make a request to the given provider.
// limit is the max requests allowed in the window; windowSecs is the window duration.
// Returns whether the request is allowed, the remaining quota, and when the window resets.
func (l *Limiter) Allow(userID, providerID uuid.UUID, limit, windowSecs int) (allowed bool, remaining int, resetAt time.Time) {
	if limit <= 0 {
		return true, 0, time.Time{}
	}

	k := key{UserID: userID, ProviderID: providerID}
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	w, exists := l.windows[k]
	if !exists || now.After(w.expiresAt) {
		w = &window{
			count:     0,
			expiresAt: now.Add(time.Duration(windowSecs) * time.Second),
		}
		l.windows[k] = w
	}

	if w.count >= limit {
		return false, 0, w.expiresAt
	}

	w.count++
	return true, limit - w.count, w.expiresAt
}

// Stop terminates the background cleanup goroutine.
func (l *Limiter) Stop() {
	close(l.done)
}

func (l *Limiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-l.done:
			return
		case <-ticker.C:
			l.sweep()
		}
	}
}

func (l *Limiter) sweep() {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, w := range l.windows {
		if now.After(w.expiresAt) {
			delete(l.windows, k)
		}
	}
}
