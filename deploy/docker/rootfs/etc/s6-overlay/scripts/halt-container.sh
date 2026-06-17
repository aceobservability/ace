#!/bin/sh
# Shared crash-detection handler for the combined image's longruns. Each service's
# finish script execs this with the service name as $1, followed by s6's finish
# args ($2 = exit code, $3 = signal).
#
# s6 would normally just restart a dead longrun, but for the combined image a
# missing backend or nginx means the container is no longer doing its job, so we
# bring the whole container down via halt and let the operator's restart policy /
# orchestrator surface the failure.
#
# halt cascades a stop to the *other* service, whose finish script then also runs
# — so guard the exit-code write with an atomic mkdir marker, letting the service
# that actually died (the first finish to run) decide the container exit code. The
# exit code is 256 when the process was killed by a signal; clamp that to 1 so a
# crash is a non-zero exit while a clean `docker stop` (services exit 0) stays 0.
svc="$1"; code="$2"; signal="$3"
echo "ace-standalone: $svc exited (code=$code signal=$signal), halting container" >&2
if mkdir /run/ace-halting 2>/dev/null; then
  if [ "$code" -eq 256 ]; then code=1; fi
  echo "$code" >/run/s6-linux-init-container-results/exitcode
fi
exec /run/s6/basedir/bin/halt
