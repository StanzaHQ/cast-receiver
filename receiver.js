// Stanza Cast receiver.

'use strict';

const CONTENT_TYPES = {
  m3u8: 'application/x-mpegurl',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
};

// Cast firmware (Chromecast, Nest Hub, Cast-enabled TVs) identifies itself as CrKey.
const onCastDevice =
  /CrKey/.test(navigator.userAgent) &&
  typeof cast !== 'undefined' &&
  Boolean(cast.framework && cast.framework.CastReceiverContext);

function setState(state) {
  document.body.dataset.state = state;
}

function assetUrl(path) {
  return `url("${new URL(path, document.baseURI).href}")`;
}

function contentTypeFor(url, declared) {
  if (declared && declared !== 'application/octet-stream') return declared;
  let extension = '';
  try {
    extension = new URL(url, document.baseURI).pathname.split('.').pop().toLowerCase();
  } catch {
    // Not a URL we can parse; let the player sniff it.
  }
  return CONTENT_TYPES[extension] || declared || 'video/mp4';
}

function isHls(contentType) {
  return /mpegurl/i.test(contentType);
}

// The sender knows how the server packaged the stream, so honour its hint.
function applySegmentFormat(media, hints) {
  const { HlsSegmentFormat, HlsVideoSegmentFormat } = cast.framework.messages;
  const format = String((hints && hints.hlsSegmentFormat) || '').toLowerCase();

  if (format === 'fmp4') {
    media.hlsSegmentFormat = HlsSegmentFormat.FMP4;
    media.hlsVideoSegmentFormat = HlsVideoSegmentFormat.FMP4;
  } else if (format === 'ts') {
    media.hlsSegmentFormat = HlsSegmentFormat.TS;
    media.hlsVideoSegmentFormat = HlsVideoSegmentFormat.MPEG2_TS;
  }
}

function prepareTextTracks(media) {
  const { TrackType } = cast.framework.messages;
  for (const track of media.tracks || []) {
    if (track.type === TrackType.TEXT && !track.trackContentType) {
      track.trackContentType = 'text/vtt';
    }
  }
}

function prepareMetadata(media, url) {
  if (media.metadata) return;
  const metadata = new cast.framework.messages.GenericMediaMetadata();
  metadata.title = decodeURIComponent(url.split('/').pop().split('?')[0]);
  media.metadata = metadata;
}

function interceptLoad(request) {
  const { ErrorData, ErrorType, ErrorReason } = cast.framework.messages;
  const media = request.media;
  const url = media && (media.contentUrl || media.contentId);

  if (!url) {
    const error = new ErrorData(ErrorType.LOAD_FAILED);
    error.reason = ErrorReason.INVALID_REQUEST;
    return error;
  }

  media.contentUrl = url;
  media.contentType = contentTypeFor(url, media.contentType);
  if (isHls(media.contentType)) {
    applySegmentFormat(media, media.customData || request.customData);
  }
  prepareTextTracks(media);
  prepareMetadata(media, url);

  setState('active');
  return request;
}

function startReceiver() {
  const context = cast.framework.CastReceiverContext.getInstance();
  const playerManager = context.getPlayerManager();
  const { MessageType } = cast.framework.messages;

  document.body.classList.add('on-device');

  // Set here rather than in CSS so the URLs resolve against this page,
  // not the player's own stylesheet.
  const player = document.querySelector('cast-media-player');
  player.style.setProperty('--splash-image', assetUrl('assets/stanza-mark.png'));
  player.style.setProperty('--logo-image', assetUrl('assets/stanza-mark.png'));

  playerManager.setMessageInterceptor(MessageType.LOAD, interceptLoad);
  // Fires on end of stream, a stop from the sender, and playback errors alike.
  playerManager.addEventListener(cast.framework.events.EventType.MEDIA_FINISHED, () => {
    setState('idle');
  });

  context.start();
}

if (onCastDevice) {
  startReceiver();
}
