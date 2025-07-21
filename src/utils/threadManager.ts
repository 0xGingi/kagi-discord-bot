import { ChatInputCommandInteraction, ThreadChannel, TextChannel } from 'discord.js';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

const THREAD_CREATION_ENABLED = process.env.CREATE_THREADS_FOR_RESULTS === 'true';
const MAX_DISCORD_MESSAGE_LENGTH = 2000;

export async function createThreadForResults(
  interaction: ChatInputCommandInteraction,
  query: string,
  commandName: string
): Promise<ThreadChannel | null> {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  
  logger.debug('Attempting to create thread', {
    userId,
    guildId,
    channelId,
    commandName,
    threadCreationEnabled: THREAD_CREATION_ENABLED,
    queryLength: query.length
  });

  if (!THREAD_CREATION_ENABLED) {
    logger.debug('Thread creation disabled by configuration', { userId, commandName });
    return null;
  }
  
  if (!interaction.channel || !interaction.guildId) {
    logger.warn('Cannot create thread: missing channel or guild', { 
      userId, 
      commandName,
      hasChannel: !!interaction.channel,
      hasGuild: !!interaction.guildId 
    });
    return null;
  }
  
  if (!(interaction.channel instanceof TextChannel)) {
    logger.warn('Cannot create thread: channel is not a text channel', { 
      userId, 
      commandName,
      channelType: interaction.channel.type 
    });
    return null;
  }

  try {
    const capitalizedCommand = commandName.charAt(0).toUpperCase() + commandName.slice(1);
    
    let threadName = `${capitalizedCommand}: ${query}`;
    if (threadName.length > 100) {
      threadName = threadName.substring(0, 97) + '...';
    }

    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: 60,
      reason: `${capitalizedCommand} results for query: ${query}`
    });

    logger.info('Thread created successfully', {
      userId,
      commandName,
      threadId: thread.id,
      threadName,
      guildId,
      channelId
    });

    return thread;
  } catch (error) {
    logger.error('Error creating thread', error, {
      userId,
      commandName,
      guildId,
      channelId,
      queryLength: query.length
    });
    return null;
  }
}

export async function sendMessageToThread(thread: ThreadChannel, content: string | { embeds: any[] }): Promise<void> {
  const threadId = thread.id;
  const guildId = thread.guildId;
  const isStringContent = typeof content === 'string';
  
  logger.debug('Sending message to thread', {
    threadId,
    guildId,
    contentType: isStringContent ? 'string' : 'embed',
    contentLength: isStringContent ? (content as string).length : undefined
  });

  try {
    if (!isStringContent) {
      await thread.send(content);
      logger.debug('Sent embed message to thread', { threadId, guildId });
      return;
    }
    
    const stringContent = content as string;
    const MAX_MESSAGE_LENGTH = 1900;
    
    if (stringContent.length <= MAX_MESSAGE_LENGTH) {
      await thread.send(stringContent);
      logger.debug('Sent single message to thread', { 
        threadId, 
        guildId, 
        messageLength: stringContent.length 
      });
      return;
    }
    
    const chunks = splitMessageIntoChunks(stringContent, MAX_MESSAGE_LENGTH);
    logger.debug('Split content into chunks for thread', { 
      threadId, 
      guildId,
      totalChunks: chunks.length,
      chunkLengths: chunks.map(chunk => chunk.length)
    });
    
    for (let i = 0; i < chunks.length; i++) {
      await thread.send(chunks[i]);
      logger.debug('Sent chunk to thread', { 
        threadId, 
        guildId,
        chunkIndex: i + 1,
        totalChunks: chunks.length,
        chunkLength: chunks[i].length
      });
      
      // Small delay between chunks to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info('Successfully sent all message chunks to thread', { 
      threadId, 
      guildId,
      totalChunks: chunks.length
    });
  } catch (error) {
    logger.error('Error sending message to thread', error, {
      threadId,
      guildId,
      contentType: isStringContent ? 'string' : 'embed',
      contentLength: isStringContent ? (content as string).length : undefined
    });
    throw error;
  }
}

function splitMessageIntoChunks(message: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remainingMessage = message;
  
  while (remainingMessage.length > 0) {
    if (remainingMessage.length <= maxLength) {
      chunks.push(remainingMessage);
      break;
    }
    
    let splitPoint = maxLength;
    while (splitPoint > maxLength - 100 && !/\s/.test(remainingMessage[splitPoint])) {
      splitPoint--;
    }
    
    if (splitPoint <= maxLength - 100) {
      splitPoint = maxLength;
    }
    
    chunks.push(remainingMessage.substring(0, splitPoint));
    remainingMessage = remainingMessage.substring(splitPoint);
    
    if (chunks.length > 0 && remainingMessage.length > 0) {
      chunks[chunks.length - 1] += ' (continued...)';
    }
  }
  
  return chunks.map((chunk, index) => 
    `${index > 0 ? `**[Part ${index + 1}/${chunks.length}]**\n\n` : ''}${chunk}`
  );
}

export function shouldCreateThread(contentLength: number): boolean {
  const shouldCreate = THREAD_CREATION_ENABLED && contentLength > MAX_DISCORD_MESSAGE_LENGTH;
  
  logger.debug('Evaluating if thread should be created', {
    contentLength,
    maxLength: MAX_DISCORD_MESSAGE_LENGTH,
    threadCreationEnabled: THREAD_CREATION_ENABLED,
    shouldCreate
  });
  
  return shouldCreate;
} 