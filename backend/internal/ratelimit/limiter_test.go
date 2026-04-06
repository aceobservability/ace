package ratelimit

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestAllow_UnlimitedWhenZero(t *testing.T) {
	l := New()
	defer l.Stop()

	uid := uuid.New()
	pid := uuid.New()

	allowed, _, _ := l.Allow(uid, pid, 0, 3600)
	if !allowed {
		t.Error("expected unlimited when limit=0")
	}
}

func TestAllow_WithinLimit(t *testing.T) {
	l := New()
	defer l.Stop()

	uid := uuid.New()
	pid := uuid.New()

	for i := 0; i < 3; i++ {
		allowed, remaining, _ := l.Allow(uid, pid, 3, 3600)
		if !allowed {
			t.Errorf("request %d should be allowed", i+1)
		}
		if remaining != 3-i-1 {
			t.Errorf("request %d: expected remaining %d, got %d", i+1, 3-i-1, remaining)
		}
	}
}

func TestAllow_ExceedsLimit(t *testing.T) {
	l := New()
	defer l.Stop()

	uid := uuid.New()
	pid := uuid.New()

	for i := 0; i < 3; i++ {
		l.Allow(uid, pid, 3, 3600)
	}

	allowed, remaining, resetAt := l.Allow(uid, pid, 3, 3600)
	if allowed {
		t.Error("4th request should be denied")
	}
	if remaining != 0 {
		t.Errorf("expected remaining 0, got %d", remaining)
	}
	if resetAt.IsZero() {
		t.Error("expected non-zero resetAt")
	}
}

func TestAllow_SeparateUsers(t *testing.T) {
	l := New()
	defer l.Stop()

	uid1 := uuid.New()
	uid2 := uuid.New()
	pid := uuid.New()

	// Exhaust user1
	for i := 0; i < 2; i++ {
		l.Allow(uid1, pid, 2, 3600)
	}

	// user2 should still be allowed
	allowed, _, _ := l.Allow(uid2, pid, 2, 3600)
	if !allowed {
		t.Error("user2 should be allowed independently of user1")
	}
}

func TestAllow_SeparateProviders(t *testing.T) {
	l := New()
	defer l.Stop()

	uid := uuid.New()
	pid1 := uuid.New()
	pid2 := uuid.New()

	// Exhaust provider1
	for i := 0; i < 2; i++ {
		l.Allow(uid, pid1, 2, 3600)
	}

	// provider2 should still be allowed
	allowed, _, _ := l.Allow(uid, pid2, 2, 3600)
	if !allowed {
		t.Error("provider2 should be allowed independently of provider1")
	}
}

func TestSweep_RemovesExpired(t *testing.T) {
	l := New()
	defer l.Stop()

	uid := uuid.New()
	pid := uuid.New()

	// Create a window with 1-second duration
	l.Allow(uid, pid, 10, 1)

	// Wait for it to expire
	time.Sleep(1100 * time.Millisecond)

	l.sweep()

	l.mu.Lock()
	_, exists := l.windows[key{UserID: uid, ProviderID: pid}]
	l.mu.Unlock()

	if exists {
		t.Error("expected expired window to be swept")
	}
}

func TestAllow_WindowReset(t *testing.T) {
	l := New()
	defer l.Stop()

	uid := uuid.New()
	pid := uuid.New()

	// Exhaust with 1-second window
	for i := 0; i < 2; i++ {
		l.Allow(uid, pid, 2, 1)
	}
	allowed, _, _ := l.Allow(uid, pid, 2, 1)
	if allowed {
		t.Error("should be denied within window")
	}

	// Wait for window to expire
	time.Sleep(1100 * time.Millisecond)

	allowed, remaining, _ := l.Allow(uid, pid, 2, 1)
	if !allowed {
		t.Error("should be allowed after window expires")
	}
	if remaining != 1 {
		t.Errorf("expected remaining 1, got %d", remaining)
	}
}
