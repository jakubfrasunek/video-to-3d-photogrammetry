# Video to 3D Photogrammetry

Local Mac app that turns a video into a 3D model with Apple Object Capture. Nothing leaves the computer.

The UI is in English and Czech. Switch language with the flags in the header.

## Requirements

- Mac with [Object Capture](https://developer.apple.com/augmented-reality/object-capture/) (Apple Silicon)
- macOS 12 or later
- Xcode Command Line Tools so `swift` can compile the reconstruction scripts

`./scripts/start-ui.sh` checks these on launch. If ffmpeg is missing it installs [Homebrew](https://brew.sh) when needed, then ffmpeg. If `swift` is missing it opens the Command Line Tools installer. Object Capture and Three.js are not downloaded: Object Capture is part of macOS, Three.js ships in the repo.

## Run

```bash
./scripts/start-ui.sh
```

Opens `http://127.0.0.1:8741`.

1. Pick one or more videos (native macOS dialog, or drag and drop)
2. Choose quality: **preview / small / medium / full / profi**
3. Choose how many frames to use (the ceiling is Apple’s hardware limit, not an app cap)
4. The finished model appears in the browser

Projects are stored in `~/Projects/Video to 3D Photogrammetry/`. The original video is copied, not moved.

## How it works

1. `ffmpeg` extracts evenly spaced frames
2. `PhotogrammetrySession` builds a USDZ model
3. Model I/O exports an OBJ preview for the in-browser viewer ([Three.js](https://threejs.org/))

## Repository

```
web/                 Local server and UI
scripts/             Object Capture, preview export, start script
```

## Support

If this project helps you, you can sponsor it on [GitHub](https://github.com/sponsors/jakubfrasunek) or send a tip via [PayPal](https://paypal.me/frasunekjakub).

## License

MIT. Three.js files in `web/static/vendor/` keep their own MIT license.
