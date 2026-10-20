// What the "Conéctate" screen's two QR codes hold (reached from the faint Wi-Fi
// button on the start screen).

// The gym's password-protected Wi-Fi, as a standard Wi-Fi QR payload, for
// example `WIFI:T:WPA;S:<network name>;P:<password>;;` (escape \ ; , : " in the
// name and password with a backslash). null shows a placeholder. To be filled
// in on site. Note: whatever goes here ships in the kiosk's public web bundle.
export const WIFI_QR_PAYLOAD: string | null = null

// The open-gym PWA that lets members get into the gym.
export const OPEN_GYM_URL = "https://high-altitude-dog.github.io/open-gym/"
