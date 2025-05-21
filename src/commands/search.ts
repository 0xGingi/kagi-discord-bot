import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { querySearchAPI } from '../utils/kagiApi';
import { createThreadForResults, shouldCreateThread, sendMessageToThread } from '../utils/threadManager';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search the web using Kagi Search API')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('The search query')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('limit')
      .setDescription('Maximum number of results to display (1-10)')
      .setMinValue(1)
      .setMaxValue(10)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const query = interaction.options.getString('query');
    const limit = interaction.options.getInteger('limit') || 5;
    
    if (!query) {
      await interaction.editReply('Query is required');
      return;
    }

    const response = await querySearchAPI({ q: query });
    const searchResults = response.data.filter(item => item.t === 0) as any[];

    if (!searchResults || searchResults.length === 0) {
      await interaction.editReply('No results found for your query.');
      return;
    }

    const relatedSearches = response.data.find(item => item.t === 1) as any;
    
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`Search Results for: ${query}`)
      .setDescription('Powered by Kagi Search API')
      .setFooter({ text: `API Balance: $${response.meta.api_balance.toFixed(3)}` })
      .setTimestamp();

    const maxResults = Math.min(limit, searchResults.length);
    
    for (let i = 0; i < maxResults; i++) {
      const result = searchResults[i];
      
      const title = result.title || 'No title';
      const snippet = result.snippet || 'No description available';
      const url = result.url;
      
      const truncatedSnippet = snippet.length > 100 ? snippet.substring(0, 97) + '...' : snippet;
      
      embed.addFields({
        name: `${i + 1}. ${title}`,
        value: `${truncatedSnippet}\n[Link](${url})`
      });
    }

    if (relatedSearches && relatedSearches.list && relatedSearches.list.length > 0) {
      embed.addFields({
        name: 'Related Searches',
        value: relatedSearches.list.slice(0, 5).join(', ')
      });
    }

    if (searchResults.length > maxResults) {
      embed.setFooter({ 
        text: `Showing ${maxResults} of ${searchResults.length} results | API Balance: $${response.meta.api_balance.toFixed(3)}` 
      });
    }

    const embedFields = embed.data.fields || [];
    let totalContentLength = 0;
    
    embedFields.forEach(field => {
      if (field.value && field.name !== 'Related Searches') {
        totalContentLength += field.value.length;
      }
    });
    
    const hasRelatedSearches = relatedSearches && relatedSearches.list && relatedSearches.list.length > 0;
    
    let relatedSearchesLength = 0;
    if (hasRelatedSearches && relatedSearches.list) {
      relatedSearchesLength = relatedSearches.list.join(", ").length;
    }
    
    const shouldUseThread = (totalContentLength + relatedSearchesLength) > 2000;
    
    const thread = shouldUseThread && process.env.CREATE_THREADS_FOR_RESULTS === 'true'
      ? await createThreadForResults(interaction, query, 'search')
      : null;

    if (thread) {
      await interaction.editReply({ 
        content: `Search results for: **${query}** are available in the thread below.` 
      });
      
      await sendMessageToThread(thread, { embeds: [embed] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error: unknown) {
    console.error('Error in search command:', error);
    
    let errorMessage = 'An error occurred while querying the Kagi Search API.';
    
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      errorMessage += ` Error: ${error.response.data.detail}`;
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    await interaction.editReply(errorMessage);
  }
} 