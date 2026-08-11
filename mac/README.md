# LocalDrop for macOS

This directory is a self-contained macOS preparation bundle. It can be copied to a Mac without mixing its source and packages with the Windows build.

## Quick setup

1. Copy `LocalDrop-macOS-Hazir.zip` to the Mac and extract it. The ZIP format is recommended because it preserves executable permissions.
2. Double-click `Kurulum.command`.
3. If macOS blocks the file on first launch, Control-click it and choose **Open**.

The first setup requires an internet connection to obtain Node.js and application dependencies. After installation, LocalDrop transfers files within the local network and does not upload them to the internet.

If the folder was copied without the ZIP and macOS reports missing execute permission, open Terminal in this directory and run:

```bash
chmod +x Kurulum.command LocalDrop-Baslat.command
```

The setup helper:

- Checks the Mac and processor architecture (Apple Silicon or Intel)
- Offers to install a current Node.js release through Homebrew when needed
- Performs a clean dependency installation and runs the tests
- Builds the appropriate `LocalDrop.app`, DMG, and ZIP packages
- Installs the app in `~/Applications/LocalDrop.app`
- Opens LocalDrop

Generated packages remain in `mac/kurulum`. The source is in `mac/kaynak`; dependencies and temporary build files stay inside that area.

For later launches, double-click `LocalDrop-Baslat.command`.

## Transfer storage

```text
~/Documents/LocalDrop/files/uploads
~/Documents/LocalDrop/files/download
```

- `uploads`: files sent from the Mac to a phone
- `download`: files received from a phone

## Signing notice

The local build is not signed and notarized with an Apple Developer certificate. The setup helper applies a local ad-hoc signature. Build and install only from a source bundle you trust; macOS may request confirmation on first launch.
