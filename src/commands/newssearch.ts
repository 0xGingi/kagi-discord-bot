import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { queryNewsEnrichment } from '../utils/kagiApi';
import { createThreadForResults, shouldCreateThread, sendMessageToThread } from '../utils/threadManager';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('newssearch')
  .setDescription('Search for non-commercial news content using Kagi News Enrichment API')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('The search query')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const query = interaction.options.getString('query');
    
    if (!query) {
      await interaction.editReply('Query is required');
      return;
    }

    const response = await queryNewsEnrichment({ q: query });
    const searchResults = response.data;

    if (!searchResults || searchResults.length === 0) {
      await interaction.editReply('No news results found for your query.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle(`News Search Results for: ${query}`)
      .setDescription('Non-commercial news content from Kagi Enrichment API')
      .setFooter({ text: `API Balance: $${response.meta.api_balance?.toFixed(3) || 'N/A'}` })
      .setTimestamp();

    const maxResults = Math.min(10, searchResults.length);
    
    for (let i = 0; i < maxResults; i++) {
      const result = searchResults[i];
      
      const title = result.title || 'No title';
      const snippet = result.snippet || 'No description available';
      const url = result.url;
      
      let value = '';
      if (result.published) {
        const publishDate = new Date(result.published);
        value = `📅 ${publishDate.toLocaleDateString()}\n`;
      }
      
      const truncatedSnippet = snippet.length > 100 ? snippet.substring(0, 97) + '...' : snippet;
      value += `${truncatedSnippet}\n[Read more](${url})`;
      
      embed.addFields({
        name: `${i + 1}. ${title}`,
        value: value
      });
    }

    if (searchResults.length > maxResults) {
      embed.setFooter({ text: `Showing ${maxResults} of ${searchResults.length} results | API Balance: $${response.meta.api_balance?.toFixed(3) || 'N/A'}` });
    }

    const embedFields = embed.data.fields || [];
    let totalContentLength = 0;
    
    embedFields.forEach(field => {
      if (field.value) totalContentLength += field.value.length;
    });
    
    const shouldUseThread = totalContentLength > 2000;
    
    const thread = shouldUseThread && process.env.CREATE_THREADS_FOR_RESULTS === 'true'
      ? await createThreadForResults(interaction, query, 'newssearch')
      : null;

    if (thread) {
      await interaction.editReply({ 
        content: `News search results for: **${query}** are available in the thread below.` 
      });
      
      await sendMessageToThread(thread, { embeds: [embed] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error: unknown) {
    console.error('Error in newssearch command:', error);
    
    let errorMessage = 'An error occurred while querying the Kagi News Enrichment API.';
    
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      errorMessage += ` Error: ${error.response.data.detail}`;
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    await interaction.editReply(errorMessage);
  }
} 