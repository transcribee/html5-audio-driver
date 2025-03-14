import { compose, ifElse, identity } from "ramda";
import { getNodeFromEvent } from "./utils";
import { initialized, duration, props } from "./props";
import { MediaElement } from "./types";
import Hls from "hls.js";

/**
 * Node Defaults
 *
 * Disables media defaults
 */

const setMediaDefaults = (node: MediaElement) => {
  node.autoplay = false;
  node.loop = false;
  node.preload = "auto"; // if set to 'none' this won't trigger canplay events in IE11 or won't play in Safari
  node.controls = false;
  node.playtime = 0;
  node.liveSync = null;
  node.initialized = false;
  node.hls = null;

  return node;
};

/**
 * Playtime Polyfill
 *
 * Adds ability for Safari to set the playtime without the need of loading the full file
 */
const updatePlaytimeToCurrentTime = (media: MediaElement) => {
  media.playtime = media.currentTime;
  return media;
};

const updateCurrentTimeToPlaytime = (media: MediaElement) => {
  if (!media || !initialized(media)) {
    return media;
  }

  try {
    media.currentTime = media.playtime || 0;
  } catch (e) {}

  return media;
};

const readyToPlay = (node: MediaElement) => {
  node.initialized = true;

  return node;
};

// HTML Audio implementation 101 quirks: on Safari and iOS you just can set currentTime after loading
const polyfillPlaytime = (node: MediaElement) => {
  node.playtime = 0;

  node.addEventListener(
    "timeupdate",
    compose(updatePlaytimeToCurrentTime, getNodeFromEvent)
  );

  node.addEventListener(
    "canplay",
    compose(updateCurrentTimeToPlaytime, readyToPlay, getNodeFromEvent),
    { once: true }
  );

  node.addEventListener(
    "play",
    compose(updateCurrentTimeToPlaytime, getNodeFromEvent)
  );

  return node;
};

// [livesync] polyfill: adds a pointer to the live position
const isLivestream = (node: MediaElement) => duration(node) === Infinity;

const liveSyncPosition = ({ playtime, hls }: { playtime: number | undefined; hls: Hls | undefined}): number => {
  // not a http live stream
  if (!hls) {
    return 0;
  }

  // syncposition wasn't initialized yet
  if (!hls.liveSyncPosition) {
    return playtime || 0;
  }

  return hls.liveSyncPosition;
};

const addLiveSync = (node: MediaElement) => {
  if (!node) {
    return node;
  }

  const { playtime, hls } = props(node);

  node.liveSync = 0;

  setInterval(() => {
    const sync = liveSyncPosition({ playtime, hls });

    node.liveSync = sync > (node.liveSync || 0) ? sync : node.liveSync;

    node.liveSync = (node.liveSync || 0) + 1;
    node.dispatchEvent(new CustomEvent("livesyncupdate"));
  }, 1000);

  return node;
};

const resetToLivesync = (node: MediaElement) => {
  if (!node) {
    return node;
  }

  let { playtime, liveSync } = props(node);

  playtime = playtime || 0;
  liveSync = liveSync || 0;

  if (playtime > liveSync) {
    return node;
  }

  node.currentTime = liveSync;

  return node;
};

const polifyllLiveSync = (node: MediaElement) => {
  node.addEventListener(
    "canplay",
    compose(ifElse(isLivestream, addLiveSync, identity), getNodeFromEvent),
    { once: true }
  );

  node.addEventListener(
    "play",
    compose(ifElse(isLivestream, resetToLivesync, identity), getNodeFromEvent),
    { once: true }
  );

  return node;
};

export const mediaPolyfill = compose(
  setMediaDefaults,
  polyfillPlaytime,
  polifyllLiveSync
);
