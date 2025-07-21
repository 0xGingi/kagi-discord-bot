import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
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

export const data = new SlashCommandBuilder()
  .setName('fastgpt')
  .setDescription('Query the Kagi FastGPT API')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('The question you want to ask')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option.setName('cache')
      .setDescription('Whether to allow cached responses (default: true)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const startTime = Date.now();
  const userId = interaction.user.id;
  const commandName = 'fastgpt';
  
  try {
    await interaction.deferReply();
    logger.debug('FastGPT command deferred reply successfully', { userId });

    const query = interaction.options.getString('query');
    const cache = interaction.options.getBoolean('cache') ?? true;
    
    if (!query) {
      logger.warn('FastGPT command called without query parameter', { userId });
      await interaction.editReply('Query is required');
      return;
    }
    
    logger.info('Processing FastGPT query', { 
      userId, 
      queryLength: query.length, 
      cache,
      queryPreview: query.substring(0, 50) + (query.length > 50 ? '...' : '')
    });

    const response = await queryFastGPT({
      query,
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

    // Check conditions for thread creation:
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
    
    // Use thread if appropriate
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
        logger.warn('Failed to create thread for FastGPT response, using regular messages', threadError, { userId });
      }
    }
    
    // For responses that fit in a single message, or if thread creation failed/disabled
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
      // Message too long and couldn't be split nicely, truncate
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