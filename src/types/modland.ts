// Modland database types

export interface ModlandFile {
  song_id: number;
  hash_id: string;
  pattern_hash: number | null;
  url: string;
}

export interface ModlandSample {
  hash_id: string;
  song_id: number;
  song_sample_id: number;
  text: string;
  length_bytes: number;
  length: number;
}

export interface ModlandInstrument {
  hash_id: string;
  song_id: number;
  text: string;
}

export interface ModlandMetadata {
  artist: string;
  title: string;
  format: string;
  year?: string;
}

export interface ModlandSearchResult {
  file: ModlandFile;
  metadata: ModlandMetadata;
}
