import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

const KAGI_API_KEY = process.env.KAGI_API_KEY;

if (!KAGI_API_KEY) {
  logger.error('KAGI_API_KEY is not set in environment variables');
  throw new Error('KAGI_API_KEY is not set in the environment variables');
}

// Helper function to handle API errors consistently
function handleApiError(error: any, endpoint: string, params?: any): never {
  if (error.response) {
    // Server responded with error status
    const statusCode = error.response.status;
    const responseData = error.response.data;
    
    logger.apiError(endpoint, error, {
      statusCode,
      responseData,
      params: params ? JSON.stringify(params) : undefined
    });
    
    switch (statusCode) {
      case 400:
        throw new Error(`Bad Request: Invalid parameters sent to ${endpoint}`);
      case 401:
        throw new Error('Unauthorized: Invalid or missing Kagi API key');
      case 402:
        throw new Error('Payment Required: Insufficient Kagi API credits');
      case 403:
        throw new Error('Forbidden: Access denied to Kagi API endpoint');
      case 404:
        throw new Error(`Not Found: ${endpoint} endpoint not found`);
      case 429:
        throw new Error('Rate Limited: Too many requests to Kagi API');
      case 500:
        throw new Error('Internal Server Error: Kagi API is experiencing issues');
      case 503:
        throw new Error('Service Unavailable: Kagi API is temporarily unavailable');
      default:
        throw new Error(`API Error ${statusCode}: ${responseData?.message || 'Unknown error'}`);
    }
  } else if (error.request) {
    // Request was made but no response received
    logger.apiError(endpoint, error, {
      type: 'network_error',
      params: params ? JSON.stringify(params) : undefined
    });
    throw new Error(`Network Error: Unable to reach ${endpoint}. Please check your internet connection.`);
  } else {
    // Error in request setup
    logger.apiError(endpoint, error, {
      type: 'request_setup_error',
      params: params ? JSON.stringify(params) : undefined
    });
    throw new Error(`Request Error: Failed to setup request to ${endpoint}`);
  }
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
  const endpoint = 'https://kagi.com/api/v0/fastgpt';
  const startTime = Date.now();
  
  logger.apiRequest(endpoint, 'POST', {
    query: params.query.substring(0, 100) + (params.query.length > 100 ? '...' : ''),
    cache: params.cache,
    web_search: params.web_search
  });

  try {
    const response = await axios.post(endpoint, params, {
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    const duration = Date.now() - startTime;
    logger.apiResponse(endpoint, duration, response.status, {
      tokens: response.data?.data?.tokens,
      referencesCount: response.data?.data?.references?.length || 0,
      apiBalance: response.data?.meta?.api_balance
    });

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.apiError(endpoint, error, { duration, params: JSON.stringify(params) });
    handleApiError(error, endpoint, params);
  }
}

export async function queryWebEnrichment(params: EnrichmentParams): Promise<EnrichmentResponse> {
  const endpoint = 'https://kagi.com/api/v0/enrich/web';
  const startTime = Date.now();
  
  logger.apiRequest(endpoint, 'GET', {
    query: params.q.substring(0, 100) + (params.q.length > 100 ? '...' : '')
  });

  try {
    const response = await axios.get(endpoint, {
      params,
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`
      },
      timeout: 30000
    });

    const duration = Date.now() - startTime;
    logger.apiResponse(endpoint, duration, response.status, {
      resultsCount: response.data?.data?.length || 0,
      apiBalance: response.data?.meta?.api_balance
    });

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.apiError(endpoint, error, { duration, params: JSON.stringify(params) });
    handleApiError(error, endpoint, params);
  }
}

export async function queryNewsEnrichment(params: EnrichmentParams): Promise<EnrichmentResponse> {
  const endpoint = 'https://kagi.com/api/v0/enrich/news';
  const startTime = Date.now();
  
  logger.apiRequest(endpoint, 'GET', {
    query: params.q.substring(0, 100) + (params.q.length > 100 ? '...' : '')
  });

  try {
    const response = await axios.get(endpoint, {
      params,
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`
      },
      timeout: 30000
    });

    const duration = Date.now() - startTime;
    logger.apiResponse(endpoint, duration, response.status, {
      resultsCount: response.data?.data?.length || 0,
      apiBalance: response.data?.meta?.api_balance
    });

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.apiError(endpoint, error, { duration, params: JSON.stringify(params) });
    handleApiError(error, endpoint, params);
  }
}

export async function querySummarizer(params: SummarizerParams): Promise<SummarizerResponse> {
  const endpoint = 'https://kagi.com/api/v0/summarize';
  const startTime = Date.now();
  const isTextSummary = !!params.text;
  
  logger.apiRequest(endpoint, isTextSummary ? 'POST' : 'GET', {
    url: params.url,
    textLength: params.text?.length,
    engine: params.engine || 'cecil',
    summaryType: params.summary_type || 'takeaway',
    targetLanguage: params.target_language
  });

  try {
    let response;
    
    if (isTextSummary) {
      response = await axios.post(endpoint, params, {
        headers: {
          'Authorization': `Bot ${KAGI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // Longer timeout for summarization
      });
    } else {
      response = await axios.get(endpoint, {
        params,
        headers: {
          'Authorization': `Bot ${KAGI_API_KEY}`
        },
        timeout: 60000
      });
    }

    const duration = Date.now() - startTime;
    logger.apiResponse(endpoint, duration, response.status, {
      tokens: response.data?.data?.tokens,
      engine: params.engine || 'cecil',
      apiBalance: response.data?.meta?.api_balance
    });

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.apiError(endpoint, error, { duration, params: JSON.stringify(params) });
    handleApiError(error, endpoint, params);
  }
}

export async function querySearchAPI(params: SearchParams): Promise<SearchResponse> {
  const endpoint = 'https://kagi.com/api/v0/search';
  const startTime = Date.now();
  
  logger.apiRequest(endpoint, 'GET', {
    query: params.q.substring(0, 100) + (params.q.length > 100 ? '...' : ''),
    limit: params.limit || 10
  });

  try {
    const response = await axios.get(endpoint, {
      params,
      headers: {
        'Authorization': `Bot ${KAGI_API_KEY}`
      },
      timeout: 30000
    });

    const duration = Date.now() - startTime;
    logger.apiResponse(endpoint, duration, response.status, {
      resultsCount: response.data?.data?.filter((item: any) => item.t === 0)?.length || 0,
      apiBalance: response.data?.meta?.api_balance
    });

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.apiError(endpoint, error, { duration, params: JSON.stringify(params) });
    handleApiError(error, endpoint, params);
  }
} 