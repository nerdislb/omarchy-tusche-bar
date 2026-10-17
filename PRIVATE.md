# Private until the Omi licence is settled

This repository is a **private** working fork of
[omarchy-tusche-bar](https://github.com/nerdislb/omarchy-tusche-bar) with the Omi focus seal
(`seal: omi`, idle life, speech bubble, battery) on `main`, and the island's
`companion` signals on the branch `island-companion-signals`
(a fork of [omarchy-tusche-island](https://github.com/nerdislb/omarchy-tusche-island)).

**Do not make it public, push it to a public remote, or open a pull request from it** until
the open question below is answered.

## The open question

Omi ([tahayvr/omi](https://github.com/tahayvr/omi)) is a mascot drawn from the Omarchy
logo. Its *code* is MIT, but its *design* (the kit data, the pictures, anything a player draws from
them) is declared a derivative of the Omarchy logo, owned by the Omacom Foundation, with no licence
granted. We therefore need an answer from the author and/or the Omacom Foundation on whether a plugin
that loads Omi at runtime (without shipping it) may be published, and under what attribution.

## What is and is not in here

- **Not in the repository:** Omi's player, kit or pictures. `setup/omi-fetch.sh` downloads one pinned,
  sha256-checked release (v1.0.0) into the user's own data directory (`~/.local/share/tusche-bar/omi-<release>-<time>`, named by `current`). The
  repository's own history was scanned for these files before it was first pushed.
- **In the repository:** our own code (`FocusSeal.js`, `OmiArt.js`, `IdleDirector.js`, `IdleWatch.qml`,
  `CompanionFeed.qml`, `modules/OmiFace.qml`) and tests. Its speech bubble, battery and fly are our own
  rectangles. The code refers to Omi's mode names (`idle`, `wink`, …) and API, which a licence reading
  might still count as derived, hence the question.

## Publishing later

If it is cleared: drop this file, merge `main` into `omarchy-tusche-bar` and
`island-companion-signals` into `omarchy-tusche-island`. If it is refused: keep the face-independent
state model (`FocusSeal.js companion()`, `IdleDirector.js`) and replace `modules/OmiFace.qml` with a skin of
our own, for example the Tusche seal with the same states.
