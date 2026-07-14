# Changelog

## 2.2.44

- Pacchetto aggiornato al contratto Home Assistant Apps; requisito minimo 2026.2.
- Connessione zero-config al Core tramite Supervisor, senza token manuale.
- Supporto immagini multi-arch `amd64` e `aarch64`.

All notable changes to the MyHome Home Assistant app packaging are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.2.44] - 2026-07-14

### Added

- Home Assistant store icon, logo, repository metadata, and app documentation.

### Changed

- Publish a multi-architecture image for the supported `aarch64` and `amd64`
  platforms.
- Align container metadata with the current Home Assistant app specification.
- Use the Supervisor Home Assistant API proxy by default, with optional remote
  URL and token overrides.
- Keep the app configuration LAN-only by removing obsolete cloud database
  options.
