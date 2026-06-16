package main

import "testing"

func TestResolveListenAddr(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{
			name: "defaults to :8080 when unset",
			env:  map[string]string{},
			want: ":8080",
		},
		{
			name: "defaults to :8080 when empty",
			env:  map[string]string{"ACE_LISTEN_ADDR": ""},
			want: ":8080",
		},
		{
			name: "uses ACE_LISTEN_ADDR when set",
			env:  map[string]string{"ACE_LISTEN_ADDR": "127.0.0.1:9090"},
			want: "127.0.0.1:9090",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			getenv := func(key string) string { return tt.env[key] }
			if got := resolveListenAddr(getenv); got != tt.want {
				t.Errorf("resolveListenAddr() = %q, want %q", got, tt.want)
			}
		})
	}
}
