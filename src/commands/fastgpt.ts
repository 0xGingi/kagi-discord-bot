import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queryFastGPT } from '../utils/kagiApi';
import { createThreadForResults, shouldCreateThread, sendMessageToThread } from '../utils/threadManager';
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
  )
  .addBooleanOption(option =>
    option.setName('split_response')
      .setDescription('Split long responses into multiple messages instead of using threads (default: false)')
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
    const splitResponse = interaction.options.getBoolean('split_response') ?? false;

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

    const shouldUseThread = !splitResponse && shouldCreateThread(replyContent.length);
    const thread = shouldUseThread ? await createThreadForResults(interaction, query, 'fastgpt') : null;

    if (thread) {
      await interaction.editReply(`Answer to "${query}" is available in the thread below.`);
      
      await sendMessageToThread(thread, replyContent);
    } else if (replyContent.length > 2000 && !splitResponse) {
      let truncatePoint = 1950;
      while (truncatePoint > 1900 && !/\s/.test(replyContent[truncatePoint])) {
        truncatePoint--;
      }
      replyContent = replyContent.substring(0, truncatePoint) + '... (response truncated due to length)';
      await interaction.editReply(replyContent);
    } else if (replyContent.length > 2000 && splitResponse) {
      const chunks = splitMessageIntoChunks(replyContent, 1900);
      
      await interaction.editReply(chunks[0]);
      
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
      }
    } else {
      await interaction.editReply(replyContent);
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

function splitMessageIntoChunks(message: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let remainingMessage = message;
  
  while (remainingMessage.length > 0) {
    if (remainingMessage.length <= maxChunkSize) {
      chunks.push(remainingMessage);
      break;
    }
    
    let splitPoint = maxChunkSize;
    while (splitPoint > maxChunkSize - 100 && !/\s/.test(remainingMessage[splitPoint])) {
      splitPoint--;
    }
    
    if (splitPoint <= maxChunkSize - 100) {
      splitPoint = maxChunkSize;
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