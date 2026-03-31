#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Bravo 6 Flight Academy — Display Board Auto-Start Setup
# ═══════════════════════════════════════════════════════════
#
# This script configures a Raspberry Pi to:
# 1. Auto-launch the welcome board in fullscreen Chromium (HDMI TV)
# 2. Cast the weather board to a second TV via built-in Chromecast
# 3. Start everything on boot — no remotes or interaction needed
#
# URLS:
#   Welcome Board: https://jseal-bravo.github.io/b6-displays/
#   Weather Board: https://jseal-bravo.github.io/b6-displays/weather.html
#
# ═══════════════════════════════════════════════════════════

# --- STEP 1: Install required packages ---
echo "Installing required packages..."
sudo apt-get update
sudo apt-get install -y xdotool unclutter python3-pip

# Install catt for Chromecast casting
pip3 install catt --break-system-packages

# --- STEP 2: Disable screen blanking / sleep ---
echo "Disabling screen sleep..."
# Add to /etc/xdg/lxsession/LXDE-pi/autostart
sudo bash -c 'cat >> /etc/xdg/lxsession/LXDE-pi/autostart << EOF
@xset s off
@xset -dpms
@xset s noblank
EOF'

# --- STEP 3: Create the auto-start script ---
echo "Creating display launcher script..."
mkdir -p /home/pi/b6-displays

cat > /home/pi/b6-displays/launch.sh << 'LAUNCH'
#!/bin/bash
# ═══════════════════════════════════════════════════
# Bravo 6 Display Board Launcher
# ═══════════════════════════════════════════════════

# Wait for desktop and network to be ready
sleep 15

# --- HDMI TV: Launch Chromium in kiosk mode ---
# This shows the welcome board on the TV connected via HDMI
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-component-update \
  --disable-translate \
  --incognito \
  --check-for-update-interval=604800 \
  "https://jseal-bravo.github.io/b6-displays/" &

# Hide the mouse cursor after 3 seconds of inactivity
unclutter -idle 3 -root &

# --- CHROMECAST TV: Cast weather board ---
# Wait for Chromium to start, then cast to the second TV
# IMPORTANT: Replace "Lobby TV" with the actual name of your
# Chromecast-enabled TV as it appears in the Google Home app
sleep 30
catt -d "Lobby TV" cast_site "https://jseal-bravo.github.io/b6-displays/weather.html" &

echo "Bravo 6 displays launched at $(date)"
LAUNCH

chmod +x /home/pi/b6-displays/launch.sh

# --- STEP 4: Set up auto-start on boot ---
echo "Configuring auto-start on boot..."
mkdir -p /home/pi/.config/autostart

cat > /home/pi/.config/autostart/b6-displays.desktop << 'DESKTOP'
[Desktop Entry]
Type=Application
Name=Bravo 6 Displays
Exec=/home/pi/b6-displays/launch.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
DESKTOP

# --- STEP 5: Create a helper script to find Chromecast device names ---
cat > /home/pi/b6-displays/find-devices.sh << 'FIND'
#!/bin/bash
echo "Scanning for Chromecast devices on your network..."
echo "(Make sure the TV is on and connected to the same WiFi as this Pi)"
echo ""
catt scan
echo ""
echo "Copy the device name above and paste it into launch.sh"
echo "Replace 'Lobby TV' with the actual name shown above"
FIND

chmod +x /home/pi/b6-displays/find-devices.sh

echo ""
echo "═══════════════════════════════════════════════════"
echo "  SETUP COMPLETE!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  BEFORE REBOOTING, do these two things:"
echo ""
echo "  1. Find your TV's Chromecast name:"
echo "     Run: /home/pi/b6-displays/find-devices.sh"
echo ""
echo "  2. Update the TV name in the launch script:"
echo "     Edit: /home/pi/b6-displays/launch.sh"
echo "     Change 'Lobby TV' to your TV's actual name"
echo ""
echo "  Then reboot: sudo reboot"
echo ""
echo "  After reboot, both TVs will show the displays"
echo "  automatically — no remotes needed!"
echo "═══════════════════════════════════════════════════"
