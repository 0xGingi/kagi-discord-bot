import { ChatInputCommandInteraction, ThreadChannel, TextChannel } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const THREAD_CREATION_ENABLED = process.env.CREATE_THREADS_FOR_RESULTS === 'true';
const MAX_DISCORD_MESSAGE_LENGTH = 2000;

export async function createThreadForResults(
  interaction: ChatInputCommandInteraction,
  query: string,
  commandName: string
): Promise<ThreadChannel | null> {
  if (!THREAD_CREATION_ENABLED || !interaction.channel || !interaction.guildId) {
    return null;
  }
  
  if (!(interaction.channel instanceof TextChannel)) {
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

    return thread;
  } catch (error) {
    console.error(`Error creating thread: ${error}`);
    return null;
  }
}

export async function sendMessageToThread(thread: ThreadChannel, content: string | { embeds: any[] }): Promise<void> {
  if (typeof content !== 'string') {
    await thread.send(content);
    return;
  }
  
  const MAX_MESSAGE_LENGTH = 1900;
  
  if (content.length <= MAX_MESSAGE_LENGTH) {
    await thread.send(content);
    return;
  }
  
  const chunks = splitMessageIntoChunks(content, MAX_MESSAGE_LENGTH);
  
  for (const chunk of chunks) {
    await thread.send(chunk);
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
  // Only create threads when the content would exceed Discord's message length limit
  // This means we'd need multiple messages, making a thread worthwhile
  return THREAD_CREATION_ENABLED && contentLength > MAX_DISCORD_MESSAGE_LENGTH;
} 