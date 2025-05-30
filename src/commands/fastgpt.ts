import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queryFastGPT } from '../utils/kagiApi';
import { createThreadForResults, sendMessageToThread } from '../utils/threadManager';
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
  await interaction.deferReply();

  try {
    const query = interaction.options.getString('query');
    
    if (!query) {
      await interaction.editReply('Query is required');
      return;
    }
    
    const cache = interaction.options.getBoolean('cache') ?? true;

    const response = await queryFastGPT({
      query,
      cache,
      web_search: true
    });

    const { output, references } = response.data;
    
    const formattedOutput = convertHtmlToMarkdown(output);

    let replyContent = `**Query:** ${query}\n\n${formattedOutput}`;

    if (references && references.length > 0) {
      replyContent += '\n\n**Sources:**\n';
      references.slice(0, 5).forEach((ref, index) => {
        replyContent += `${index + 1}. [${ref.title}](${ref.url})\n`;
      });

      if (references.length > 5) {
        replyContent += `...and ${references.length - 5} more sources`;
      }
    }
    
    replyContent += `\n\n**API Balance:** $${response.meta.api_balance?.toFixed(3) || 'N/A'}`;

    // Check conditions for thread creation:
    // 1. Response contains code blocks
    // 2. Response is very long
    // 3. Thread creation is enabled in config
    const hasCodeBlocks = replyContent.includes("```");
    const isLongResponse = replyContent.length > 1500;
    const createThreads = process.env.CREATE_THREADS_FOR_RESULTS === 'true';
    
    // Use thread if appropriate
    if (createThreads && (hasCodeBlocks || isLongResponse)) {
      const thread = await createThreadForResults(interaction, query, 'fastgpt');
      
      if (thread) {
        // If thread creation succeeded, send reply directing to thread
        await interaction.editReply(`Answer to "${query}" is available in the thread below.`);
        
        // Send message to thread with full content
        await sendMessageToThread(thread, replyContent);
        return;
      }
      // If thread creation failed, fall through to normal reply handling
    }
    
    // For responses that fit in a single message, or if thread creation failed/disabled
    const messageChunks = splitDiscordMessage(replyContent);
    
    if (messageChunks.length === 1 && messageChunks[0].length <= 2000) {
      // Short message, just send it
      await interaction.editReply(messageChunks[0]);
    } else if (messageChunks.length > 1) {
      // Multiple chunks needed, send as separate messages
      await interaction.editReply(messageChunks[0]);
      
      for (let i = 1; i < messageChunks.length; i++) {
        await interaction.followUp(messageChunks[i]);
      }
    } else {
      // Message too long and couldn't be split nicely, truncate
      const truncated = replyContent.substring(0, 1950) + "... (response truncated due to length)";
      await interaction.editReply(truncated);
    }
  } catch (error: unknown) {
    console.error('Error in fastgpt command:', error);
    
    let errorMessage = 'An error occurred while querying the Kagi FastGPT API.';
    
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      errorMessage += ` Error: ${error.response.data.detail}`;
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    await interaction.editReply(errorMessage);
  }
} 