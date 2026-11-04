// YouTube videos shown in the panel feed (HomeFeed, "Videos" section).
// Every ID below was verified from a YouTube search result before writing:
// the ID is the v= value in that result's exact watch URL, the title/channel
// are that result's title/channel. Tapping a card opens the video on
// YouTube in a new tab — nothing autoplays in-app.
export interface YoutubeVideo {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

const yt = (id: string, youtubeId: string, title: string, channel: string): YoutubeVideo => ({
  id,
  youtubeId,
  title,
  channel,
  thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
  url: `https://www.youtube.com/watch?v=${youtubeId}`,
});

export const YOUTUBE_VIDEOS: YoutubeVideo[] = [
  yt('yt-1', 'k5yQBhDnrvM', 'Tomorrowland Belgium 2026 | Official Aftermovie', 'Tomorrowland'),
  yt('yt-2', '1zcTFxuG-II', 'Tomorrowland Winter 2025 | Official Aftermovie', 'Tomorrowland'),
  yt('yt-3', 'JCf3cx9edOI', 'Tomorrowland Brasil 2025 | Aftermovie', 'Tomorrowland'),
  yt('yt-4', 'iDdDmD9pF6c', 'Tomorrowland 2026 | Official Smash The House Stage Aftermovie', 'Tomorrowland'),
  yt('yt-5', 'UWb5Qc-fBvk', 'Tomorrowland 2012 | official aftermovie', 'Tomorrowland'),
  yt('yt-6', '4GjztNT2bRE', 'ULTRA MIAMI 2026 - SYNCHRONICITY (Official Aftermovie)', 'UMF TV'),
  yt('yt-7', '5eDxz3cLyHw', 'ULTRA MIAMI 2025 - INTO HYPERSPACE (Official Aftermovie)', 'UMF TV'),
  yt('yt-8', '3TlJWoM69ww', 'RELIVE ULTRA MIAMI 2012 (Official Aftermovie)', 'UMF TV'),
  yt('yt-9', 'ua_GPKxszvQ', 'EDC Las Vegas Day 1 Recap', 'Insomniac'),
  yt('yt-10', 'bPaT2gEpSKg', 'EDC Las Vegas | 2022 Recap Video', 'Insomniac'),
  yt('yt-11', 'plDRI7DCKUA', 'RECAP: EDC Las Vegas 2012', 'Insomniac'),
  yt('yt-12', '2ifLispXhI4', 'Official Coachella Video Recap', 'Coachella'),
];
