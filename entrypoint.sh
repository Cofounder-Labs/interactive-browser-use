#!/bin/bash
set -e

# Start Xvfb (virtual framebuffer) on display :99
# -screen 0 1280x1024x24: Create screen 0 with 1280x1024 resolution and 24-bit color depth
# -nolisten tcp: Disable TCP connections to the X server (more secure)
# -ac: Disable access control
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -ac & 
XVFBPID=$!

# Set the DISPLAY environment variable for subsequent GUI applications
export DISPLAY=:99

# Start a lightweight window manager (optional, but helps manage windows for VNC)
fluxbox &> /dev/null &
FLUXBOXPID=$!

# Start x11vnc
# -display :99: Connect to the display served by Xvfb
# -nopw: Do not require a password (simpler for this setup)
# -forever: Keep running even after the first client disconnects
# -shared: Allow multiple clients to connect simultaneously
# -rfbport 5900: Listen on port 5900
# -localhost: Only listen on localhost within the container initially (docker-compose exposes it)
# -xkb: Use X keyboard extension
# -noxrecord: Disable X Record extension (potential compatibility fix)
x11vnc -display :99 -nopw -forever -shared -rfbport 5900 -localhost -xkb -noxrecord &> /dev/null &
X11VNCPID=$!

echo "Starting Xvfb (PID: $XVFBPID), Fluxbox (PID: $FLUXBOXPID), x11vnc (PID: $X11VNCPID)"
echo "VNC server running on port 5900 (exposed by docker-compose)"
echo "Executing command: $@"

# Execute the command passed to the entrypoint (e.g., the CMD from Dockerfile)
exec "$@"

# Optional: Cleanup on exit (might not always run depending on how container stops)
trap "kill $X11VNCPID $FLUXBOXPID $XVFBPID" EXIT 