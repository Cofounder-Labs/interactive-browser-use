#!/bin/bash
set -e

# Define display number
DISPLAY_NUM=99
export DISPLAY=:${DISPLAY_NUM}

echo "Setting up X server on display :${DISPLAY_NUM}"

# Clean up potential stale lock files
rm -f /tmp/.X${DISPLAY_NUM}-lock || true
rm -f /tmp/.X11-unix/X${DISPLAY_NUM} || true

# Start Xvfb with error output capture for debugging
echo "Starting Xvfb on display :${DISPLAY_NUM}"
Xvfb :${DISPLAY_NUM} -screen 0 1280x1024x24 -nolisten tcp -ac &> /tmp/xvfb.log & 
XVFBPID=$!

# Wait to ensure Xvfb is ready
sleep 2

# Verify Xvfb is running
if ! ps -p $XVFBPID > /dev/null; then
    echo "ERROR: Xvfb failed to start! Check log output:"
    cat /tmp/xvfb.log
    exit 1
fi

echo "Xvfb started successfully with PID $XVFBPID"

# Start x11vnc with output redirected for debugging
echo "Starting x11vnc server on port 5900"
x11vnc -display :${DISPLAY_NUM} -nopw -forever -shared -rfbport 5900 -xkb -noxrecord &> /tmp/x11vnc.log &
X11VNCPID=$!

# Verify x11vnc is running
sleep 1
if ! ps -p $X11VNCPID > /dev/null; then
    echo "ERROR: x11vnc failed to start! Check log output:"
    cat /tmp/x11vnc.log
    exit 1
fi

echo "x11vnc started successfully with PID $X11VNCPID"
echo "VNC server is running on port 5900"

# Start websockify for WebSocket VNC access (if installed)
if command -v websockify &> /dev/null; then
    echo "Starting websockify on port 5901"
    websockify --web=/usr/share/novnc 5901 localhost:5900 &> /tmp/websockify.log &
    WEBSOCKIFYPID=$!
    
    sleep 1
    if ! ps -p $WEBSOCKIFYPID > /dev/null; then
        echo "WARNING: websockify failed to start! Check log output:"
        cat /tmp/websockify.log
    else
        echo "websockify started successfully with PID $WEBSOCKIFYPID"
        echo "WebSocket access available on port 5901"
        # Add websockify to cleanup trap
        trap "kill $WEBSOCKIFYPID $X11VNCPID $XVFBPID" EXIT
    fi
else
    echo "websockify not found, skipping WebSocket VNC setup"
    trap "kill $X11VNCPID $XVFBPID" EXIT
fi

echo "X11/VNC environment setup complete"
echo "Executing command: $@"

# Execute the command passed to the entrypoint
exec "$@" 