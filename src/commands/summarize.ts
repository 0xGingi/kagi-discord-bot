import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { querySummarizer } from '../utils/kagiApi';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('summarize')
  .setDescription('Summarize content using the Kagi Universal Summarizer API')
  .addSubcommand(subcommand =>
    subcommand
      .setName('url')
      .setDescription('Summarize content from a URL')
      .addStringOption(option =>
        option.setName('url')
          .setDescription('The URL to summarize')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(
            { name: 'Cecil (Default) - Friendly, descriptive, fast', value: 'cecil' },
            { name: 'Agnes - Formal, technical, analytical', value: 'agnes' },
            { name: 'Muriel - Best-in-class, enterprise-grade', value: 'muriel' }
          )
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
      .addBooleanOption(option =>
        option.setName('cache')
          .setDescription('Whether to allow cached responses (default: true)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('text')
      .setDescription('Summarize provided text')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('The text to summarize')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(
            { name: 'Cecil (Default) - Friendly, descriptive, fast', value: 'cecil' },
            { name: 'Agnes - Formal, technical, analytical', value: 'agnes' },
            { name: 'Muriel - Best-in-class, enterprise-grade', value: 'muriel' }
          )
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
      .addBooleanOption(option =>
        option.setName('cache')
          .setDescription('Whether to allow cached responses (default: true)')
          .setRequired(false)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const subcommand = interaction.options.getSubcommand();
    const engine = interaction.options.getString('engine') || undefined;
    const summaryType = interaction.options.getString('summary_type') || undefined;
    const targetLanguage = interaction.options.getString('target_language') || undefined;
    const cache = interaction.options.getBoolean('cache') ?? undefined;

    let params: any = {
      engine,
      summary_type: summaryType,
      target_language: targetLanguage,
      cache
    };

    if (subcommand === 'url') {
      const url = interaction.options.getString('url');
      if (!url) {
        await interaction.editReply('URL is required');
        return;
      }
      params.url = url;
    } else {
      const text = interaction.options.getString('text');
      if (!text) {
        await interaction.editReply('Text is required');
        return;
      }
      params.text = text;
    }

    if (engine === 'muriel') {
      await interaction.followUp({
        content: 'Note: The Muriel engine costs $1 USD per summary, regardless of length.',
        ephemeral: true
      });
    }

    const response = await querySummarizer(params);
    const { output, tokens } = response.data;

    const embed = new EmbedBuilder()
      .setColor(0x8855FF)
      .setTitle(`${subcommand === 'url' ? 'URL' : 'Text'} Summary`)
      .setDescription(output)
      .addFields(
        { name: 'Engine', value: engine || 'cecil (default)', inline: true },
        { name: 'Summary Type', value: summaryType || 'summary (default)', inline: true },
        { name: 'Tokens Processed', value: tokens.toString(), inline: true }
      )
      .setTimestamp();

    if (subcommand === 'url') {
      embed.setURL(params.url);
    }

    if (targetLanguage) {
      embed.addFields({ name: 'Target Language', value: targetLanguage, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error: unknown) {
    console.error('Error in summarize command:', error);
    
    let errorMessage = 'An error occurred while querying the Kagi Universal Summarizer API.';
    
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      errorMessage += ` Error: ${error.response.data.detail}`;
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    await interaction.editReply(errorMessage);
  }
} 