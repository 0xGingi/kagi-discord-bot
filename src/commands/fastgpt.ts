import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queryFastGPT } from '../utils/kagiApi';
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
    
    // Convert HTML to Markdown
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

    if (replyContent.length > 2000) {
      let truncatePoint = 1950;
      while (truncatePoint > 1900 && !/\s/.test(replyContent[truncatePoint])) {
        truncatePoint--;
      }
      replyContent = replyContent.substring(0, truncatePoint) + '... (response truncated due to length)';
    }

    await interaction.editReply(replyContent);
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