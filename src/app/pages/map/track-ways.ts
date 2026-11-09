import { IDF_TRACK_WAYS } from './idf-tracks';
import { TrackWay, decodeWay } from './track-geometry';

const cache = new Map<number, TrackWay>();

/** Decodes a track way on first use; ways are shared by every line that runs on them. */
export function getTrackWay(index: number): TrackWay {
  let way = cache.get(index);
  if (!way) {
    way = decodeWay(IDF_TRACK_WAYS[index]);
    cache.set(index, way);
  }
  return way;
}
