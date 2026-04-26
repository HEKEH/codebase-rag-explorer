export interface EmbeddingRecord {
  chunk_id: string;
  repo_id: string;
  vector: number[];
  dimension: number;
}
