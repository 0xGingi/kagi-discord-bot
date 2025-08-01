import { SlashCommandBuilder, ChatInputCommandInteraction, Attachment } from 'discord.js';
import { queryFastGPT } from '../utils/kagiApi';
import { createThreadForResults, sendMessageToThread } from '../utils/threadManager';
import logger from '../utils/logger';
import axios from 'axios';

function convertHtmlToMarkdown(html: string): string {
  return html
    .replace(/<h[1-6]>(.*?)<\/h[1-6]>/g, '**$1**')
    .replace(/<(b|strong)>(.*?)<\/(b|strong)>/g, '**$2**')
    .replace(/<(i|em)>(.*?)<\/(i|em)>/g, '*$2*')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<pre>(.*?)<\/pre>/g, '```\n$1\n```')
    .replace(/<ul>(.*?)<\/ul>/gs, '$1')
    .replace(/<ol>(.*?)<\/ol>/gs, '$1')
    .replace(/<li>(.*?)<\/li>/g, '• $1\n')
    .replace(/<a href="(.*?)".*?>(.*?)<\/a>/g, '[$2]($1)')
    .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#160;/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function splitDiscordMessage(message: string, maxLength: number = 1900): string[] {
  if (message.length <= maxLength) {
    return [message];
  }

  const chunks: string[] = [];
  let currentChunk = "";
  
  if (message.includes("```")) {
    return [message];
  }
  
  const lines = message.split("\n");
  
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxLength) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      if (currentChunk.length > 0) {
        currentChunk += "\n";
      }
      currentChunk += line;
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

async function processFileContent(attachment: Attachment): Promise<string> {
  const maxFileSize = 10 * 1024 * 1024; // 10MB limit
  const supportedTypes = ['text/plain', 'application/pdf', 'text/markdown', 'text/csv'];
  
  if (attachment.size > maxFileSize) {
    throw new Error(`File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB.`);
  }
  
  const extension = attachment.name.toLowerCase().split('.').pop();
  const textExtensions = ['txt', 'md', 'csv', 'json', 'log', 'py', 'js', 'ts', 'rs', 'go', 'java', 'cpp', 'c', 'h', 'php', 'rb', 'kt', 'swift', 'dart', 'sh', 'bat', 'ps1', 'yaml', 'yml', 'xml', 'html', 'css', 'scss', 'less', 'sql'];
  
  if (!supportedTypes.includes(attachment.contentType || '') && !textExtensions.includes(extension || '')) {
    logger.warn(`Attempting to read unsupported file type: ${attachment.contentType} (${extension})`, {
      fileName: attachment.name,
      contentType: attachment.contentType
    });
  }
  
  try {
    let content: string;
    
    if (attachment.contentType === 'application/pdf' || extension === 'pdf') {
      const response = await axios.get(attachment.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: maxFileSize
      });
      
      try {
        const pdfParse = await import('pdf-parse');
        const pdfData = await pdfParse.default(Buffer.from(response.data));
        content = pdfData.text;
        
        if (!content.trim()) {
          throw new Error('PDF appears to be empty or contains only images/scanned content');
        }
        
        logger.debug('PDF parsed successfully', {
          fileName: attachment.name,
          pages: pdfData.numpages,
          contentLength: content.length
        });
      } catch (pdfError) {
        logger.warn('Failed to parse PDF, attempting as text', {
          fileName: attachment.name,
          error: pdfError instanceof Error ? pdfError.message : String(pdfError)
        });
        const textResponse = await axios.get(attachment.url, {
          responseType: 'text',
          timeout: 30000,
          maxContentLength: maxFileSize
        });
        content = `[PDF Content - Warning: Could not parse PDF properly, showing raw content]\n\n${textResponse.data}`;
      }
    } else {
      const response = await axios.get(attachment.url, {
        responseType: 'text',
        timeout: 30000,
        maxContentLength: maxFileSize
      });
      content = response.data;
    }
    
    // Truncate to 8000 characters
    const maxContentLength = 8000;
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + '\n\n[Content truncated due to length...]';
    }
    
    return content;
  } catch (error) {
    logger.error('Failed to process file content', error, {
      fileName: attachment.name,
      fileSize: attachment.size,
      contentType: attachment.contentType
    });
    throw new Error(`Failed to read file content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const data = new SlashCommandBuilder()
  .setName('fastgpt')
  .setDescription('Query the Kagi FastGPT API')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('The question you want to ask')
      .setRequired(true)
  )
  .addAttachmentOption(option =>
    option.setName('file')
      .setDescription('Optional file to include in your query (PDF, TXT, etc.)')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option.setName('cache')
      .setDescription('Whether to allow cached responses (default: true)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const startTime = Date.now();
  const userId = interaction.user.id;
  
  try {
    await interaction.deferReply();
    logger.debug('FastGPT command deferred reply successfully', { userId });

    const query = interaction.options.getString('query');
    const attachment = interaction.options.getAttachment('file');
    const cache = interaction.options.getBoolean('cache') ?? true;
    
    if (!query) {
      logger.warn('FastGPT command called without query parameter', { userId });
      await interaction.editReply('Query is required');
      return;
    }
    
    let finalQuery = query;
    
    if (attachment) {
      logger.info('Processing file attachment for FastGPT query', {
        userId,
        fileName: attachment.name,
        fileSize: attachment.size,
        contentType: attachment.contentType
      });
      
      try {
        const fileContent = await processFileContent(attachment);
        finalQuery = `${query}\n\n--- File Content (${attachment.name}) ---\n${fileContent}`;
        
        logger.debug('File content processed successfully', {
          userId,
          fileName: attachment.name,
          contentLength: fileContent.length,
          finalQueryLength: finalQuery.length
        });
      } catch (error) {
        logger.error('Failed to process file attachment', error, {
          userId,
          fileName: attachment.name,
          fileSize: attachment.size
        });
        
        await interaction.editReply(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    }
    
    logger.info('Processing FastGPT query', { 
      userId, 
      originalQueryLength: query.length,
      finalQueryLength: finalQuery.length,
      hasAttachment: !!attachment,
      cache,
      queryPreview: query.substring(0, 50) + (query.length > 50 ? '...' : '')
    });

    const response = await queryFastGPT({
      query: finalQuery,
      cache,
      web_search: true
    });

    const { output, references } = response.data;
    logger.debug('FastGPT API response received', { 
      userId,
      outputLength: output.length,
      referencesCount: references?.length || 0,
      tokens: response.data.tokens
    });
    
    const formattedOutput = convertHtmlToMarkdown(output);
    logger.debug('HTML to Markdown conversion completed', { 
      userId,
      originalLength: output.length,
      convertedLength: formattedOutput.length
    });

    let replyContent = `**Query:** ${query}\n\n${formattedOutput}`;

    if (references && references.length > 0) {
      replyContent += '\n\n**Sources:**\n';
      references.slice(0, 5).forEach((ref, index) => {
        replyContent += `${index + 1}. [${ref.title}](${ref.url})\n`;
      });

      if (references.length > 5) {
        replyContent += `...and ${references.length - 5} more sources`;
      }
      
      logger.debug('Added references to FastGPT response', { 
        userId, 
        totalReferences: references.length,
        displayedReferences: Math.min(references.length, 5)
      });
    }
    
    replyContent += `\n\n**API Balance:** $${response.meta.api_balance?.toFixed(3) || 'N/A'}`;

    const hasCodeBlocks = replyContent.includes("```");
    const isLongResponse = replyContent.length > 1500;
    const createThreads = process.env.CREATE_THREADS_FOR_RESULTS === 'true';
    
    logger.debug('Evaluating response delivery method', {
      userId,
      responseLength: replyContent.length,
      hasCodeBlocks,
      isLongResponse,
      createThreads
    });
    
    if (createThreads && (hasCodeBlocks || isLongResponse)) {
      try {
        const thread = await createThreadForResults(interaction, query, 'fastgpt');
        
        if (thread) {
          logger.info('Created thread for FastGPT response', { 
            userId, 
            threadId: thread.id,
            reason: hasCodeBlocks ? 'code_blocks' : 'long_response'
          });
          
          await interaction.editReply(`Answer to "${query}" is available in the thread below.`);
          await sendMessageToThread(thread, replyContent);
          
          const duration = Date.now() - startTime;
          logger.info('FastGPT command completed successfully with thread', { 
            userId, 
            duration, 
            threadId: thread.id 
          });
          return;
        }
      } catch (threadError) {
        logger.warn('Failed to create thread for FastGPT response, using regular messages', { 
          userId, 
          error: threadError instanceof Error ? threadError.message : String(threadError) 
        });
      }
    }
    
    const messageChunks = splitDiscordMessage(replyContent);
    logger.debug('Split response into message chunks', { 
      userId, 
      totalChunks: messageChunks.length,
      chunkLengths: messageChunks.map(chunk => chunk.length)
    });
    
    if (messageChunks.length === 1 && messageChunks[0].length <= 2000) {
      await interaction.editReply(messageChunks[0]);
      logger.debug('Sent single message response', { userId });
    } else if (messageChunks.length > 1) {
      await interaction.editReply(messageChunks[0]);
      
      for (let i = 1; i < messageChunks.length; i++) {
        await interaction.followUp(messageChunks[i]);
      }
      logger.info('Sent multi-chunk response', { userId, totalChunks: messageChunks.length });
    } else {
      const truncated = replyContent.substring(0, 1950) + "... (response truncated due to length)";
      await interaction.editReply(truncated);
      logger.warn('Response truncated due to excessive length', { 
        userId, 
        originalLength: replyContent.length,
        truncatedLength: truncated.length
      });
    }
    
    const duration = Date.now() - startTime;
    logger.info('FastGPT command completed successfully', { userId, duration });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    logger.error('FastGPT command failed', error, { 
      userId, 
      duration,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    
    let errorMessage = 'An error occurred while querying the Kagi FastGPT API.';
    
    if (axios.isAxiosError(error)) {
      if (error.response?.data?.detail) {
        errorMessage += ` Error: ${error.response.data.detail}`;
      } else if (error.response?.status) {
        errorMessage += ` HTTP ${error.response.status}: ${error.response.statusText}`;
      }
      logger.debug('Axios error details', { 
        userId,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    try {
      await interaction.editReply(errorMessage);
    } catch (replyError) {
      logger.error('Failed to send error message to user', replyError, { userId, originalError: error });
    }
  }
} 