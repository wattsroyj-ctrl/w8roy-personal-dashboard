# W8ROY Personal Dashboard v1.0

A light-mode, responsive static dashboard for personal use.

## Features in this starter build
- Eastern and UTC clocks
- Live National Weather Service forecast and active alerts (when the browser can reach api.weather.gov)
- NOAA Space Weather Prediction Center live feed attempts
- Curated links to world, U.S., Michigan and Metro Detroit news
- Local SEMTN QNI/QTC/QTR monthly totals (manual entry, saved in this browser)
- Local reminders and scratchpad
- Amateur radio, public safety and quick links
- No passwords, API keys, or email contents are stored

## Important privacy note
GitHub Pages sites are publicly accessible on the internet. This starter site does not include private personal data, and local reminders/statistics/scratchpad are saved only in the current browser's local storage. Do not enter confidential work information. GitHub Pages does not provide password protection for a site.

## Deploy to GitHub Pages
1. Sign in to GitHub and create a new repository, for example `w8roy-dashboard`.
2. Choose **Public** (the published website will be public even if the repository is private).
3. Upload `index.html` from this ZIP to the repository's top level. You can also upload `README.md`.
4. Open repository **Settings** → **Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Choose branch `main` and folder `/(root)`, then click **Save**.
7. Wait for the Pages deployment to finish, then use the **Visit site** link on the Pages settings screen.

Your URL will look like `https://YOUR-GITHUB-USERNAME.github.io/w8roy-dashboard/`.

## Notes / limitations
- Weather uses an approximate Livonia, Michigan coordinate and official NWS API. Browser connectivity and NWS service availability can affect it.
- News panels are live links to publisher/search pages rather than embedded article feeds in this version; this avoids relying on fragile third-party RSS proxy services.
- Email highlights are not connected. A secure provider-authorized sign-in/backend would be needed.
- SEMTN totals are entered manually. Automatic integration requires inspecting how your existing tracker stores/exports data.
- Reminders do not send notifications and do not sync across devices.
- Public warning data is informational and not a substitute for official emergency alerting.
