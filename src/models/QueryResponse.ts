export interface Paragraph {
  id: string;
  originalURI: string;
  content: string;
  publicationDate: string;
  scoreInPercent: number;
  highlighting: string[];
  highlightBegin: number;
  highlightEnd: number;
}
export interface Document {
  id: string;
  originalURI: string;
  resourceURI: string;
  binaryURI: string;
  content: string;
  publicationDate: string;
  scoreInPercent: number;
  highlighting: string[];
  summary: string;
  paragraphs: Paragraph[];
}
export default interface QueryResponse {
  documents: Document[];
  conceptsOfQuery: string[];
  query?: string;
}
