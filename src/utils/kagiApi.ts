import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const KAGI_API_KEY = process.env.KAGI_API_KEY;

if (!KAGI_API_KEY) {
  throw new Error('KAGI_API_KEY is not set in the environment variables');
}

interface FastGPTParams {
  query: string;
  cache?: boolean;
  web_search?: boolean;
}

interface Reference {
  title: string;
  snippet: string;
  url: string;
}

interface FastGPTResponse {
  meta: {
    id: string;
    node: string;
    ms: number;
    api_balance?: number;
  };
  data: {
    output: string;
    tokens: number;
    references: Reference[];
  };
}

interface EnrichmentParams {
  q: string;
}

interface SearchObject {
  t: number;
  rank: number;
  url: string;
  title: string;
  snippet: string | null;
  published?: string;
}

interface EnrichmentResponse {
  meta: {
    id: string;
    node: string;
    ms: number;
    api_balance?: number;
  };
  data: SearchObject[];
}

interface SummarizerParams {
  url?: string;
  text?: string;
  engine?: 'cecil' | 'agnes' | 'muriel';
  summary_type?: 'summary' | 'takeaway';
  target_language?: string;
  cache?: boolean;
}

interface SummarizerResponse {
  meta: {
    id: string;
    node: string;
    ms: number;
    api_balance?: number;
  };
  data: {
    output: string;
    tokens: number;
  };
}

interface SearchParams {
  q: string;
  limit?: number;
}

interface SearchResponseMeta {
  id: string;
  node: string;
  ms: number;
  api_balance: number;
}

interface SearchResultObject {
  t: number;
  url: string;
  title: string;
  snippet?: string;
  published?: string;
  thumbnail?: {
    url: string;
    height?: number;
    width?: number;
  };
}

interface RelatedSearchObject {
  t: number;
  list: string[];
}

interface SearchResponse {
  meta: SearchResponseMeta;
  data: (SearchResultObject | RelatedSearchObject)[];
}

export async function queryFastGPT(params: FastGPTParams): Promise<FastGPTResponse> {
  try {
    const response = await axios.post('https://kagi.com/api/v0/fastgpt', params, {
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error querying FastGPT:', error);
    throw error;
  }
}

export async function queryWebEnrichment(params: EnrichmentParams): Promise<EnrichmentResponse> {
  try {
    const response = await axios.get('https://kagi.com/api/v0/enrich/web', {
      params,
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error querying Web Enrichment:', error);
    throw error;
  }
}

export async function queryNewsEnrichment(params: EnrichmentParams): Promise<EnrichmentResponse> {
  try {
    const response = await axios.get('https://kagi.com/api/v0/enrich/news', {
      params,
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error querying News Enrichment:', error);
    throw error;
  }
}

export async function querySummarizer(params: SummarizerParams): Promise<SummarizerResponse> {
  try {
    if (params.text) {
      const response = await axios.post('https://kagi.com/api/v0/summarize', params, {
        headers: {
          'Authorization': `Bot ${KAGI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } else {
      const response = await axios.get('https://kagi.com/api/v0/summarize', {
        params,
        headers: {
          'Authorization': `Bot ${KAGI_API_KEY}`
        }
      });
      return response.data;
    }
  } catch (error) {
    console.error('Error querying Universal Summarizer:', error);
    throw error;
  }
}

export async function querySearchAPI(params: SearchParams): Promise<SearchResponse> {
  try {
    const response = await axios.get('https://kagi.com/api/v0/search', {
      params,
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error querying Kagi Search API:', error);
    throw error;
  }
} 