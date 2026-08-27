# ArtistOS contract

ArtistOS is useful offline with Node.js 20+, a browser, and a writable workspace.
The core binds to loopback by default, stores state inside the selected workspace,
and treats missing catalogs, profiles, renderers, AI systems, live-data clients,
and publishing adapters as optional.

The content pipeline is `idea → creating → review → ready → posted`. Approval is
a recorded artist decision; it does not move media, publish, mint, or promote an
artifact. Networked and publishing integrations are disabled by default and
require explicit configuration plus action-specific confirmation.

Forks should add local artist material under their own workspace, never this code
repository. Do not copy another artist's persona, marks, approvals, biography,
feedback, analytics, or rights assertions as seed data.
